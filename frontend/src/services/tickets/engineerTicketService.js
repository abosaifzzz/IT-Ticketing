import { httpClient } from '../auth/authService.js'
import { createEngineerTicketApi } from './engineerTicketApi.js'
export const engineerTicketService = createEngineerTicketApi(httpClient)
