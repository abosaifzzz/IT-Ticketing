// Server-issued initial/temporary password (new accounts, roster import and Admin resets).
// It is not a secret credential: every first login must replace it. The setup page sends it
// automatically so users are not asked to retype the password they just signed in with.
export const TEMPORARY_PASSWORD = '123'

export function validateProfileForm({ phone, departmentIds, currentPassword, newPassword, confirmPassword }, activeDepartmentIds, { setup = false, role = '' } = {}) {
  const trimmedPhone = phone.trim()
  const digits = (trimmedPhone.match(/[0-9]/g) ?? []).length
  if (!/^\+?[0-9][0-9 ()-]{5,30}[0-9]$/.test(trimmedPhone) || digits < 7 || digits > 15) return 'أدخل رقم هاتف صحيحًا من ٧ إلى ١٥ رقمًا.'
  if (!Array.isArray(departmentIds) || !departmentIds.length || departmentIds.length > 100 || new Set(departmentIds).size !== departmentIds.length || departmentIds.some((id) => !activeDepartmentIds.has(id))) return 'اختر قسمًا نشطًا واحدًا على الأقل دون تكرار.'
  if (!setup) return ''
  if (!currentPassword || !newPassword || newPassword !== confirmPassword) return 'أدخل كلمة المرور الجديدة وتأكد من تطابقها مع التأكيد.'
  const adminPasswordInvalid = role === 'admin' && ([...newPassword].length < 16 || /[\r\n\0]/.test(newPassword) || newPassword.trim() !== newPassword)
  if (newPassword === currentPassword || newPassword === TEMPORARY_PASSWORD || new TextEncoder().encode(newPassword).length > 1024 || adminPasswordInvalid) return 'اختر كلمة مرور جديدة مختلفة عن الحالية والمؤقتة. كلمة مرور مسؤول النظام تتطلب ١٦ حرفًا على الأقل دون مسافات طرفية أو أسطر جديدة.'
  return ''
}
