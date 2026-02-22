import axios from 'axios'
import { getToken, clearAuth } from '../hooks/useAuth'

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export const api = axios.create({ baseURL: SERVER_URL })

api.interceptors.request.use((cfg) => {
  const token = getToken()
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

api.interceptors.response.use(
  res => res,
  err => {
    if (
      err.response?.status === 401 &&
      !window.location.pathname.startsWith('/sign-in') &&
      !window.location.pathname.startsWith('/oauth-callback')
    ) {
      clearAuth()
      window.location.replace('/sign-in')
    }
    return Promise.reject(err)
  }
)
