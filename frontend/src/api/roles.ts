import client from './client'
import type { Permission, SystemRole } from '../types'

export const rolesApi = {
  listPermissions: () =>
    client.get<Permission[]>('/roles/permissions'),

  list: () =>
    client.get<SystemRole[]>('/roles/'),

  get: (id: number) =>
    client.get<SystemRole>(`/roles/${id}`),

  create: (data: { name: string; display_name: string; description?: string; color?: string; permission_ids?: number[] }) =>
    client.post<SystemRole>('/roles/', data),

  update: (id: number, data: { display_name?: string; description?: string; color?: string; permission_ids?: number[] }) =>
    client.put<SystemRole>(`/roles/${id}`, data),

  delete: (id: number) =>
    client.delete(`/roles/${id}`),
}
