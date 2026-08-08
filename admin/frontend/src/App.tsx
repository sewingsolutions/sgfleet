import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ToastProvider from './components/Toast'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import UsersPage from './pages/UsersPage'
import MetricsPage from './pages/MetricsPage'
import ModelsPage from './pages/ModelsPage'
import ModelEditPage from './pages/ModelEditPage'
import ModelDownloadPage from './pages/ModelDownloadPage'
import ModelLogsPage from './pages/ModelLogsPage'
import SettingsPage from './pages/SettingsPage'

import LogsPage from './pages/LogsPage'
import AuditPage from './pages/AuditPage'
import VersionPage from './pages/VersionPage'

function App() {
  return (
    <BrowserRouter basename="/admin">
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute><Layout><UsersPage /></Layout></ProtectedRoute>} />
            <Route path="/metrics" element={<ProtectedRoute><Layout><MetricsPage /></Layout></ProtectedRoute>} />
            <Route path="/models" element={<ProtectedRoute><Layout><ModelsPage /></Layout></ProtectedRoute>} />
            <Route path="/models/download" element={<ProtectedRoute><Layout><ModelDownloadPage /></Layout></ProtectedRoute>} />
            <Route path="/models/new" element={<ProtectedRoute><Layout><ModelEditPage /></Layout></ProtectedRoute>} />
            <Route path="/models/:modelId/edit" element={<ProtectedRoute><Layout><ModelEditPage /></Layout></ProtectedRoute>} />
            <Route path="/models/:modelId/logs" element={<ProtectedRoute><Layout><ModelLogsPage /></Layout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
            <Route path="/system" element={<Navigate to="/metrics" replace />} />
            <Route path="/logs" element={<ProtectedRoute><Layout><LogsPage /></Layout></ProtectedRoute>} />
            <Route path="/audit" element={<ProtectedRoute><Layout><AuditPage /></Layout></ProtectedRoute>} />
            <Route path="/version" element={<ProtectedRoute><Layout><VersionPage /></Layout></ProtectedRoute>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
