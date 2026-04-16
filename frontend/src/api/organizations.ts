import client from './client'
import type { Organization } from '../types'

export const orgApi = {
  // Trailing slash bắt buộc – khớp với route FastAPI @router.get("/")
  list: () => client.get<Organization[]>('/organizations/'),
  tree: () => client.get<Organization[]>('/organizations/tree'),
  get: (id: number) => client.get<Organization>(`/organizations/${id}`),
  create: (data: Partial<Organization>) =>
    client.post<Organization>('/organizations/', data),
  update: (id: number, data: Partial<Organization>) =>
    client.put<Organization>(`/organizations/${id}`, data),
  delete: (id: number) => client.delete(`/organizations/${id}`),
  listUsers: (id: number) => client.get<unknown[]>(`/organizations/${id}/users`),
  assignUser: (id: number, data: { user_id: number; role: string; is_primary: boolean }) =>
    client.post(`/organizations/${id}/users`, data),
}
