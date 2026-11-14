import { appEvents, EVENT_NAMES } from "../events/eventBus.js";
import { localStorageAdapter } from "../storage/localStorageAdapter.js";
import { seedTickets } from "./seedData.js";
import { mockTechnicianService } from "./mockTechnicianService.js";
const STORAGE_KEY = "hospital-helpdesk:tickets:v2";
const TECHNICIAN_IDS = Object.freeze({
  "محمد": "demo-engineer-01",
  "أحمد": "demo-engineer-02",
  "عبد الرحمن": "demo-engineer-03",
  "احمد سمير": "demo-engineer-01",
  "محمد طارق": "demo-engineer-02",
  "سارة عادل": "demo-engineer-03",
});
const STATUS_PATHS = {
  new: ["new"],
  assigned: ["new", "assigned"],
  in_progress: ["new", "assigned", "in_progress"],
  pending: ["new", "assigned", "in_progress", "pending"],
  resolved: ["new", "assigned", "in_progress", "resolved"],
  closed: ["new", "assigned", "in_progress", "resolved", "closed"],
  reopened: ["new", "assigned", "in_progress", "resolved", "reopened"],
};

function defaultHistory(ticket) {
  const statuses = STATUS_PATHS[ticket.status] ?? ["new"];
  return statuses.map((status, index) => ({
    id: `${ticket.id}-status-${index}`,
    type: "status",
    status,
    timestamp:
      index === 0
        ? ticket.createdAt
        : index === statuses.length - 1
          ? ticket.updatedAt
          : ticket.createdAt,
  }));
}

function normalizeTicket(ticket) {
  const normalizedTicket = {
    assignedAt: ticket.createdAt,
    assignedTechnicianId: TECHNICIAN_IDS[ticket.assignedTechnician] ?? null,
    publicTechnicianNotes: [],
    internalTechnicianNotes: [],
    comments: [],
    history: defaultHistory(ticket),
    ...ticket,
    subcategory: ticket.subcategory || "عام",
  };
  delete normalizedTicket.priority;
  return normalizedTicket;
}

function reporterView(ticket) {
  if (!ticket) return null;
  const { solutionDescription, ...visible } = ticket;
  void solutionDescription;
  return {
    ...visible,
    history: ticket.history.map((event) =>
      event.type === "resolution" ? { ...event, note: null } : event,
    ),
  };
}

function timestampedId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getAssignmentSourceLabel(ticket) {
  if (!ticket.assignedTechnicianId) return "لم يتم الإسناد";
  if (ticket.assignedByTechnicianId)
    return `إسناد ذاتي بواسطة ${ticket.assignedByTechnicianName ?? ticket.assignedTechnician}`;
  return ticket.assignedByManagerName
    ? `المدير ${ticket.assignedByManagerName}`
    : "غير متاح للتذاكر التاريخية";
}

