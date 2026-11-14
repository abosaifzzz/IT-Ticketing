const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
};

const { appEvents, EVENT_NAMES } =
  await import("../src/services/events/eventBus.js");
const { mockAssetInventoryService } =
  await import("../src/services/mock/mockAssetInventoryService.js");
const { mockTicketService } = await import("../src/services/mock/mockTicketService.js");
const { mockTechnicianService } = await import("../src/services/mock/mockTechnicianService.js");
const { assetExportService } =
  await import("../src/services/reports/assetExportService.js");
const { excelExportService } =
  await import("../src/services/reports/excelExportService.js");
const manager = { id: "demo-manager-01", name: "خالد عادل", role: "manager" };
const technician = {
  id: "demo-engineer-01",
  name: "احمد سمير",
  role: "technician",
};
const employee = { id: "demo-employee-01", name: "موظف", role: "employee" };
const input = {
  assetId: "AST-TEST-01",
  name: "طابعة اختبار احتياطية",
  quantity: 7,
  manufacturer: "Demo",
  model: "Print 100",
  serialNumber: "SERIAL-DEMO-1",
  department: "الصيدلية",
  location: "مخزن تكنولوجيا المعلومات",
  purchaseDate: "2026-01-01",
  operationalStatus: "working",
  conditionDescription: "جديدة وتعمل بصورة سليمة.",
  maintenanceNotes: "",
  lastMaintenanceDate: "",
};

let createdEvent = null;
const unsubscribe = appEvents.subscribe(EVENT_NAMES.ASSET_CREATED, (asset) => {
  createdEvent = asset;
});
const created = mockAssetInventoryService.create(input, technician);
unsubscribe();
if (
  !created ||
  createdEvent?.assetId !== created.assetId ||
  !mockAssetInventoryService.getById(input.assetId)
)
  throw new Error("Asset creation, persistence, or event failed");
if (mockAssetInventoryService.create(input, manager) !== null)
  throw new Error("Duplicate asset ID was accepted");
if (mockAssetInventoryService.create({ ...input, assetId: "AST-WITHDRAWN-MANUAL", operationalStatus: "withdrawn" }, manager) !== null)
  throw new Error("Asset was manually created as withdrawn without an engineer");
for (const quantity of [0, -2, 1.5, 1000001, ""]) {
  if (mockAssetInventoryService.create({ ...input, assetId: `AST-INVALID-${String(quantity).replace('.', '-')}`, quantity }, manager) !== null)
    throw new Error(`Invalid asset quantity was accepted: ${quantity}`);
}
if (
  mockAssetInventoryService.create(
    { ...input, assetId: "AST-EMPLOYEE" },
    employee,
  ) !== null
)
  throw new Error("Employee created an asset");
for (const filters of [
  { search: "SERIAL-DEMO-1" },
  { search: "Print 100" },
  { department: "الصيدلية" },
  { operationalStatus: "working" },
]) {
  if (
    !mockAssetInventoryService
      .query(filters)
      .some((asset) => asset.assetId === created.assetId)
  )
    throw new Error(`Asset query failed: ${JSON.stringify(filters)}`);
}
const updated = mockAssetInventoryService.update(
  created.assetId,
  {
    ...input,
    assetId: "CHANGED-ID",
    operationalStatus: "under_repair",
    quantity: 4,
    conditionDescription: "قيد الفحص الفني.",
  },
  technician,
);
if (
  !updated ||
  updated.assetId !== created.assetId ||
  updated.history.length !== 2 ||
  !updated.history
    .at(-1)
    .changes.some(
      (change) =>
        change.field === "quantity" &&
        change.previousValue === 7 &&
        change.nextValue === 4,
    )
)
  throw new Error("Asset update or history preservation failed");
if (!mockAssetInventoryService.remove(created.assetId, technician))
  throw new Error("Engineer archive failed");
if (
  mockAssetInventoryService
    .getAll()
    .some((asset) => asset.assetId === created.assetId)
)
  throw new Error("Archived asset remained in active inventory");
const archived = mockAssetInventoryService.getById(created.assetId);
if (!archived?.archivedAt || archived.history.at(-1).type !== "archived")
  throw new Error("Archived asset history was not preserved");
const legacyAssets = mockAssetInventoryService.getAll({ includeArchived: true });
delete legacyAssets[0].quantity;
legacyAssets[0].category = "printer";
legacyAssets[0].conditionRating = 5;
storage.set("hospital-helpdesk:assets:v2", JSON.stringify(legacyAssets));
const restored = mockAssetInventoryService.getById(legacyAssets[0].assetId);
if (restored?.quantity !== 1 || "category" in restored || "conditionRating" in restored)
  throw new Error("Legacy asset migration did not default quantity or ignore cancelled fields");
const sheetData = assetExportService.getSheetData({ search: "AST-0005" });
if (sheetData.rows.length !== 1 || sheetData.rows[0].quantity !== 3 ||
    sheetData.columns.some(({ key }) => ["category", "conditionRating"].includes(key)))
  throw new Error("Filtered asset spreadsheet included wrong records or cancelled fields");
