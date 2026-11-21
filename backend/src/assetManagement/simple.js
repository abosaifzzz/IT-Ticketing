import {components,trackComponent,endComponent,addStock,allocate,returnGroup,returnCondition,returnConditions,replacePending,returnedStock} from './groupStock.js'
import {serialFor} from './serial.js'
import { randomUUID } from 'node:crypto'
import { str, id, reqId, choice, boolean, integer, normalizedSerial, bad } from './validation.js'
import { one, insert, update, owner, destination, defaultWarehouse, movement, audit, closeCustody, custody, historyLink } from './database.js'
import { createAsset } from './assets.js'

export const simpleConditions = ['NEW', 'USED', 'FAULTY', 'IN_MAINTENANCE', 'OUT_OF_SERVICE']
export const serialModes = ['REQUIRED', 'OPTIONAL', 'DISABLED']
const optional = validator => value => value === undefined ? undefined : validator(value)
const nullableText = value => value === null || value === '' ? '' : str()(value)
const version = optional(integer(0, 4294967294))
const note = str(4000)

export function simpleCondition(row) {
  if (row.operational_status === 'IN_MAINTENANCE') return 'IN_MAINTENANCE'
  if (row.technical_condition === 'UNREPAIRABLE') return 'OUT_OF_SERVICE'
  if (row.technical_condition !== 'GOOD') return 'FAULTY'
  return row.usage_condition ?? 'USED'
}
export function simpleAsset(row) {
  return {
    id: row.id, internalAssetId: row.asset_tag, assetTypeId: row.category_id,
    assetTypeName: row.type_name, brand: row.brand, model: row.model,
    isStock: Boolean(row.is_stock), sourceAssetId: row.source_asset_id ?? null, serialNumber: row.serial_number, quantity: Number(row.quantity ?? 1), condition: simpleCondition(row), locationId: row.location_id,
    custodianType: row.custodian_type,
    custodianId: row.custodian_type === 'employee' ? row.employee_id : row.custodian_type === 'department' ? row.department_id : null,
    custodianName: row.custodian_type === 'employee' ? row.employee_name ?? null : row.custodian_type === 'department' ? row.department_name ?? null : null,
    employeeName: row.employee_name ?? null, departmentName: row.department_name ?? null, locationName: row.location_name ?? null,
    departmentId: row.department_id, groupId: row.workstation_id, notes: row.notes,
    version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.archived_at,
  }
}
export const simpleType = row => ({ id: row.id, name: row.name, prefix: row.prefix,
  serialMode: row.serial_mode, uniqueSerial: Boolean(row.unique_serial), isActive: Boolean(row.is_active) })
export const simpleGroup = row => ({ id: row.id, name: row.name, description: row.description ?? '',
  locationId: row.location_id, custodianType: row.employee_id ? 'employee' : row.department_id ? 'department' : 'none',
  custodianId: row.employee_id ?? row.department_id, isActive: Boolean(row.is_active), version: row.version,
  deletedAt: row.archived_at })

