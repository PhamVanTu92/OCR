// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  refresh_expires_in?: number
}

export interface MeResponse {
  id: number
  keycloak_id: string
  email: string
  full_name: string | null
  username: string
  roles: string[]
  organization_ids: number[]
}

// ─── Users ────────────────────────────────────────────────────────────────────
export interface UserRoleItem {
  id: number
  name: string
  display_name: string
  color: string
}

export interface UserDetail {
  id: number
  keycloak_id: string
  email: string
  full_name: string | null
  username: string
  is_active: boolean
  created_at: string
  roles: UserRoleItem[]
  organization_ids: number[]
}

// ─── Roles & Permissions ──────────────────────────────────────────────────────
export interface Permission {
  id: number
  code: string
  name: string
  category: string
  description: string | null
}

export interface SystemRole {
  id: number
  name: string
  display_name: string
  description: string | null
  is_system: boolean
  color: string
  permissions: Permission[]
  created_at: string
}

// ─── API Tokens ───────────────────────────────────────────────────────────────
export interface APITokenListItem {
  id: number
  name: string
  token_prefix: string
  is_active: boolean
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

export interface APITokenCreated extends APITokenListItem {
  token: string   // full token, only available on creation
}

// ─── Organization ─────────────────────────────────────────────────────────────
export interface Organization {
  id: number
  parent_id: number | null
  name: string
  code: string
  group_name: string | null
  manager_name: string | null
  level: number
  path: string | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  children?: Organization[]
}

// ─── Document Type ────────────────────────────────────────────────────────────
export interface DocumentCategory {
  id: number
  name: string
  code: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface DocumentTypeField {
  id: number
  document_type_id: number
  field_name: string
  field_key: string
  field_type: string
  position: string
  is_required: boolean
  description: string | null
  sort_order: number
}

export interface DocumentTypeTableColumn {
  id: number
  table_id: number
  column_name: string
  column_key: string
  column_type: string
  is_required: boolean
  sort_order: number
}

export interface DocumentTypeTable {
  id: number
  document_type_id: number
  table_name: string
  table_key: string
  description: string | null
  sort_order: number
  columns: DocumentTypeTableColumn[]
}

export interface DocumentType {
  id: number
  category_id: number
  name: string
  code: string
  description: string | null
  system_prompt: string | null
  allowed_formats: string[] | null
  allow_multiple: boolean
  is_active: boolean
  created_at: string
  fields: DocumentTypeField[]
  tables: DocumentTypeTable[]
}

// ─── OCR / Document ───────────────────────────────────────────────────────────
export interface Document {
  id: number
  file_name: string
  file_size: number | null
  mime_type: string | null
  document_type_id: number
  organization_id: number
  status: 'pending' | 'processing' | 'completed' | 'confirmed' | 'failed'
  error_message: string | null
  processed_at: string | null
  confirmed_at: string | null
  confirmed_by_user_id: number | null
  created_at: string
  result?: DocumentResult | null
}

// ─── Integration ──────────────────────────────────────────────────────────────

export interface FieldMappingItem {
  source_key:    string
  target_key:    string
  is_required:   boolean
  default_value: string | null
}

export interface ColumnMappingItem {
  source_key: string
  target_key: string
}

export interface TableMappingItem {
  source_table_key: string
  target_key:       string
  columns:          ColumnMappingItem[]
}

export interface IntegrationConfig {
  id:               number
  document_type_id: number
  name:             string
  code:             string
  description:      string | null
  is_active:        boolean
  target_url:       string | null
  http_method:      string
  auth_type:        string | null          // bearer | api_key | basic | sap_b1 | null
  auth_header_name: string | null          // header name  OR  SAP username
  auth_value:       string | null          // token / key  OR  SAP password
  sap_base_url:     string | null          // SAP B1: base URL for login, e.g. https://host:50000
  sap_company_db:   string | null          // SAP B1: CompanyDB name
  root_key:         string | null
  field_mappings:   FieldMappingItem[] | null
  table_mappings:   TableMappingItem[] | null
  created_at:       string
}

export interface SapTestResponse {
  success:    boolean
  session_id: string | null
  routeid:    string | null
  message:    string
}

export interface PreviewExportResponse {
  integration_id:   number
  integration_name: string
  document_id:      number
  payload:          Record<string, unknown>
  warnings:         string[]
}

export interface ExportLogResponse {
  id:                    number
  integration_config_id: number
  document_id:           number
  status:                'success' | 'failed'
  response_status:       number | null
  error_message:         string | null
  exported_at:           string
  exported_payload:      Record<string, unknown> | null
  created_at:            string
}

export interface DocumentResult {
  id: number
  document_id: number
  raw_text: string | null
  extracted_fields: Record<string, unknown> | null
  extracted_tables: Record<string, Record<string, unknown>[]> | null
  confidence_score: number | null
  processing_time_ms: number | null
  model_used: string | null
  is_manually_edited: boolean
  edited_at: string | null
  created_at: string
}

// ─── Purchase Invoice (Hóa đơn đầu vào – Matbao) ─────────────────────────────

export interface PurchaseInvoiceConfig {
  id:               number
  name:             string
  matbao_base_url:  string
  matbao_token:     string | null
  tct_username:     string | null
  tct_password:     string | null
  is_active:        boolean
  created_at:       string | null
  updated_at:       string | null
}

export interface PurchaseInvoiceItem {
  // Thông tin chung
  THDon?:       string   // Tên hóa đơn
  KHMSHDon?:   string   // Ký hiệu mẫu số
  KHHDon?:     string   // Ký hiệu hóa đơn
  SHDon?:      string | number  // Số hóa đơn
  NLap?:       string   // Ngày lập
  NKy?:        string   // Ngày ký
  DVTTe?:      string   // Đơn vị tiền tệ
  HTTToan?:    string   // Hình thức thanh toán
  MCCQT?:      string   // Mã cơ quan thuế
  // Người bán
  NBanTen?:    string
  NBanMST?:    string
  NBanDChi?:   string
  // Người mua
  NMuaTen?:    string
  NMuaMST?:    string
  NMuaDChi?:   string
  // Thanh toán
  TgTCThue?:   number   // Tổng tiền chưa thuế
  TgTThue?:    number   // Tổng tiền thuế
  TgTTTBSo?:   number   // Tổng tiền thanh toán
  // Trạng thái
  TThai?:          number
  TenTThai?:       string
  LoaiHoaDon?:     number
  TenLoaiHoaDon?:  string
  // Links
  LinkDownloadXML?: string
  LinkDownloadPDF?: string
  // Line items
  DSHHDVu?: PurchaseInvoiceLineItem[]
  // Kiểm tra
  KTra?: Record<string, unknown>
}

export interface PurchaseInvoiceLineItem {
  STT?:     number
  MHHDVu?:  string
  THHDVu?:  string
  DVTinh?:  string
  SLuong?:  number
  DGia?:    number
  ThTien?:  number
  TSuat?:   string | number
  TLCKhau?: number
  STCKhau?: number
}

export interface CaptchaResponse {
  key:     string
  content: string   // SVG string
}
