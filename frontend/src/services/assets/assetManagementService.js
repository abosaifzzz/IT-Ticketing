import {httpClient} from '../auth/authService'
import {createAssetManagementApi} from './assetManagementApi'

export const assetManagementService = createAssetManagementApi(httpClient)
