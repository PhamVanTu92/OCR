import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import MainLayout from './components/Layout/MainLayout'
import LoginPage from './pages/LoginPage'
import OrganizationsPage from './pages/OrganizationsPage'
import DocumentTypesPage from './pages/DocumentTypesPage'
import OCRPage from './pages/OCRPage'
import OCRDetailPage from './pages/OCRDetailPage'
import UsersPage from './pages/UsersPage'
import RolesPage from './pages/RolesPage'
import PurchaseInvoicesPage from './pages/PurchaseInvoicesPage'

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
  </div>
)

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const hasToken = !!localStorage.getItem('access_token')

  // Có token nhưng user chưa load xong → hiện spinner (tránh redirect sớm)
  if (loading || (hasToken && !user)) return <Spinner />

  // Không có token → về login
  if (!hasToken) return <Navigate to="/login" replace />

  return <>{children}</>
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const hasToken = !!localStorage.getItem('access_token')

  if (loading) return <Spinner />

  // Đã đăng nhập rồi → vào trang chính
  if (user || hasToken) return <Navigate to="/organizations" replace />

  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          } />

          <Route path="/" element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }>
            <Route index element={<Navigate to="/organizations" replace />} />
            <Route path="organizations"  element={<OrganizationsPage />} />
            <Route path="document-types" element={<DocumentTypesPage />} />
            <Route path="ocr"            element={<OCRPage />} />
            <Route path="ocr/documents/:id" element={<OCRDetailPage />} />
            <Route path="purchase-invoices" element={<PurchaseInvoicesPage />} />
            <Route path="users"          element={<UsersPage />} />
            <Route path="roles"          element={<RolesPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
