import axios, { AxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

const client = axios.create({
  baseURL: BASE_URL,
  withCredentials: false,
})

// ── Helpers: lưu / đọc token + thời gian hết hạn ────────────────────────────
export function saveTokens(
  accessToken: string,
  expiresIn: number,
  refreshToken?: string,
) {
  localStorage.setItem('access_token', accessToken)
  // Lưu thời điểm hết hạn (epoch ms) để kiểm tra chủ động
  localStorage.setItem(
    'access_token_expires_at',
    String(Date.now() + expiresIn * 1000),
  )
  if (refreshToken) localStorage.setItem('refresh_token', refreshToken)
}

/** Trả về true nếu access token còn < 60 giây là hết hạn */
function isTokenExpiringSoon(): boolean {
  const raw = localStorage.getItem('access_token_expires_at')
  if (!raw) return false
  return Date.now() > parseInt(raw) - 60_000   // refresh sớm hơn 60s
}

// ── Track in-flight refresh – tránh gọi đồng thời nhiều lần ─────────────────
let _refreshing: Promise<string> | null = null

async function tryRefresh(): Promise<string> {
  if (_refreshing) return _refreshing

  _refreshing = (async () => {
    const rt = localStorage.getItem('refresh_token')
    if (!rt) throw new Error('no_refresh_token')

    // Gọi thẳng axios (bypass interceptor để tránh vòng lặp)
    const res = await axios.post<{
      access_token: string
      expires_in?: number
      refresh_token?: string
    }>(`${BASE_URL}/auth/refresh`, { refresh_token: rt })

    saveTokens(
      res.data.access_token,
      res.data.expires_in ?? 300,
      res.data.refresh_token,
    )
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
  localStorage.removeItem('access_token_expires_at')
  localStorage.removeItem('refresh_token')
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login'
  }
}

// ── Request interceptor: gắn token + refresh chủ động trước khi hết hạn ─────
client.interceptors.request.use(async (config) => {
  let token = localStorage.getItem('access_token')
  if (!token) return config

  // Token sắp hết hạn → refresh trước khi gửi request
  if (isTokenExpiringSoon()) {
    try {
      token = await tryRefresh()
    } catch {
      // Không refresh được → dùng token cũ, response interceptor xử lý 401
    }
  }

  config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// ── Response interceptor: fallback xử lý 401 ────────────────────────────────
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status  = err.response?.status
    const url     = err.config?.url ?? ''
    const isRetry = err.config?._retry === true

    // 401 trên request bình thường, chưa retry → thử refresh
    if (status === 401 && !url.includes('/auth/') && !isRetry) {
      try {
        const newToken = await tryRefresh()

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
        goToLogin()
      }
    }

    // 401 từ auth endpoint hoặc request đã retry → hết hạn thật sự
    if (status === 401 && (url.includes('/auth/') || isRetry)) {
      goToLogin()
    }

    return Promise.reject(err)
  },
)

export default client
