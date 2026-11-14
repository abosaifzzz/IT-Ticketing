const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
};

const { mockTicketService } =
  await import("../src/services/mock/mockTicketService.js");
const { appEvents, EVENT_NAMES } =
  await import("../src/services/events/eventBus.js");
const { mockTechnicianService } =
  await import("../src/services/mock/mockTechnicianService.js");
const accountId = "demo-employee-01";
const technicianId = "demo-engineer-01";
const firstManager = { id: "demo-manager-01", name: "سميرة" };
const secondManager = { id: "demo-manager-02", name: "نهال" };
mockTechnicianService.setActive("demo-engineer-03", false);
const engineerTwo = { id: "demo-engineer-02", role: "technician" };
const existingEngineerTickets =
  mockTicketService.queryByTechnicianId(technicianId).length;
if (
  mockTechnicianService.setAvailability(engineerTwo.id, false, firstManager) !==
  null
)
  throw new Error("Manager changed engineer self-availability");
const unavailable = mockTechnicianService.setAvailability(
  engineerTwo.id,
  false,
  engineerTwo,
);
if (
  unavailable?.available !== false ||
  !unavailable.active ||
  mockTechnicianService.getById(engineerTwo.id)?.available !== false
)
  throw new Error("Temporary engineer unavailability did not persist");
if (mockTicketService.selfAssign("IT-1046", engineerTwo) !== null)
  throw new Error("Unavailable engineer claimed an unassigned ticket");
if (
  mockTicketService.queryByTechnicianId(technicianId).length !==
  existingEngineerTickets
)
  throw new Error("Existing assignments changed with engineer availability");
if (
  mockTechnicianService.setAvailability(engineerTwo.id, true, engineerTwo)
    ?.available !== true
)
  throw new Error("Engineer could not become available again");
const tickets = mockTicketService.getByReporterAccountId(accountId);

if (tickets.length !== 4)
  throw new Error(`Expected 4 employee tickets, received ${tickets.length}`);
if (tickets.some((ticket) => ticket.reporterAccountId !== accountId))
  throw new Error("Ticket ownership filter leaked another account");
if (
  tickets.some(
    (ticket, index) =>
      index > 0 &&
      new Date(ticket.createdAt) > new Date(tickets[index - 1].createdAt),
  )
)
  throw new Error("Tickets are not sorted newest first");
if (mockTicketService.getByReporterAccountId("missing-account").length !== 0)
  throw new Error("Empty state query should return no tickets");
if (
  mockTicketService.queryByReporterAccountId(accountId, { search: "IT-1048" })
    .length !== 1
)
  throw new Error("Ticket reference search failed");
if (
  mockTicketService.queryByReporterAccountId(accountId, { search: "الشبكة" })
    .length !== 1
)
  throw new Error("Fault title search failed");
if (
  mockTicketService.queryByReporterAccountId(accountId, { status: "resolved" })
    .length !== 1
)
  throw new Error("Status filter failed");
if (
  mockTicketService.queryByReporterAccountId(accountId, {
    creationDate: "2026-10-24",
  }).length !== 1
)
  throw new Error("Creation date filter failed");
if (
  mockTicketService.queryByReporterAccountId(accountId, { sort: "oldest" })[0]
    ?.id !== "IT-1007"
)
  throw new Error("Oldest-first sorting failed");

const managerRecurring = mockTicketService.getRecurringProblems();
if (
  !managerRecurring.some(
    (problem) =>
      problem.category === "البرامج والأنظمة" &&
      problem.department === "العيادات الخارجية" &&
      problem.count === 2,
  )
)
  throw new Error("Manager recurring-problem analysis failed");
const technicianRecurring = mockTicketService.getRecurringProblems({
  technicianId,
});
if (
  !technicianRecurring.some(
    (problem) => problem.category === "البرامج والأنظمة" && problem.count === 2,
  )
)
  throw new Error("Technician recurring-problem scope failed");
if (
  mockTicketService.getRecurringProblems({ technicianId: "missing-technician" })
    .length !== 0
)
  throw new Error(
    "Recurring problems leaked into an unrelated technician scope",
  );

if (
  mockTicketService.queryForManager({ assignment: "unassigned" }).length !== 1
)
  throw new Error("Manager unassigned filter failed");
if (mockTicketService.queryForManager({ search: "الصيدلية" }).length !== 1)
  throw new Error("Manager search failed");
let assignedEvent = null;
const unsubscribeAssigned = appEvents.subscribe(
  EVENT_NAMES.TICKET_ASSIGNED,
  (ticket) => {
    assignedEvent = ticket;
  },
);
const managerAssigned = mockTicketService.assign(
  "IT-1046",
  "demo-engineer-02",
  firstManager,
);
unsubscribeAssigned();
if (
  managerAssigned?.status !== "assigned" ||
  managerAssigned.assignedTechnicianId !== "demo-engineer-02" ||
  managerAssigned.assignedByManagerId !== firstManager.id ||
  managerAssigned.assignedByManagerName !== firstManager.name
)
  throw new Error("Manager assignment identity failed");
