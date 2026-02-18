import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import axios from 'axios'
import { isLoggedIn, clearAuth } from './hooks/useAuth'
import SignIn from './pages/SignIn'
import Dashboard from './pages/Dashboard'
import Board from './pages/Board'
import Pricing from './pages/Pricing'
import ActivateLicense from './pages/ActivateLicense'

// Global 401 interceptor — clears stale session and redirects to sign-in
axios.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      clearAuth()
      window.location.replace('/sign-in')
    }
    return Promise.reject(err)
  }
)

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/sign-in" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/activate" element={<ProtectedRoute><ActivateLicense /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/board/:boardId" element={<ProtectedRoute><Board /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