export const mockTicketService = {
  getAll() {
    return localStorageAdapter
      .get(STORAGE_KEY, seedTickets)
      .map(normalizeTicket);
  },
  getById(id) {
    return this.getAll().find((ticket) => ticket.id === id) ?? null;
  },
  getByRelatedAssetId(assetId) {
    if (!assetId) return [];
    return this.getAll().filter((ticket) => ticket.relatedAssetId === assetId);
  },
  getByIdForReporter(id, accountId) {
    if (!id || !accountId) return null;
    return reporterView(
      this.getAll().find(
        (ticket) => ticket.id === id && ticket.reporterAccountId === accountId,
      ) ?? null,
    );
  },
  getByIdForTechnician(id, technicianId) {
    if (!id || !technicianId) return null;
    return (
      this.getAll().find(
        (ticket) =>
          ticket.id === id && ticket.assignedTechnicianId === technicianId,
      ) ?? null
    );
  },
  getByReporterAccountId(accountId) {
    return this.queryByReporterAccountId(accountId);
  },
  queryByReporterAccountId(accountId, filters = {}) {
    if (!accountId) return [];
    const {
      search = "",
      status = "all",
      creationDate = "",
      sort = "newest",
    } = filters;
    const normalizedSearch = search.trim().toLocaleLowerCase("ar");
    return this.getAll()
      .filter((ticket) => ticket.reporterAccountId === accountId)
      .filter(
        (ticket) =>
          !normalizedSearch ||
          ticket.id.toLocaleLowerCase("ar").includes(normalizedSearch) ||
          ticket.title.toLocaleLowerCase("ar").includes(normalizedSearch),
      )
      .filter((ticket) => status === "all" || ticket.status === status)
      .filter(
        (ticket) =>
          !creationDate || ticket.createdAt.slice(0, 10) === creationDate,
      )
      .sort((first, second) =>
        sort === "oldest"
          ? new Date(first.createdAt) - new Date(second.createdAt)
          : new Date(second.createdAt) - new Date(first.createdAt),
      )
      .map(reporterView);
  },
  queryByTechnicianId(technicianId, filters = {}) {
    if (!technicianId) return [];
    const { search = "", status = "all", sort = "newest" } = filters;
    const normalizedSearch = search.trim().toLocaleLowerCase("ar");
    return this.getAll()
      .filter((ticket) => ticket.assignedTechnicianId === technicianId)
      .filter(
        (ticket) =>
          !normalizedSearch ||
          [
            ticket.id,
            ticket.title,
            ticket.reporterName,
            ticket.department,
          ].some((value) =>
            value?.toLocaleLowerCase("ar").includes(normalizedSearch),
          ),
      )
      .filter((ticket) => status === "all" || ticket.status === status)
      .sort((first, second) =>
        sort === "oldest"
          ? new Date(first.assignedAt) - new Date(second.assignedAt)
          : new Date(second.assignedAt) - new Date(first.assignedAt),
      );
  },
  queryUnassigned() {
    return this.getAll()
      .filter((ticket) => ticket.status === "new" && !ticket.assignedTechnicianId)
      .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
  },
  queryForManager(filters = {}) {
    const {
      search = "",
      status = "all",
      assignment = "all",
      sort = "newest",
    } = filters;
    const normalizedSearch = search.trim().toLocaleLowerCase("ar");
    return this.getAll()
      .filter(
        (ticket) =>
          !normalizedSearch ||
          [
            ticket.id,
            ticket.title,
            ticket.reporterName,
            ticket.department,
            ticket.assignedTechnician,
          ].some((value) =>
            value?.toLocaleLowerCase("ar").includes(normalizedSearch),
          ),
      )
      .filter((ticket) => status === "all" || ticket.status === status)
      .filter(
        (ticket) =>
          assignment === "all" ||
          (assignment === "unassigned"
            ? !ticket.assignedTechnicianId
            : Boolean(ticket.assignedTechnicianId)),
      )
      .sort((first, second) =>
        sort === "oldest"
          ? new Date(first.createdAt) - new Date(second.createdAt)
          : new Date(second.createdAt) - new Date(first.createdAt),
      );
  },
  getRecurringProblems({
    technicianId = null,
    minimumOccurrences = 2,
    limit = 6,
  } = {}) {
    const tickets = this.getAll().filter(
      (ticket) => !technicianId || ticket.assignedTechnicianId === technicianId,
    );
    const groups = new Map();
    tickets.forEach((ticket) => {
      const category = ticket.category || "غير مصنف";
      const department = ticket.department || "قسم غير محدد";
      const key = `${category.trim().toLocaleLowerCase("ar")}::${department.trim().toLocaleLowerCase("ar")}`;
      const group = groups.get(key) ?? {
        key,
        category,
        department,
        count: 0,
        openCount: 0,
        ticketIds: [],
        latestTicketId: ticket.id,
        latestOccurredAt: ticket.createdAt,
      };
      group.count += 1;
      group.ticketIds.push(ticket.id);
      if (!["resolved", "closed"].includes(ticket.status)) group.openCount += 1;
      if (new Date(ticket.createdAt) > new Date(group.latestOccurredAt)) {
        group.latestTicketId = ticket.id;
        group.latestOccurredAt = ticket.createdAt;
      }
      groups.set(key, group);
    });
    return [...groups.values()]
      .filter((group) => group.count >= minimumOccurrences)
      .sort(
        (first, second) =>
          second.count - first.count ||
          new Date(second.latestOccurredAt) - new Date(first.latestOccurredAt),
      )
      .slice(0, limit);
  },
  getTopEmployeeRequesters({ limit = 10, tickets } = {}) {
    const groups = new Map();
    (tickets ?? this.getAll())
      .filter((ticket) => ticket.requesterType !== "top_management")
      .forEach((ticket) => {
        const name = ticket.reporterName?.trim() || "موظف غير محدد";
        const department = ticket.department?.trim() || "قسم غير محدد";
        const identity = ticket.employeeNumber?.trim()
          ? `number:${ticket.employeeNumber.trim()}`
          : `details:${name.toLocaleLowerCase("ar")}::${department.toLocaleLowerCase("ar")}`;
        const group = groups.get(identity) ?? {
          key: identity,
          employeeName: name,
          employeeNumber: ticket.employeeNumber?.trim() || null,
          department,
          ticketCount: 0,
          openCount: 0,
          closedCount: 0,
          latestTicketAt: ticket.createdAt,
        };
        group.ticketCount += 1;
        if (["resolved", "closed"].includes(ticket.status))
          group.closedCount += 1;
        else group.openCount += 1;
        if (new Date(ticket.createdAt) > new Date(group.latestTicketAt))
          group.latestTicketAt = ticket.createdAt;
        groups.set(identity, group);
      });
    return [...groups.values()]
      .sort(
        (first, second) =>
          second.ticketCount - first.ticketCount ||
          new Date(second.latestTicketAt) - new Date(first.latestTicketAt),
      )
      .slice(0, limit);
  },
  create(ticketInput) {
    const requiredValues = [
      ticketInput.reporterName,
      ticketInput.requesterType === 'top_management' ? 'not-applicable' : ticketInput.department,
      ticketInput.title,
      ticketInput.category,
      ticketInput.description,
    ];
    const isManual = ticketInput.source === "manual";
    if (
      requiredValues.some((value) => !value?.trim()) ||
      (!isManual && !ticketInput.reporterAccountId) ||
      (isManual && !ticketInput.createdByAccountId)
    )
      return null;
    if (ticketInput.clientRequestId) {
      const existing = this.getAll().find(
        (ticket) => ticket.clientRequestId === ticketInput.clientRequestId,
      );
      if (existing) return existing;
    }
    const timestamp = new Date().toISOString();
    const id = `IT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const ticket = normalizeTicket({
      ...ticketInput,
      reporterName: ticketInput.reporterName.trim(),
      department: ticketInput.requesterType === 'top_management' ? null : ticketInput.department.trim(),
      title: ticketInput.title.trim(),
      category: ticketInput.category.trim(),
      subcategory: ticketInput.subcategory?.trim() || "عام",
      description: ticketInput.description.trim(),
      id,
      status: "new",
      assignedTechnician: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      history: [
        { id: `${id}-status-0`, type: "status", status: "new", timestamp },
      ],
    });
    localStorageAdapter.set(STORAGE_KEY, [ticket, ...this.getAll()]);
    appEvents.publish(EVENT_NAMES.TICKET_CREATED, ticket);
    return ticket;
  },
  update(id, changes) {
    let updatedTicket = null;
    const tickets = this.getAll().map((ticket) => {
      if (ticket.id !== id) return ticket;
      const timestamp = new Date().toISOString();
      const statusChanged = changes.status && changes.status !== ticket.status;
      const history =
        changes.history ??
        (statusChanged
          ? [
              ...ticket.history,
              {
                id: timestampedId("status"),
                type: "status",
                status: changes.status,
                timestamp,
                note: changes.historyNote,
              },
            ]
          : ticket.history);
      updatedTicket = normalizeTicket({
        ...ticket,
        ...changes,
        history,
        updatedAt: timestamp,
      });
      return updatedTicket;
    });
    localStorageAdapter.set(STORAGE_KEY, tickets);
    if (updatedTicket)
      appEvents.publish(EVENT_NAMES.TICKET_UPDATED, updatedTicket);
    return updatedTicket;
  },
  addEmployeeComment(id, { employeeAccountId, authorName, text }) {
    const ticket = this.getById(id);
    if (!ticket || ticket.reporterAccountId !== employeeAccountId || !text?.trim()) return null;
    const timestamp = new Date().toISOString();
    const comment = {
      id: timestampedId("comment"),
      authorAccountId: employeeAccountId,
      authorName,
      text: text.trim(),
      createdAt: timestamp,
    };
    const updatedTicket = this.update(id, {
      comments: [...ticket.comments, comment],
      history: [
        ...ticket.history,
        {
          id: timestampedId("comment-event"),
          type: "comment",
          timestamp,
          note: "أضاف الموظف تعليقًا",
        },
      ],
    });
    appEvents.publish(EVENT_NAMES.TICKET_COMMENT_ADDED, {
      ticketId: id,
      comment,
    });
    return reporterView(updatedTicket);
  },
  assign(id, technicianId, assignedByManager) {
    const ticket = this.getById(id);
    const technician = mockTechnicianService.getById(technicianId);
    const managerId = assignedByManager?.id?.trim();
    const managerName = assignedByManager?.name?.trim();
    if (
      !ticket ||
      !technician?.active ||
      technician.role !== "technician" ||
      !managerId ||
      !managerName
    )
      return null;
    if (ticket.assignedTechnicianId === technician.id) return ticket;
    const timestamp = new Date().toISOString();
    const status = ticket.status === "new" ? "assigned" : ticket.status;
    const previousTechnician = ticket.assignedTechnician;
    const history = [
      ...ticket.history,
      {
        id: timestampedId("assignment"),
        type: "assignment",
        status,
        timestamp,
        technicianId: technician.id,
        technicianName: technician.name,
        assignedByManagerId: managerId,
        assignedByManagerName: managerName,
        note: previousTechnician
          ? `أعاد المدير ${managerName} إسناد التذكرة من ${previousTechnician} إلى ${technician.name}`
          : `أسند المدير ${managerName} التذكرة إلى ${technician.name}`,
      },
    ];
    const updatedTicket = this.update(id, {
      assignedTechnicianId: technician.id,
      assignedTechnician: technician.name,
      assignedByManagerId: managerId,
      assignedByManagerName: managerName,
      assignedByTechnicianId: null,
      assignedByTechnicianName: null,
      assignedAt: timestamp,
      status,
      history,
    });
    if (updatedTicket)
      appEvents.publish(EVENT_NAMES.TICKET_ASSIGNED, updatedTicket);
    return updatedTicket;
  },
  selfAssign(id, engineerIdentity) {
    const ticket = this.getById(id);
    const engineer = mockTechnicianService.getById(engineerIdentity?.id);
    if (
      !ticket || ticket.status !== "new" || ticket.assignedTechnicianId ||
      engineerIdentity?.role !== "technician" || !engineer?.active ||
      engineer.available === false || engineer.role !== "technician"
    ) return null;
    const timestamp = new Date().toISOString();
    const updatedTicket = this.update(id, {
      assignedTechnicianId: engineer.id,
      assignedTechnician: engineer.name,
      assignedByManagerId: null,
      assignedByManagerName: null,
      assignedByTechnicianId: engineer.id,
      assignedByTechnicianName: engineer.name,
      assignedAt: timestamp,
      status: "assigned",
      history: [...ticket.history, {
        id: timestampedId("assignment"),
        type: "assignment",
        status: "assigned",
        timestamp,
        technicianId: engineer.id,
        technicianName: engineer.name,
        assignedByTechnicianId: engineer.id,
        assignedByTechnicianName: engineer.name,
        note: `تولى المهندس ${engineer.name} التذكرة بنفسه`,
      }],
    });
    if (updatedTicket) appEvents.publish(EVENT_NAMES.TICKET_ASSIGNED, updatedTicket);
    return updatedTicket;
  },
  startWork(id, technicianId) {
    const ticket = this.getByIdForTechnician(id, technicianId);
    if (!ticket || !["assigned", "pending", "reopened"].includes(ticket.status))
      return null;
    return this.update(id, {
      status: "in_progress",
      pendingReason: null,
      historyNote:
        ticket.status === "pending"
          ? "استأنف المهندس العمل على الطلب"
          : "بدأ المهندس العمل على الطلب",
    });
  },
  setPending(id, technicianId, reason) {
    const ticket = this.getByIdForTechnician(id, technicianId);
    const cleanReason = reason?.trim();
    if (
      !ticket ||
      !cleanReason ||
      !["assigned", "in_progress", "reopened"].includes(ticket.status)
    )
      return null;
    const timestamp = new Date().toISOString();
    return this.update(id, {
      status: "pending",
      pendingAt: timestamp,
      pendingReason: cleanReason,
      historyNote: cleanReason,
    });
  },
  addTechnicianNote(
    id,
    { technicianId, technicianName, text, visibility = "public" },
  ) {
    const ticket = this.getByIdForTechnician(id, technicianId);
    const cleanText = text?.trim();
    if (
      !ticket ||
      !cleanText ||
      !["assigned", "in_progress", "pending", "reopened"].includes(
        ticket.status,
      ) ||
      !["public", "internal"].includes(visibility)
    )
      return null;
    const timestamp = new Date().toISOString();
    const note = {
      id: timestampedId("technician-note"),
      authorAccountId: technicianId,
      authorName: technicianName,
      text: cleanText,
      visibility,
      createdAt: timestamp,
    };
    const noteKey =
      visibility === "public"
        ? "publicTechnicianNotes"
        : "internalTechnicianNotes";
    return this.update(id, {
      [noteKey]: [...ticket[noteKey], note],
      history: [
        ...ticket.history,
        {
          id: timestampedId("technician-note-event"),
          type: "technician_note",
          visibility,
          timestamp,
          note:
            visibility === "public"
              ? "أضاف المهندس ملاحظة عامة"
              : "أضاف المهندس ملاحظة داخلية",
        },
      ],
    });
  },
  resolve(id, technicianId, solutionDescription) {
    const ticket = this.getByIdForTechnician(id, technicianId);
    const cleanSolution = solutionDescription?.trim();
    if (
      !ticket ||
      !cleanSolution ||
      !["assigned", "in_progress", "pending", "reopened"].includes(
        ticket.status,
      )
    )
      return null;
    const timestamp = new Date().toISOString();
    const updatedTicket = this.update(id, {
      status: "closed",
      solutionDescription: cleanSolution,
      resolvedAt: timestamp,
      resolutionConfirmedAt: null,
      pendingReason: null,
      history: [
        ...ticket.history,
        { id: timestampedId("resolution"), type: "resolution", status: "resolved", timestamp, note: cleanSolution },
        { id: timestampedId("status"), type: "status", status: "closed", timestamp },
      ],
    });
    if (updatedTicket)
      appEvents.publish(EVENT_NAMES.TICKET_RESOLVED, updatedTicket);
    return updatedTicket;
  },
  confirmResolution(id, employeeAccountId) {
    const ticket = this.getById(id);
    if (!ticket || ticket.reporterAccountId !== employeeAccountId || !["resolved", "closed"].includes(ticket.status) || ticket.resolutionConfirmedAt) return null;
    const timestamp = new Date().toISOString();
    return reporterView(this.update(id, {
      status: "closed",
      resolutionConfirmedAt: timestamp,
      history: [
        ...ticket.history,
        {
          id: timestampedId("confirmation"),
          type: "confirmation",
          timestamp,
          note: "أكد الموظف حل المشكلة",
        },
        ...(ticket.status === "resolved" ? [{
          id: timestampedId("status"),
          type: "status",
          status: "closed",
          timestamp,
        }] : []),
      ],
    }));
  },
  reopen(id, employeeAccountId, reason = "") {
    const ticket = this.getById(id);
    if (!ticket || ticket.reporterAccountId !== employeeAccountId || !["resolved", "closed"].includes(ticket.status)) return null;
    const timestamp = new Date().toISOString();
    const updatedTicket = this.update(id, {
      status: "reopened",
      reopenedAt: timestamp,
      reopeningReason: reason.trim(),
      history: [
        ...ticket.history,
        {
          id: timestampedId("reopen"),
          type: "reopened",
          status: "reopened",
          timestamp,
          note: reason.trim() || "أفاد الموظف بأن المشكلة ما زالت موجودة",
        },
      ],
    });
    if (updatedTicket)
      appEvents.publish(EVENT_NAMES.TICKET_REOPENED, updatedTicket);
    return reporterView(updatedTicket);
  },
};