if (
  assignedEvent?.id !== "IT-1046" ||
  !managerAssigned.history.some((event) => event.type === "assignment")
)
  throw new Error("Ticket-assigned event or history failed");
if (
  !mockTicketService
    .queryByTechnicianId("demo-engineer-02")
    .some((ticket) => ticket.id === "IT-1046")
)
  throw new Error("Assignment was not reflected in technician view");
if (
  mockTicketService.assign("IT-1046", "demo-engineer-03", firstManager) !== null
)
  throw new Error("Inactive technician accepted an assignment");
if (mockTicketService.assign("IT-1046", technicianId) !== null)
  throw new Error("Assignment without manager identity was accepted");
const reassigned = mockTicketService.assign(
  "IT-1046",
  technicianId,
  secondManager,
);
if (
  reassigned?.assignedTechnicianId !== technicianId ||
  reassigned.assignedByManagerName !== secondManager.name ||
  !reassigned.history.at(-1)?.note.includes(secondManager.name)
)
  throw new Error("Manager reassignment identity failed");
const assignmentManagers = reassigned.history
  .filter((event) => event.type === "assignment")
  .map((event) => event.assignedByManagerName);
if (
  !assignmentManagers.includes(firstManager.name) ||
  !assignmentManagers.includes(secondManager.name)
)
  throw new Error("Assignment manager history was not preserved");

const assignedTickets = mockTicketService.queryByTechnicianId(technicianId);
if (
  assignedTickets.length !== 6 ||
  assignedTickets.some((ticket) => ticket.assignedTechnicianId !== technicianId)
)
  throw new Error("Technician assignment filter failed");
if (
  mockTicketService.getByIdForTechnician("IT-1046", "demo-engineer-02") !== null
)
  throw new Error("Technician ownership query exposed a reassigned ticket");
if (
  mockTicketService.queryByTechnicianId(technicianId, {
    search: "شؤون العاملين",
  }).length !== 1
)
  throw new Error("Technician department search failed");
if (mockTicketService.getAll().some((ticket) => "priority" in ticket))
  throw new Error("Removed ticket priority leaked through the service");

const started = mockTicketService.startWork("IT-1047", technicianId);
if (started?.status !== "in_progress")
  throw new Error("Technician start-work action failed");
const pending = mockTicketService.setPending(
  "IT-1047",
  technicianId,
  "بانتظار توصيل الجهاز",
);
if (
  pending?.status !== "pending" ||
  pending.pendingReason !== "بانتظار توصيل الجهاز"
)
  throw new Error("Pending reason persistence failed");
const publicNote = mockTicketService.addTechnicianNote("IT-1047", {
  technicianId,
  technicianName: "احمد سمير",
  text: "تم فحص التوصيلات",
  visibility: "public",
});
if (publicNote?.publicTechnicianNotes.at(-1)?.text !== "تم فحص التوصيلات")
  throw new Error("Public technician note persistence failed");
const internalNote = mockTicketService.addTechnicianNote("IT-1047", {
  technicianId,
  technicianName: "احمد سمير",
  text: "ملاحظة داخلية تجريبية",
  visibility: "internal",
});
if (internalNote?.internalTechnicianNotes.at(-1)?.visibility !== "internal")
  throw new Error("Internal technician note persistence failed");
if (mockTicketService.resolve("IT-1047", technicianId, "   ") !== null)
  throw new Error("Resolution accepted an empty solution");
let resolvedEvent = null;
const unsubscribe = appEvents.subscribe(
  EVENT_NAMES.TICKET_RESOLVED,
  (ticket) => {
    resolvedEvent = ticket;
  },
);
const technicianResolved = mockTicketService.resolve(
  "IT-1047",
  technicianId,
  "تم تجهيز الجهاز واختبار تشغيله",
);
unsubscribe();
if (
  technicianResolved?.status !== "closed" ||
  !technicianResolved.resolvedAt ||
  !technicianResolved.history.some((event) => event.type === "resolution" && event.status === "resolved") ||
  technicianResolved.solutionDescription !== "تم تجهيز الجهاز واختبار تشغيله"
)
  throw new Error("Technician resolution persistence failed");
if (resolvedEvent?.id !== "IT-1047")
  throw new Error("Ticket-resolved event was not published");
