import { appEvents, EVENT_NAMES } from '../events/eventBus.js'
import { localStorageAdapter } from '../storage/localStorageAdapter.js'
import { seedDepartments } from './seedData.js'

const STORAGE_KEY = 'hospital-helpdesk:departments:v1'
const makeId = () => `department-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function save(departments) {
  localStorageAdapter.set(STORAGE_KEY, departments)
  appEvents.publish(EVENT_NAMES.DEPARTMENTS_CHANGED, departments)
  return departments
}

export const mockDepartmentService = {
  getAll() { return localStorageAdapter.get(STORAGE_KEY, seedDepartments) },
  getActive() { return this.getAll().filter((department) => department.active) },
  search(query = '') {
    const value = query.trim().toLocaleLowerCase('ar')
    return this.getAll().filter((department) => !value || department.name.toLocaleLowerCase('ar').includes(value))
  },
  add(name) {
    const value = name?.trim()
    if (!value || this.getAll().some((department) => department.name === value)) return null
    const department = { id: makeId(), name: value, active: true }
    save([...this.getAll(), department])
    return department
  },
  update(id, name) {
    const value = name?.trim()
    if (!value || this.getAll().some((department) => department.id !== id && department.name === value)) return null
    let updated = null
    const departments = this.getAll().map((department) => department.id === id ? (updated = { ...department, name: value }) : department)
    if (updated) save(departments)
    return updated
  },
  setActive(id, active) {
    let updated = null
    const departments = this.getAll().map((department) => department.id === id ? (updated = { ...department, active: Boolean(active) }) : department)
    if (updated) save(departments)
    return updated
  },
}
