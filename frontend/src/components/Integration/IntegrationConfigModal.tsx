import React, { useEffect, useState } from 'react'
import {
  X, Eye, Link2, Save,
  AlertCircle, CheckCircle2, ArrowRight, Wifi, WifiOff, Loader2,
  KeyRound, Copy, Check,
} from 'lucide-react'
import { integrationApi } from '../../api/integrations'
import { apiTokensApi } from '../../api/apiTokens'
import client from '../../api/client'
import type {
  DocumentType,
  IntegrationConfig,
  FieldMappingItem,
  ColumnMappingItem,
  TableMappingItem,
  SapTestResponse,
  APITokenListItem,
} from '../../types'

// ── Shared input style ────────────────────────────────────────────────────────
const inp  = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
const inpS = 'w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white'
const inpMono = inpS + ' font-mono'
const lbl  = 'block text-xs font-medium text-gray-600 mb-1'

type Tab = 'basic' | 'fields' | 'tables' | 'preview'

interface Props {
  open:        boolean
  docType:     DocumentType               // schema reference
  editData?:   IntegrationConfig | null   // null → create mode
  onClose:     () => void
  onSaved:     () => void
}

// ── Default empty integration ─────────────────────────────────────────────────
const emptyConfig = (): Omit<IntegrationConfig, 'id' | 'document_type_id' | 'created_at'> => ({
  name: '', code: '', description: null, is_active: true,
  target_url: null, http_method: 'POST',
  auth_type: null, auth_header_name: null, auth_value: null,
  sap_base_url: null, sap_company_db: null,
  root_key: null,
  field_mappings: null, table_mappings: null,
})

