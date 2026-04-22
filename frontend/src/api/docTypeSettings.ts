import client from './client'
import type { DocTypeSapConfig, DocTypeApiSource, ApiFieldMapping, InvokeApiSourceResult, DocTypeLinkedSource, LinkedFieldMapping, LinkedDisplayColumn } from '../types'

export interface SapConfigUpdatePayload {
  sap_base_url?:   string | null
  sap_company_db?: string | null
  sap_username?:   string | null
  sap_password?:   string | null
  is_active?:      boolean
}

export interface TestSapLoginResponse {
  success:            boolean
  message:            string
  session_preview:    string
  version:            string
  expires_in_minutes: number
}

export interface ApiSourcePayload {
  name:             string
  description?:     string | null
  base_url:         string
  select_fields?:   string | null
  filter_template?: string | null
  extra_params?:    string | null
  field_mappings:   ApiFieldMapping[]
  use_sap_auth:     boolean
  category?:        string | null
  source_table_key?: string | null
  is_active:        boolean
}

export interface LinkedSourcePayload {
  name:              string
  description?:      string | null
  base_url:          string
  select_fields?:    string | null
  filter_template?:  string | null
  extra_params?:     string | null
  use_sap_auth:      boolean
  header_mappings:   LinkedFieldMapping[]
  lines_key?:        string | null
  source_table_key?: string | null
  line_mappings:     LinkedFieldMapping[]
  display_columns:   LinkedDisplayColumn[]
  is_active:         boolean
}

export const docTypeSettingsApi = {
  // ── SAP Config ────────────────────────────────────────────────────────────
  getSapConfig: (dtId: number) =>
    client.get<DocTypeSapConfig>(`/document-types/${dtId}/sap-config`),

  updateSapConfig: (dtId: number, data: SapConfigUpdatePayload) =>
    client.put<DocTypeSapConfig>(`/document-types/${dtId}/sap-config`, data),

  testSapLogin: (dtId: number) =>
    client.post<TestSapLoginResponse>(`/document-types/${dtId}/sap-config/test-login`),

  // ── API Sources ───────────────────────────────────────────────────────────
  listApiSources: (dtId: number) =>
    client.get<DocTypeApiSource[]>(`/document-types/${dtId}/api-sources`),

  createApiSource: (dtId: number, data: ApiSourcePayload) =>
    client.post<DocTypeApiSource>(`/document-types/${dtId}/api-sources`, data),

  updateApiSource: (dtId: number, srcId: number, data: Partial<ApiSourcePayload>) =>
    client.put<DocTypeApiSource>(`/document-types/${dtId}/api-sources/${srcId}`, data),

  deleteApiSource: (dtId: number, srcId: number) =>
    client.delete(`/document-types/${dtId}/api-sources/${srcId}`),

  invokeApiSource: (dtId: number, srcId: number, context: Record<string, string | null>) =>
    client.post<InvokeApiSourceResult>(`/document-types/${dtId}/api-sources/${srcId}/invoke`, { context }),

  // ── Linked Sources ────────────────────────────────────────────────────────
  listLinkedSources: (dtId: number) =>
    client.get<DocTypeLinkedSource[]>(`/document-types/${dtId}/linked-sources`),

  createLinkedSource: (dtId: number, data: LinkedSourcePayload) =>
    client.post<DocTypeLinkedSource>(`/document-types/${dtId}/linked-sources`, data),

  updateLinkedSource: (dtId: number, srcId: number, data: Partial<LinkedSourcePayload>) =>
    client.put<DocTypeLinkedSource>(`/document-types/${dtId}/linked-sources/${srcId}`, data),

  deleteLinkedSource: (dtId: number, srcId: number) =>
    client.delete(`/document-types/${dtId}/linked-sources/${srcId}`),

  invokeLinkedSource: (dtId: number, srcId: number, context: Record<string, string | null>) =>
    client.post<InvokeApiSourceResult>(`/document-types/${dtId}/linked-sources/${srcId}/invoke`, { context }),
}
