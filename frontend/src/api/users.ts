import client from './client'
import type { UserDetail } from '../types'

export const usersApi = {
  list: (params?: { is_active?: boolean; search?: string; limit?: number; offset?: number }) =>
    client.get<UserDetail[]>('/users/', { params }),

  get: (id: number) =>
    client.get<UserDetail>(`/users/${id}`),

  update: (id: number, data: { full_name?: string; is_active?: boolean }) =>
    client.patch<UserDetail>(`/users/${id}`, data),

  getRoles: (id: number) =>
    client.get<{ id: number; name: string; display_name: string; color: string }[]>(`/users/${id}/roles`),

  assignRole: (userId: number, roleId: number) =>
    client.post(`/users/${userId}/roles/`, { role_id: roleId }),

  removeRole: (userId: number, roleId: number) =>
    client.delete(`/users/${userId}/roles/${roleId}`),

  getOrgs: (id: number) =>
    client.get<{ organization_id: number; organization_name: string; organization_code: string; role: string; is_primary: boolean }[]>(
      `/users/${id}/organizations`
    ),

  assignOrg: (userId: number, data: { organization_id: number; role?: string; is_primary?: boolean }) =>
    client.post(`/users/${userId}/organizations/`, data),

  removeOrg: (userId: number, orgId: number) =>
    client.delete(`/users/${userId}/organizations/${orgId}`),
}
