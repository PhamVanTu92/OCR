import client from './client'
import type { Document } from '../types'

export const ocrApi = {
  list: async (params?: {
    organization_id?: number
    document_type_id?: number
    status?: string
    search?: string
    limit?: number
    offset?: number
  }) => {
    const res = await client.get<Document[]>('/ocr/documents', { params })
    const total = parseInt(res.headers['x-total-count'] ?? String(res.data.length), 10)
    return { data: res.data, total }
  },

  get: (id: number) => client.get<Document>(`/ocr/documents/${id}`),

  upload: (file: File, document_type_id: number, organization_id: number) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('document_type_id', String(document_type_id))
    fd.append('organization_id', String(organization_id))
    return client.post<Document>('/ocr/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  retry: (id: number) => client.post(`/ocr/documents/${id}/retry`),

  getFile: (id: number) =>
    client.get(`/ocr/documents/${id}/file`, { responseType: 'blob' }),

  updateResult: (
    id: number,
    data: {
      extracted_fields?: Record<string, unknown>
      extracted_tables?: Record<string, Record<string, unknown>[]>
    },
  ) => client.patch<Document>(`/ocr/documents/${id}/result`, data),

  confirm: (id: number) =>
    client.post<Document>(`/ocr/documents/${id}/confirm`),

  unconfirm: (id: number) =>
    client.post<Document>(`/ocr/documents/${id}/unconfirm`),
}