function checkVersion(row, expected) {
  if (expected !== undefined && row.version !== expected) bad('Record changed; refresh and try again', 409)
}
function current(row) { if (row.archived_at) bad('Record has been deleted', 409); if(row.operational_status==='RETIRED'||(row.operational_status==='RESERVED'&&row.technical_condition==='GOOD'))bad('Resolve this legacy retired/reserved state through its existing endpoint first',409) }
export function state(condition, assigned) {
  return { technical_condition: ['NEW', 'USED'].includes(condition) ? 'GOOD' : condition==='OUT_OF_SERVICE'?'UNREPAIRABLE':'FAULTY',
    operational_status: condition === 'IN_MAINTENANCE' ? 'IN_MAINTENANCE' : assigned ? 'IN_USE' : ['NEW', 'USED'].includes(condition) ? 'AVAILABLE' : 'RESERVED',
    ...(['NEW', 'USED'].includes(condition) ? { usage_condition: condition } : {}) }
}
async function simpleOwner(c, type, custodianId) {
  if (type === 'none' && custodianId) bad('Unassigned custody cannot include a custodian')
  if (type !== 'none' && !custodianId) bad('Choose a custodian')
  return owner(c, { custodianType: type, employeeId: type === 'employee' ? custodianId : null,
    departmentId: type === 'department' ? custodianId : null })
}
async function lockedAsset(c, assetId) {
  const [[hint]] = await c.execute('SELECT workstation_id FROM am_assets WHERE id=?', [assetId])
  if (!hint) bad('Asset not found', 404)
  if (hint.workstation_id) await one(c, 'am_workstations', hint.workstation_id)
  const row = await one(c, 'am_assets', assetId)
  current(row)
  if (row.workstation_id !== hint.workstation_id) bad('Group membership changed; retry', 409)
  return row
}
async function group(c, groupId) {
  const row = await one(c, 'am_workstations', groupId)
  current(row)
  if (!row.is_active) bad('Group is inactive', 409)
  return row
}
export async function saveAsset(c, actor, before, changes, action, notes = '', replacementId = null) {
  const after = { ...before, ...changes, version: before.version + 1, updated_at: new Date() }
  await update(c, 'am_assets', before.id, { ...changes, version: after.version, updated_at: after.updated_at })
  const m = await movement(c, actor, { type: action, asset: before.id, quantity: Math.max(1,after.quantity), source: before.location_id,
    destination: after.location_id, before: simpleAsset(before), after: simpleAsset(after),
    reason: notes || action, replacementId })
  if (before.custodian_type !== after.custodian_type || before.employee_id !== after.employee_id ||
    before.department_id !== after.department_id || before.location_id !== after.location_id) {
    await closeCustody(c, before)
    await custody(c, actor, after, m, notes)
  }
  await audit(c, actor, 'asset', before.id, action, simpleAsset(before), simpleAsset(after))
  return after
}
const ownershipSpec = { custodianType: choice(['employee', 'department', 'none'], 'none'), custodianId: id }
const createSpec = { assetTypeId: reqId, brand: str(), model: str(), serialNumber: nullableText, quantity: integer(1, 1000000, 1),
  condition: choice(simpleConditions, 'USED'), locationId: id, ...ownershipSpec, notes: note }

