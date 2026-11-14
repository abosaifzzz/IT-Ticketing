import {str,normalizedSerial,bad} from './validation.js'
export function serialFor(type, value, quantity = 1) {
  const serial = value ? str()(value) : ''
  if (type.serial_mode === 'REQUIRED' && !serial) bad('This asset type requires a serial number')
  if (type.serial_mode === 'DISABLED' && serial) bad('Serial numbers are disabled for this asset type')
  if (quantity > 1 && (type.serial_mode === 'REQUIRED' || serial)) bad('Multiple units cannot share one serial number; create a separate record for each device')
  const key = serial ? normalizedSerial(serial) : null
  if (key && key.length > 160) bad('Normalized serial is too long')
  return { serial_number: serial || null, serial_key: type.unique_serial ? key : null }
}
