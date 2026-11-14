export const assetFilterKeys = ['search', 'assetTypeId', 'condition', 'custodianType', 'employeeId', 'departmentId']

export const assetFilters = params => Object.fromEntries(assetFilterKeys.map(key => [key, params.get(key) ?? '']))