// ── Component ─────────────────────────────────────────────────────────────────
export default function IntegrationConfigModal({
  open, docType, editData, onClose, onSaved,
}: Props) {
  const [tab,    setTab]    = useState<Tab>('basic')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // ── Basic fields ─────────────────────────────────────────────────────────────
  const [name,         setName]         = useState('')
  const [code,         setCode]         = useState('')
  const [desc,         setDesc]         = useState('')
  const [isActive,     setIsActive]     = useState(true)
  const [targetUrl,    setTargetUrl]    = useState('')
  const [method,       setMethod]       = useState('POST')
  const [authType,     setAuthType]     = useState('')
  const [authHeader,   setAuthHeader]   = useState('')
  const [authValue,    setAuthValue]    = useState('')
  const [sapBaseUrl,   setSapBaseUrl]   = useState('')
  const [sapCompanyDb, setSapCompanyDb] = useState('')
  const [rootKey,      setRootKey]      = useState('')

  // ── SAP B1 test connection state ──────────────────────────────────────────
  const [sapTesting,  setSapTesting]  = useState(false)
  const [sapTestResult, setSapTestResult] = useState<SapTestResponse | null>(null)

  // ── API Token picker & credential login ──────────────────────────────────
  const [apiTokens,    setApiTokens]    = useState<APITokenListItem[]>([])
  const [tokenPicker,  setTokenPicker]  = useState(false)

  // Credential-based token fetch (username + password → /auth/token)
  const [showCredForm,    setShowCredForm]    = useState(false)
  const [credUsername,    setCredUsername]    = useState('')
  const [credPassword,    setCredPassword]    = useState('')
  const [credLoading,     setCredLoading]     = useState(false)
  const [credError,       setCredError]       = useState('')
  const [credTokenResult, setCredTokenResult] = useState('')
  const [credCopied,      setCredCopied]      = useState(false)

  useEffect(() => {
    if (authType === 'bearer' && apiTokens.length === 0) {
      apiTokensApi.list().then(r => setApiTokens(r.data.filter(t => t.is_active))).catch(() => {})
    }
    if (authType !== 'bearer') {
      setShowCredForm(false)
      setCredTokenResult('')
      setCredError('')
    }
  }, [authType])

  const fetchTokenByCredentials = async () => {
    if (!credUsername || !credPassword) { setCredError('Nhập username và password'); return }
    setCredLoading(true); setCredError(''); setCredTokenResult('')
    try {
      const res = await client.post<{ access_token: string }>('/auth/token', {
        username: credUsername,
        password: credPassword,
      })
      setCredTokenResult(res.data.access_token)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setCredError(msg || 'Sai tên đăng nhập hoặc mật khẩu')
    } finally { setCredLoading(false) }
  }

  const applyCredToken = () => {
    if (!credTokenResult) return
    setAuthValue(credTokenResult)
    setShowCredForm(false)
    setCredTokenResult('')
    setCredUsername(''); setCredPassword('')
  }

  const copyCredToken = () => {
    navigator.clipboard.writeText(credTokenResult)
    setCredCopied(true)
    setTimeout(() => setCredCopied(false), 2000)
  }

  // ── Field mappings ────────────────────────────────────────────────────────────
  const [fieldMappings, setFieldMappings] = useState<FieldMappingItem[]>([])

  // ── Table mappings ────────────────────────────────────────────────────────────
  const [tableMappings, setTableMappings] = useState<TableMappingItem[]>([])

  // ── Preview ───────────────────────────────────────────────────────────────────
  const [previewJson, setPreviewJson] = useState('')

  // ── Populate on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setTab('basic')
    setError('')

    setSapTestResult(null)

    if (editData) {
      setName(editData.name)
      setCode(editData.code)
      setDesc(editData.description ?? '')
      setIsActive(editData.is_active)
      setTargetUrl(editData.target_url ?? '')
      setMethod(editData.http_method ?? 'POST')
      setAuthType(editData.auth_type ?? '')
      setAuthHeader(editData.auth_header_name ?? '')
      setAuthValue(editData.auth_value ?? '')
      setSapBaseUrl(editData.sap_base_url ?? '')
      setSapCompanyDb(editData.sap_company_db ?? '')
      setRootKey(editData.root_key ?? '')
      setFieldMappings(editData.field_mappings ?? [])
      setTableMappings(editData.table_mappings ?? [])
    } else {
      setName(''); setCode(''); setDesc(''); setIsActive(true)
      setTargetUrl(''); setMethod('POST')
      setAuthType(''); setAuthHeader(''); setAuthValue('')
      setSapBaseUrl(''); setSapCompanyDb(''); setRootKey('')
      // Auto-init field mappings from doc type schema
      setFieldMappings(
        docType.fields.map(f => ({
          source_key:    f.field_key,
          target_key:    f.field_key,
          is_required:   f.is_required,
          default_value: null,
        }))
      )
      // Auto-init table mappings from doc type schema
      setTableMappings(
        docType.tables.map(t => ({
          source_table_key: t.table_key,
          target_key:       t.table_key,
          columns: t.columns.map(c => ({
            source_key: c.column_key,
            target_key: c.column_key,
          })),
        }))
      )
    }
  }, [open, editData])

  // ── Auto-generate preview JSON when switching to preview tab ─────────────────
  useEffect(() => {
    if (tab !== 'preview') return
    buildPreview()
  }, [tab])

  const buildPreview = () => {
    const body: Record<string, unknown> = {}
    // Header fields
    for (const fm of fieldMappings) {
      if (!fm.target_key) continue
      const field = docType.fields.find(f => f.field_key === fm.source_key)
      const sample = sampleValue(field?.field_type ?? 'string', fm.source_key)
      body[fm.target_key] = fm.default_value !== null && fm.default_value !== undefined
        ? fm.default_value : sample
    }
    // Tables
    for (const tm of tableMappings) {
      if (!tm.target_key) continue
      const tbl = docType.tables.find(t => t.table_key === tm.source_table_key)
      const sampleRow: Record<string, unknown> = {}
      for (const cm of tm.columns) {
        if (!cm.target_key) continue
        const col = tbl?.columns.find(c => c.column_key === cm.source_key)
        sampleRow[cm.target_key] = sampleValue(col?.column_type ?? 'string', cm.source_key)
      }
      body[tm.target_key] = [sampleRow]
    }
    const result = rootKey ? { [rootKey]: body } : body
    setPreviewJson(JSON.stringify(result, null, 2))
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!name.trim() || !code.trim()) { setError('Tên và mã không được trống'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        name: name.trim(), code: code.trim(),
        description:      desc.trim() || null,
        is_active:        isActive,
        target_url:       targetUrl.trim() || null,
        http_method:      method,
        auth_type:        authType || null,
        auth_header_name: authHeader.trim() || null,
        auth_value:       authValue.trim() || null,
        sap_base_url:     sapBaseUrl.trim() || null,
        sap_company_db:   sapCompanyDb.trim() || null,
        root_key:         rootKey.trim() || null,
        field_mappings:   fieldMappings.filter(f => f.source_key && f.target_key),
        table_mappings:   tableMappings
          .filter(t => t.source_table_key && t.target_key)
          .map(t => ({
            ...t,
            columns: t.columns.filter(c => c.source_key && c.target_key),
          })),
      }
      if (editData) {
        await integrationApi.update(docType.id, editData.id, payload as Record<string, unknown>)
      } else {
        await integrationApi.create(docType.id, payload as Record<string, unknown>)
      }
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Có lỗi xảy ra')
    } finally { setSaving(false) }
  }

  // ── SAP B1 test ──────────────────────────────────────────────────────────────
  const handleTestSap = async () => {
    if (!editData) return   // can only test after saving
    setSapTesting(true); setSapTestResult(null)
    try {
      const { data } = await integrationApi.testSap(docType.id, editData.id)
      setSapTestResult(data)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSapTestResult({ success: false, session_id: null, routeid: null, message: msg || 'Lỗi không xác định' })
    } finally { setSapTesting(false) }
  }

  if (!open) return null

  const tabs: { id: Tab; label: string }[] = [
    { id: 'basic',   label: 'Thông tin' },
    { id: 'fields',  label: 'Mapping Header' },
    { id: 'tables',  label: 'Mapping Chi tiết' },
    { id: 'preview', label: 'Xem trước JSON' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-indigo-500" />
            <h3 className="font-semibold text-gray-800">
              {editData ? 'Chỉnh sửa cấu hình tích hợp' : 'Thêm cấu hình tích hợp'}
            </h3>
            <span className="text-xs text-gray-400 ml-1">— {docType.name}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex border-b shrink-0 px-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
                ${tab === t.id
                  ? 'text-indigo-600 border-indigo-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50
              border border-red-200 rounded-lg px-4 py-2.5">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {/* ═══ Tab: Thông tin cơ bản ═══════════════════════════════════ */}
          {tab === 'basic' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Tên tích hợp <span className="text-red-500">*</span></label>
                  <input className={inp} placeholder="Hệ thống kế toán ERP"
                    value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Mã tích hợp <span className="text-red-500">*</span></label>
                  <input className={inp + ' font-mono'} placeholder="ERP_INVOICE"
                    value={code} onChange={e => setCode(e.target.value)} />
                </div>
              </div>

              <div>
                <label className={lbl}>Mô tả</label>
                <textarea className={inp} rows={2} placeholder="Mô tả về hệ thống tích hợp..."
                  value={desc} onChange={e => setDesc(e.target.value)} />
              </div>

              {/* Status toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={() => setIsActive(!isActive)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer
                    ${isActive ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow
                    transition-transform ${isActive ? 'translate-x-5' : ''}`} />
                </div>
                <span className="text-sm text-gray-700">Kích hoạt tích hợp</span>
              </label>

              {/* Target endpoint */}
              <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Endpoint nhận dữ liệu (tuỳ chọn)
                </p>
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3">
                    <label className={lbl}>
                      URL endpoint
                      {authType === 'sap_b1' && (
                        <span className="text-gray-400 font-normal ml-1">
                          — API cụ thể, vd. https://host:50000/b1s/v1/Drafts
                        </span>
                      )}
                    </label>
                    <input className={inp}
                      placeholder={authType === 'sap_b1'
                        ? 'https://172.16.10.1:50000/b1s/v1/Drafts'
                        : 'https://api.erp.com/v1/invoices'}
                      value={targetUrl} onChange={e => setTargetUrl(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>HTTP Method</label>
                    <select className={inp} value={method} onChange={e => setMethod(e.target.value)}>
                      {['POST', 'PUT', 'PATCH'].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={lbl}>Xác thực</label>
                      <select className={inp} value={authType} onChange={e => { setAuthType(e.target.value); setSapTestResult(null) }}>
                        <option value="">Không</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="api_key">API Key</option>
                        <option value="basic">Basic Auth</option>
                        <option value="sap_b1">SAP Business One</option>
                      </select>
                    </div>

                    {/* Standard auth: bearer / api_key / basic */}
                    {authType && authType !== 'sap_b1' && (
                      <>
                        <div>
                          <label className={lbl}>Header name</label>
                          <input className={inp + ' font-mono'} placeholder="Authorization"
                            value={authHeader} onChange={e => setAuthHeader(e.target.value)} />
                        </div>
                        <div>
                          {/* Label row with helper buttons for bearer */}
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-medium text-gray-600">
                              Giá trị (Token / Key)
                            </label>
                            {authType === 'bearer' && (
                              <div className="flex items-center gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => { setShowCredForm(v => !v); setTokenPicker(false) }}
                                  className="flex items-center gap-1 text-indigo-500 hover:text-indigo-700 font-medium"
                                >
                                  <KeyRound size={12} /> Lấy token bằng tài khoản
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => { setTokenPicker(v => !v); setShowCredForm(false) }}
                                  className="text-gray-500 hover:text-indigo-600"
                                >
                                  API Token
                                </button>
                              </div>
                            )}
                          </div>

                          <input className={inp} type="password"
                            placeholder={authType === 'bearer' ? 'Bearer token / API token (oct_…)' : 'Token / Key'}
                            value={authValue} onChange={e => setAuthValue(e.target.value)} />

                          {/* ── Credential-based token fetch ────────────────── */}
                          {authType === 'bearer' && showCredForm && (
                            <div className="mt-2 border border-indigo-200 bg-indigo-50/50 rounded-xl p-4 space-y-3">
                              <p className="text-xs font-semibold text-indigo-700">
                                Đăng nhập hệ thống để lấy Bearer Token
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Username</label>
                                  <input
                                    type="text"
                                    value={credUsername}
                                    onChange={e => setCredUsername(e.target.value)}
                                    placeholder="Tên đăng nhập"
                                    className={inp}
                                    autoComplete="off"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Password</label>
                                  <input
                                    type="password"
                                    value={credPassword}
                                    onChange={e => setCredPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className={inp}
                                    autoComplete="new-password"
                                    onKeyDown={e => e.key === 'Enter' && fetchTokenByCredentials()}
                                  />
                                </div>
                              </div>

                              {credError && (
                                <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">
                                  {credError}
                                </p>
                              )}

                              {credTokenResult ? (
                                <div className="space-y-2">
                                  <p className="text-xs text-green-700 font-medium">
                                    ✓ Token lấy thành công!
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <code className="flex-1 text-[10px] font-mono bg-white border
                                      border-green-200 rounded px-2 py-1.5 text-gray-700 truncate select-all">
                                      {credTokenResult.slice(0, 50)}…
                                    </code>
                                    <button type="button" onClick={copyCredToken}
                                      className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs
                                        font-medium transition-colors
                                        ${credCopied
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                      <Copy size={11} />
                                      {credCopied ? 'Đã chép' : 'Chép'}
                                    </button>
                                    <button type="button" onClick={applyCredToken}
                                      className="flex items-center gap-1 px-2 py-1.5 rounded text-xs
                                        font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors">
                                      <Check size={11} />
                                      Điền vào
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={fetchTokenByCredentials}
                                    disabled={credLoading || !credUsername || !credPassword}
                                    className="px-3 py-1.5 rounded text-xs font-medium bg-indigo-500
                                      text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                                  >
                                    {credLoading ? 'Đang lấy token...' : 'Lấy token'}
                                  </button>
                                  <button type="button"
                                    onClick={() => { setShowCredForm(false); setCredError(''); setCredTokenResult('') }}
                                    className="text-xs text-gray-400 hover:text-gray-600">
                                    Hủy
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── API Token list (long-lived tokens) ─────────────── */}
                          {authType === 'bearer' && tokenPicker && (
                            <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50/80 p-3 space-y-2">
                              <p className="text-xs font-semibold text-gray-600">
                                API Token dài hạn (oct_…):
                              </p>
                              {apiTokens.length === 0 ? (
                                <p className="text-xs text-gray-500">
                                  Chưa có API token nào.{' '}
                                  <a href="/roles" target="_blank" rel="noopener"
                                    className="text-indigo-500 underline">
                                    Tạo tại trang Vai trò & Quyền
                                  </a>
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {apiTokens.map(t => (
                                    <div key={t.id}
                                      className="flex items-center justify-between bg-white border
                                        border-gray-200 rounded px-3 py-2">
                                      <div>
                                        <div className="text-xs font-medium text-gray-800">{t.name}</div>
                                        <div className="text-xs font-mono text-gray-400">{t.token_prefix}</div>
                                      </div>
                                      <span className="text-xs text-gray-400 italic">
                                        Dán full token vào ô trên
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <button type="button" onClick={() => setTokenPicker(false)}
                                className="text-xs text-gray-400 hover:text-gray-600">
                                Đóng
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* SAP Business One specific fields */}
                  {authType === 'sap_b1' && (
                    <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-4 space-y-4">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                        SAP Business One – Service Layer
                      </p>

                      {/* Row 1: Base URL (auth) + Company DB */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={lbl}>
                            Service Layer URL <span className="text-red-500">*</span>
                            <span className="text-gray-400 font-normal ml-1">(dùng để xác thực)</span>
                          </label>
                          <input className={inp + ' font-mono'} placeholder="https://172.16.10.1:50000"
                            value={sapBaseUrl} onChange={e => setSapBaseUrl(e.target.value)} />
                          {sapBaseUrl && (
                            <p className="text-xs text-blue-400 mt-0.5 font-mono truncate">
                              → {sapBaseUrl.replace(/\/$/, '')}/b1s/v1/Login
                            </p>
                          )}
                        </div>
                        <div>
                          <label className={lbl}>
                            Company DB <span className="text-red-500">*</span>
                          </label>
                          <input className={inp + ' font-mono'} placeholder="DB_COMPANY"
                            value={sapCompanyDb} onChange={e => setSapCompanyDb(e.target.value)} />
                        </div>
                      </div>

                      {/* Row 2: Username + Password */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={lbl}>Username <span className="text-red-500">*</span></label>
                          <input className={inp} placeholder="manager"
                            value={authHeader} onChange={e => setAuthHeader(e.target.value)} />
                        </div>
                        <div>
                          <label className={lbl}>Password <span className="text-red-500">*</span></label>
                          <input className={inp} type="password" placeholder="••••••••"
                            value={authValue} onChange={e => setAuthValue(e.target.value)} />
                        </div>
                      </div>

                      {/* Test connection */}
                      <div className="flex items-center gap-3 pt-0.5 border-t border-blue-100">
                        <button
                          type="button"
                          onClick={handleTestSap}
                          disabled={sapTesting || !editData}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white
                            bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {sapTesting
                            ? <><Loader2 size={12} className="animate-spin" /> Đang kiểm tra...</>
                            : <><Wifi size={12} /> Kiểm tra kết nối</>}
                        </button>
                        {!editData && (
                          <span className="text-xs text-gray-400 italic">
                            Lưu cấu hình trước để kiểm tra kết nối
                          </span>
                        )}
                        {sapTestResult && (
                          <span className={`flex items-center gap-1.5 text-xs font-medium
                            ${sapTestResult.success ? 'text-green-600' : 'text-red-600'}`}>
                            {sapTestResult.success
                              ? <><CheckCircle2 size={13} /> {sapTestResult.message}</>
                              : <><WifiOff size={13} /> {sapTestResult.message}</>}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Output structure */}
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Cấu trúc JSON đầu ra
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-48">
                    <label className={lbl}>Root key (envelope)</label>
                    <input className={inp + ' font-mono'} placeholder="data (tuỳ chọn)"
                      value={rootKey} onChange={e => setRootKey(e.target.value)} />
                  </div>
                  <div className="text-xs text-gray-400 mt-4">
                    {rootKey
                      ? `→ JSON sẽ là: { "${rootKey}": { ... } }`
                      : '→ JSON sẽ là trực tiếp: { ... }'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Tab: Mapping Header (scalar fields) ═════════════════════ */}
          {tab === 'fields' && (
            <div>
              <p className="text-xs text-gray-400 mb-4">
                Ánh xạ các trường header từ kết quả OCR sang key trong JSON tích hợp.
                Bỏ trống <strong>Target key</strong> để loại trừ trường đó khỏi output.
              </p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                      <th className="px-3 py-2 text-left">Tên trường (OCR)</th>
                      <th className="px-3 py-2 text-left w-32">OCR key</th>
                      <th className="px-3 py-2 text-center w-8">→</th>
                      <th className="px-3 py-2 text-left">Target key</th>
                      <th className="px-3 py-2 text-center w-20">Bắt buộc</th>
                      <th className="px-3 py-2 text-left">Giá trị mặc định</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docType.fields.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-xs text-gray-400">
                          Loại chứng từ chưa có trường header nào
                        </td>
                      </tr>
                    )}
                    {docType.fields.map(field => {
                      const fm = fieldMappings.find(m => m.source_key === field.field_key)
                        ?? { source_key: field.field_key, target_key: '', is_required: false, default_value: null }
                      const idx = fieldMappings.findIndex(m => m.source_key === field.field_key)

                      const update = (patch: Partial<FieldMappingItem>) => {
                        setFieldMappings(prev => {
                          const copy = [...prev]
                          if (idx >= 0) copy[idx] = { ...copy[idx], ...patch }
                          else copy.push({ ...fm, ...patch })
                          return copy
                        })
                      }

                      return (
                        <tr key={field.field_key}
                          className="border-t border-gray-100 hover:bg-gray-50/50">
                          <td className="px-3 py-2 text-gray-700 text-xs">
                            <div>{field.field_name}</div>
                            <div className="text-gray-400">{field.field_type}</div>
                          </td>
                          <td className="px-3 py-2">
                            <code className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                              {field.field_key}
                            </code>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-300">
                            <ArrowRight size={14} />
                          </td>
                          <td className="px-3 py-2">
                            <input className={inpMono} placeholder={field.field_key}
                              value={fm.target_key}
                              onChange={e => update({ target_key: e.target.value })} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox" className="accent-indigo-600 w-4 h-4 cursor-pointer"
                              checked={fm.is_required}
                              onChange={e => update({ is_required: e.target.checked })} />
                          </td>
                          <td className="px-3 py-2">
                            <input className={inpS} placeholder="(trống)"
                              value={fm.default_value ?? ''}
                              onChange={e => update({ default_value: e.target.value || null })} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ Tab: Mapping Tables ══════════════════════════════════════ */}
          {tab === 'tables' && (
            <div className="space-y-5">
              <p className="text-xs text-gray-400">
                Ánh xạ các bảng chi tiết (array) từ kết quả OCR sang cấu trúc JSON tích hợp.
              </p>

              {docType.tables.length === 0 && (
                <div className="border border-dashed border-gray-200 rounded-lg py-8 text-center text-xs text-gray-400">
                  Loại chứng từ này chưa có bảng chi tiết
                </div>
              )}

              {docType.tables.map(tbl => {
                const tmIdx = tableMappings.findIndex(m => m.source_table_key === tbl.table_key)
                const tm: TableMappingItem = tmIdx >= 0
                  ? tableMappings[tmIdx]
                  : { source_table_key: tbl.table_key, target_key: tbl.table_key, columns: [] }

                const updateTm = (patch: Partial<TableMappingItem>) => {
                  setTableMappings(prev => {
                    const copy = [...prev]
                    if (tmIdx >= 0) copy[tmIdx] = { ...copy[tmIdx], ...patch }
                    else copy.push({ ...tm, ...patch })
                    return copy
                  })
                }

                const updateCol = (colSrcKey: string, patch: Partial<ColumnMappingItem>) => {
                  const cols = [...(tm.columns ?? [])]
                  const ci   = cols.findIndex(c => c.source_key === colSrcKey)
                  if (ci >= 0) cols[ci] = { ...cols[ci], ...patch }
                  else cols.push({ source_key: colSrcKey, target_key: colSrcKey, ...patch })
                  updateTm({ columns: cols })
                }

                return (
                  <div key={tbl.table_key} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Table header row */}
                    <div className="bg-gray-50 border-b px-4 py-3 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-700">{tbl.table_name}</div>
                        <code className="text-xs text-indigo-500">{tbl.table_key}</code>
                      </div>
                      <ArrowRight size={16} className="text-gray-300 shrink-0" />
                      <div className="w-48">
                        <input className={inpMono} placeholder="target array key"
                          value={tm.target_key}
                          onChange={e => updateTm({ target_key: e.target.value })} />
                      </div>
                    </div>

                    {/* Column mappings */}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 uppercase border-b border-gray-100 bg-white">
                          <th className="px-4 py-2 text-left">Tên cột (OCR)</th>
                          <th className="px-4 py-2 text-left w-32">OCR key</th>
                          <th className="px-3 py-2 text-center w-8">→</th>
                          <th className="px-4 py-2 text-left">Target key</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tbl.columns.map(col => {
                          const cm = tm.columns?.find(c => c.source_key === col.column_key)
                            ?? { source_key: col.column_key, target_key: col.column_key }
                          return (
                            <tr key={col.column_key}
                              className="border-t border-gray-50 hover:bg-gray-50/50">
                              <td className="px-4 py-2 text-gray-600">
                                <div>{col.column_name}</div>
                                <div className="text-gray-400">{col.column_type}</div>
                              </td>
                              <td className="px-4 py-2">
                                <code className="text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                                  {col.column_key}
                                </code>
                              </td>
                              <td className="px-3 py-2 text-center text-gray-300">
                                <ArrowRight size={12} />
                              </td>
                              <td className="px-4 py-2">
                                <input className={inpMono} placeholder={col.column_key}
                                  value={cm.target_key}
                                  onChange={e => updateCol(col.column_key, { target_key: e.target.value })} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}

          {/* ═══ Tab: Preview JSON ════════════════════════════════════════ */}
          {tab === 'preview' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">
                  Cấu trúc JSON dự kiến (giá trị mẫu dựa theo kiểu dữ liệu)
                </p>
                <button onClick={buildPreview}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline">
                  <Eye size={12} /> Làm mới
                </button>
              </div>
              <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-4 overflow-auto
                max-h-[50vh] font-mono leading-relaxed">
                {previewJson || '// Chưa có mapping nào'}
              </pre>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-xl shrink-0">
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>{fieldMappings.filter(f => f.target_key).length} fields</span>
            <span>{tableMappings.filter(t => t.target_key).length} tables</span>
            {isActive
              ? <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={11}/> Đang kích hoạt</span>
              : <span className="text-gray-400">Không kích hoạt</span>}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Hủy
            </button>
            <button onClick={submit} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm text-white bg-indigo-600 rounded-lg
                hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              <Save size={14} />
              {saving ? 'Đang lưu...' : editData ? 'Lưu thay đổi' : 'Tạo mới'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sample value generator ────────────────────────────────────────────────────
function sampleValue(type: string, key: string): unknown {
  switch (type) {
    case 'number':  return 0
    case 'date':    return '2024-01-01'
    case 'boolean': return false
    default:        return `<${key}>`
  }
}

