import client from './client'
import type {
  PurchaseInvoiceConfig,
  PurchaseInvoiceItem,
  SupplierMapping,
  ProductMapping,
  SavedInvoice,
  SapOpenPO,
  ExternalApiSource,
  ApiFieldMapping,
  InvokeApiSourceResult,
} from '../types'

export interface InvoiceListParams {
  comName?:        string
  comTaxCode?:     string
  no?:             number
  fromDateYMD?:    string
  toDateYMD?:      string
  trangthai?:      number
  pattern?:        string
  serial?:         string
  typeSearchDate?: number
  typeDataPDF?:    number
}

export interface InvoiceListResponse {
  data:  PurchaseInvoiceItem[]
  total: number
}

export interface TestTokenResponse {
  success:             boolean
  message:             string
  token_preview:       string
  expires_in_seconds:  number
}

export interface TestSapLoginResponse {
  success:            boolean
  message:            string
  session_preview:    string
  version:            string
  expires_in_minutes: number
}

export const purchaseInvoiceApi = {
  // ── Config ────────────────────────────────────────────────────────────────
  getConfig: () =>
    client.get<PurchaseInvoiceConfig>('/purchase-invoices/config'),

  updateConfig: (data: Partial<PurchaseInvoiceConfig> & { sap_password?: string }) =>
    client.put<PurchaseInvoiceConfig>('/purchase-invoices/config', data),

  // ── Test API key ──────────────────────────────────────────────────────────
  testToken: () =>
    client.post<TestTokenResponse>('/purchase-invoices/test-token'),

  // ── Test SAP B1 login ─────────────────────────────────────────────────────
  testSapLogin: () =>
    client.post<TestSapLoginResponse>('/purchase-invoices/sap/test-login'),

  // ── Invoice list ──────────────────────────────────────────────────────────
  listInvoices: (params: InvoiceListParams) =>
    client.post<InvoiceListResponse>('/purchase-invoices/list', params),

  // ── Detail ────────────────────────────────────────────────────────────────
  detailByUrl: (url_xml: string, kiem_tra_hop_le = 0) =>
    client.get<PurchaseInvoiceItem>('/purchase-invoices/detail-by-url', {
      params: { url_xml, kiem_tra_hop_le },
    }),

  // ── Save invoice to DB ────────────────────────────────────────────────────
  saveInvoice: (invoice: PurchaseInvoiceItem) =>
    client.post<SavedInvoice>('/purchase-invoices/save', { invoice }),

  // ── Saved records ─────────────────────────────────────────────────────────
  listSaved: () =>
    client.get<SavedInvoice[]>('/purchase-invoices/saved'),

  getSavedByInvId: (inv_id: string) =>
    client.get<SavedInvoice>(`/purchase-invoices/saved/by-inv/${encodeURIComponent(inv_id)}`),

  updateSaved: (id: number, data: { supplier_code?: string; reference_po?: string }) =>
    client.put<SavedInvoice>(`/purchase-invoices/saved/${id}`, data),

  // ── Supplier mappings ─────────────────────────────────────────────────────
  listSupplierMappings: () =>
    client.get<SupplierMapping[]>('/purchase-invoices/config/supplier-mappings'),

  createSupplierMapping: (data: { tax_code: string; supplier_code: string; supplier_name?: string }) =>
    client.post<SupplierMapping>('/purchase-invoices/config/supplier-mappings', data),

  updateSupplierMapping: (id: number, data: Partial<SupplierMapping>) =>
    client.put<SupplierMapping>(`/purchase-invoices/config/supplier-mappings/${id}`, data),

  deleteSupplierMapping: (id: number) =>
    client.delete(`/purchase-invoices/config/supplier-mappings/${id}`),

  // ── Product mappings ──────────────────────────────────────────────────────
  listProductMappings: () =>
    client.get<ProductMapping[]>('/purchase-invoices/config/product-mappings'),

  createProductMapping: (data: {
    product_name: string; material_code?: string; unit_code?: string; tax_code_sap?: string
  }) =>
    client.post<ProductMapping>('/purchase-invoices/config/product-mappings', data),

  updateProductMapping: (id: number, data: Partial<ProductMapping>) =>
    client.put<ProductMapping>(`/purchase-invoices/config/product-mappings/${id}`, data),

  deleteProductMapping: (id: number) =>
    client.delete(`/purchase-invoices/config/product-mappings/${id}`),

  // ── SAP open POs ──────────────────────────────────────────────────────────
  getSapOpenPOs: (supplier_code: string) =>
    client.get<{ data: SapOpenPO[] }>('/purchase-invoices/sap/open-pos', {
      params: { supplier_code },
    }),

  // ── External API Sources ──────────────────────────────────────────────────
  listApiSources: () =>
    client.get<ExternalApiSource[]>('/purchase-invoices/config/api-sources'),

  createApiSource: (data: {
    name: string
    description?: string | null
    base_url: string
    select_fields?: string | null
    filter_template?: string | null
    extra_params?: string | null
    field_mappings?: ApiFieldMapping[]
    use_sap_auth?: boolean
    is_active?: boolean
  }) =>
    client.post<ExternalApiSource>('/purchase-invoices/config/api-sources', data),

  updateApiSource: (id: number, data: Partial<{
    name: string
    description: string | null
    base_url: string
    select_fields: string | null
    filter_template: string | null
    extra_params: string | null
    field_mappings: ApiFieldMapping[]
    use_sap_auth: boolean
    is_active: boolean
  }>) =>
    client.put<ExternalApiSource>(`/purchase-invoices/config/api-sources/${id}`, data),

  deleteApiSource: (id: number) =>
    client.delete(`/purchase-invoices/config/api-sources/${id}`),

  invokeApiSource: (id: number, context: Record<string, string | null>) =>
    client.post<InvokeApiSourceResult>(
      `/purchase-invoices/config/api-sources/${id}/invoke`,
      { context },
    ),
}
