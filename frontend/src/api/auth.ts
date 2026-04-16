import client from './client'
import type { TokenResponse, MeResponse } from '../types'

export const authApi = {
  login: (username: string, password: string) =>
    client.post<TokenResponse>('/auth/token', { username, password }),

  refresh: (refresh_token: string) =>
    client.post<TokenResponse>('/auth/refresh', { refresh_token }),

  me: () => client.get<MeResponse>('/auth/me'),

  logout: (refresh_token: string) =>
    client.post('/auth/logout', { refresh_token }),
}
