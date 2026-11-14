import { httpClient } from '../auth/authService.js'
import { createEmployeeTicketApi } from './employeeTicketApi.js'
export const employeeTicketService = createEmployeeTicketApi(httpClient)