export function simpleHandlers() {
  return {
    simpleTypeCreate: {  spec: { name: str(160, true), prefix: nullableText,
      serialMode: choice(serialModes, 'OPTIONAL'), uniqueSerial: boolean },
      async run(c, a, b) {
        const prefix = b.prefix || 'AS' + randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
        if (!/^[A-Z][A-Z0-9]{0,11}$/.test(prefix)) bad('Prefix must contain 1-12 uppercase letters/digits')
        const row = { id: randomUUID(), name: b.name, prefix, tracking: 'CONFIGURABLE',
          requires_serial: b.serialMode === 'REQUIRED', serial_mode: b.serialMode,
          unique_serial: b.uniqueSerial, is_active: true, created_at: new Date() }
        await insert(c, 'am_categories', row)
        await insert(c, 'am_sequences', { category_id: row.id, next_number: 1 })
        await audit(c, a, 'category', row.id, 'TYPE_CREATE', null, simpleType(row))
        return simpleType(row)
      } },
    simpleTypeUpdate: {  spec: { id: reqId, name: optional(str(160, true)), prefix: optional(nullableText),
      serialMode: optional(choice(serialModes)), uniqueSerial: optional(boolean), isActive: optional(boolean) },
      async run(c, a, b) {
        const type = await one(c, 'am_categories', b.id)
        const after = { ...type, name: b.name ?? type.name, prefix: b.prefix || type.prefix,
          serial_mode: b.serialMode ?? type.serial_mode, unique_serial: b.uniqueSerial ?? Boolean(type.unique_serial),
          is_active: b.isActive ?? Boolean(type.is_active) }
        if (!/^[A-Z][A-Z0-9]{0,11}$/.test(after.prefix)) bad('Invalid prefix')
        if (after.prefix !== type.prefix) {
          const [[seq]] = await c.execute('SELECT next_number FROM am_sequences WHERE category_id=? FOR UPDATE', [type.id])
          if (BigInt(seq.next_number) > 1n) bad('Prefix cannot change after IDs have been generated', 409)
        }
        const [assets] = await c.execute('SELECT * FROM am_assets WHERE category_id=? ORDER BY id FOR UPDATE', [type.id])
        for (const asset of assets) {
          // Preserve serial values in archived history, but never discard current serials to change policy.
          const serial = asset.archived_at ? { serial_key: after.unique_serial && asset.serial_number ? normalizedSerial(asset.serial_number) : null }
            : serialFor(after, asset.serial_number, asset.quantity)
          await update(c, 'am_assets', asset.id, serial)
        }
        await update(c, 'am_categories', type.id, { name: after.name, prefix: after.prefix,
          serial_mode: after.serial_mode, requires_serial: after.serial_mode === 'REQUIRED',
          unique_serial: after.unique_serial, is_active: after.is_active })
        await audit(c, a, 'category', type.id, 'TYPE_UPDATE', simpleType(type), simpleType(after))
        return simpleType(after)
      } },
    simpleTypeDelete: {  spec: { id: reqId }, async run(c, a, b) {
      const type = await one(c, 'am_categories', b.id)
      await update(c, 'am_categories', b.id, { is_active: false })
      await audit(c, a, 'category', b.id, 'TYPE_DELETE', simpleType(type), { ...simpleType(type), isActive: false })
      return { ...simpleType(type), isActive: false }
    } },
    simpleAssetCreate: { spec: createSpec, async run(c, a, b) {
      b.locationId=(await defaultWarehouse(c,b.locationId)).id
      const type = await one(c, 'am_categories', b.assetTypeId)
      if (!type.is_active) bad('Asset type is inactive')
      serialFor(type, b.serialNumber, b.quantity)
      const own = await simpleOwner(c, b.custodianType, b.custodianId)
      const derived = state(b.condition, own.custodian_type !== 'none')
      const row = await createAsset(c, a, { categoryId: type.id, brand: b.brand, model: b.model,
        serialNumber: b.serialNumber, quantity: b.quantity, usageCondition:b.condition==='NEW'?'NEW':'USED', technicalCondition: derived.technical_condition,
        operationalStatus: derived.operational_status, locationId: b.locationId,
        custodianType: own.custodian_type, employeeId: own.employee_id, departmentId: own.department_id,
        receivedDate: null, supplier: '', notes: b.notes }, { simple: true })
      await update(c, 'am_assets', row.id, { usage_condition: b.condition === 'NEW' ? 'NEW' : 'USED' })
      const saved = await one(c, 'am_assets', row.id)
      await audit(c, a, 'asset', row.id, 'CREATE', null, simpleAsset(saved))
      return simpleAsset(saved)
    } },
    simpleAssetUpdate: { spec: { id: reqId, assetTypeId: optional(reqId), brand: optional(str()), model: optional(str()),
      serialNumber: optional(nullableText), quantity: optional(integer(1, 1000000)), notes: optional(note), expectedVersion: version },
      async run(c, a, b) {
        const asset = await lockedAsset(c, b.id)
        checkVersion(asset, b.expectedVersion)
        const type = await one(c, 'am_categories', b.assetTypeId ?? asset.category_id)
        if (type.id !== asset.category_id && !type.is_active) bad('Asset type is inactive')
        const quantity = b.quantity ?? asset.quantity
        const serial = serialFor(type, b.serialNumber === undefined ? asset.serial_number : b.serialNumber, quantity)
        if (asset.is_stock && serial.serial_number) bad('Stock records cannot have a device serial')
        if (quantity !== asset.quantity && (asset.workstation_id || asset.custodian_type !== 'none')) bad('Return custody and remove group membership before changing quantity', 409)
        if (quantity !== asset.quantity) {
          const [[job]] = await c.execute("SELECT id FROM am_maintenance WHERE asset_id=? AND status='OPEN' FOR SHARE", [asset.id])
          if (job || simpleCondition(asset) === 'IN_MAINTENANCE') bad('Finish maintenance before changing quantity', 409)
        }
        const after = await saveAsset(c, a, asset, { category_id: type.id, brand: b.brand ?? asset.brand,
          model: b.model ?? asset.model, ...serial, quantity, is_stock:asset.is_stock||quantity>1, notes: b.notes ?? asset.notes }, 'UPDATE', b.notes)
        return simpleAsset(after)
      } },
    // Receive more units into a quantity record (e.g. a new box of mice). Serialized devices are added one record each.
    simpleAssetReceive: { spec: { id: reqId, quantity: integer(1, 1000000, 1), expectedVersion: version, notes: note }, async run(c, a, b) {
      const asset = await lockedAsset(c, b.id)
      checkVersion(asset, b.expectedVersion)
      if (asset.workstation_id || asset.custodian_type !== 'none') bad('Add stock only to warehouse records', 409)
      if (asset.source_asset_id && !asset.is_stock) bad('Add stock to the original warehouse record', 409)
      const type = await one(c, 'am_categories', asset.category_id)
      const quantity = asset.quantity + b.quantity
      if (quantity > 1000000) bad('Warehouse quantity limit reached', 409)
      serialFor(type, asset.serial_number, quantity)
      return simpleAsset(await saveAsset(c, a, asset, { quantity, is_stock: true }, 'STOCK_RECEIVE', b.notes))
    } },
    simpleAssetDelete: {  spec: { id: reqId, expectedVersion: version, notes: note }, async run(c, a, b) {
      const asset = await lockedAsset(c, b.id)
      checkVersion(asset, b.expectedVersion)
      const [[job]] = await c.execute("SELECT id FROM am_maintenance WHERE asset_id=? AND status='OPEN' FOR SHARE", [asset.id])
      const [[component]]=await c.execute('SELECT id FROM am_group_components WHERE source_asset_id=? AND removed_at IS NULL LIMIT 1 FOR SHARE',[asset.id])
      const [[child]]=await c.execute('SELECT id FROM am_assets WHERE source_asset_id=? AND archived_at IS NULL LIMIT 1 FOR SHARE',[asset.id])
      if (child || component || asset.workstation_id || asset.custodian_type !== 'none' || simpleCondition(asset) === 'IN_MAINTENANCE' || job) bad('Return custody, remove group membership and finish maintenance before deleting', 409)
      return simpleAsset(await saveAsset(c, a, asset, { archived_at: new Date() }, 'DELETE', b.notes))
    } },
    simpleAssetCondition: { spec: { id: reqId, condition: choice(simpleConditions), repairConfirmed: optional(boolean),
      expectedVersion: version, notes: note }, async run(c, a, b) {
      const asset = await lockedAsset(c, b.id)
      checkVersion(asset, b.expectedVersion)
      const previous = simpleCondition(asset)
      if (['FAULTY', 'IN_MAINTENANCE', 'OUT_OF_SERVICE'].includes(previous) && ['NEW', 'USED'].includes(b.condition) &&
        (!b.repairConfirmed || !b.notes)) bad('Confirm repair/inspection and include a note before returning to service')
      const [[job]] = await c.execute("SELECT * FROM am_maintenance WHERE asset_id=? AND status='OPEN' FOR UPDATE", [asset.id])
      if (job) {
        if(b.condition==='FAULTY')bad('Finish the existing maintenance job before leaving maintenance',409)
        if (['NEW', 'USED'].includes(b.condition)) {
          await update(c, 'am_maintenance', job.id, { status: 'CLOSED', action_taken: b.notes,
            outcome: 'REPAIRED', closed_at: new Date() })
          await audit(c, a, 'maintenance', job.id, 'SIMPLE_REPAIR', job, { condition: b.condition, notes: b.notes })
        }
      }
      const action = b.condition === 'IN_MAINTENANCE' ? 'MAINTENANCE_ENTRY' :
        ['FAULTY', 'IN_MAINTENANCE', 'OUT_OF_SERVICE'].includes(previous) && ['NEW', 'USED'].includes(b.condition) ? 'MAINTENANCE_RETURN' : 'CONDITION_CHANGE'
      return simpleAsset(await saveAsset(c, a, asset, state(b.condition, asset.custodian_type !== 'none'), action, b.notes))
    } },
    simpleAssetCustody: { spec: { id: reqId, action: choice(['ASSIGN', 'RETURN', 'TRANSFER']), locationId: id,
      ...ownershipSpec, custodianType:choice(['employee','department','none']), quantity: optional(integer(1, 1000000)), returnCondition, repairConfirmed:optional(boolean), expectedVersion: version, notes: note }, async run(c, a, b) {
      const asset = await lockedAsset(c, b.id)
      checkVersion(asset, b.expectedVersion)
      if (asset.workstation_id) bad('Change custody through the entire group or remove this member first', 409)
      b.locationId=(await defaultWarehouse(c,b.locationId)).id
      // Stock records (e.g. 10 keyboards) are never handed over whole: assigning issues the chosen
      // number of units as a separate held record and reduces the warehouse quantity.
      // (A stock record already handed over whole under the earlier rule keeps the normal transfer/return path.)
      if (asset.is_stock && asset.custodian_type === 'none') {
        if (b.action !== 'ASSIGN') bad('Warehouse stock is unassigned; assign units from it instead', 409)
        const own = await simpleOwner(c, b.custodianType, b.custodianId)
        if (own.custodian_type === 'none') bad('Choose an employee or department')
        const count = b.quantity ?? 1
        if (!['NEW', 'USED'].includes(simpleCondition(asset)) || asset.custodian_type !== 'none') bad('Only working warehouse stock can be issued', 409)
        if (count > asset.quantity) bad('الكمية المتاحة في المخزن غير كافية.', 409)
        await saveAsset(c, a, asset, { quantity: asset.quantity - count }, 'STOCK_ISSUE', b.notes)
        const unit = await createAsset(c, a, { categoryId: asset.category_id, brand: asset.brand, model: asset.model, serialNumber: '', quantity: count,
          isStock: false, sourceAssetId: asset.id, usageCondition: asset.usage_condition, technicalCondition: 'GOOD', operationalStatus: 'AVAILABLE',
          locationId: asset.location_id, custodianType: 'none', employeeId: null, departmentId: null, receivedDate: null, supplier: '', notes: asset.notes }, { simple: true })
        const issued = await saveAsset(c, a, unit, { ...own, location_id: b.locationId, ...state(simpleCondition(asset), true) }, 'ASSIGN', b.notes)
        return { ...simpleAsset(issued), issuedFromStockId: asset.id }
      }
      if (b.quantity !== undefined && b.quantity !== asset.quantity) bad('Partial custody changes apply to warehouse stock only')
      if (b.action === 'ASSIGN' && asset.custodian_type !== 'none') bad('Use transfer for an assigned asset', 409)
      if (b.action === 'RETURN' && (b.custodianType !== 'none' || b.custodianId)) bad('Returns remove custody')
      const own = await simpleOwner(c, b.custodianType, b.custodianId)
      if (b.action === 'ASSIGN' && own.custodian_type === 'none') bad('Choose an employee or department')
      if (b.action === 'TRANSFER' && own.custodian_type === 'none') bad('Choose a custodian; use return to remove custody')
      if (b.action !== 'RETURN' && b.returnCondition) bad('Return condition requires a return action')
      if (b.returnCondition) {
        const [[job]]=await c.execute("SELECT id FROM am_maintenance WHERE asset_id=? AND status='OPEN' FOR SHARE",[asset.id])
        if(job||simpleCondition(asset)==='IN_MAINTENANCE')bad('Finish maintenance before choosing a return condition',409)
      }
      if (b.returnCondition && ['NEW','USED'].includes(b.returnCondition) && !['NEW','USED'].includes(simpleCondition(asset)) && (!b.repairConfirmed||!b.notes)) bad('Confirm repair/inspection before returning a faulty unit as working')
      const returned=b.action==='RETURN'&&b.returnCondition?b.returnCondition:simpleCondition(asset)
      const saved = await saveAsset(c, a, asset, { ...own, location_id: b.locationId,
        ...state(returned, own.custodian_type !== 'none') }, b.action, b.notes)
      // Units issued from warehouse stock merge back into it on return, so stock counts stay correct.
      if (b.action === 'RETURN' && asset.source_asset_id && !asset.is_stock) {
        const stock = await returnedStock(c, a, saved, returned, b.locationId, b.notes)
        await saveAsset(c, a, saved, { archived_at: new Date() }, 'MERGE_TO_WAREHOUSE', b.notes)
        return { ...simpleAsset(stock), mergedFromAssetId: asset.id }
      }
      return simpleAsset(saved)
    } },
    ...groupHandlers(),
  }
}

