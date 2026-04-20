import client from './client'
import type {
  PurchaseInvoiceConfig,
  PurchaseInvoiceItem,
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

export const purchaseInvoiceApi = {
  // ── Config ────────────────────────────────────────────────────────────────
  getConfig: () =>
    client.get<PurchaseInvoiceConfig>('/purchase-invoices/config'),

  updateConfig: (data: Partial<PurchaseInvoiceConfig>) =>
    client.put<PurchaseInvoiceConfig>('/purchase-invoices/config', data),

  // ── Test API key ──────────────────────────────────────────────────────────
  testToken: () =>
    client.post<TestTokenResponse>('/purchase-invoices/test-token'),

  // ── Invoice list (POST with JSON body) ────────────────────────────────────
  listInvoices: (params: InvoiceListParams) =>
    client.post<InvoiceListResponse>('/purchase-invoices/list', params),

  // ── Detail ────────────────────────────────────────────────────────────────
  detailByUrl: (url_xml: string, kiem_tra_hop_le = 0) =>
    client.get<PurchaseInvoiceItem>('/purchase-invoices/detail-by-url', {
      params: { url_xml, kiem_tra_hop_le },
    }),
}
