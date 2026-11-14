import { ApiError } from './validation.js'

export async function lockManager(connection, actor) {
  // Repository calls made directly by trusted provisioning/tests may omit actor.
  // Every HTTP management write supplies its authenticated actor.
  if (!actor) return
  const [[current]] = await connection.execute('SELECT role, is_active FROM users WHERE id = ? FOR SHARE', [actor.id])
  if (!current?.is_active || current.role !== 'manager') throw new ApiError(403, 'الطلب غير مسموح.')
}
