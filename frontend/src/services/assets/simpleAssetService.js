import {httpClient} from '../auth/authService.js'

const root = '/asset-management/simple'
const query = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value !== null && value !== undefined)).toString()
const path = (kind, id = '') => `${root}/${kind}${id ? `/${encodeURIComponent(id)}` : ''}`

export const simpleConditions = Object.freeze({NEW:'جديد', USED:'مستعمل', FAULTY:'معطل', OUT_OF_SERVICE:'خارج الخدمة', IN_MAINTENANCE:'قيد الصيانة'})
export const returnConditions = Object.freeze({NEW:'جديد', USED:'مستعمل', OUT_OF_SERVICE:'خارج الخدمة'})
export const serialModes = Object.freeze({REQUIRED:'إلزامي', OPTIONAL:'اختياري', DISABLED:'معطل'})
export const custodyLabels = Object.freeze({none:'غير مسند', employee:'موظف', department:'قسم'})
export const movementLabels = Object.freeze({CREATE:'إضافة أصل', UPDATE:'تعديل بيانات', ASSIGN:'تسليم عهدة', RETURN:'إرجاع عهدة', TRANSFER:'نقل عهدة', REPLACE:'استبدال', CONDITION:'تغيير الحالة', MAINTENANCE:'صيانة', GROUP_ADD:'إضافة إلى مجموعة', GROUP_REMOVE:'إزالة من مجموعة', GROUP_CREATE:'إنشاء مجموعة', GROUP_UPDATE:'تعديل مجموعة', GROUP_DELETE:'تعطيل مجموعة'})

export function createSimpleAssetService(client) {
  const item = async (url, options) => (await client.request(url, options)).item
  const write = (url, body, method = 'POST', key) => item(url, {method, body: {...body, clientRequestId: key ?? crypto.randomUUID()}})
  return {
    dashboard(filters = {}, signal) { return client.request(`${root}/dashboard?${query(filters)}`, {signal}) },
    list(kind, filters = {}, signal) { return client.request(`${path(kind)}?${query(filters)}`, {signal}) },
    detail(kind, id, signal) { return item(path(kind, id), {signal}) },
    create(kind, body, key) { return write(path(kind), body, 'POST', key) },
    update(kind, id, body, key) { return write(path(kind, id), body, 'PATCH', key) },
    remove(kind, id, body = {}, key) { return write(path(kind, id), body, 'DELETE', key) },
    action(kind, id, action, body, key) { return write(`${path(kind, id)}/${action}`, body, 'POST', key) },
  }
}

export const simpleAssetService = createSimpleAssetService(httpClient)
