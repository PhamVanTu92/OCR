import client from './client'
import type {
  IntegrationConfig,
  PreviewExportResponse,
  ExportLogResponse,
  SapTestResponse,
} from '../types'

export const integrationApi = {
  // ── CRUD per document type ──────────────────────────────────────────────────
  list: (dtId: number) =>
    client.get<IntegrationConfig[]>(`/document-types/${dtId}/integrations`),

  get: (dtId: number, intId: number) =>
    client.get<IntegrationConfig>(`/document-types/${dtId}/integrations/${intId}`),

  create: (dtId: number, data: Record<string, unknown>) =>
    client.post<IntegrationConfig>(`/document-types/${dtId}/integrations`, data),

  update: (dtId: number, intId: number, data: Record<string, unknown>) =>
    client.put<IntegrationConfig>(`/document-types/${dtId}/integrations/${intId}`, data),

  delete: (dtId: number, intId: number) =>
    client.delete(`/document-types/${dtId}/integrations/${intId}`),

  // ── SAP Business One test connection ────────────────────────────────────────
  testSap: (dtId: number, intId: number) =>
    client.post<SapTestResponse>(
      `/document-types/${dtId}/integrations/${intId}/test-sap`
    ),

  // ── Preview & export per document ───────────────────────────────────────────
  previewExport: (docId: number, intId: number) =>
    client.post<PreviewExportResponse>(
      `/ocr/documents/${docId}/preview-export/${intId}`
    ),

  export: (docId: number, intId: number) =>
    client.post<ExportLogResponse>(`/ocr/documents/${docId}/export/${intId}`),

  listExportLogs: (docId: number) =>
    client.get<ExportLogResponse[]>(`/ocr/documents/${docId}/export-logs`),
}
