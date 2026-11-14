import {ApiError} from '../management/validation.js'

export const roles=Object.freeze(['employee','technician','manager','admin'])
export const adminPermissions=Object.freeze([
 'admin.dashboard.read','admin.users.read','admin.users.create','admin.users.update','admin.users.disable',
 'admin.users.reset_password','admin.roles.read','admin.permissions.manage','admin.audit.read','admin.settings.read',
 'admin.settings.update','admin.backups.read','admin.backups.create','admin.backups.restore','admin.monitoring.read',
 'admin.errors.read','admin.sessions.revoke',
])
export const requiredPermissions=Object.freeze(['admin.users.read','admin.users.update','admin.roles.read','admin.permissions.manage','admin.audit.read','admin.settings.read','admin.settings.update'])
export const operationalPermissions=Object.freeze({
 employee:['tickets.create.personal','tickets.read.owned','tickets.comment.owned','tickets.confirm.owned','tickets.reopen.owned'],
 technician:['tickets.read.shared','tickets.work.assigned','tickets.claim','tickets.create.manual','availability.update.self','assets.full','directory.read','directory.create'],
 manager:['tickets.read.all','tickets.assign','tickets.create.manual','references.manage','it_users.manage','directory.read','directory.create','reports.read','assets.full'],
})
export function requireAdminIdentity(user) {
 if(user?.role!=='admin')throw new ApiError(403,'Administrative access required')
}
export function strongAdminPassword(password) {
 return typeof password==='string'&&[...password].length>=16&&Buffer.byteLength(password,'utf8')<=1024&&!/[\r\n]/.test(password)&&!password.includes(String.fromCharCode(0))&&password.trim()===password
}
export function requireStrongAdminPassword(password) {
 if(!strongAdminPassword(password))throw new ApiError(400,'Administrative passwords require at least 16 characters, without line breaks or surrounding whitespace')
}
export const administrativeTables=Object.freeze(['admin_guard','admin_role_permissions','admin_settings','admin_audit','admin_requests','admin_backups'])
