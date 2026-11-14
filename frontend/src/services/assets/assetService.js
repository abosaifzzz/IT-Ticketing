import{httpClient}from'../auth/authService'
import{createAssetApi}from'./assetApi'
export const assetService=createAssetApi(httpClient)
