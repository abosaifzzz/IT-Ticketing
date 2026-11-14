const storage = new Map();
const channels = [];
class FakeBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    channels.push(this);
  }
  postMessage(data) {
    channels
      .filter((channel) => channel !== this && channel.name === this.name)
      .forEach((channel) => channel.onmessage?.({ data }));
  }
  close() {
    const index = channels.indexOf(this);
    if (index >= 0) channels.splice(index, 1);
  }
}
globalThis.window = {
  setTimeout,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  BroadcastChannel: FakeBroadcastChannel,
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { mockAuthProvider: authService } = await import("../src/services/auth/mockAuthProvider.js");
const { notificationService, NOTIFICATION_TYPES } =
  await import("../src/services/notifications/notificationService.js");
const { notificationSoundService } =
  await import("../src/services/notifications/notificationSoundService.js");
const { mockTicketService } =
  await import("../src/services/mock/mockTicketService.js");
const { mockAssetInventoryService } =
  await import("../src/services/mock/mockAssetInventoryService.js");
const { mockReportService } =
  await import("../src/services/reports/mockReportService.js");

notificationService.initialize();
notificationSoundService.initialize();
const baseline = mockReportService.getDashboard();

const employeeSession = await authService.login({
  username: "samar.eraky@demo.example",
  password: "SamarDemo@26",
});
const employee = employeeSession.user;
const input = {
  reporterAccountId: employee.id,
  createdFor: "self",
  clientRequestId: "e2e-ticket-request",
  reporterName: "موظف اختبار شامل",
  department: "الحسابات",
  title: "اختبار دورة البلاغ الكاملة",
  category: "أجهزة الكمبيوتر",
  subcategory: "محطة عمل",
  description: "بيانات تجريبية لمراجعة الواجهة فقط.",
};
if (mockTicketService.create({ ...input, reporterName: "   " }) !== null)
  throw new Error("Required ticket validation failed");
const ticket = mockTicketService.create(input);
const duplicate = mockTicketService.create(input);
if (
  !ticket ||
  duplicate.id !== ticket.id ||
  mockTicketService
    .getAll()
    .filter((item) => item.clientRequestId === input.clientRequestId).length !==
    1
)
  throw new Error("Ticket creation idempotency failed");
if (
  !mockTicketService
    .getByReporterAccountId(employee.id)
    .some((item) => item.id === ticket.id) ||
  mockTicketService.getByIdForReporter(ticket.id, "another-account")
)
  throw new Error("Employee listing or ownership failed");
const newTicketRecipients = [
  "demo-engineer-01",
  "demo-engineer-02",
  "demo-engineer-03",
  "demo-manager-01",
  "demo-manager-02",
  "demo-manager-03",
];
for (const recipientId of newTicketRecipients)
  if (
    notificationService
      .getForRecipient(recipientId)
      .filter(
        (item) =>
          item.ticketId === ticket.id &&
          item.type === NOTIFICATION_TYPES.NEW_TICKET,
      ).length !== 1
  )
    throw new Error(`New-ticket notification failed for ${recipientId}`);
if (
  notificationService
    .getForRecipient(employee.id)
    .some(
      (item) =>
        item.ticketId === ticket.id &&
        item.type === NOTIFICATION_TYPES.NEW_TICKET,
    )
)
  throw new Error("New-ticket recipient filtering failed");

await authService.logout();
const manager = (
  await authService.login({
    username: "samira@demo.example",
    password: "SamiraDemo@26",
  })
).user;
const assigned = mockTicketService.assign(
  ticket.id,
  "demo-engineer-01",
  manager,
);
const sameAssignment = mockTicketService.assign(
  ticket.id,
  "demo-engineer-01",
  manager,
);
if (
  assigned?.status !== "assigned" ||
  sameAssignment.history.length !== assigned.history.length
)
  throw new Error("Assignment or duplicate assignment protection failed");
if (
  notificationService
    .getForRecipient("demo-engineer-01")
    .filter(
      (item) =>
        item.ticketId === ticket.id &&
        item.type === NOTIFICATION_TYPES.TICKET_ASSIGNMENT,
    ).length !== 1
)
  throw new Error("Assignment notification was missing or duplicated");
if (
  notificationService
    .getForRecipient("demo-engineer-02")
    .some(
      (item) =>
        item.ticketId === ticket.id &&
        item.type === NOTIFICATION_TYPES.TICKET_ASSIGNMENT,
    )
)
  throw new Error("Assignment notification leaked");

await authService.logout();
const technician = (
  await authService.login({
    username: "mohamed@demo.example",
    password: "MohamedDemo@26",
  })
).user;
if (
  !mockTicketService.getByIdForTechnician(ticket.id, technician.id) ||
  mockTicketService.getByIdForTechnician(ticket.id, "demo-engineer-02")
)
  throw new Error("Technician assignment scope failed");
const started = mockTicketService.startWork(ticket.id, technician.id);
const noted = mockTicketService.addTechnicianNote(ticket.id, {
  technicianId: technician.id,
  technicianName: technician.name,
  text: "تم فحص التوصيلات وإعادة تشغيل الجهاز.",
  visibility: "public",
});
const internal = mockTicketService.addTechnicianNote(ticket.id, {
  technicianId: technician.id,
  technicianName: technician.name,
  text: "نتيجة فحص داخلية تجريبية.",
  visibility: "internal",
});
const resolved = mockTicketService.resolve(
  ticket.id,
  technician.id,
  "تم استبدال الوصلة واختبار الجهاز بنجاح.",
);
if (
  started?.status !== "in_progress" ||
  !noted?.publicTechnicianNotes.length ||
  !internal?.internalTechnicianNotes.length ||
  resolved?.status !== "closed"
)
  throw new Error("Technician workflow failed");
if (
  mockTicketService.addTechnicianNote(ticket.id, {
    technicianId: technician.id,
    technicianName: technician.name,
    text: "ملاحظة متأخرة",
    visibility: "public",
  }) !== null
)
  throw new Error("Completed ticket accepted a troubleshooting note");
if (
  !notificationService
    .getForRecipient(employee.id)
    .some(
      (item) =>
        item.ticketId === ticket.id &&
        item.type === NOTIFICATION_TYPES.TICKET_RESOLVED,
    )
)
  throw new Error("Employee resolution notification failed");

await authService.login({
  username: "samar.eraky@demo.example",
  password: "SamarDemo@26",
});
const closed = mockTicketService.confirmResolution(ticket.id, employee.id);
if (
  closed?.status !== "closed" ||
  mockTicketService.confirmResolution(ticket.id, employee.id) !== null
)
  throw new Error("Resolution confirmation or duplicate confirmation failed");

await authService.logout();
await authService.login({
  username: "samira@demo.example",
  password: "SamiraDemo@26",
});
const assetInput = {
  assetId: "AST-E2E-01",
  name: "جهاز اختبار الواجهة",
  quantity: 4,
  manufacturer: "Demo",
  model: "E2E",
  serialNumber: "DEMO-E2E",
  department: "الحسابات",
  location: "غرفة اختبار الواجهة",
  purchaseDate: "",
  operationalStatus: "working",
  conditionDescription: "حالة تشغيل جيدة لأغراض الاختبار.",
  maintenanceNotes: "",
  lastMaintenanceDate: "2026-10-27",
};
if (
  mockAssetInventoryService.create(
    { ...assetInput, assetId: "bad/id" },
    manager,
  ) !== null
)
  throw new Error("Unsafe asset ID was accepted");
const asset = mockAssetInventoryService.create(assetInput, manager);
const report = mockReportService.getDashboard();
if (
  !asset ||
  report.tickets.total !== baseline.tickets.total + 1 ||
  report.tickets.solved !== baseline.tickets.solved + 1 ||
  report.tickets.solved + report.tickets.unsolved !== report.tickets.total ||
  mockAssetInventoryService.getStatistics().total < 4 ||
  "assets" in report || "technicianPerformance" in report
)
  throw new Error("Reporting consistency failed");
if (
  (await notificationSoundService.play("new_ticket")) !== false ||
  JSON.stringify(notificationSoundService.getPattern("new_ticket")) ===
    JSON.stringify(notificationSoundService.getPattern("assignment"))
)
  throw new Error("Audio restriction or sound distinction failed");

if (
  mockTicketService.getById("missing-ticket") !== null ||
  mockAssetInventoryService.getById("missing-asset") !== null
)
  throw new Error("Missing-record handling failed");
if (
  mockTicketService.getById(ticket.id)?.status !== "closed" ||
  mockAssetInventoryService.getById(asset.assetId)?.assetId !== asset.assetId
)
  throw new Error("Persistence after workflow failed");
storage.set(
  "hospital-helpdesk:demo-session",
  JSON.stringify({
    provider: "demo",
    role: "manager",
    user: { id: employee.id, username: employee.username, role: "manager" },
  }),
);
if (
  authService.restoreSession() !== null ||
  storage.has("hospital-helpdesk:demo-session")
)
  throw new Error("Tampered session was accepted");

notificationService.dispose();
console.log(
  "PASS complete supported employee-manager-engineer lifecycle, validation, duplicate protection, ownership, notifications, audio restrictions, persistence, assets, and reports",
);
