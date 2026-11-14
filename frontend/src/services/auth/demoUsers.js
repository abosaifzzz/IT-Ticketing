// Identity data may be referenced by legacy development pages; credentials must never ship.
const identities = [
  {
    "id": "demo-employee-01",
    "username": "samar.eraky@demo.example",
    "name": "سمر عراقي",
    "role": "employee",
    "roleLabel": "موظف",
    "destination": "/employee"
  },
  {
    "id": "demo-employee-02",
    "username": "walaa@demo.example",
    "name": "ولاء",
    "role": "employee",
    "roleLabel": "موظف",
    "destination": "/employee"
  },
  {
    "id": "demo-engineer-01",
    "username": "mohamed@demo.example",
    "name": "محمد",
    "role": "technician",
    "roleLabel": "مهندس تكنولوجيا المعلومات",
    "destination": "/technician"
  },
  {
    "id": "demo-engineer-02",
    "username": "ahmed@demo.example",
    "name": "أحمد",
    "role": "technician",
    "roleLabel": "مهندس تكنولوجيا المعلومات",
    "destination": "/technician"
  },
  {
    "id": "demo-engineer-03",
    "username": "abdelrahman@demo.example",
    "name": "عبد الرحمن",
    "role": "technician",
    "roleLabel": "مهندس تكنولوجيا المعلومات",
    "destination": "/technician"
  },
  {
    "id": "demo-manager-01",
    "username": "samira@demo.example",
    "name": "سميرة",
    "role": "manager",
    "roleLabel": "مدير تكنولوجيا المعلومات",
    "destination": "/manager"
  },
  {
    "id": "demo-manager-02",
    "username": "nehal@demo.example",
    "name": "نهال",
    "role": "manager",
    "roleLabel": "مدير تكنولوجيا المعلومات",
    "destination": "/manager"
  },
  {
    "id": "demo-manager-03",
    "username": "nesma@demo.example",
    "name": "نسمة",
    "role": "manager",
    "roleLabel": "مدير تكنولوجيا المعلومات",
    "destination": "/manager"
  }
]
const passwords = import.meta.env && (!import.meta.env.DEV || import.meta.env.VITE_AUTH_MODE !== 'mock') ? {} : (await import('./demoCredentials.js')).DEMO_PASSWORDS
export const DEMO_USERS = Object.freeze(identities.map(user => Object.freeze({...user, ...(passwords[user.id] ? {password:passwords[user.id]} : {})})))
export const ROLE_DESTINATIONS = Object.freeze(Object.fromEntries(identities.map(({role,destination})=>[role,destination])))
