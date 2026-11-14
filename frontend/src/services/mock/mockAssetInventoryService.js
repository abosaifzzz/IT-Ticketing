import { appEvents, EVENT_NAMES } from "../events/eventBus.js";
import { localStorageAdapter } from "../storage/localStorageAdapter.js";
import { mockTechnicianService } from "./mockTechnicianService.js";
import { mockTicketService } from "./mockTicketService.js";

const STORAGE_KEY = "hospital-helpdesk:assets:v2";

export const operationalStatusLabels = Object.freeze({
  working: "يعمل",
  needs_maintenance: "يحتاج إلى صيانة",
  out_of_service: "خارج الخدمة",
  under_repair: "قيد الإصلاح",
  retired: "مستبعد",
  withdrawn: "تم السحب",
});
export const operationalStatuses = Object.freeze(
  Object.keys(operationalStatusLabels),
);

const seedAssets = [
  {
    assetId: "AST-0001",
    name: "كمبيوتر مكتب الاستقبال",
    manufacturer: "Dell",
    model: "OptiPlex 7090",
    serialNumber: "FCT-DEMO-1001",
    department: "العيادات الخارجية",
    location: "الطابق الأرضي — الاستقبال",
    purchaseDate: "2023-06-14",
    operationalStatus: "working",
    quantity: 1,
    conditionDescription: "يعمل بصورة مستقرة مع آثار استخدام بسيطة.",
    maintenanceNotes: "تنظيف دوري كل ستة أشهر.",
    lastMaintenanceDate: "2026-08-20",
  },
  {
    assetId: "AST-0002",
    name: "كمبيوتر محمول للاجتماعات",
    manufacturer: "Lenovo",
    model: "ThinkPad E14",
    serialNumber: "FCT-DEMO-1002",
    department: "شؤون العاملين",
    location: "مخزن تكنولوجيا المعلومات — رف 2",
    purchaseDate: "2024-02-10",
    operationalStatus: "working",
    quantity: 1,
    conditionDescription: "جهاز احتياطي بحالة ممتازة.",
    maintenanceNotes: "شحن البطارية وفحص التحديثات شهريًا.",
    lastMaintenanceDate: "2026-10-04",
  },
  {
    assetId: "AST-0003",
    name: "طابعة صرف الأدوية",
    manufacturer: "HP",
    model: "LaserJet Pro M404",
    serialNumber: "FCT-DEMO-1003",
    department: "الصيدلية",
    location: "مكتب صرف الأدوية",
    purchaseDate: "2022-11-02",
    operationalStatus: "needs_maintenance",
    quantity: 1,
    conditionDescription: "انحشار ورق متكرر وصوت مرتفع أثناء السحب.",
    maintenanceNotes: "تحتاج إلى فحص مجموعة سحب الورق.",
    lastMaintenanceDate: "2026-10-25",
  },
  {
    assetId: "AST-0004",
    name: "محول شبكة المعمل",
    manufacturer: "Cisco",
    model: "CBS350-24T",
    serialNumber: "FCT-DEMO-1004",
    department: "المعامل",
    location: "غرفة الشبكات الرئيسية",
    purchaseDate: "2023-09-18",
    operationalStatus: "working",
    quantity: 1,
    conditionDescription: "جميع المنافذ تعمل ولا توجد تنبيهات.",
    maintenanceNotes: "نسخة الإعدادات محفوظة ضمن إجراءات القسم.",
    lastMaintenanceDate: "2026-09-12",
  },
  {
    assetId: "AST-0005",
    name: "شاشة احتياطية 24 بوصة",
    manufacturer: "Dell",
    model: "P2422H",
    serialNumber: "",
    department: "شؤون العاملين",
    location: "مخزن تكنولوجيا المعلومات — رف 4",
    purchaseDate: "",
    operationalStatus: "working",
    quantity: 3,
    conditionDescription: "وحدة احتياطية جديدة لم تُستخدم.",
    maintenanceNotes: "",
    lastMaintenanceDate: "",
  },
  {
    assetId: "AST-0006",
    name: "ماسح مستندات الحسابات",
    manufacturer: "Canon",
    model: "DR-C240",
    serialNumber: "FCT-DEMO-1006",
    department: "الحسابات",
    location: "غرفة الأرشيف",
    purchaseDate: "2021-05-07",
    operationalStatus: "under_repair",
    quantity: 1,
    conditionDescription: "تعذر سحب المستندات متعددة الصفحات.",
    maintenanceNotes: "جارٍ انتظار بكرة تغذية بديلة.",
    lastMaintenanceDate: "2026-10-18",
  },
];
const trackedFields = [
  "name",
  "quantity",
  "manufacturer",
  "model",
  "serialNumber",
  "department",
  "location",
  "purchaseDate",
  "operationalStatus",
  "conditionDescription",
  "maintenanceNotes",
  "lastMaintenanceDate",
];
const requiredFields = [
  "assetId",
  "name",
  "manufacturer",
  "model",
  "department",
  "location",
  "operationalStatus",
  "conditionDescription",
];
const clean = (value) => value?.trim() ?? "";
const actorSnapshot = (actor) => ({
  actorAccountId: actor.id,
  actorName: actor.name,
  actorRole: actor.role,
});
function initialData() {
  const timestamp = "2026-10-01T08:00:00.000Z";
  return seedAssets.map((asset) => ({
    ...asset,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    history: [
      {
        type: "created",
        timestamp,
        actorAccountId: "system",
        actorName: "بيانات تجريبية",
        actorRole: "system",
        changes: [],
      },
    ],
  }));
}
function normalize(input) {
  const values = {
    assetId: clean(input.assetId).toUpperCase(),
    name: clean(input.name),
    quantity: Number(input.quantity),
    manufacturer: clean(input.manufacturer),
    model: clean(input.model),
    serialNumber: clean(input.serialNumber),
    department: clean(input.department),
    location: clean(input.location),
    purchaseDate: input.purchaseDate || "",
    operationalStatus: input.operationalStatus,
    conditionDescription: clean(input.conditionDescription),
    maintenanceNotes: clean(input.maintenanceNotes),
    lastMaintenanceDate: input.lastMaintenanceDate || "",
  };
  if (
    requiredFields.some((field) => !values[field]) ||
    !/^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(values.assetId) ||
    !Number.isInteger(values.quantity) ||
    values.quantity < 1 ||
    values.quantity > 1000000 ||
    !operationalStatuses.includes(values.operationalStatus)
  )
    return null;
  return values;
}
function canWrite(actor) {
  return Boolean(actor && ["technician", "manager"].includes(actor.role));
}
function save(assets, eventName, payload) {
  localStorageAdapter.set(STORAGE_KEY, assets);
  appEvents.publish(eventName, payload);
  appEvents.publish(EVENT_NAMES.ASSETS_CHANGED, assets);
}

