import { useEffect, useMemo, useState } from 'react'
import {
  Settings, RefreshCw, CheckCircle2, AlertCircle,
  X, Loader2, KeyRound, Receipt, Plus, Pencil, Trash2, Save,
  Database, ChevronDown, ChevronRight,
  Link2, Play, Info,
} from 'lucide-react'
import { purchaseInvoiceApi } from '../api/purchaseInvoices'
import type { TestSapLoginResponse } from '../api/purchaseInvoices'
import type {
  PurchaseInvoiceConfig,
  ExternalApiSource, ApiFieldMapping, InvokeApiSourceResult,
} from '../types'

type Err = { response?: { data?: { detail?: string } } }

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function SectionHeader({
  icon, title, expanded, onToggle,
}: {
  icon: React.ReactNode
  title: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-6 py-4 border-b bg-gray-50/80
        hover:bg-gray-100 transition-colors text-left">
      <span className="text-indigo-500">{icon}</span>
      <span className="font-semibold text-gray-700 text-sm flex-1">{title}</span>
      {expanded
        ? <ChevronDown  size={15} className="text-gray-400" />
        : <ChevronRight size={15} className="text-gray-400" />}
    </button>
  )
}


// ─── Context placeholder sets (for $filter template) ─────────────────────────
// Fields available in the invoice header context (always sent)
const HEADER_PLACEHOLDERS = [
  { key: 'NBanMST',  label: 'MST người bán',    group: 'Người bán' },
  { key: 'NBanTen',  label: 'Tên người bán',     group: 'Người bán' },
  { key: 'NBanMa',   label: 'Mã người bán',      group: 'Người bán' },
  { key: 'NBanDChi', label: 'Địa chỉ người bán', group: 'Người bán' },
  { key: 'NMuaMST',  label: 'MST người mua',     group: 'Người mua' },
  { key: 'NMuaTen',  label: 'Tên người mua',     group: 'Người mua' },
  { key: 'SHDon',    label: 'Số hóa đơn',        group: 'Hóa đơn' },
  { key: 'InvID',    label: 'InvID (Matbao)',     group: 'Hóa đơn' },
  { key: 'NLap',     label: 'Ngày lập',           group: 'Hóa đơn' },
  { key: 'KHMSHDon', label: 'Mẫu số HĐ',         group: 'Hóa đơn' },
  { key: 'KHHDon',   label: 'Ký hiệu HĐ',        group: 'Hóa đơn' },
  { key: 'DVTTe',    label: 'Đơn vị tiền tệ',    group: 'Hóa đơn' },
  { key: 'HTTToan',  label: 'Hình thức TT',       group: 'Hóa đơn' },
]

// Additional fields available only when running per-line (line_item category)
const LINE_ITEM_PLACEHOLDERS = [
  { key: 'MHHDVu',  label: 'Mã hàng hóa/DV',  group: 'Dòng hàng' },
  { key: 'THHDVu',  label: 'Tên hàng hóa/DV', group: 'Dòng hàng' },
  { key: 'DVTinh',  label: 'Đơn vị tính',      group: 'Dòng hàng' },
  { key: 'SLuong',  label: 'Số lượng',          group: 'Dòng hàng' },
  { key: 'DGia',    label: 'Đơn giá',           group: 'Dòng hàng' },
  { key: 'TSuat',   label: 'Thuế suất',         group: 'Dòng hàng' },
  { key: 'ItemCode', label: 'SAP ItemCode',     group: 'SAP hiện tại' },
  { key: 'ItemName', label: 'SAP ItemName',     group: 'SAP hiện tại' },
  { key: 'UomId',   label: 'SAP UomId',         group: 'SAP hiện tại' },
  { key: 'TaxCode', label: 'SAP TaxCode',       group: 'SAP hiện tại' },
]

