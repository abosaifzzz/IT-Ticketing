import {authMode} from '../services/auth/mode'
import {ApiNotificationsProvider} from '../features/notifications/api/ApiNotificationsProvider'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { ItSharedLayout } from '../layouts/ItSharedLayout'
import { AdminLayout } from '../layouts/AdminLayout'
import { NotFoundPage } from '../features/shared/NotFoundPage'
import { ManualTicketPage } from '../features/shared/ManualTicketPage'
import { EmployeeDirectoryPage } from '../features/shared/EmployeeDirectoryPage'
import { HomeRedirect } from '../features/auth/HomeRedirect'
import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { ApiFeatureBoundary } from '../features/auth/ApiFeatureBoundary'
import { UnauthorizedPage } from '../features/auth/UnauthorizedPage'
import { EmployeeDashboardPage } from '../features/employee/EmployeeDashboardPage'
import { CreateTicketPage } from '../features/employee/CreateTicketPage'
import { MyTicketsPage } from '../features/employee/MyTicketsPage'
import { TicketDetailsPage } from '../features/employee/TicketDetailsPage'
import { EngineerDashboardPage } from '../features/engineer/EngineerDashboardPage'
import { TechnicianTicketsPage } from '../features/engineer/TechnicianTicketsPage'
import { TechnicianTicketDetailsPage } from '../features/engineer/TechnicianTicketDetailsPage'
import { ManagerDashboardPage } from '../features/manager/ManagerDashboardPage'
import { AllTicketsPage } from '../features/manager/AllTicketsPage'
import { ManagerTicketDetailsPage } from '../features/manager/ManagerTicketDetailsPage'
import { EngineerManagementPage } from '../features/manager/EngineerManagementPage'
import { FaultCategoriesPage } from '../features/manager/FaultCategoriesPage'
import { DepartmentManagementPage } from '../features/manager/DepartmentManagementPage'
import { NotificationHistoryPage } from '../features/notifications/NotificationHistoryPage'
import { AssetInventoryPage } from '../features/assets/AssetInventoryPage'
import { AssetFormPage } from '../features/assets/AssetFormPage'
import { AssetDetailsPage } from '../features/assets/AssetDetailsPage'
import { AssetManagementDashboardPage } from '../features/assets/AssetManagementDashboardPage'
import { TrackedAssetFormPage } from '../features/assets/TrackedAssetFormPage'
import { TrackedAssetDetailsPage } from '../features/assets/TrackedAssetDetailsPage'
import { AssetStockPage } from '../features/assets/AssetStockPage'
import { AssetMovementsPage } from '../features/assets/AssetMovementsPage'
import { AssetCustodyPage } from '../features/assets/AssetCustodyPage'
import { AssetWorkstationsPage } from '../features/assets/AssetWorkstationsPage'
import { AssetReplacementPage } from '../features/assets/AssetReplacementPage'
import { AssetMaintenancePage } from '../features/assets/AssetMaintenancePage'
import { AssetInventorySessionsPage } from '../features/assets/AssetInventorySessionsPage'
import { AssetReportsPage } from '../features/assets/AssetReportsPage'
import { AssetAdministrationPage } from '../features/assets/AssetAdministrationPage'
import { AssetLookupPage } from '../features/assets/AssetLookupPage'
import { AssetTypesPage } from '../features/assets/AssetTypesPage'
import { AssetGroupsPage } from '../features/assets/AssetGroupsPage'
import { AssetGroupDetailsPage } from '../features/assets/AssetGroupDetailsPage'
import { ReportsPage } from '../features/manager/ReportsPage'
import { AdminPermissionRoute } from '../features/admin/AdminPermissionRoute'
import { AdminDashboardPage } from '../features/admin/AdminDashboardPage'
import { AdminUsersPage } from '../features/admin/AdminUsersPage'
import { AdminRolesPage } from '../features/admin/AdminRolesPage'
import { AdminAuditPage } from '../features/admin/AdminAuditPage'
import { AdminSettingsPage } from '../features/admin/AdminSettingsPage'
import { AdminBackupsPage } from '../features/admin/AdminBackupsPage'
import { AdminMonitoringPage } from '../features/admin/AdminMonitoringPage'
import { portalRoutes } from './routeConfig'

function AssetsListRedirect(){const {search}=useLocation();return <Navigate to={`/it/assets${search}`} replace/>}

