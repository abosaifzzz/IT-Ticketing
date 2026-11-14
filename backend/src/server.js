import {createAdministrationRepository} from './administration/repository.js'
import {createAssetManagementRepository} from './assetManagement/repository.js'
import { loadConfig } from './config.js'
import { createPool } from './db/pool.js'
import { createMySqlUserRepository } from './repositories/mysqlUserRepository.js'
import { createMySqlSessionRepository } from './repositories/mysqlSessionRepository.js'
import { createLocalPasswordProvider } from './auth/localPasswordProvider.js'
import { createAuthService } from './auth/authService.js'
import { createApp } from './app.js'
import { createMySqlReferenceRepository } from './repositories/mysqlReferenceRepository.js'
import { createMySqlItUserRepository } from './repositories/mysqlItUserRepository.js'
import { createMySqlTicketRepository } from './repositories/mysqlTicketRepository.js'
import { createMySqlTicketWorkflowRepository } from './repositories/mysqlTicketWorkflowRepository.js'
import { createMySqlAssetRepository } from './repositories/mysqlAssetRepository.js'
import { createNotificationService } from './notifications/service.js'
import { createMySqlNotificationRepository } from './repositories/mysqlNotificationRepository.js'
import { createMySqlReportRepository } from './repositories/mysqlReportRepository.js'
import { createMySqlDashboardRepository } from './repositories/mysqlDashboardRepository.js'
import { createMySqlEmployeeDirectoryRepository } from './repositories/mysqlEmployeeDirectoryRepository.js'

const config = loadConfig()
const pool = createPool(config.database)

try {
  await pool.query('SELECT 1')
  const users = createMySqlUserRepository(pool)
  const sessions = createMySqlSessionRepository(pool)
  const provider = await createLocalPasswordProvider(users)
  const administrationRepository=createAdministrationRepository(pool)
  const authService = createAuthService({ provider, sessions,administrationPolicy:()=>administrationRepository.runtimePolicy() })
  const notifications = createNotificationService()
  const managementRepositories = {
    departments: createMySqlReferenceRepository(pool, 'departments'),
    categories: createMySqlReferenceRepository(pool, 'categories'),
    subcategories: createMySqlReferenceRepository(pool, 'subcategories'),
    itUsers: createMySqlItUserRepository(pool),
    employees: createMySqlEmployeeDirectoryRepository(pool),
  }
  const app = createApp({ authService, config,administrationRepository, managementRepositories, ticketRepository: createMySqlTicketRepository(pool, { notifications }), ticketWorkflowRepository: createMySqlTicketWorkflowRepository(pool, { notifications }), assetRepository: createMySqlAssetRepository(pool), assetManagementRepository:createAssetManagementRepository(pool), notificationRepository: createMySqlNotificationRepository(pool), reportRepository: createMySqlReportRepository(pool), dashboardRepository: createMySqlDashboardRepository(pool) })
  const server = app.listen(config.port, () => console.log(`API listening on port ${config.port}`))

  async function shutdown() {
    app.locals.closeNotificationStreams?.()
    server.close(async () => {
      await app.locals.closeAdministrationJobs?.()
      await pool.end()
      process.exit(0)
    })
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
} catch (error) {
  console.error('Backend failed to start:', error.message)
  await pool.end()
  process.exitCode = 1
}
