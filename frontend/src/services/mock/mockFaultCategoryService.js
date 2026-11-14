import { appEvents, EVENT_NAMES } from '../events/eventBus.js'
import { localStorageAdapter } from '../storage/localStorageAdapter.js'
import { seedFaultCategories } from './seedData.js'

const STORAGE_KEY = 'hospital-helpdesk:fault-categories:v1'
const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const clean = (value) => value?.trim()

function save(categories) {
  localStorageAdapter.set(STORAGE_KEY, categories)
  appEvents.publish(EVENT_NAMES.FAULT_CATEGORIES_CHANGED, categories)
  return categories
}

export const mockFaultCategoryService = {
  getAll() { return localStorageAdapter.get(STORAGE_KEY, seedFaultCategories) },
  getActive() { return this.getAll().filter((category) => category.active) },
  search(query = '') {
    const value = clean(query)?.toLocaleLowerCase('ar') ?? ''
    return this.getAll().filter((category) => !value || category.name.toLocaleLowerCase('ar').includes(value) || category.subcategories.some((subcategory) => subcategory.name.toLocaleLowerCase('ar').includes(value)))
  },
  add(name) {
    const value = clean(name)
    if (!value || this.getAll().some((category) => category.name === value)) return null
    const category = { id: makeId('category'), name: value, active: true, subcategories: [] }
    save([...this.getAll(), category])
    return category
  },
  update(id, name) {
    const value = clean(name)
    if (!value || this.getAll().some((category) => category.id !== id && category.name === value)) return null
    let updated = null
    const categories = this.getAll().map((category) => category.id === id ? (updated = { ...category, name: value }) : category)
    if (updated) save(categories)
    return updated
  },
  setActive(id, active) {
    let updated = null
    const categories = this.getAll().map((category) => category.id === id ? (updated = { ...category, active: Boolean(active) }) : category)
    if (updated) save(categories)
    return updated
  },
  addSubcategory(categoryId, name) {
    const value = clean(name)
    let created = null
    const categories = this.getAll().map((category) => {
      if (category.id !== categoryId || !value || category.subcategories.some((item) => item.name === value)) return category
      created = { id: makeId('subcategory'), name: value, active: true }
      return { ...category, subcategories: [...category.subcategories, created] }
    })
    if (created) save(categories)
    return created
  },
  updateSubcategory(categoryId, subcategoryId, name) {
    const value = clean(name)
    let updated = null
    const categories = this.getAll().map((category) => {
      if (category.id !== categoryId || !value || category.subcategories.some((item) => item.id !== subcategoryId && item.name === value)) return category
      return { ...category, subcategories: category.subcategories.map((item) => item.id === subcategoryId ? (updated = { ...item, name: value }) : item) }
    })
    if (updated) save(categories)
    return updated
  },
  setSubcategoryActive(categoryId, subcategoryId, active) {
    let updated = null
    const categories = this.getAll().map((category) => category.id === categoryId ? { ...category, subcategories: category.subcategories.map((item) => item.id === subcategoryId ? (updated = { ...item, active: Boolean(active) }) : item) } : category)
    if (updated) save(categories)
    return updated
  },
}
