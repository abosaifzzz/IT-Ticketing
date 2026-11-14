import { mockDepartmentService } from './mockDepartmentService.js'

// Fictional development-only directory. Never mixed into API sessions.
export const mockEmployeeOptionsService = {
  query(search = '', page = 1) {
    const departments = mockDepartmentService.getActive()
    const entries = departments.length ? Array.from({ length: 132 }, (_, index) => {
      const department = departments[index % departments.length]
      return { id: `mock-employee-${String(index + 1).padStart(3, '0')}`, fullName: `موظف تجريبي ${String(index + 1).padStart(3, '0')}`, departmentId: department.id, departmentName: department.name }
    }) : []
    const filtered = entries.filter((item) => item.fullName.includes(search.trim()))
    return { items: filtered.slice((page - 1) * 25, page * 25), total: filtered.length, page, pageSize: 25 }
  },
}
