import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ToastProvider from './components/Toast'
import ConfirmProvider from './components/ConfirmProvider'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import UserProtectedRoute from './components/UserProtectedRoute'
import SetupWizard from './pages/SetupWizard'
import DashboardPage from './pages/admin/DashboardPage'
import UsersPage from './pages/admin/UsersPage'
import MetricsPage from './pages/admin/MetricsPage'
import ModelsPage from './pages/admin/ModelsPage'
import ModelEditPage from './pages/admin/ModelEditPage'
import ModelDownloadPage from './pages/admin/ModelDownloadPage'
import ModelLogsPage from './pages/admin/ModelLogsPage'
import SettingsPage from './pages/admin/SettingsPage'
import LogsPage from './pages/admin/LogsPage'
import AuditPage from './pages/admin/AuditPage'
import VersionPage from './pages/admin/VersionPage'
import UserLoginPage from './pages/user/UserLoginPage'
import UserDashboardPage from './pages/user/UserDashboardPage'
import UserModelsPage from './pages/user/UserModelsPage'
import UserConfigPage from './pages/user/UserConfigPage'
import UserMetricsPage from './pages/user/UserMetricsPage'
import UserRequestsPage from './pages/user/UserRequestsPage'
import UserQuotaPage from './pages/user/UserQuotaPage'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Routes>
              {/* Setup & Login */}
              <Route path="/setup" element={<SetupWizard />} />
              <Route path="/login" element={<UserLoginPage />} />

              {/* Admin routes */}
              <Route path="/admin/" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute><Layout><UsersPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/metrics" element={<ProtectedRoute><Layout><MetricsPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/models" element={<ProtectedRoute><Layout><ModelsPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/models/download" element={<ProtectedRoute><Layout><ModelDownloadPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/models/new" element={<ProtectedRoute><Layout><ModelEditPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/models/:modelId/edit" element={<ProtectedRoute><Layout><ModelEditPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/models/:modelId/logs" element={<ProtectedRoute><Layout><ModelLogsPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/system" element={<Navigate to="/admin/metrics" replace />} />
              <Route path="/admin/logs" element={<ProtectedRoute><Layout><LogsPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/audit" element={<ProtectedRoute><Layout><AuditPage /></Layout></ProtectedRoute>} />
              <Route path="/admin/version" element={<ProtectedRoute><Layout><VersionPage /></Layout></ProtectedRoute>} />

              {/* User routes */}
              <Route path="/user/" element={<UserProtectedRoute><UserDashboardPage /></UserProtectedRoute>} />
              <Route path="/user/models" element={<UserProtectedRoute><UserModelsPage /></UserProtectedRoute>} />
              <Route path="/user/config" element={<UserProtectedRoute><UserConfigPage /></UserProtectedRoute>} />
              <Route path="/user/metrics" element={<UserProtectedRoute><UserMetricsPage /></UserProtectedRoute>} />
              <Route path="/user/requests" element={<UserProtectedRoute><UserRequestsPage /></UserProtectedRoute>} />
              <Route path="/user/quota" element={<UserProtectedRoute><UserQuotaPage /></UserProtectedRoute>} />

              {/* Legacy redirect: /admin (without basename) */}
              <Route path="/" element={<Navigate to="/admin/" replace />} />
            </Routes>
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
