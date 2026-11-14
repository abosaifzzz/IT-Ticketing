import { localStorageAdapter } from "../storage/localStorageAdapter.js";
import { appEvents, EVENT_NAMES } from "../events/eventBus.js";
import { seedTechnicians } from "./seedData.js";

const STORAGE_KEY = "hospital-helpdesk:technicians:v2";
const LEGACY_STORAGE_KEY = "hospital-helpdesk:technicians:v1";
const legacySeedIds = new Set([
  "demo-engineer-01",
  "demo-engineer-02",
  "demo-engineer-03",
  "demo-engineer-04",
  "demo-manager-01",
  "demo-manager-02",
  "demo-manager-03",
]);
const makeId = () =>
  `demo-it-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
export const itStaffRoleLabels = Object.freeze({
  technician: "مهندس تكنولوجيا المعلومات",
  manager: "مدير تكنولوجيا المعلومات",
});
const staffRoles = Object.keys(itStaffRoleLabels);

function normalize(technician) {
  const role = staffRoles.includes(technician.role)
    ? technician.role
    : technician.jobTitle?.includes("مدير")
      ? "manager"
      : "technician";
  return {
    username: "",
    ...technician,
    role,
    jobTitle: itStaffRoleLabels[role],
    available:
      role === "technician" ? technician.available !== false : undefined,
  };
}

export function getEngineerAvailabilityLabel(engineer) {
  return !engineer?.active
    ? "غير نشط"
    : engineer.available === false
      ? "غير متاح مؤقتًا"
      : "متاح للإسناد";
}

function save(technicians) {
  localStorageAdapter.set(STORAGE_KEY, technicians);
  appEvents.publish(EVENT_NAMES.TECHNICIANS_CHANGED, technicians);
  return technicians;
}

export const mockTechnicianService = {
  getAll() {
    const current = localStorageAdapter.get(STORAGE_KEY);
    if (current) return current.map(normalize);
    const legacy = localStorageAdapter.get(LEGACY_STORAGE_KEY);
    if (!Array.isArray(legacy)) return seedTechnicians.map(normalize);
    const migrated = [
      ...seedTechnicians.map((seed) => {
        const previous = legacy.find((person) => person.id === seed.id);
        return previous
          ? {
              ...previous,
              ...seed,
              active: seed.id === "demo-engineer-03" ? true : previous.active,
            }
          : seed;
      }),
      ...legacy.filter((person) => !legacySeedIds.has(person.id)),
    ];
    localStorageAdapter.set(STORAGE_KEY, migrated);
    return migrated.map(normalize);
  },
  getById(id) {
    return this.getAll().find((technician) => technician.id === id) ?? null;
  },
  getActive() {
    return this.getAll().filter((technician) => technician.active);
  },
  getTechnicians() {
    return this.getAll().filter(
      (technician) => technician.role === "technician",
    );
  },
  search(query = "") {
    const value = query.trim().toLocaleLowerCase("ar");
    return this.getAll().filter(
      (technician) =>
        !value ||
        [technician.name, technician.username, technician.jobTitle].some(
          (field) => field?.toLocaleLowerCase("ar").includes(value),
        ),
    );
  },
  add(input) {
    const name = input.name?.trim();
    const username = input.username?.trim().toLocaleLowerCase("en");
    if (
      !name ||
      !username ||
      !staffRoles.includes(input.role) ||
      this.getAll().some(
        (technician) =>
          technician.username.toLocaleLowerCase("en") === username,
      )
    )
      return null;
    const technician = normalize({
      id: makeId(),
      name,
      username,
      role: input.role,
      active: input.active !== false,
    });
    save([...this.getAll(), technician]);
    return technician;
  },
  update(id, input) {
    const name = input.name?.trim();
    const username = input.username?.trim().toLocaleLowerCase("en");
    if (
      !name ||
      !username ||
      !staffRoles.includes(input.role) ||
      this.getAll().some(
        (technician) =>
          technician.id !== id &&
          technician.username.toLocaleLowerCase("en") === username,
      )
    )
      return null;
    let updated = null;
    const technicians = this.getAll().map((technician) =>
      technician.id === id
        ? (updated = normalize({
            ...technician,
            name,
            username,
            role: input.role,
          }))
        : technician,
    );
    if (updated) save(technicians);
    return updated;
  },
  setActive(id, active) {
    let updated = null;
    const technicians = this.getAll().map((technician) =>
      technician.id === id
        ? (updated = { ...technician, active: Boolean(active) })
        : technician,
    );
    if (updated) save(technicians);
    return updated;
  },
  setAvailability(id, available, actor) {
    const engineer = this.getById(id);
    if (
      !engineer ||
      !engineer.active ||
      engineer.role !== "technician" ||
      actor?.role !== "technician" ||
      actor.id !== id
    )
      return null;
    if (engineer.available === Boolean(available)) return engineer;
    const updated = { ...engineer, available: Boolean(available) };
    save(this.getAll().map((person) => (person.id === id ? updated : person)));
    return updated;
  },
};