const employeeResolution = mockTicketService.getByIdForReporter("IT-1047", technicianResolved.reporterAccountId);
if (
  !employeeResolution ||
  "solutionDescription" in employeeResolution ||
  employeeResolution.history.some((event) => event.type === "resolution" && event.note) ||
  mockTicketService.getByReporterAccountId(technicianResolved.reporterAccountId).some((ticket) => "solutionDescription" in ticket)
) throw new Error("Employee ticket views exposed the IT solution");

const created = mockTicketService.create({
  reporterAccountId: accountId,
  createdFor: "other",
  reporterName: "موظف تجريبي",
  department: "المعامل",
  title: "طلب تجريبي",
  category: "البرامج والأنظمة",
  description: "بيانات اختبار غير حقيقية",
});
if (created.createdFor !== "other" || created.reporterAccountId !== accountId)
  throw new Error("Another-employee report ownership failed");
if (mockTicketService.getByReporterAccountId(accountId).length !== 5)
  throw new Error(
    "Created report did not persist for the authenticated account",
  );
const reopened = mockTicketService.update(created.id, { status: "reopened" });
if (reopened.status !== "reopened")
  throw new Error("Ticket reopen action failed");

if (mockTicketService.getByIdForReporter("IT-1047", accountId) !== null)
  throw new Error(
    "Ownership-safe detail query exposed another employee ticket",
  );
const commented = mockTicketService.addEmployeeComment("IT-1035", {
  employeeAccountId: accountId,
  authorName: "مستخدم تجريبي",
  text: "تعليق تجريبي للمتابعة",
});
if (commented.comments.at(-1)?.text !== "تعليق تجريبي للمتابعة")
  throw new Error("Employee comment persistence failed");
const markedResolved = mockTicketService.update("IT-1048", {
  status: "resolved",
  historyNote: "تم الحل بواسطة المهندس",
});
if (
  markedResolved.status !== "resolved" ||
  !markedResolved.history.some((event) => event.status === "resolved")
)
  throw new Error("Resolving flow failed");
const confirmed = mockTicketService.confirmResolution("IT-1048", accountId);
if (
  confirmed.status !== "closed" ||
  !confirmed.resolutionConfirmedAt ||
  !confirmed.history.some((event) => event.status === "closed")
)
  throw new Error("Resolution confirmation flow failed");
const reopenedAfterConfirmation = mockTicketService.reopen(
  "IT-1048",
  accountId,
  "المشكلة عادت مرة أخرى",
);
if (
  reopenedAfterConfirmation.status !== "reopened" ||
  reopenedAfterConfirmation.reopeningReason !== "المشكلة عادت مرة أخرى"
)
  throw new Error("Reopening reason persistence failed");
if (
  !reopenedAfterConfirmation.history.some(
    (event) => event.status === "resolved",
  ) ||
  !reopenedAfterConfirmation.history.some(
    (event) => event.status === "closed",
  ) ||
  !reopenedAfterConfirmation.history.some((event) => event.type === "reopened")
)
  throw new Error("Reopening discarded previous ticket history");

const employeeManualTicket = mockTicketService.create({
  reporterAccountId: null,
  reporterName: "موظف بلاغ يدوي",
  employeeNumber: "EMP-DEMO-99",
  department: "الحسابات",
  requesterType: "employee",
  source: "manual",
  createdByAccountId: technicianId,
  createdByName: "مهندس تجريبي",
  title: "بلاغ يدوي تجريبي",
  category: "أجهزة الكمبيوتر",
  description: "اختبار إنشاء بلاغ يدوي لصالح موظف.",
});
await new Promise((resolve) => setTimeout(resolve, 2));
const managementManualTicket = mockTicketService.create({
  reporterAccountId: null,
  reporterName: "عضو إدارة تجريبي",
  department: "الإدارة العليا",
  requesterType: "top_management",
  managementPosition: "مكتب الإدارة التنفيذية",
  source: "manual",
  createdByAccountId: "demo-manager-01",
  createdByName: "مدير تجريبي",
  title: "بلاغ يدوي للإدارة العليا",
  category: "الشبكة",
  description: "اختبار إنشاء بلاغ يدوي لصالح الإدارة العليا.",
});
if (
  managementManualTicket.status !== "new" ||
  managementManualTicket.assignedTechnicianId
)
  throw new Error(
    "Manager manual ticket without engineer was not left unassigned",
  );
const assignedManagementTicket = mockTicketService.assign(
  managementManualTicket.id,
  technicianId,
  firstManager,
);
if (
  assignedManagementTicket?.status !== "assigned" ||
  assignedManagementTicket.assignedTechnicianId !== technicianId ||
  assignedManagementTicket.createdByAccountId !== "demo-manager-01" ||
  assignedManagementTicket.assignedByManagerId !== firstManager.id ||
  !mockTicketService
    .queryByTechnicianId(technicianId)
    .some((ticket) => ticket.id === managementManualTicket.id)
)
  throw new Error("Optional manager manual-ticket assignment failed");
