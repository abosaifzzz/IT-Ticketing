import { httpClient } from '../auth/authService'
import { createManagerApi } from './managerApi'
export const managerService = createManagerApi(httpClient)