// Suggested target (ocr_field) for each category
const LINE_ITEM_TARGET_FIELDS = [
  { key: 'ItemCode', label: 'ItemCode – Mã hàng SAP' },
  { key: 'ItemName', label: 'ItemName – Tên hàng SAP' },
  { key: 'UomId',   label: 'UomId – Đơn vị tính SAP' },
  { key: 'TaxCode', label: 'TaxCode – Mã thuế SAP' },
  { key: 'MHHDVu',  label: 'MHHDVu – Mã hàng trên HĐ' },
  { key: 'DVTinh',  label: 'DVTinh – ĐVT trên HĐ' },
]

// ─── External API Source section ──────────────────────────────────────────────
const EMPTY_MAPPING: ApiFieldMapping = { api_field: '', label: '', ocr_field: null }

function buildUrlPreview(baseUrl: string, selectFields: string, filterTemplate: string, extraParams: string) {
  if (!baseUrl.trim()) return ''
  const parts: string[] = []
  if (selectFields.trim())   parts.push(`$select=${selectFields.trim()}`)
  if (filterTemplate.trim()) parts.push(`$filter=${filterTemplate.trim()}`)
  if (extraParams.trim()) {
    extraParams.trim().split('&').forEach(p => { if (p.trim()) parts.push(p.trim()) })
  }
  return parts.length ? `${baseUrl.trim()}?${parts.join('&')}` : baseUrl.trim()
}