function normalizeStoredAsset(asset) {
  const normalized = {
    ...asset,
    quantity: Number.isInteger(Number(asset.quantity)) && Number(asset.quantity) > 0 ? Number(asset.quantity) : 1,
    history: asset.history.map((entry) => ({
      ...entry,
      changes: entry.changes.map((change) => ({ ...change })),
    })),
  };
  delete normalized.category;
  delete normalized.conditionRating;
  return normalized;
}

export const mockAssetInventoryService = {
  getAll({ includeArchived = false } = {}) {
    return localStorageAdapter
      .get(STORAGE_KEY, initialData())
      .filter((asset) => includeArchived || !asset.archivedAt)
      .map(normalizeStoredAsset);
  },
  getById(assetId) {
    const normalizedId = clean(assetId).toUpperCase();
    return (
      this.getAll({ includeArchived: true }).find(
        (asset) => asset.assetId === normalizedId,
      ) ?? null
    );
  },
  query({
    search = "",
    department = "all",
    operationalStatus = "all",
  } = {}) {
    const query = search.trim().toLocaleLowerCase("ar");
    return this.getAll()
      .filter(
        (asset) =>
          !query ||
          [asset.assetId, asset.name, asset.model, asset.serialNumber].some(
            (value) => value?.toLocaleLowerCase("ar").includes(query),
          ),
      )
      .filter(
        (asset) => department === "all" || asset.department === department,
      )
      .filter(
        (asset) =>
          operationalStatus === "all" ||
          asset.operationalStatus === operationalStatus,
      )
      .sort((first, second) =>
        first.assetId.localeCompare(second.assetId, "en"),
      );
  },
  getStatistics() {
    return this.getAll().reduce(
      (summary, asset) => ({
        ...summary,
        total: summary.total + asset.quantity,
        recordCount: summary.recordCount + 1,
        [asset.operationalStatus]: summary[asset.operationalStatus] + asset.quantity,
      }),
      {
        total: 0,
        recordCount: 0,
        working: 0,
        needs_maintenance: 0,
        out_of_service: 0,
        under_repair: 0,
        retired: 0,
        withdrawn: 0,
      },
    );
  },
  create(input, actor) {
    if (!canWrite(actor)) return null;
    const values = normalize(input);
    if (!values || values.operationalStatus === "withdrawn" || this.getById(values.assetId)) return null;
    const timestamp = new Date().toISOString();
    const asset = {
      ...values,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      history: [
        { type: "created", timestamp, ...actorSnapshot(actor), changes: [] },
      ],
    };
    save(
      [asset, ...this.getAll({ includeArchived: true })],
      EVENT_NAMES.ASSET_CREATED,
      asset,
    );
    return asset;
  },
  update(assetId, input, actor) {
    if (!canWrite(actor)) return null;
    const existing = this.getById(assetId);
    if (!existing || existing.archivedAt) return null;
    const values = normalize({ ...input, assetId: existing.assetId });
    if (!values ||
      (values.operationalStatus === "withdrawn" && existing.operationalStatus !== "withdrawn") ||
      (existing.operationalStatus === "withdrawn" && (values.operationalStatus !== "withdrawn" || values.quantity !== 1))) return null;
    const changes = trackedFields
      .filter((field) => existing[field] !== values[field])
      .map((field) => ({
        field,
        previousValue: existing[field],
        nextValue: values[field],
      }));
    if (!changes.length) return existing;
    const timestamp = new Date().toISOString();
    const updated = {
      ...existing,
      ...values,
      assetId: existing.assetId,
      updatedAt: timestamp,
      history: [
        ...existing.history,
        { type: "updated", timestamp, ...actorSnapshot(actor), changes },
      ],
    };
    save(
      this.getAll({ includeArchived: true }).map((asset) =>
        asset.assetId === existing.assetId ? updated : asset,
      ),
      EVENT_NAMES.ASSET_UPDATED,
      updated,
    );
    return updated;
  },
  withdrawForTicket(assetId, ticketId, actor) {
    const source = this.getById(assetId);
    const ticket = mockTicketService.getByIdForTechnician(ticketId, actor?.id);
    const engineer = mockTechnicianService.getById(actor?.id);
    if (
      actor?.role !== "technician" || !engineer?.active || engineer.role !== "technician" ||
      !ticket || !["assigned", "in_progress", "pending", "reopened"].includes(ticket.status) ||
      ticket.relatedAssetId || !source || source.archivedAt ||
      source.operationalStatus !== "working" || source.quantity < 1
    ) return null;

    const timestamp = new Date().toISOString();
    const allAssets = this.getAll({ includeArchived: true });
    let withdrawnId = source.assetId;
    if (source.quantity > 1) {
      do {
        withdrawnId = `AST-WD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      } while (allAssets.some((asset) => asset.assetId === withdrawnId));
    }
    const event = {
      type: "withdrawn", timestamp, ...actorSnapshot({ id: engineer.id, name: engineer.name, role: "technician" }),
      ticketId: ticket.id, sourceAssetId: source.assetId,
      note: `سحب المهندس ${engineer.name} وحدة للبلاغ ${ticket.id}`,
    };
    const withdrawn = {
      ...source,
      assetId: withdrawnId,
      quantity: 1,
      serialNumber: source.quantity > 1 ? "" : source.serialNumber,
      operationalStatus: "withdrawn",
      location: `بعهدة المهندس ${engineer.name}`,
      sourceAssetId: source.assetId,
      withdrawnForTicketId: ticket.id,
      takenByEngineerId: engineer.id,
      takenByEngineerName: engineer.name,
      withdrawnAt: timestamp,
      createdAt: source.quantity > 1 ? timestamp : source.createdAt,
      updatedAt: timestamp,
      history: source.quantity > 1
        ? [{ ...event, changes: [{ field: "operationalStatus", previousValue: source.operationalStatus, nextValue: "withdrawn" }, { field: "location", previousValue: source.location, nextValue: `بعهدة المهندس ${engineer.name}` }] }]
        : [...source.history, { ...event, changes: [{ field: "operationalStatus", previousValue: source.operationalStatus, nextValue: "withdrawn" }, { field: "location", previousValue: source.location, nextValue: `بعهدة المهندس ${engineer.name}` }] }],
    };
    const remaining = source.quantity > 1 ? {
      ...source,
      quantity: source.quantity - 1,
      updatedAt: timestamp,
      history: [...source.history, { ...event, changes: [{ field: "quantity", previousValue: source.quantity, nextValue: source.quantity - 1 }] }],
    } : null;

    const updatedTicket = mockTicketService.update(ticket.id, {
      relatedAssetId: withdrawn.assetId,
      history: [...ticket.history, {
        id: `asset-withdrawal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: "asset_withdrawal", visibility: "internal", timestamp,
        assetId: withdrawn.assetId,
        note: `سحب المهندس ${engineer.name} الأصل ${withdrawn.name} (${withdrawn.assetId})`,
      }],
    });
    if (!updatedTicket) return null;
    const assets = allAssets.map((asset) => asset.assetId === source.assetId ? (remaining ?? withdrawn) : asset);
    if (remaining) assets.unshift(withdrawn);
    save(assets, EVENT_NAMES.ASSET_WITHDRAWN, withdrawn);
    return { asset: withdrawn, ticket: updatedTicket };
  },
  remove(assetId, actor) {
    if (!actor || !["technician", "manager"].includes(actor.role)) return false;
    const existing = this.getById(assetId);
    if (!existing || existing.archivedAt) return false;
    const timestamp = new Date().toISOString();
    const archived = {
      ...existing,
      archivedAt: timestamp,
      updatedAt: timestamp,
      history: [
        ...existing.history,
        { type: "archived", timestamp, ...actorSnapshot(actor), changes: [] },
      ],
    };
    save(
      this.getAll({ includeArchived: true }).map((asset) =>
        asset.assetId === existing.assetId ? archived : asset,
      ),
      EVENT_NAMES.ASSET_ARCHIVED,
      archived,
    );
    return true;
  },
};