function groupHandlers() {
  return {
    simpleGroupCreate: { spec: { name: str(160, true), description: note, locationId: id, ...ownershipSpec }, async run(c, a, b) {
      const own = await simpleOwner(c, b.custodianType, b.custodianId)
      if (own.custodian_type !== 'none' && !b.locationId) b.locationId=(await defaultWarehouse(c)).id
      if (b.locationId) await destination(c, b.locationId)
      const row = { id: randomUUID(), name: b.name, description: b.description, location_id: b.locationId,
        department_id: own.department_id, employee_id: own.employee_id, is_active: true, version: 0 }
      await insert(c, 'am_workstations', row)
      await audit(c, a, 'workstation', row.id, 'GROUP_CREATE', null, simpleGroup(row))
      return simpleGroup(row)
    } },
    simpleGroupUpdate: { spec: { id: reqId, name: optional(str(160, true)), description: optional(note), expectedVersion: version }, async run(c, a, b) {
      const before = await group(c, b.id)
      checkVersion(before, b.expectedVersion)
      const after = { ...before, name: b.name ?? before.name, description: b.description ?? before.description, version: before.version + 1 }
      await update(c, 'am_workstations', b.id, { name: after.name, description: after.description, version: after.version })
      await audit(c, a, 'workstation', b.id, 'GROUP_UPDATE', simpleGroup(before), simpleGroup(after))
      return simpleGroup(after)
    } },
    simpleGroupDelete: {  spec: { id: reqId, expectedVersion: version }, async run(c, a, b) {
      const before = await group(c, b.id)
      checkVersion(before, b.expectedVersion)
      const [[members]] = await c.execute('SELECT COUNT(*) n FROM am_assets WHERE workstation_id=?', [b.id])
      const pending=await components(c,b.id)
      if (members.n || pending.length || before.department_id || before.employee_id) bad('Return group custody and remove its members before deleting', 409)
      const after = { ...before, is_active: false, archived_at: new Date(), version: before.version + 1 }
      await update(c, 'am_workstations', b.id, { is_active: false, archived_at: after.archived_at, version: after.version })
      await audit(c, a, 'workstation', b.id, 'GROUP_DELETE', simpleGroup(before), simpleGroup(after))
      return simpleGroup(after)
    } },
    simpleGroupAdd: { spec: { id: reqId, assetId: reqId, expectedVersion: version, notes: note }, async run(c, a, b) {
      const parent = await group(c, b.id)
      checkVersion(parent, b.expectedVersion)
      const asset = await one(c, 'am_assets', b.assetId)
      current(asset)
      const groupOwn=await simpleOwner(c,parent.employee_id?'employee':parent.department_id?'department':'none',parent.employee_id??parent.department_id)
      if(asset.is_stock){const result=await addStock(c,a,parent,asset,groupOwn,b.notes);await update(c,'am_workstations',parent.id,{version:parent.version+1});return result}
      if (asset.workstation_id || asset.operational_status === 'RETIRED' || asset.quantity !== 1) bad('Group members must be ungrouped individual units', 409)
      const own = await simpleOwner(c, parent.employee_id ? 'employee' : parent.department_id ? 'department' : 'none', parent.employee_id ?? parent.department_id)
      if(asset.custodian_type!=='none'&&(asset.custodian_type!==own.custodian_type||asset.employee_id!==own.employee_id||asset.department_id!==own.department_id))bad('Member custody conflicts with this group; return or transfer it first',409)
      const after = await saveAsset(c, a, asset, { ...own, workstation_id: parent.id,
        location_id: parent.location_id ?? asset.location_id, ...state(simpleCondition(asset), own.custodian_type !== 'none') }, 'GROUP_ADD', b.notes)
      await trackComponent(c,a,parent.id,asset.id,asset.id)
      await historyLink(c, a, parent.id, asset.id, 'ATTACH')
      await update(c, 'am_workstations', parent.id, { version: parent.version + 1 })
      return simpleAsset(after)
    } },
    simpleGroupRemove: { spec: { id: reqId, assetId: reqId, expectedVersion: version, notes: note }, async run(c, a, b) {
      const parent = await group(c, b.id)
      checkVersion(parent, b.expectedVersion)
      const rows=await components(c,parent.id),pending=rows.find(row=>row.source_asset_id===b.assetId&&!row.allocated_asset_id)
      if(pending){await endComponent(c,a,pending);await update(c,'am_workstations',parent.id,{version:parent.version+1});return {...simpleAsset(await one(c,'am_assets',b.assetId)),componentRemoved:true}}
      const asset = await one(c, 'am_assets', b.assetId)
      if (asset.workstation_id !== parent.id) bad('Asset is not a current member', 409)
      const after = await saveAsset(c, a, asset, { workstation_id: null }, 'GROUP_REMOVE', b.notes)
      await historyLink(c, a, parent.id, asset.id, 'DETACH')
      await update(c, 'am_workstations', parent.id, { version: parent.version + 1 })
      return simpleAsset(after)
    } },
    simpleGroupCustody: { spec: { id: reqId, action: choice(['ASSIGN', 'RETURN', 'TRANSFER']), locationId: id,
      ...ownershipSpec, returnCondition, returnConditions, repairConfirmed:optional(boolean), expectedVersion: version, notes: note }, async run(c, a, b) {
      const parent = await group(c, b.id)
      checkVersion(parent, b.expectedVersion)
      b.locationId=(await defaultWarehouse(c,b.locationId)).id
      if (b.action === 'ASSIGN' && (parent.department_id || parent.employee_id)) bad('Use transfer for an assigned group', 409)
      if (b.action === 'RETURN' && (b.custodianType !== 'none' || b.custodianId)) bad('Return must remove custody')
      const own = await simpleOwner(c, b.custodianType, b.custodianId)
      if (b.action === 'ASSIGN' && own.custodian_type === 'none') bad('Choose a custodian')
      if (b.action === 'TRANSFER' && own.custodian_type === 'none') bad('Choose a custodian; use return to remove custody')
      if (b.action !== 'RETURN' && (b.returnCondition||b.returnConditions.length)) bad('Return conditions require a return action')
      const rows=await components(c,parent.id)
      if(b.action==='ASSIGN'||b.action==='TRANSFER')for(const component of rows)await allocate(c,a,parent,component,own,b.locationId,b.notes)
      if(b.action==='RETURN'&&(b.returnCondition||b.returnConditions.length)){
        b.locationId=await returnGroup(c,a,parent,rows,b)
      }
      const [assets] = await c.execute('SELECT * FROM am_assets WHERE workstation_id=? ORDER BY id FOR UPDATE', [parent.id])
      for (const asset of assets) {
        await saveAsset(c, a, asset, { ...own, location_id: b.locationId,
          ...state(simpleCondition(asset), own.custodian_type !== 'none') }, b.action, b.notes)
        await historyLink(c, a, parent.id, asset.id, 'TRANSFER')
      }
      const after = { ...parent, employee_id: own.employee_id, department_id: own.department_id,
        location_id: b.locationId, version: parent.version + 1 }
      await update(c, 'am_workstations', parent.id, { employee_id: after.employee_id,
        department_id: after.department_id, location_id: after.location_id, version: after.version })
      await audit(c, a, 'workstation', parent.id, b.action, simpleGroup(parent), simpleGroup(after))
      return simpleGroup(after)
    } },
    simpleGroupReplace: { spec: { id: reqId, oldAssetId: reqId, replacementAssetId: reqId,
      oldLocationId: id, expectedVersion: version, notes: note }, async run(c, a, b) {
      const parent = await group(c, b.id)
      checkVersion(parent, b.expectedVersion)
      if (b.oldAssetId === b.replacementAssetId) bad('Choose a different replacement')
      const locked = {}
      for (const assetId of [b.oldAssetId, b.replacementAssetId].sort()) locked[assetId] = await one(c, 'am_assets', assetId)
      const before = locked[b.oldAssetId]
      let replacement = locked[b.replacementAssetId]
      current(before); current(replacement)
      const definitions=await components(c,parent.id),pending=definitions.find(row=>row.source_asset_id===before.id&&!row.allocated_asset_id)
      if(pending)return replacePending(c,a,parent,pending,replacement,b.notes)
      if(replacement.is_stock){
        const component=await trackComponent(c,a,parent.id,replacement.id)
        replacement=await allocate(c,a,parent,component,{custodian_type:'none',employee_id:null,department_id:null},replacement.location_id,b.notes,false)
      }
      if (before.quantity !== 1 || replacement.quantity !== 1) bad('Group replacement requires individually tracked units', 409)
      if (before.workstation_id !== parent.id) bad('Old asset is not a current member', 409)
      if (replacement.workstation_id || replacement.custodian_type !== 'none' || replacement.operational_status === 'RETIRED') bad('Replacement must be ungrouped and unassigned', 409)
      const oldLocation = b.oldLocationId ?? before.location_id
      await destination(c, oldLocation)
      const own = await simpleOwner(c, parent.employee_id ? 'employee' : parent.department_id ? 'department' : 'none', parent.employee_id ?? parent.department_id)
      const operation = { id: randomUUID(), old_asset_id: before.id, new_asset_id: replacement.id,
        reason: b.notes || 'Group member replacement', ticket_id: null, actor_id: a.id, created_at: new Date() }
      await insert(c, 'am_replacements', operation)
      const old = await saveAsset(c, a, before, { workstation_id: null, custodian_type: 'none',
        employee_id: null, department_id: null, location_id: oldLocation,
        ...state(simpleCondition(before), false) }, 'REPLACE', b.notes, operation.id)
      const next = await saveAsset(c, a, replacement, { workstation_id: parent.id, ...own,
        location_id: parent.location_id ?? before.location_id,
        ...state(simpleCondition(replacement), own.custodian_type !== 'none') }, 'REPLACE', b.notes, operation.id)
      await historyLink(c, a, parent.id, before.id, 'REPLACE')
      await c.execute('UPDATE am_group_memberships SET replaced_by_asset_id=? WHERE group_id=? AND asset_id=? AND ended_at IS NOT NULL AND end_reason=\'REPLACE\' ORDER BY ended_at DESC LIMIT 1', [replacement.id, parent.id, before.id])
      await historyLink(c, a, parent.id, replacement.id, 'ATTACH')
      await update(c, 'am_workstations', parent.id, { version: parent.version + 1 })
      await audit(c, a, 'workstation', parent.id, 'REPLACE', simpleAsset(before), simpleAsset(next))
      return { replacementId: operation.id, oldAsset: simpleAsset(old), replacementAsset: simpleAsset(next) }
    } },
  }
}
