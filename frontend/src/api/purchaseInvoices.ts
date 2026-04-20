import client from './client'
import type {
  PurchaseInvoiceConfig,
  PurchaseInvoiceItem,
  CaptchaResponse,
} from '../types'

export interface InvoiceListParams {
  comName?:        string
  comTaxCode?:     string
  no?:             number
  fromDateYMD?:    string
  toDateYMD?:      string
  trangthai?:      number
  loaihoadon?:     number
  pattern?:        string
  serial?:         string
  typeSearchDate?: number
  typeDataPDF?:    number
}

export interface InvoiceListResponse {
  data:  PurchaseInvoiceItem[]
  total: number
}

export const purchaseInvoiceApi = {
  // ── Config ────────────────────────────────────────────────────────────────
  getConfig: () =>
    client.get<PurchaseInvoiceConfig>('/purchase-invoices/config'),

  updateConfig: (data: Partial<PurchaseInvoiceConfig>) =>
    client.put<PurchaseInvoiceConfig>('/purchase-invoices/config', data),

  // ── Invoice list ──────────────────────────────────────────────────────────
  listInvoices: (params: InvoiceListParams) =>
    client.get<InvoiceListResponse>('/purchase-invoices/list', { params }),

  listInvoicesTCT: (params: InvoiceListParams) =>
    client.get<InvoiceListResponse>('/purchase-invoices/list-tct', { params }),

  // ── Detail ────────────────────────────────────────────────────────────────
  detailByUrl: (url_xml: string, kiem_tra_hop_le = 0) =>
    client.get<PurchaseInvoiceItem>('/purchase-invoices/detail-by-url', {
      params: { url_xml, kiem_tra_hop_le },
    }),

  // ── TCT Auth ──────────────────────────────────────────────────────────────
  getCaptcha: () =>
    client.get<CaptchaResponse>('/purchase-invoices/captcha'),

  loginTCT: (body: {
    username: string
    password: string
    cvalue:   string
    ckey:     string
  }) => client.post<{ message: string }>('/purchase-invoices/login-tct', body),
}