function ExternalApiSection() {
  const [items,    setItems]    = useState<ExternalApiSource[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<ExternalApiSource | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)

  const [fName,    setFName]    = useState('')
  const [fDesc,    setFDesc]    = useState('')
  const [fUrl,     setFUrl]     = useState('')
  const [fSelect,  setFSelect]  = useState('')
  const [fFilter,  setFFilter]  = useState('')
  const [fExtra,   setFExtra]   = useState('')
  const [fMaps,     setFMaps]     = useState<ApiFieldMapping[]>([{ ...EMPTY_MAPPING }])
  const [fSapAuth,  setFSapAuth]  = useState(true)
  const [fCategory, setFCategory] = useState<string>('')   // '' | 'seller' | 'line_item'
  const [fActive,   setFActive]   = useState(true)

  // Invoke / test state
  const [invoking, setInvoking]   = useState<number | null>(null)
  const [invokeRes, setInvokeRes] = useState<(InvokeApiSourceResult & { source_id: number }) | null>(null)

  const urlPreview = useMemo(
    () => buildUrlPreview(fUrl, fSelect, fFilter, fExtra),
    [fUrl, fSelect, fFilter, fExtra],
  )

  // $filter placeholders: header always; line_item fields thêm khi category = line_item
  const placeholderGroups = useMemo(() => {
    const list = fCategory === 'line_item'
      ? [...HEADER_PLACEHOLDERS, ...LINE_ITEM_PLACEHOLDERS]
      : HEADER_PLACEHOLDERS
    const groups: Record<string, typeof HEADER_PLACEHOLDERS> = {}
    list.forEach(p => {
      if (!groups[p.group]) groups[p.group] = []
      groups[p.group].push(p)
    })
    return groups
  }, [fCategory])

  const load = () => {
    setLoading(true)
    purchaseInvoiceApi.listApiSources()
      .then(r => setItems(r.data))
      .catch(() => setError('Không thể tải danh sách API'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    setFName(''); setFDesc(''); setFUrl(''); setFSelect(''); setFFilter(''); setFExtra('')
    setFMaps([{ ...EMPTY_MAPPING }]); setFSapAuth(true); setFCategory(''); setFActive(true)
    setShowForm(true)
  }
  const openEdit = (src: ExternalApiSource) => {
    setEditing(src)
    setFName(src.name); setFDesc(src.description ?? ''); setFUrl(src.base_url)
    setFSelect(src.select_fields ?? ''); setFFilter(src.filter_template ?? '')
    setFExtra(src.extra_params ?? '')
    setFMaps(src.field_mappings.length ? src.field_mappings.map(m => ({ ...m })) : [{ ...EMPTY_MAPPING }])
    setFSapAuth(src.use_sap_auth); setFCategory(src.category ?? ''); setFActive(src.is_active)
    setShowForm(true)
  }
  const cancelForm = () => { setShowForm(false); setEditing(null) }

  const handleSave = async () => {
    if (!fName.trim()) { setError('Tên không được trống'); return }
    if (!fUrl.trim())  { setError('Base URL không được trống'); return }
    setSaving(true); setError(''); setSuccess('')
    const validMaps = fMaps.filter(m => m.api_field.trim())
    const payload = {
      name: fName.trim(), description: fDesc || null,
      base_url: fUrl.trim(), select_fields: fSelect || null,
      filter_template: fFilter || null, extra_params: fExtra || null,
      field_mappings: validMaps,
      use_sap_auth: fSapAuth,
      category: fCategory || null,
      is_active: fActive,
    }
    try {
      if (editing) {
        await purchaseInvoiceApi.updateApiSource(editing.id, payload)
        setSuccess('Đã cập nhật API source!')
      } else {
        await purchaseInvoiceApi.createApiSource(payload)
        setSuccess('Đã tạo API source!')
      }
      load(); cancelForm()
    } catch (e: unknown) {
      setError((e as Err)?.response?.data?.detail ?? 'Lỗi lưu')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Xoá API source này?')) return
    setDeleting(id)
    try {
      await purchaseInvoiceApi.deleteApiSource(id)
      setItems(prev => prev.filter(i => i.id !== id))
      setSuccess('Đã xoá!')
    } catch { setError('Xoá thất bại') }
    finally { setDeleting(null) }
  }

  const handleInvoke = async (src: ExternalApiSource) => {
    setInvoking(src.id); setInvokeRes(null); setError('')
    try {
      const r = await purchaseInvoiceApi.invokeApiSource(src.id, {})
      setInvokeRes({ ...r.data, source_id: src.id })
    } catch (e: unknown) {
      setError((e as Err)?.response?.data?.detail ?? 'Gọi API thất bại')
    } finally { setInvoking(null) }
  }

  // ── Field mapping helpers ─────────────────────────────────────────────────
  const updateMap = (i: number, patch: Partial<ApiFieldMapping>) =>
    setFMaps(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m))
  const addMap    = () => setFMaps(prev => [...prev, { ...EMPTY_MAPPING }])
  const removeMap = (i: number) => setFMaps(prev => prev.filter((_, idx) => idx !== i))

  return (
    <div className="px-6 py-4 space-y-4">

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
          <AlertCircle size={13} /> <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={11} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
          <CheckCircle2 size={13} /> <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess('')}><X size={11} /></button>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="border border-indigo-200 rounded-xl bg-indigo-50/20 p-5 space-y-5">
          <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
            <Link2 size={13} />
            {editing ? 'Chỉnh sửa API source' : 'Thêm API source mới'}
          </p>

          {/* Basic info + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Tên *">
              <input value={fName} onChange={e => setFName(e.target.value)}
                placeholder="VD: SAP Orders theo MST người bán" className={inputCls} />
            </Field>
            <Field label="Mô tả">
              <input value={fDesc} onChange={e => setFDesc(e.target.value)}
                placeholder="Ghi chú dùng để làm gì..." className={inputCls} />
            </Field>
            <Field label="Chạy tự động (Category)">
              <select value={fCategory} onChange={e => setFCategory(e.target.value)}
                className={inputCls}>
                <option value="">— Thủ công</option>
                <option value="seller">🏢 Người bán – tự động khi mở HĐ</option>
                <option value="line_item">📦 Hàng hóa – tự động từng dòng</option>
              </select>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {fCategory === 'seller'    && 'Chạy 1 lần khi mở hóa đơn, kết quả hiển thị ở mục Người bán'}
                {fCategory === 'line_item' && 'Chạy riêng cho từng dòng hàng, gán dữ liệu theo mapping bên dưới'}
                {fCategory === ''          && 'Chỉ chạy khi bấm thủ công trong drawer hóa đơn'}
              </p>
            </Field>
          </div>

          {/* Endpoint */}
          <Field label={<span className="flex items-center gap-1"><Link2 size={11} className="text-indigo-400" />Base URL *</span>}>
            <input value={fUrl} onChange={e => setFUrl(e.target.value)}
              placeholder="https://172.16.10.1:50000/b1s/v1/Orders"
              className={`${inputCls} font-mono text-xs`} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Trường lấy dữ liệu ($select)">
              <input value={fSelect} onChange={e => setFSelect(e.target.value)}
                placeholder="DocEntry,U_MDHPT,Cancelled,DocDate"
                className={`${inputCls} font-mono text-xs`} />
              <p className="text-[11px] text-gray-400 mt-0.5">Danh sách trường cách nhau bằng dấu phẩy</p>
            </Field>
            <Field label="Tham số thêm (extra)">
              <input value={fExtra} onChange={e => setFExtra(e.target.value)}
                placeholder="$skip=0&$orderby=DocDate desc&$top=100"
                className={`${inputCls} font-mono text-xs`} />
            </Field>
          </div>

          <Field label="Điều kiện lọc ($filter) – dùng {placeholder} từ dữ liệu hóa đơn">
            <input value={fFilter} onChange={e => setFFilter(e.target.value)}
              placeholder="Cancelled eq 'tNO' and U_MDHPT eq '{NBanMST}'"
              className={`${inputCls} font-mono text-xs`} />
            <div className="mt-2 space-y-1.5">
              <span className="text-[11px] text-gray-400 font-medium">
                Placeholder khả dụng
                {fCategory === 'line_item'
                  ? ' (header hóa đơn + từng dòng hàng – gọi API mỗi dòng):'
                  : ' (context hóa đơn – gọi API 1 lần):'}
              </span>
              {Object.entries(placeholderGroups).map(([group, fields]) => (
                <div key={group} className="flex flex-wrap gap-1 items-center">
                  <span className="text-[10px] text-gray-300 w-20 shrink-0">{group}</span>
                  {fields.map(p => (
                    <button key={p.key} type="button"
                      onClick={() => setFFilter(v => v + `{${p.key}}`)}
                      title={p.label}
                      className="text-[11px] font-mono bg-indigo-50 text-indigo-600 border border-indigo-100
                        px-1.5 py-0.5 rounded hover:bg-indigo-100 transition-colors whitespace-nowrap">
                      {`{${p.key}}`}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </Field>

          {/* URL preview */}
          {urlPreview && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[11px] text-gray-400 font-medium mb-1">URL preview:</p>
              <p className="text-[11px] font-mono text-gray-700 break-all leading-relaxed">{urlPreview}</p>
            </div>
          )}

          {/* Field mappings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Info size={11} className="text-indigo-400" />
                Mapping trường kết quả API → trường đích
              </label>
              <button onClick={addMap}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
                <Plus size={12} /> Thêm trường
              </button>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-0.5">
              <span className="text-[11px] font-medium text-gray-400">Trường API (JSON key)</span>
              <span className="text-[11px] font-medium text-gray-400">Nhãn hiển thị</span>
              <span className="text-[11px] font-medium text-gray-400">
                {fCategory === 'line_item' ? 'Trường dòng hàng đích' : 'Trường OCR đích (không bắt buộc)'}
              </span>
              <span />
            </div>

            <div className="space-y-2">
              {fMaps.map((m, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
                  <input value={m.api_field}
                    onChange={e => updateMap(i, { api_field: e.target.value })}
                    placeholder="VD: DocEntry"
                    className={`${inputCls} font-mono text-xs`} />
                  <input value={m.label}
                    onChange={e => updateMap(i, { label: e.target.value })}
                    placeholder="VD: Số đơn hàng"
                    className={inputCls} />
                  <div className="space-y-1">
                    <input value={m.ocr_field ?? ''}
                      onChange={e => updateMap(i, { ocr_field: e.target.value || null })}
                      placeholder={fCategory === 'line_item' ? 'VD: ItemCode' : 'Không bắt buộc'}
                      className={`${inputCls} font-mono text-xs`} />
                    {/* Quick-fill chips for line_item */}
                    {fCategory === 'line_item' && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {LINE_ITEM_TARGET_FIELDS.map(t => (
                          <button key={t.key} type="button"
                            onClick={() => updateMap(i, { ocr_field: t.key })}
                            title={t.label}
                            className={`text-[10px] font-mono px-1 py-0.5 rounded border transition-colors
                              ${m.ocr_field === t.key
                                ? 'bg-amber-100 text-amber-700 border-amber-200'
                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-amber-50 hover:text-amber-600'}`}>
                            {t.key}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeMap(i)} disabled={fMaps.length === 1}
                    className="text-gray-300 hover:text-red-500 disabled:opacity-20 transition-colors mt-2">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {fCategory === 'line_item' && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                📦 <strong>Hàng hóa:</strong> API gọi <em>1 lần</em> với context hóa đơn, trả về danh sách.
                Dòng kết quả thứ N gán vào dòng hàng thứ N theo thứ tự.
                Cột đích nên là <code className="font-mono">ItemCode · ItemName · UomId · TaxCode</code>.
              </p>
            )}
            {fCategory === 'seller' && (
              <p className="text-[11px] text-violet-600 bg-violet-50 border border-violet-100 rounded px-2 py-1.5">
                🏢 <strong>Người bán:</strong> API chạy 1 lần khi mở hóa đơn. Kết quả hiển thị dạng{' '}
                <em>nhãn → giá trị</em> trong card Người bán (không ghi đè dữ liệu gốc từ Matbao).
              </p>
            )}
          </div>

          {/* Options */}
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
              <input type="checkbox" checked={fSapAuth}
                onChange={e => setFSapAuth(e.target.checked)}
                className="accent-indigo-600 w-4 h-4" />
              Dùng SAP B1 Authentication
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
              <input type="checkbox" checked={fActive}
                onChange={e => setFActive(e.target.checked)}
                className="accent-indigo-600 w-4 h-4" />
              Kích hoạt
            </label>
          </div>

          {/* Form actions */}
          <div className="flex gap-2 pt-1 border-t border-indigo-100">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600
                rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? <><Loader2 size={13} className="animate-spin" /> Đang lưu...</> : <><Save size={13} /> Lưu</>}
            </button>
            <button onClick={cancelForm}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Invoke result */}
      {invokeRes && (
        <div className="border border-green-200 rounded-xl bg-green-50/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Kết quả ({invokeRes.count} bản ghi)
            </p>
            <button onClick={() => setInvokeRes(null)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
          <p className="text-[11px] font-mono text-gray-400 break-all">{invokeRes.url_called}</p>
          {invokeRes.data.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-green-200 bg-white max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-green-50 sticky top-0">
                  <tr>
                    {Object.keys(invokeRes.data[0]).slice(0, 8).map(k => (
                      <th key={k} className="px-2 py-1.5 text-left text-green-700 font-semibold whitespace-nowrap">
                        {k}
                      </th>
                    ))}
                    {Object.keys(invokeRes.data[0]).length > 8 && (
                      <th className="px-2 py-1.5 text-gray-400">…</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-100">
                  {invokeRes.data.slice(0, 10).map((row, i) => (
                    <tr key={i} className="hover:bg-green-50/50">
                      {Object.values(row).slice(0, 8).map((v, j) => (
                        <td key={j} className="px-2 py-1.5 text-gray-700 whitespace-nowrap max-w-[200px] truncate font-mono text-[11px]">
                          {v == null ? <span className="text-gray-300">null</span> : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {invokeRes.count > 10 && (
            <p className="text-[11px] text-gray-400 italic">Hiển thị 10/{invokeRes.count} bản ghi</p>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
          <Loader2 size={14} className="animate-spin" /> Đang tải...
        </div>
      ) : (
        <>
          {items.length === 0 && !showForm ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              <Link2 size={28} className="mx-auto mb-2 opacity-20" />
              <p>Chưa có API source. Nhấn "+ Thêm" để khai báo.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-th">Tên</th>
                    <th className="table-th">Base URL</th>
                    <th className="table-th text-center">Auto</th>
                    <th className="table-th text-center">SAP Auth</th>
                    <th className="table-th text-center">Trạng thái</th>
                    <th className="table-th text-center w-28">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(src => (
                    <tr key={src.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td">
                        <div className="font-medium text-gray-800">{src.name}</div>
                        {src.description && (
                          <div className="text-[11px] text-gray-400">{src.description}</div>
                        )}
                        {src.field_mappings.length > 0 && (
                          <div className="text-[11px] text-indigo-500 mt-0.5">
                            {src.field_mappings.length} trường mapping
                          </div>
                        )}
                      </td>
                      <td className="table-td max-w-[260px]">
                        <div className="font-mono text-xs text-gray-600 truncate" title={src.base_url}>
                          {src.base_url}
                        </div>
                        {src.filter_template && (
                          <div className="text-[11px] text-gray-400 truncate font-mono mt-0.5" title={src.filter_template}>
                            $filter: {src.filter_template}
                          </div>
                        )}
                      </td>
                      <td className="table-td text-center">
                        {src.category === 'seller'
                          ? <span className="text-[11px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-100">🏢 Người bán</span>
                          : src.category === 'line_item'
                            ? <span className="text-[11px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">📦 Hàng hóa</span>
                            : <span className="text-[11px] text-gray-400">Thủ công</span>}
                      </td>
                      <td className="table-td text-center">
                        {src.use_sap_auth
                          ? <span className="text-[11px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">SAP B1</span>
                          : <span className="text-[11px] text-gray-400">—</span>}
                      </td>
                      <td className="table-td text-center">
                        {src.is_active
                          ? <span className="text-[11px] text-green-600 font-medium">✓ Hoạt động</span>
                          : <span className="text-[11px] text-gray-400">Tắt</span>}
                      </td>
                      <td className="table-td text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleInvoke(src)}
                            disabled={invoking === src.id || !src.is_active}
                            title="Gọi thử API (không có context)"
                            className="text-green-500 hover:text-green-700 disabled:opacity-30 transition-colors">
                            {invoking === src.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Play size={14} />}
                          </button>
                          <button onClick={() => openEdit(src)}
                            className="text-indigo-400 hover:text-indigo-600 transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(src.id)} disabled={deleting === src.id}
                            className="text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors">
                            {deleting === src.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button onClick={openAdd}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 transition-colors font-medium">
            <Plus size={15} /> Thêm API source
          </button>
        </>
      )}
    </div>
  )
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function PurchaseInvoiceSettingsPage() {
  const [cfg,         setCfg]         = useState<PurchaseInvoiceConfig | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [testing,     setTesting]     = useState(false)
  const [testingSap,  setTestingSap]  = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')
  const [tokenInfo,   setTokenInfo]   = useState('')
  const [sapPwd,      setSapPwd]      = useState('')
  const [sapLoginInfo, setSapLoginInfo] = useState<TestSapLoginResponse | null>(null)

  const [matbaoOpen,   setMatbaoOpen]   = useState(true)
  const [sapOpen,      setSapOpen]      = useState(true)
  const [apiOpen,      setApiOpen]      = useState(false)

  useEffect(() => {
    purchaseInvoiceApi.getConfig()
      .then(r => setCfg(r.data))
      .catch(() => setError('Không thể tải cấu hình'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!cfg) return
    setSaving(true); setError(''); setSuccess(''); setTokenInfo(''); setSapLoginInfo(null)
    try {
      await purchaseInvoiceApi.updateConfig({
        name:            cfg.name,
        matbao_base_url: cfg.matbao_base_url,
        matbao_api_key:  cfg.matbao_api_key  ?? undefined,
        sap_base_url:    cfg.sap_base_url    ?? undefined,
        sap_company_db:  cfg.sap_company_db  ?? undefined,
        sap_username:    cfg.sap_username    ?? undefined,
        ...(sapPwd && { sap_password: sapPwd }),
      })
      setSapPwd('')
      setSuccess('Đã lưu cấu hình thành công!')
    } catch (e: unknown) {
      setError((e as Err)?.response?.data?.detail ?? 'Lỗi lưu cấu hình')
    } finally { setSaving(false) }
  }

  const handleTestSapLogin = async () => {
    setTestingSap(true); setError(''); setSuccess(''); setTokenInfo(''); setSapLoginInfo(null)
    try {
      const r = await purchaseInvoiceApi.testSapLogin()
      setSapLoginInfo(r.data)
      setSuccess(r.data.message)
    } catch (e: unknown) {
      setError((e as Err)?.response?.data?.detail ?? 'Đăng nhập SAP B1 thất bại')
    } finally { setTestingSap(false) }
  }

  const handleTestToken = async () => {
    setTesting(true); setError(''); setSuccess(''); setTokenInfo('')
    try {
      const r = await purchaseInvoiceApi.testToken()
      setSuccess(r.data.message)
      setTokenInfo(
        `Preview: ${r.data.token_preview} · Hết hạn sau ${Math.floor(r.data.expires_in_seconds / 60)} phút`
      )
    } catch (e: unknown) {
      setError((e as Err)?.response?.data?.detail ?? 'API key không hợp lệ')
    } finally { setTesting(false) }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Page title */}
      <div className="flex items-center gap-3">
        <Receipt size={22} className="text-indigo-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-800">Thiết lập hóa đơn đầu vào</h1>
          <p className="text-xs text-gray-400 mt-0.5">Cấu hình kết nối API và mapping dữ liệu SAP</p>
        </div>
      </div>

      {/* Global messages */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={12} /></button>
        </div>
      )}
      {success && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
            <CheckCircle2 size={14} />
            <span className="flex-1">{success}</span>
            <button onClick={() => setSuccess('')}><X size={12} /></button>
          </div>
          {tokenInfo && <p className="text-xs text-gray-400 font-mono px-1">{tokenInfo}</p>}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Đang tải...
        </div>
      )}

      {cfg && !loading && (
        <>
          {/* ── Matbao API ────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <SectionHeader
              icon={<Settings size={16} />}
              title="Kết nối Matbao API"
              expanded={matbaoOpen}
              onToggle={() => setMatbaoOpen(v => !v)}
            />
            {matbaoOpen && (
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Tên cấu hình">
                    <input value={cfg.name} onChange={e => setCfg({ ...cfg, name: e.target.value })}
                      className={inputCls} />
                  </Field>
                  <Field label="Base URL API">
                    <input value={cfg.matbao_base_url}
                      onChange={e => setCfg({ ...cfg, matbao_base_url: e.target.value })}
                      className={`${inputCls} font-mono text-xs`}
                      placeholder="https://api-hoadondauvao.matbao.in" />
                  </Field>
                </div>
                <Field label={
                  <span className="flex items-center gap-1.5">
                    <KeyRound size={12} className="text-indigo-400" />
                    API Key (UUID) <span className="text-red-500">*</span>
                  </span>
                }>
                  <input type="password" value={cfg.matbao_api_key ?? ''}
                    onChange={e => setCfg({ ...cfg, matbao_api_key: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className={`${inputCls} font-mono`} />
                  <p className="text-xs text-gray-400 mt-1">
                    Lấy tại trang quản trị hóa đơn đầu vào → Cài đặt → API Key
                  </p>
                </Field>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <button onClick={handleTestToken} disabled={testing || !cfg.matbao_api_key}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm border border-indigo-200 text-indigo-600
                      rounded-lg hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {testing
                      ? <><Loader2 size={13} className="animate-spin" /> Đang kiểm tra...</>
                      : <><RefreshCw size={13} /> Kiểm tra API Key</>}
                  </button>
                  <button onClick={handleSave} disabled={saving} className="btn-primary">
                    {saving ? <><Loader2 size={13} className="animate-spin" /> Đang lưu...</> : 'Lưu cấu hình'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── SAP Connection ────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <SectionHeader
              icon={<Database size={16} />}
              title="Kết nối SAP"
              expanded={sapOpen}
              onToggle={() => setSapOpen(v => !v)}
            />
            {sapOpen && (
              <div className="px-6 py-5 space-y-4">
                <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  Cấu hình SAP B1 Service Layer. Backend đăng nhập qua{' '}
                  <code className="font-mono text-indigo-600 text-[11px]">
                    POST {'{sap_base_url}'}/b1s/v1/Login
                  </code>{' '}
                  và sử dụng <code className="font-mono text-indigo-600 text-[11px]">Cookie: B1SESSION=...</code>{' '}
                  cho các API tiếp theo. Session được cache 30 phút.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="SAP Base URL">
                    <input value={cfg.sap_base_url ?? ''}
                      onChange={e => setCfg({ ...cfg, sap_base_url: e.target.value || null })}
                      placeholder="https://192.168.1.1:50000"
                      className={`${inputCls} font-mono text-xs`} />
                  </Field>
                  <Field label="Company DB (CompanyDB)">
                    <input value={cfg.sap_company_db ?? ''}
                      onChange={e => setCfg({ ...cfg, sap_company_db: e.target.value || null })}
                      placeholder="BTI__Golive"
                      className={`${inputCls} font-mono`} />
                  </Field>
                  <Field label="Username">
                    <input value={cfg.sap_username ?? ''}
                      onChange={e => setCfg({ ...cfg, sap_username: e.target.value || null })}
                      placeholder="manager" className={inputCls} />
                  </Field>
                  <Field label="Password (để trống nếu không thay đổi)">
                    <input type="password" value={sapPwd}
                      onChange={e => setSapPwd(e.target.value)}
                      placeholder="••••••••" className={inputCls} />
                  </Field>
                </div>

                {/* SAP login result */}
                {sapLoginInfo && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1">
                    <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Đăng nhập SAP B1 thành công
                    </p>
                    <p className="text-xs text-gray-500 font-mono">
                      Session: <span className="text-indigo-600">{sapLoginInfo.session_preview}</span>
                      {sapLoginInfo.version && (
                        <span className="ml-3 text-gray-400">v{sapLoginInfo.version}</span>
                      )}
                      <span className="ml-3">· Hết hạn sau{' '}
                        <span className="font-semibold text-green-600">{sapLoginInfo.expires_in_minutes} phút</span>
                      </span>
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <button
                    onClick={handleTestSapLogin}
                    disabled={testingSap || !cfg.sap_base_url || !cfg.sap_company_db || !cfg.sap_username}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm border border-indigo-200 text-indigo-600
                      rounded-lg hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {testingSap
                      ? <><Loader2 size={13} className="animate-spin" /> Đang kiểm tra...</>
                      : <><RefreshCw size={13} /> Kiểm tra đăng nhập SAP B1</>}
                  </button>
                  <button onClick={handleSave} disabled={saving} className="btn-primary">
                    {saving ? <><Loader2 size={13} className="animate-spin" /> Đang lưu...</> : 'Lưu cấu hình SAP'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── External API Sources ───────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <SectionHeader
              icon={<Link2 size={16} />}
              title="API nguồn dữ liệu ngoài"
              expanded={apiOpen}
              onToggle={() => setApiOpen(v => !v)}
            />
            {apiOpen && <ExternalApiSection />}
          </div>
        </>
      )}
    </div>
  )
}
