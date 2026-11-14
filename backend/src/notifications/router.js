import { Router } from "express";
import { ApiError, invalid, uuid } from "../management/validation.js";
import { emptyBody, notificationFilters, revision } from "./validation.js";

export function createNotificationRouter({
  authService,
  cookieName,
  repository,
  intervalMs = 2000,
  heartbeatMs = 15000,
}) {
  const router = Router();
  const streams = new Set();
  router.closeStreams = () => {
    for (const stream of streams) stream.res.end();
  };
  router.use(async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    req.user = await authService.getUser(req.cookies[cookieName]);
    if (!req.user) throw new ApiError(401, "يجب تسجيل الدخول.");
    if (!["employee","technician","manager"].includes(req.user.role)) throw new ApiError(403,"Operational notifications are restricted to helpdesk roles");
    next();
  });
  router.get("/", async (req, res) =>
    res.json(
      await repository.history(req.user.id, notificationFilters(req.query)),
    ),
  );
  router.get("/state", async (req, res) => {
    if (Object.keys(req.query).some((key) => key !== "since")) invalid();
    const since =
      req.query.since === undefined ? null : revision(req.query.since);
    const snapshot = await repository.state(req.user.id);
    res.json({
      ...snapshot,
      changed: since === null || since !== snapshot.revision,
      pollAfterMs: 15000,
    });
  });
  router.get("/unread-count", async (req, res) => {
    if (Object.keys(req.query).length) invalid();
    res.json(await repository.state(req.user.id));
  });
  router.patch("/:id/read", async (req, res) => {
    emptyBody(req.body);
    res.json(await repository.markRead(req.user.id, uuid(req.params.id)));
  });
  router.post("/read-all", async (req, res) => {
    emptyBody(req.body);
    res.json(await repository.markRead(req.user.id));
  });
  router.get("/stream", async (req, res) => {
    if (Object.keys(req.query).length) invalid();
    const lastId = req.get("Last-Event-ID");
    if (lastId !== undefined) revision(lastId);
    if (
      [...streams].filter((stream) => stream.accountId === req.user.id)
        .length >= 3
    )
      throw new ApiError(429, "اتصالات إشعارات كثيرة. استخدم التحديث الدوري.");
    const stream = { res, accountId: req.user.id };
    // Reserve the slot before awaiting the database, including simultaneous connects.
    streams.add(stream);
    res.once("close", () => streams.delete(stream));
    let initial;
    try {
      initial = await repository.state(req.user.id);
    } catch (error) {
      streams.delete(stream);
      throw error;
    }
    if (res.destroyed) {
      streams.delete(stream);
      return;
    }
    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    let closed = false,
      current = initial.revision,
      heartbeatAt = Date.now(),
      timer;
    const close = () => {
      closed = true;
      clearTimeout(timer);
    };
    res.on("close", close);
    const send = (event, data, id) => {
      if (closed || res.writableEnded) return false;
      return res.write(
        `${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
      );
    };
    res.write("retry: 3000\n\n");
    send(
      "ready",
      {
        ...initial,
        refreshRequired: true,
        changed: lastId === undefined || lastId !== initial.revision,
        pollAfterMs: 15000,
      },
      initial.revision,
    );
    async function tick() {
      if (closed) return;
      try {
        // Never treat an open connection as permanent authorization.
        const user = await authService.getUser(req.cookies[cookieName]);
        if (!user || user.id !== req.user.id) {
          send("session-ended", { reauthenticate: true });
          close();
          res.end();
          return;
        }
        const snapshot = await repository.state(user.id);
        if (closed) return;
        if (snapshot.revision !== current) {
          current = snapshot.revision;
          if (
            !send("refresh", { ...snapshot, refreshRequired: true }, current)
          ) {
            // Bound memory for slow/disconnected clients; reconnect performs a durable refresh.
            close();
            res.end();
            return;
          }
        } else if (Date.now() - heartbeatAt >= heartbeatMs) {
          heartbeatAt = Date.now();
          if (!res.write(": heartbeat\n\n")) {
            close();
            res.end();
            return;
          }
        }
      } catch {
        send("refresh-error", { refreshRequired: true, pollAfterMs: 15000 });
        close();
        res.end();
        return;
      }
      if (!closed) timer = setTimeout(tick, intervalMs);
    }
    timer = setTimeout(tick, intervalMs);
  });
  return router;
}
