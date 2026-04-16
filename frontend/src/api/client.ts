import axios, { AxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

const client = axios.create({
  baseURL: BASE_URL,
  withCredentials: false,
})

// ── Gắn Bearer token vào mọi request ────────────────────────────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// ── Track in-flight refresh to prevent parallel refresh storms ───────────────
let _refreshing: Promise<string> | null = null

async function tryRefresh(): Promise<string> {
  if (_refreshing) return _refreshing

  _refreshing = (async () => {
    const rt = localStorage.getItem('refresh_token')
    if (!rt) throw new Error('no_refresh_token')

    // Call refresh directly – bypass interceptor to avoid loops
    const res = await axios.post<{ access_token: string; refresh_token?: string }>(
      `${BASE_URL}/auth/refresh`,
      { refresh_token: rt },
    )
    localStorage.setItem('access_token', res.data.access_token)
    if (res.data.refresh_token) {
      localStorage.setItem('refresh_token', res.data.refresh_token)
    }
    return res.data.access_token
  })()

  try {
    return await _refreshing
  } finally {
    _refreshing = null
  }
}

function goToLogin() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login'
  }
}

// ── Xử lý response lỗi ──────────────────────────────────────────────────────
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status  = err.response?.status
    const url     = err.config?.url ?? ''
    const isRetry = err.config?._retry === true

    // 401 on a non-auth, non-retry request → attempt token refresh
    if (status === 401 && !url.includes('/auth/') && !isRetry) {
      try {
        const newToken = await tryRefresh()

        // Replay the original request with the new token
        const retryConfig: AxiosRequestConfig & { _retry?: boolean } = {
          ...err.config,
          _retry: true,
          headers: {
            ...err.config.headers,
            Authorization: `Bearer ${newToken}`,
          },
        }
        return client(retryConfig)
      } catch {
        // Refresh failed → session truly expired
        goToLogin()
      }
    }

    // 401 from auth endpoints or from a retried request → real auth failure
    if (status === 401 && (url.includes('/auth/') || isRetry)) {
      goToLogin()
    }

    return Promise.reject(err)
  },
)

export default client