const workbook = excelExportService.serialize(sheetData.columns, sheetData.rows);
const decoder = new TextDecoder();
const view = new DataView(workbook.buffer);
const entries = new Map();
let position = 0;
while (view.getUint32(position, true) === 0x04034B50) {
  const nameLength = view.getUint16(position + 26, true);
  const dataLength = view.getUint32(position + 18, true);
  const name = decoder.decode(workbook.subarray(position + 30, position + 30 + nameLength));
  const content = decoder.decode(workbook.subarray(position + 30 + nameLength, position + 30 + nameLength + dataLength));
  entries.set(name, content);
  position += 30 + nameLength + dataLength;
}
const sheet = entries.get("xl/worksheets/sheet1.xml");
if (!entries.has("[Content_Types].xml") || !entries.has("xl/workbook.xml") ||
    !sheet?.includes('rightToLeft="1"') || !sheet.includes("الكمية") ||
    !sheet.includes("AST-0005") || !sheet.includes("<v>3</v>") ||
    view.getUint32(position, true) !== 0x02014B50)
  throw new Error("Excel workbook packaging or Arabic asset worksheet failed");
const injectionSheet = excelExportService.serialize([{ key: "name", label: "الاسم" }], [{ name: '=HYPERLINK("https://example.invalid")' }]);
if (decoder.decode(injectionSheet).includes("<f>"))
  throw new Error("Spreadsheet value was interpreted as a formula");

const supportTicket = mockTicketService.create({
  reporterAccountId: "demo-employee-01", reporterName: "موظف اختبار", department: "شؤون العاملين",
  title: "مشكلة في الشاشة", category: "أجهزة الكمبيوتر", description: "اختبار سحب أصل تقني.",
});
mockTicketService.assign(supportTicket.id, technician.id, manager);
if (mockAssetInventoryService.withdrawForTicket("AST-0005", supportTicket.id, manager) !== null ||
    mockAssetInventoryService.withdrawForTicket("AST-0005", supportTicket.id, { id: "demo-engineer-02", role: "technician" }) !== null ||
    mockAssetInventoryService.withdrawForTicket("AST-0003", supportTicket.id, technician) !== null)
  throw new Error("Unauthorized or unavailable asset withdrawal was accepted");
const beforeWithdrawal = mockAssetInventoryService.getStatistics();
let withdrawalEvent = null;
const stopWithdrawalListener = appEvents.subscribe(EVENT_NAMES.ASSET_WITHDRAWN, (asset) => { withdrawalEvent = asset; });
const withdrawal = mockAssetInventoryService.withdrawForTicket("AST-0005", supportTicket.id, technician);
stopWithdrawalListener();
const canonicalEngineer = mockTechnicianService.getById(technician.id);
const remainingAsset = mockAssetInventoryService.getById("AST-0005");
const afterWithdrawal = mockAssetInventoryService.getStatistics();
if (!withdrawal || withdrawal.asset.assetId === "AST-0005" || withdrawal.asset.quantity !== 1 ||
    withdrawal.asset.operationalStatus !== "withdrawn" || withdrawal.asset.takenByEngineerName !== canonicalEngineer.name ||
    withdrawal.asset.withdrawnForTicketId !== supportTicket.id || remainingAsset.quantity !== 2 ||
    withdrawal.ticket.relatedAssetId !== withdrawal.asset.assetId || withdrawalEvent?.assetId !== withdrawal.asset.assetId ||
    !withdrawal.ticket.history.some((event) => event.type === "asset_withdrawal" && event.visibility === "internal") ||
    !mockTicketService.getByRelatedAssetId(withdrawal.asset.assetId).some((ticket) => ticket.id === supportTicket.id) ||
    afterWithdrawal.total !== beforeWithdrawal.total || afterWithdrawal.working !== beforeWithdrawal.working - 1 ||
    afterWithdrawal.withdrawn !== beforeWithdrawal.withdrawn + 1)
  throw new Error("Batch withdrawal did not preserve stock, engineer identity, ticket link, or history");
if (mockAssetInventoryService.withdrawForTicket("AST-0005", supportTicket.id, technician) !== null)
  throw new Error("Ticket withdrew a second asset without an explicit replacement flow");
const secondTicket = mockTicketService.create({
  reporterAccountId: "demo-employee-01", reporterName: "موظف اختبار", department: "شؤون العاملين",
  title: "مشكلة في الحاسب المحمول", category: "أجهزة الكمبيوتر", description: "اختبار سحب أصل واحد.",
});
mockTicketService.assign(secondTicket.id, technician.id, manager);
const singleWithdrawal = mockAssetInventoryService.withdrawForTicket("AST-0002", secondTicket.id, technician);
if (singleWithdrawal?.asset.assetId !== "AST-0002" || mockAssetInventoryService.getById("AST-0002")?.operationalStatus !== "withdrawn")
  throw new Error("Single-unit withdrawal did not update the existing asset");
const withdrawnRow = assetExportService.getSheetData({ operationalStatus: "withdrawn" }).rows.find((asset) => asset.assetId === withdrawal.asset.assetId);
if (withdrawnRow?.takenByEngineerName !== canonicalEngineer.name || withdrawnRow?.withdrawnForTicketId !== supportTicket.id)
  throw new Error("Withdrawn asset was missing from filtered export with engineer and ticket");
if (mockAssetInventoryService.update(withdrawal.asset.assetId, { ...withdrawal.asset, quantity: 2 }, manager) !== null ||
    mockAssetInventoryService.update(withdrawal.asset.assetId, { ...withdrawal.asset, operationalStatus: "working" }, manager) !== null)
  throw new Error("Withdrawn unit was altered through the generic asset form");
console.log(
  "PASS asset quantity validation, legacy migration, filtered Excel export, ticket-linked single and batch withdrawal, role controls, persistence, search, filters, updates, history, and soft archive",
);
