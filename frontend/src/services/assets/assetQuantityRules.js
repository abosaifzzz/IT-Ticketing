export const isQuantityLocked = asset => Boolean(asset && (
  asset.custodianType !== 'none' || asset.groupId || asset.condition === 'IN_MAINTENANCE'
))

export function updateAssetFormField(form, name, value, types) {
  if (name === 'assetTypeId') return {
    ...form,
    assetTypeId: value,
    serialNumber: '',
    quantity: types.find(type => type.id === value)?.serialMode === 'REQUIRED' ? 1 : form.quantity,
  }
  if (name === 'serialNumber') return {
    ...form,
    serialNumber: value,
    quantity: value.trim() ? 1 : form.quantity,
  }
  return { ...form, [name]: value, ...(name === 'custodianType' ? { custodianId: '' } : {}) }
}

export function validateAssetQuantity(value, serialMode, serial, existing) {
  const quantity = Number(value)
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new Error('أدخل كمية صحيحة بين ١ و١٬٠٠٠٬٠٠٠.')
  if (quantity > 1 && (serialMode === 'REQUIRED' || serial)) throw new Error('لا يمكن مشاركة رقم مسلسل واحد بين عدة وحدات. استخدم الكمية ١ لهذا النوع.')
  if (existing && quantity !== existing.quantity && isQuantityLocked(existing)) throw new Error('أعد العهدة وأخرج الأصل من المجموعة وأنهِ الصيانة قبل تغيير الكمية.')
  return quantity
}