const requesterReport = mockTicketService.getTopEmployeeRequesters();
if (
  employeeManualTicket.source !== "manual" ||
  managementManualTicket.requesterType !== "top_management" ||
  !requesterReport.some(
    (employee) => employee.employeeNumber === "EMP-DEMO-99",
  ) ||
  requesterReport.some(
    (employee) => employee.employeeName === "عضو إدارة تجريبي",
  )
)
  throw new Error("Manual-ticket classification or top-employee report failed");

const unassignedBeforeClaim = mockTicketService.queryUnassigned();
if (
  !unassignedBeforeClaim.some((ticket) => ticket.id === employeeManualTicket.id)
)
  throw new Error("Unassigned engineer queue omitted a new ticket");
if (
  mockTicketService.selfAssign(employeeManualTicket.id, firstManager) !== null
)
  throw new Error("Manager claimed a ticket through the engineer action");
mockTechnicianService.setAvailability(engineerTwo.id, false, engineerTwo);
if (mockTicketService.selfAssign(employeeManualTicket.id, engineerTwo) !== null)
  throw new Error("Unavailable engineer claimed a ticket");
mockTechnicianService.setAvailability(engineerTwo.id, true, engineerTwo);
if (
  mockTicketService.selfAssign(employeeManualTicket.id, {
    id: "demo-engineer-03",
    role: "technician",
  }) !== null
)
  throw new Error("Inactive engineer claimed a ticket");
let claimEvents = 0;
const stopClaimListener = appEvents.subscribe(
  EVENT_NAMES.TICKET_ASSIGNED,
  (ticket) => {
    if (ticket.id === employeeManualTicket.id) claimEvents += 1;
  },
);
const claimed = mockTicketService.selfAssign(
  employeeManualTicket.id,
  engineerTwo,
);
stopClaimListener();
if (
  !claimed ||
  claimed.status !== "assigned" ||
  claimed.assignedTechnicianId !== engineerTwo.id ||
  claimed.assignedByTechnicianId !== engineerTwo.id ||
  claimed.assignedByManagerId ||
  !claimed.history.some(
    (entry) =>
      entry.type === "assignment" &&
      entry.assignedByTechnicianId === engineerTwo.id,
  ) ||
  claimEvents !== 1 ||
  mockTicketService
    .queryUnassigned()
    .some((ticket) => ticket.id === claimed.id) ||
  !mockTicketService
    .queryByTechnicianId(engineerTwo.id)
    .some((ticket) => ticket.id === claimed.id)
)
  throw new Error(
    "Engineer self-assignment did not persist or publish correctly",
  );
if (mockTicketService.selfAssign(employeeManualTicket.id, engineerTwo) !== null)
  throw new Error("Already assigned ticket could be claimed again");
const managerReassignedClaim = mockTicketService.assign(
  employeeManualTicket.id,
  technicianId,
  secondManager,
);
if (
  managerReassignedClaim?.assignedByTechnicianId ||
  managerReassignedClaim?.assignedByManagerId !== secondManager.id ||
  !managerReassignedClaim.history.some(
    (entry) => entry.assignedByTechnicianId === engineerTwo.id,
  )
)
  throw new Error("Manager reassignment lost self-claim history or provenance");

mockTechnicianService.setAvailability(engineerTwo.id, false, engineerTwo);
let unavailableAssignmentEvent = null;
const stopUnavailableAssignmentListener = appEvents.subscribe(EVENT_NAMES.TICKET_ASSIGNED, (ticket) => {
  if (ticket.id === managementManualTicket.id) unavailableAssignmentEvent = ticket;
});
const assignedWhileUnavailable = mockTicketService.assign(managementManualTicket.id, engineerTwo.id, firstManager);
stopUnavailableAssignmentListener();
if (assignedWhileUnavailable?.assignedTechnicianId !== engineerTwo.id ||
    assignedWhileUnavailable?.assignedByManagerId !== firstManager.id ||
    unavailableAssignmentEvent?.id !== managementManualTicket.id ||
    mockTechnicianService.getById(engineerTwo.id)?.available !== false ||
    !mockTicketService.queryByTechnicianId(engineerTwo.id).some((ticket) => ticket.id === managementManualTicket.id))
  throw new Error("Manager could not assign a ticket to a temporarily unavailable engineer");
mockTechnicianService.setAvailability(engineerTwo.id, true, engineerTwo);

console.log(
  "PASS employee ownership, manager assignment to unavailable engineers, engineer self-claim restrictions, inactive blocking, technician propagation, filters, notes, resolution events, persistence, priority removal, optional manual-ticket assignment, and employee reporting",
);
