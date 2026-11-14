import { ApiError, invalid, uuid } from '../management/validation.js'

const working = ['assigned', 'in_progress', 'pending', 'reopened']
export function transition(action, status) {
  const allowed = { in_progress: ['assigned', 'pending', 'reopened'], pending: ['assigned', 'in_progress', 'reopened'],
    resolved: working, confirm: ['resolved', 'closed'], reopen: ['resolved', 'closed'] }
  if (!allowed[action]?.includes(status)) throw new ApiError(409, 'حالة البلاغ لا تسمح بهذا الإجراء.')
  return { resolved: 'closed', confirm: 'closed', reopen: 'reopened' }[action] ?? action
}

export function workflowText(value, max = 4000, optional = false) {
  if (optional && (value === undefined || value === '')) return ''
  if (typeof value !== 'string') invalid()
  const clean = value.trim().normalize('NFC')
  if ((!optional && !clean) || clean.length > max || [...clean].some((char) => {
    const code = char.charCodeAt(0)
    return (code < 32 && !['\n', '\r', '\t'].includes(char)) || code === 127
  })) invalid()
  return clean
}

export function workflowInput(action, body = {}) {
  const allowed = {
    assign: ['technicianId', 'expectedVersion'], claim: ['expectedVersion'],
    status: ['status', 'pendingReason', 'solutionDescription', 'expectedVersion'],
    note: ['text', 'visibility', 'expectedVersion'], comment: ['text', 'expectedVersion'],
    confirm: ['expectedVersion'], reopen: ['reason', 'expectedVersion'],
  }[action]
  if (!allowed || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) invalid()
  const expectedVersion = body.expectedVersion
  if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 0 || expectedVersion > 4294967294)) invalid()
  const input = { expectedVersion }
  if (action === 'assign') {
    if (expectedVersion === undefined) invalid()
    input.technicianId = uuid(body.technicianId)
  }
  if (action === 'status') {
    if (!['in_progress', 'pending', 'resolved'].includes(body.status)) invalid()
    input.status = body.status
    if (body.status === 'pending') input.text = workflowText(body.pendingReason, 2000)
    else if (body.pendingReason !== undefined) invalid()
    if (body.status === 'resolved') input.text = workflowText(body.solutionDescription)
    else if (body.solutionDescription !== undefined) invalid()
  }
  if (action === 'note') {
    input.visibility = body.visibility ?? 'public'
    if (!['public', 'internal'].includes(input.visibility)) invalid()
  }
  if (action === 'note' || action === 'comment') input.text = workflowText(body.text)
  if (action === 'reopen') input.text = workflowText(body.reason, 2000, true) || 'أفاد الموظف بأن المشكلة ما زالت موجودة'
  return input
}

export function requireActionRole(action, role) {
  const roles = { assign: ['manager'], claim: ['technician'], status: ['technician'], note: ['technician'],
    comment: ['employee'], confirm: ['employee'], reopen: ['employee'] }
  if (!roles[action]?.includes(role)) throw new ApiError(403, 'الطلب غير مسموح.')
}

export const workingStatuses = Object.freeze(working)
