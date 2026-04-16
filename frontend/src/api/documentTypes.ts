import client from './client'
import type { DocumentCategory, DocumentType } from '../types'

export const docTypeApi = {
  // Categories
  listCategories: () => client.get<DocumentCategory[]>('/document-types/categories'),
  createCategory: (data: Partial<DocumentCategory>) =>
    client.post<DocumentCategory>('/document-types/categories', data),

  // Document Types – trailing slash để khớp route FastAPI @router.get("/")
  list: (category_id?: number) =>
    client.get<DocumentType[]>('/document-types/', { params: { category_id } }),
  get: (id: number) => client.get<DocumentType>(`/document-types/${id}`),
  create: (data: Record<string, unknown>) =>
    client.post<DocumentType>('/document-types/', data),
  update: (id: number, data: Record<string, unknown>) =>
    client.put<DocumentType>(`/document-types/${id}`, data),
  delete: (id: number) => client.delete(`/document-types/${id}`),

  // Fields
  addField: (dtId: number, data: Record<string, unknown>) =>
    client.post(`/document-types/${dtId}/fields`, data),
  updateField: (dtId: number, fieldId: number, data: Record<string, unknown>) =>
    client.put(`/document-types/${dtId}/fields/${fieldId}`, data),
  deleteField: (dtId: number, fieldId: number) =>
    client.delete(`/document-types/${dtId}/fields/${fieldId}`),

  // Tables
  addTable: (dtId: number, data: Record<string, unknown>) =>
    client.post(`/document-types/${dtId}/tables`, data),
  updateTable: (dtId: number, tableId: number, data: Record<string, unknown>) =>
    client.put(`/document-types/${dtId}/tables/${tableId}`, data),
  deleteTable: (dtId: number, tableId: number) =>
    client.delete(`/document-types/${dtId}/tables/${tableId}`),
}
