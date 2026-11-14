const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
};

const { mockFaultCategoryService } =
  await import("../src/services/mock/mockFaultCategoryService.js");
const { mockDepartmentService } =
  await import("../src/services/mock/mockDepartmentService.js");
const { mockTechnicianService } =
  await import("../src/services/mock/mockTechnicianService.js");
const { mockTicketService } =
  await import("../src/services/mock/mockTicketService.js");
const { appEvents, EVENT_NAMES } =
  await import("../src/services/events/eventBus.js");

let categoryEventCount = 0;
const unsubscribeCategory = appEvents.subscribe(
  EVENT_NAMES.FAULT_CATEGORIES_CHANGED,
  () => {
    categoryEventCount += 1;
  },
);
const category = mockFaultCategoryService.add(
  "اختبار الأجهزة الطبية غير الحساسة",
);
if (
  !category ||
  !mockFaultCategoryService.getActive().some((item) => item.id === category.id)
)
  throw new Error("New category did not propagate to active ticket options");
const subcategory = mockFaultCategoryService.addSubcategory(
  category.id,
  "ملحق تجريبي",
);
if (
  !subcategory ||
  !mockFaultCategoryService
    .getAll()
    .find((item) => item.id === category.id)
    ?.subcategories.some((item) => item.id === subcategory.id)
)
  throw new Error("New subcategory did not persist");
mockFaultCategoryService.updateSubcategory(
  category.id,
  subcategory.id,
  "ملحق تجريبي محدّث",
);
mockFaultCategoryService.setSubcategoryActive(
  category.id,
  subcategory.id,
  false,
);
if (
  mockFaultCategoryService
    .getAll()
    .find((item) => item.id === category.id)
    ?.subcategories.find((item) => item.id === subcategory.id)?.active !== false
)
  throw new Error("Subcategory activation update failed");
mockFaultCategoryService.setActive(category.id, false);
if (
  mockFaultCategoryService
    .getActive()
    .some((item) => item.id === category.id) ||
  categoryEventCount < 3
)
  throw new Error("Category activation or event propagation failed");
unsubscribeCategory();

const historicalCategory = mockTicketService.getById("IT-1048").category;
const printerCategory = mockFaultCategoryService
  .getAll()
  .find((item) => item.name === "الطابعات");
mockFaultCategoryService.update(printerCategory.id, "الطابعات وأجهزة الطباعة");
if (mockTicketService.getById("IT-1048").category !== historicalCategory)
  throw new Error("Historical ticket category label was overwritten");

const department = mockDepartmentService.add("قسم تجريبي");
if (
  !department ||
  !mockDepartmentService.getActive().some((item) => item.id === department.id)
)
  throw new Error(
    "New department did not propagate to active dropdown options",
  );
mockDepartmentService.update(department.id, "قسم تجريبي محدّث");
mockDepartmentService.setActive(department.id, false);
if (mockDepartmentService.getActive().some((item) => item.id === department.id))
  throw new Error("Inactive department remained in active dropdown options");
const historicalDepartment = mockTicketService.getById("IT-1048").department;
const outpatient = mockDepartmentService
  .getAll()
  .find((item) => item.name === "العيادات الخارجية");
mockDepartmentService.update(outpatient.id, "العيادات الخارجية والمشتركة");
if (mockTicketService.getById("IT-1048").department !== historicalDepartment)
  throw new Error("Historical ticket department label was overwritten");

const technician = mockTechnicianService.add({
  name: "مهندس تجريبي",
  username: "new.engineer.demo",
  role: "technician",
  active: true,
});
if (
  !technician ||
  !mockTechnicianService.getActive().some((item) => item.id === technician.id)
)
  throw new Error("New technician did not propagate to assignment options");
if (
  mockTechnicianService.add({
    name: "مكرر",
    username: "new.engineer.demo",
    role: "technician",
  }) !== null
)
  throw new Error("Duplicate demo username was accepted");
const managerUser = mockTechnicianService.add({
  name: "مدير تجريبي إضافي",
  username: "new.manager.demo",
  role: "manager",
  active: true,
});
if (!managerUser || managerUser.jobTitle !== "مدير تكنولوجيا المعلومات")
  throw new Error("Manager role option failed");
if (
  mockTicketService.assign("IT-1047", managerUser.id, {
    id: "demo-manager-01",
    name: "خالد عادل",
  }) !== null
)
  throw new Error("Manager user appeared as an assignable engineer");
const demoManager = { id: "demo-manager-01", name: "خالد عادل" };
const assigned = mockTicketService.assign(
  "IT-1046",
  technician.id,
  demoManager,
);
if (assigned?.assignedTechnicianId !== technician.id)
  throw new Error("New technician could not receive an assignment");
mockTechnicianService.update(technician.id, {
  ...technician,
  name: "مهندس تجريبي محدّث",
  role: "technician",
});
if (mockTicketService.getById("IT-1046").assignedTechnician !== "مهندس تجريبي")
  throw new Error("Historical technician reference was overwritten");
mockTechnicianService.setActive(technician.id, false);
if (mockTicketService.assign("IT-1047", technician.id, demoManager) !== null)
  throw new Error("Inactive technician accepted a new assignment");
if (mockTicketService.getById("IT-1046").assignedTechnicianId !== technician.id)
  throw new Error("Inactive technician lost historical ticket assignment");

console.log(
  "PASS category, subcategory, department, and technician persistence, propagation, activation, events, and historical references",
);
