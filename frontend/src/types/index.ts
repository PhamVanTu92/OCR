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
  matbao_api_key:   string | null
  sap_base_url:     string | null
  sap_company_db:   string | null
  sap_username:     string | null
  is_active:        boolean
  created_at:       string | null
  updated_at:       string | null
}

export interface PurchaseInvoiceKTra {
  TrangThai?:             string
  NBanTen?:               string
  NBanMST?:               string
  NBanDChi?:              string
  NMuaTen?:               string
  NMuaMST?:               string
  NMuaDChi?:              string
  TgTCThue?:              string
  TgTThue?:               string
  TgTTTBSo?:              string
  TTCKTMai?:              string
  NBanTrangThaiHDMST?:    boolean
  NBanNDTrangThaiHDMST?:  string
  NMuaTrangThaiHDMST?:    boolean
  NMuaNDTrangThaiHDMST?:  string
  ChuKyMST?:              string
  ChuKyHieuLuc?:          string
}

export interface PurchaseInvoiceItem {
  // Định danh
  InvID?:        string
  TctID?:        string
  // Thông tin chung
  THDon?:        string
  KHMSHDon?:     string
  KHHDon?:       string
  SHDon?:        string | number
  NLap?:         string
  NKy?:          string
  DVTTe?:        string
  HTTToan?:      string
  MCCQT?:        string
  // Người bán
  NBanTen?:      string
  NBanMST?:      string
  NBanMa?:       string   // Mã người bán (trong hệ thống người mua)
  NBanDChi?:     string
  NBanSDT?:      string
  // Người mua
  NMuaTen?:      string
  NMuaMST?:      string
  NMuaDChi?:     string
  // Thanh toán
  TgTCThue?:     number
  TgTThue?:      number
  TgTTTBSo?:     number
  TgTTTBChu?:    string
  TTCKTMai?:     number
  // Trạng thái
  TThai?:            number   // 0=hợp lệ, 1=không hợp lệ, 2=trùng
  TenTThai?:         string
  TrangThaiHD?:      string
  KQPhanTich?:       string
  KQKiemTraHDon?:    string
  NguonUpload?:      string
  NgayImport?:       string
  // SAP (bổ sung từ backend)
  SupplierCode?:     string | null
  // Kiểm tra hợp lệ
  KTra?:         PurchaseInvoiceKTra
  // Links
  LinkDownloadXML?: string
  LinkDownloadPDF?: string
  // Dòng hàng hóa
  DSHHDVu?: PurchaseInvoiceLineItem[]
}

export interface PurchaseInvoiceLineItem {
  STT?:      number
  MHHDVu?:   string
  THHDVu?:   string
  DVTinh?:   string
  SLuong?:   number
  DGia?:     number
  ThTien?:   number
  TSuat?:    string | number
  TLCKhau?:  number
  STCKhau?:  number
  // SAP integration fields (editable / auto-fill from External API)
  ItemCode?: string | null   // SAP – Mã hàng hóa
  ItemName?: string | null   // SAP – Tên hàng hóa
  UomId?:    string | null   // SAP – Mã đơn vị tính
  TaxCode?:  string | null   // SAP – Mã thuế
}

// ─── Supplier mapping ─────────────────────────────────────────────────────────
export interface SupplierMapping {
  id:            number
  tax_code:      string
  supplier_code: string
  supplier_name: string | null
  created_at:    string | null
  updated_at:    string | null
}

// ─── Product mapping ──────────────────────────────────────────────────────────
export interface ProductMapping {
  id:            number
  product_name:  string
  material_code: string | null
  unit_code:     string | null
  tax_code_sap:  string | null
  created_at:    string | null
  updated_at:    string | null
}

// ─── Saved invoice record ─────────────────────────────────────────────────────
export interface SavedInvoice {
  id:               number
  inv_id:           string
  inv_no:           string | null
  khhd:             string | null
  inv_date:         string | null
  seller_tax_code:  string | null
  seller_name:      string | null
  buyer_tax_code:   string | null
  buyer_name:       string | null
  total_before_tax: number | null
  total_tax:        number | null
  total_amount:     number | null
  kq_phan_tich:     string | null
  tthai:            number | null
  supplier_code:    string | null
  reference_po:     string | null
  raw_data:         string | null
  created_at:       string | null
  updated_at:       string | null
}

// ─── SAP Open PO ──────────────────────────────────────────────────────────────
export interface SapOpenPO {
  PONumber:    string
  DocDate?:    string
  Vendor?:     string
  VendorName?: string
  TotalAmount?: number
  Currency?:   string
  Items?:      SapPOItem[]
}

// ─── External API Source ──────────────────────────────────────────────────────
export interface ApiFieldMapping {
  api_field: string
  label:     string
  ocr_field: string | null
}

export interface ExternalApiSource {
  id:              number
  name:            string
  description:     string | null
  base_url:        string
  select_fields:   string | null
  filter_template: string | null
  extra_params:    string | null
  field_mappings:  ApiFieldMapping[]
  use_sap_auth:    boolean
  category:        string | null   // null=manual | 'seller'=auto người bán | 'line_item'=auto dòng hàng
  is_active:       boolean
  created_at:      string | null
  updated_at:      string | null
}

export interface InvokeApiSourceResult {
  success:    boolean
  data:       Record<string, unknown>[]
  count:      number
  url_called: string
}

export interface SapPOItem {
  POItem?:      string
  Material?:    string
  Description?: string
  Quantity?:    number
  Unit?:        string
  NetPrice?:    number
}

// ─── Per-DocType SAP + API Sources ────────────────────────────────────────────

export interface DocTypeSapConfig {
  id:               number
  document_type_id: number
  sap_base_url:     string | null
  sap_company_db:   string | null
  sap_username:     string | null
  is_active:        boolean
  created_at:       string | null
  updated_at:       string | null
}

export interface DocTypeApiSource {
  id:               number
  document_type_id: number
  name:             string
  description:      string | null
  base_url:         string
  select_fields:    string | null
  filter_template:  string | null
  extra_params:     string | null
  field_mappings:   ApiFieldMapping[]
  use_sap_auth:     boolean
  category:         string | null   // null=manual | 'seller' | 'line_item'
  is_active:        boolean
  created_at:       string | null
  updated_at:       string | null
}