function AppRoutes() {
  const employeePortal = portalRoutes.find((portal) => portal.role === 'employee')
  const engineerPortal = portalRoutes.find((portal) => portal.role === 'technician')
  const managerPortal = portalRoutes.find((portal) => portal.role === 'manager')

  return <Routes>
    <Route path="/" element={<HomeRedirect />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/unauthorized" element={<ProtectedRoute><UnauthorizedPage /></ProtectedRoute>} />

    <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']} apiReady><AdminLayout /></ProtectedRoute>}>
      <Route index element={<AdminPermissionRoute permission="admin.dashboard.read"><AdminDashboardPage /></AdminPermissionRoute>} />
      <Route path="users" element={<AdminPermissionRoute permission="admin.users.read"><AdminUsersPage /></AdminPermissionRoute>} />
      <Route path="roles" element={<AdminPermissionRoute permission="admin.roles.read"><AdminRolesPage /></AdminPermissionRoute>} />
      <Route path="audit" element={<AdminPermissionRoute permission="admin.audit.read"><AdminAuditPage /></AdminPermissionRoute>} />
      <Route path="settings" element={<AdminPermissionRoute permission="admin.settings.read"><AdminSettingsPage /></AdminPermissionRoute>} />
      <Route path="backups" element={<AdminPermissionRoute permission="admin.backups.read"><AdminBackupsPage /></AdminPermissionRoute>} />
      <Route path="monitoring" element={<AdminPermissionRoute permission="admin.monitoring.read"><AdminMonitoringPage /></AdminPermissionRoute>} />
    </Route>

    <Route path="/employee" element={<ProtectedRoute allowedRoles={['employee']} apiReady><AppLayout portal={employeePortal} /></ProtectedRoute>}>
      <Route index element={<EmployeeDashboardPage />} />
      <Route path="new-ticket" element={<CreateTicketPage />} />
      <Route path="tickets" element={<MyTicketsPage />} />
      <Route path="tickets/:id" element={<TicketDetailsPage />} />
      <Route path="notifications" element={<ProtectedRoute allowedRoles={['employee']} apiReady><NotificationHistoryPage /></ProtectedRoute>} />
    </Route>

    <Route path="/technician" element={<ProtectedRoute allowedRoles={['technician']} apiReady><AppLayout portal={engineerPortal} /></ProtectedRoute>}>
      <Route index element={<EngineerDashboardPage />} />
      <Route path="tickets" element={<TechnicianTicketsPage />} />
      <Route path="tickets/:id" element={<TechnicianTicketDetailsPage />} />
      <Route path="manual-ticket" element={<ManualTicketPage />} />
      <Route path="notifications" element={<ProtectedRoute allowedRoles={['technician']} apiReady><NotificationHistoryPage /></ProtectedRoute>} />
    </Route>

    <Route path="/manager" element={<ProtectedRoute allowedRoles={['manager']} apiReady><AppLayout portal={managerPortal} /></ProtectedRoute>}>
      <Route index element={<ManagerDashboardPage />} />
      <Route path="tickets" element={<AllTicketsPage />} />
      <Route path="tickets/:id" element={<ManagerTicketDetailsPage />} />
      <Route path="engineers" element={<EngineerManagementPage />} />
      <Route path="categories" element={<FaultCategoriesPage />} />
      <Route path="technicians" element={<EngineerManagementPage />} />
      <Route path="fault-categories" element={<FaultCategoriesPage />} />
      <Route path="departments" element={<DepartmentManagementPage />} />
      <Route path="notifications" element={<ProtectedRoute allowedRoles={['manager']} apiReady><NotificationHistoryPage /></ProtectedRoute>} />
      <Route path="manual-ticket" element={<ManualTicketPage />} />
      <Route path="reports" element={<ReportsPage />} />
    </Route>

    <Route path="/it" element={<ProtectedRoute allowedRoles={['technician', 'manager']} apiReady><ItSharedLayout /></ProtectedRoute>}>
      <Route path="employees" element={<EmployeeDirectoryPage />} />
      <Route path="assets" element={authMode==='api'?<AssetManagementDashboardPage/>:<AssetInventoryPage/>} />
      <Route path="assets/registry" element={authMode==='api'?<AssetsListRedirect/>:<ApiFeatureBoundary/>} />
      <Route path="assets/registry/new" element={authMode==='api'?<TrackedAssetFormPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/registry/:id" element={authMode==='api'?<TrackedAssetDetailsPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/registry/:id/edit" element={authMode==='api'?<TrackedAssetFormPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/types" element={authMode==='api'?<AssetTypesPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/groups" element={authMode==='api'?<AssetGroupsPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/groups/:id" element={authMode==='api'?<AssetGroupDetailsPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/lookup/:tag" element={authMode==='api'?<AssetLookupPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/stock" element={authMode==='api'?<AssetStockPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/movements" element={authMode==='api'?<AssetMovementsPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/custody" element={authMode==='api'?<AssetCustodyPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/workstations" element={authMode==='api'?<AssetWorkstationsPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/replacement" element={authMode==='api'?<AssetReplacementPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/maintenance" element={authMode==='api'?<AssetMaintenancePage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/inventory" element={authMode==='api'?<AssetInventorySessionsPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/reports" element={authMode==='api'?<AssetReportsPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/administration" element={authMode==='api'?<AssetAdministrationPage/>:<ApiFeatureBoundary/>} />
      <Route path="assets/legacy" element={<AssetInventoryPage />} />
      <Route path="assets/new" element={<AssetFormPage />} />
      <Route path="assets/:id" element={<AssetDetailsPage />} />
      <Route path="assets/:id/edit" element={<AssetFormPage />} />
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
}

export function App(){return authMode==='api'?<ApiNotificationsProvider><AppRoutes/></ApiNotificationsProvider>:<AppRoutes/>}
