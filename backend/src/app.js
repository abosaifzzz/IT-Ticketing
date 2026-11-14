import {createAdministrationRouter} from "./administration/router.js";
import {createMonitoring} from "./administration/monitoring.js";
import {createBackupService} from "./administration/backups.js";
import {createAssetManagementRouter} from "./assetManagement/router.js";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createHash } from "node:crypto";
import { createManagementRouter } from "./management/router.js";
import { ApiError } from "./management/validation.js";
import { createTicketRouter } from "./tickets/router.js";
import { createAssetRouter } from "./assets/router.js";
import { createNotificationRouter } from "./notifications/router.js";
import { createReportRouter } from "./reports/router.js";
import { createDashboardRouter } from "./dashboard/router.js";

export function sessionCookieName(nodeEnv) {
  return nodeEnv === "production"
    ? "__Host-it-helpdesk-session"
    : "it-helpdesk-session";
}

export function createApp({
  authService,
  config,
  managementRepositories,
  ticketRepository,
  ticketWorkflowRepository,
  assetRepository,
  assetManagementRepository,
  notificationRepository,
  notificationStreamOptions,
  reportRepository,
  dashboardRepository,
  administrationRepository,
  backupService,
}) {
  const app = express();
  const cookieName = sessionCookieName(config.nodeEnv);
  const cookieOptions = {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "strict",
    path: "/",
  };

  const monitoring=createMonitoring();
  app.locals.monitoring=monitoring;
  app.use(monitoring.middleware);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use((req, res, next) => {
    res.vary("Origin");
    const origin = req.get("Origin");
    if (origin && origin !== config.appOrigin)
      return res.status(403).json({ error: "الطلب غير مسموح." });
    if (origin === config.appOrigin) {
      res.set("Access-Control-Allow-Origin", config.appOrigin);
      res.set("Access-Control-Allow-Credentials", "true");
      res.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    if (!["GET", "HEAD"].includes(req.method) && origin !== config.appOrigin) {
      return res.status(403).json({ error: "الطلب غير مسموح." });
    }
    next();
  });
  app.use("/api/tickets", express.json({ limit: "32kb" }));
  app.use("/api/assets", express.json({ limit: "32kb" }));
  app.use("/api/asset-management", express.json({ limit: "8mb" }));
  app.use(express.json({ limit: "8kb" }));
  app.use(cookieParser());
  if(administrationRepository) app.use(async(req,res,next)=>{
    if(!req.path.startsWith('/api/')||req.path.startsWith('/api/admin/')||req.path.startsWith('/api/auth/')||req.path==='/api/health')return next();
    const policy=await administrationRepository.runtimePolicy();
    if(policy.maintenance?.enabled)return res.status(503).json({error:policy.maintenance.message});
    next();
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  const loginLimit = rateLimit({
    // Direct/local server: forwarded headers are deliberately untrusted.
    validate: { xForwardedForHeader: false },
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "محاولات كثيرة. حاول مرة أخرى لاحقًا." },
  });
  const accountLoginLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
    standardHeaders: "draft-8", legacyHeaders: false,
    keyGenerator: (req) => createHash("sha256").update(String(req.body?.email ?? req.body?.username ?? "").trim().toLowerCase().slice(0, 254)).digest("hex"),
    message: { error: "محاولات كثيرة. حاول مرة أخرى لاحقًا." },
  });

  app.post("/api/auth/login", loginLimit, accountLoginLimit, async (req, res) => {
    if (req.body?.email !== undefined && req.body?.username !== undefined) return res.status(400).json({ error: "أدخل اسم مستخدم واحدًا." });
    const email =
      typeof (req.body?.email ?? req.body?.username) === "string"
        ? (req.body.email ?? req.body.username).trim().toLowerCase()
        : "";
    const password = req.body?.password;
    if (
      !email ||
      email.length > 254 ||
      typeof password !== "string" ||
      !password ||
      Buffer.byteLength(password, "utf8") > 1024
    ) {
      return res
        .status(400)
        .json({ error: "أدخل البريد الإلكتروني وكلمة المرور." });
    }
    const session = await authService.login({ email, password });
    if (!session) {
      if(administrationRepository)await administrationRepository.audit({action:'authentication.login.failed',module:'authentication',ip:req.ip,status:'FAILURE'});
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة." });
    }
    if(administrationRepository)await administrationRepository.audit({actor:session.user,action:'authentication.login',module:'authentication',entityId:session.user.id,ip:req.ip});
    res.cookie(cookieName, session.token, {
      ...cookieOptions,
      expires: session.expiresAt,
    });
    return res.json({ user: session.user });
  });

  app.get("/api/auth/me", async (req, res) => {
    const user = await authService.getUser(req.cookies[cookieName]);
    if (!user)
      return res
        .status(401)
        .json({ error: "انتهت الجلسة أو لم يتم تسجيل الدخول." });
    return res.json({ user });
  });

  app.post("/api/auth/logout", async (req, res) => {
    await authService.logout(req.cookies[cookieName]);
    res.clearCookie(cookieName, cookieOptions);
    return res.sendStatus(204);
  });
  app.post("/api/auth/logout-all", async (req, res) => {
    if (req.body !== undefined && (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length)) return res.status(400).json({ error: "الطلب غير صالح." });
    if (!await authService.logoutAll(req.cookies[cookieName])) return res.status(401).json({ error: "يرجى تسجيل الدخول." });
    res.clearCookie(cookieName, cookieOptions);
    return res.sendStatus(204);
  });

  if(administrationRepository){
    const router=createAdministrationRouter({authService,cookieName,cookieOptions,repository:administrationRepository,monitoring,backups:backupService??createBackupService({pool:administrationRepository.pool})});
    app.locals.closeAdministrationJobs=router.closeJobs;
    app.use('/api/admin',router);
  }
  if (notificationRepository) {
    const router = createNotificationRouter({
      authService,
      cookieName,
      repository: notificationRepository,
      ...notificationStreamOptions,
    });
    app.locals.closeNotificationStreams = router.closeStreams;
    app.use("/api/notifications", router);
  }
  if (assetRepository)
    app.use(
      "/api/assets",
      createAssetRouter({
        authService,
        cookieName,
        repository: assetRepository,
      }),
    );
  if (ticketRepository)
    app.use(
      "/api/tickets",
      createTicketRouter({
        authService,
        cookieName,
        repository: ticketRepository,
        workflowRepository: ticketWorkflowRepository,
      }),
    );
  if (dashboardRepository) app.use("/api/dashboard", createDashboardRouter({ authService, cookieName, repository: dashboardRepository }));
  if (reportRepository) app.use("/api/reports", createReportRouter({ authService, cookieName, repository: reportRepository }));
  if (managementRepositories)
    app.use(
      "/api",
      createManagementRouter({
        authService,
        cookieName,
        repositories: managementRepositories,
      }),
    );

  if (assetManagementRepository) app.use("/api/asset-management", createAssetManagementRouter({authService,cookieName,repository:assetManagementRepository}));

  app.use((_req, res) => res.status(404).json({ error: "المسار غير موجود." }));
  app.use(async(error, _req, res, _next) => {
    monitoring.error(error,_req);
    if(administrationRepository&&error?.status===403)await administrationRepository.audit({actor:_req.user,action:'authorization.denied',module:'security',ip:_req.ip,status:'FAILURE'}).catch(()=>{});
    if (res.headersSent) { res.end(); return; }
    if (error instanceof ApiError)
      return res.status(error.status).json({ error: error.message });
    if (error?.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "السجل موجود بالفعل." });
    if (["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error?.code)) return res.status(409).json({ error: "تعارض تعديل متزامن. حدّث البيانات وحاول مجددًا." });
    if (["ER_NO_REFERENCED_ROW_2", "ER_ROW_IS_REFERENCED_2"].includes(error?.code)) return res.status(409).json({ error: "البيانات مرتبطة بسجلات أخرى أو تغيرت. حدّث البيانات." });
    if (
      error?.type === "entity.too.large" ||
      (error instanceof SyntaxError && error.status === 400)
    ) {
      return res.status(400).json({ error: "الطلب غير صالح." });
    }
    // Driver errors may contain SQL values; never log credential or session data.
    console.error("API request failed.");
    return res.status(500).json({ error: "حدث خطأ في الخادم." });
  });

  return app;
}
