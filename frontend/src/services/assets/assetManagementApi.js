/**
 * @typedef {{id:string, asset_tag:string, category_id:string, brand:string, model:string,
 * serial_number:string|null, technical_condition:string, operational_status:string,
 * location_id:string, department_id:string|null, employee_id:string|null,
 * custodian_type:string, workstation_id:string|null, created_at:string}} TrackedAsset
 * @typedef {{items:Array<object>,total:number,page:number,pageSize:number}} PageResult
 * All mutations use the backend's idempotency key. Callers retain the same key on retry.
 */
const root = '/asset-management'
const collectionPaths = Object.freeze({
  categories:'categories', locations:'locations', assets:'assets', items:'items', balances:'stock/balances',
  stockTransactions:'stock/transactions', movements:'movements', custody:'custody',
  workstations:'workstations', maintenance:'maintenance', replacements:'replacements',
  inventory:'inventory-sessions', discrepancies:'inventory-discrepancies', audit:'audit', legacy:'legacy-assets',
})
const queryString = (params = {}) => new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null)).toString()
const path = (collection) => {
  const route = collectionPaths[collection]
  if (!route) throw new Error('Unknown asset collection')
  return `${root}/${route}`
}

export const conditionLabels = Object.freeze({GOOD:'جيدة',FAULTY:'معطلة',UNDER_INSPECTION:'قيد الفحص',UNREPAIRABLE:'غير قابلة للإصلاح'})
export const operationLabels = Object.freeze({AVAILABLE:'متاح',IN_USE:'قيد الاستخدام',RESERVED:'محجوز',IN_MAINTENANCE:'قيد الصيانة',RETIRED:'مستبعد'})
export const movementLabels = Object.freeze({ISSUE:'تسليم',RETURN:'إرجاع',TRANSFER:'نقل',RESERVE:'حجز',RELEASE_RESERVATION:'إلغاء الحجز',RETIRE:'استبعاد',RECEIVE:'استلام',REPLACE:'استبدال',SEND_TO_MAINTENANCE:'إرسال للصيانة',INVENTORY_ADJUSTMENT:'تسوية الجرد'})
export const trackingLabels = Object.freeze({INDIVIDUAL:'فردي',QUANTITY:'بالكمية',CONFIGURABLE:'فردي أو بالكمية'})

export function createAssetManagementApi(client) {
  const item = async (route, options) => (await client.request(route, options)).item
  const write = (route, body, clientRequestId, method = 'POST') => item(root + route, {method, body:{...body, clientRequestId}})
  return {
    dashboard(signal) { return client.request(`${root}/dashboard`, {signal}) },
    /** @returns {Promise<PageResult>} */
    list(collection, params = {}, signal) { return client.request(`${path(collection)}?${queryString(params)}`, {signal}) },
    detail(collection, id, signal) { return item(`${path(collection)}/${encodeURIComponent(id)}`, {signal}) },
    lookup(tag, signal) { return item(`${root}/lookup/${encodeURIComponent(tag)}`, {signal}) },
    create(collection, body, key) { return write(`/${collectionPaths[collection]}`, body, key) },
    update(collection, id, body, key) { return write(`/${collectionPaths[collection]}/${encodeURIComponent(id)}`, body, key, 'PATCH') },
    moveAsset(id, body, key) { return write(`/assets/${encodeURIComponent(id)}/movements`, body, key) },
    stock(body, key) { return write('/stock/transactions', body, key) },
    replacement(body, key) { return write('/replacements', body, key) },
    workstationAction(id, action, body, key) { return write(`/workstations/${encodeURIComponent(id)}/${action}`, body, key) },
    maintenanceOutcome(id, body, key) { return write(`/maintenance/${encodeURIComponent(id)}/outcome`, body, key) },
    inventoryAction(id, action, body, key) { return write(`/inventory-sessions/${encodeURIComponent(id)}/${action}`, body, key) },
    acknowledgeCustody(id, body, key) { return write(`/custody/${encodeURIComponent(id)}/acknowledge`, body, key) },
    report(name, params = {}, signal) { return client.request(`${root}/reports/${encodeURIComponent(name)}?${queryString(params)}`, {signal}) },
    export(name, format, params = {}) { return client.request(`${root}/reports/${encodeURIComponent(name)}?${queryString({...params,format})}`, {responseType:format}) },
    attachment(id) { return client.request(`${root}/attachments/${encodeURIComponent(id)}`, {responseType:'blob'}) },
    uploadAttachment(assetId, body, key) { return write(`/assets/${encodeURIComponent(assetId)}/attachments`, body, key) },
    ticketLink(body, key) { return write('/ticket-links', body, key) },
  }
}
