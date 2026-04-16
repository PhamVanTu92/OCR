import client from './client'
import type { APITokenListItem, APITokenCreated } from '../types'

export const apiTokensApi = {
  list: () =>
    client.get<APITokenListItem[]>('/auth/tokens'),

  create: (data: { name: string; expires_at?: string | null }) =>
    client.post<APITokenCreated>('/auth/tokens', data),

  revoke: (id: number) =>
    client.delete(`/auth/tokens/${id}`),
}
