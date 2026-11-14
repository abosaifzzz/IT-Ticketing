import { mockAssetInventoryService, operationalStatusLabels } from '../mock/mockAssetInventoryService.js'
import { excelExportService } from './excelExportService.js'

const columns = [
  { key: 'assetId', label: 'رقم الأصل' },
  { key: 'name', label: 'اسم الأصل' },
  { key: 'quantity', label: 'الكمية' },
  { key: 'manufacturer', label: 'الشركة المصنعة' },
  { key: 'model', label: 'الموديل' },
  { key: 'serialNumber', label: 'الرقم المسلسل' },
  { key: 'department', label: 'القسم' },
  { key: 'location', label: 'الموقع الفعلي' },
  { key: 'purchaseDate', label: 'تاريخ الشراء' },
  { key: 'statusLabel', label: 'الحالة التشغيلية' },
  { key: 'conditionDescription', label: 'وصف الحالة' },
  { key: 'maintenanceNotes', label: 'ملاحظات الصيانة' },
  { key: 'lastMaintenanceDate', label: 'تاريخ آخر صيانة' },
  { key: 'takenByEngineerName', label: 'المهندس الذي سحب الأصل' },
  { key: 'withdrawnForTicketId', label: 'رقم البلاغ المرتبط بالسحب' },
]

export const assetExportService = {
  getSheetData(filters = {}) {
    const rows = mockAssetInventoryService.query(filters).map((asset) => ({
      ...asset,
      statusLabel: operationalStatusLabels[asset.operationalStatus] ?? '',
    }))
    return { columns, rows }
  },
  downloadExcel(filters = {}) {
    const { columns: headers, rows } = this.getSheetData(filters)
    excelExportService.download('سجل-الأصول-التقنية.xlsx', headers, rows)
  },
}
