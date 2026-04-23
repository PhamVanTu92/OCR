import React, { useEffect, useState } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronRight, Table2 } from 'lucide-react'
import { docTypeApi } from '../../api/documentTypes'
import type { DocumentType, DocumentCategory } from '../../types'

interface Props {
  open: boolean
  editData?: DocumentType | null
  categories: DocumentCategory[]
  onClose: () => void
  onSaved: () => void
}

const FORMATS     = ['PDF', 'JPG', 'PNG', 'DOCX', 'XLSX']
const FIELD_TYPES = ['string', 'number', 'date', 'boolean']
const POSITIONS   = ['HEADER', 'FOOTER']

// ── Row types ─────────────────────────────────────────────────────────────────

interface FieldRow {
  id?: number
  field_name: string
  field_key: string
  field_type: string
  position: string
  is_required: boolean
  sort_order: number
}

interface ColumnRow {
  id?: number
  column_name: string
  column_key: string
  column_type: string
  is_required: boolean
  sort_order: number
}

interface TableRow {
  id?: number
  table_name: string
  table_key: string
  description: string
  sort_order: number
  columns: ColumnRow[]
  _open: boolean
}

// ── Blank factories ────────────────────────────────────────────────────────────

const newField  = (): FieldRow  => ({ field_name: '', field_key: '', field_type: 'string', position: 'HEADER', is_required: false, sort_order: 0 })
const newTable  = (): TableRow  => ({ table_name: '', table_key: '', description: '', sort_order: 0, columns: [], _open: true })
const newColumn = (): ColumnRow => ({ column_name: '', column_key: '', column_type: 'string', is_required: false, sort_order: 0 })

// ── Shared input style ─────────────────────────────────────────────────────────

const inp = 'w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white'
const inpMono = inp + ' font-mono'

// ── Component ─────────────────────────────────────────────────────────────────

export default function DocTypeModal({ open, editData, categories, onClose, onSaved }: Props) {
  // ── Basic info ──────────────────────────────────────────────────────────────
  const [name,         setName]         = useState('')
  const [code,         setCode]         = useState('')
  const [categoryId,   setCategoryId]   = useState<number | ''>('')
  const [status,       setStatus]       = useState<'active' | 'inactive'>('active')
  const [formats,      setFormats]      = useState<string[]>(['PDF'])
  const [allowMultiple,setAllowMultiple]= useState(false)
  const [prompt,       setPrompt]       = useState('')

  // ── Rows (always-editable) ──────────────────────────────────────────────────
  const [fields,  setFields]  = useState<FieldRow[]>([])
  const [tables,  setTables]  = useState<TableRow[]>([])
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  // ── Populate on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (editData) {
      setName(editData.name)
      setCode(editData.code)
      setCategoryId(editData.category_id)
      setStatus(editData.is_active ? 'active' : 'inactive')
      setFormats(editData.allowed_formats ?? ['PDF'])
      setAllowMultiple(editData.allow_multiple)
      setPrompt(editData.system_prompt ?? '')
      setFields(editData.fields.map(f => ({ ...f })))
      setTables(editData.tables.map(t => ({
        ...t,
        description: t.description ?? '',
        columns: t.columns.map(c => ({ ...c })),
        _open: true,
      })))
    } else {
      setName(''); setCode(''); setCategoryId(''); setStatus('active')
      setFormats(['PDF']); setAllowMultiple(false); setPrompt('')
      setFields([]); setTables([])
    }
    setError('')
  }, [editData, open])

  // ── Field helpers ───────────────────────────────────────────────────────────
  const addFieldRow   = () => setFields(prev => [...prev, { ...newField(), sort_order: prev.length }])
  const removeField   = (i: number) => setFields(prev => prev.filter((_, j) => j !== i))
  const patchField    = (i: number, patch: Partial<FieldRow>) =>
    setFields(prev => prev.map((f, j) => j === i ? { ...f, ...patch } : f))

  // ── Table helpers ───────────────────────────────────────────────────────────
  const addTableRow   = () => setTables(prev => [...prev, { ...newTable(), sort_order: prev.length }])
  const removeTable   = (ti: number) => setTables(prev => prev.filter((_, j) => j !== ti))
  const patchTable    = (ti: number, patch: Partial<TableRow>) =>
    setTables(prev => prev.map((t, j) => j === ti ? { ...t, ...patch } : t))
  const toggleTable   = (ti: number) =>
    setTables(prev => prev.map((t, j) => j === ti ? { ...t, _open: !t._open } : t))

  // ── Column helpers ──────────────────────────────────────────────────────────
  const addColumnRow  = (ti: number) =>
    setTables(prev => prev.map((t, j) => j === ti
      ? { ...t, columns: [...t.columns, { ...newColumn(), sort_order: t.columns.length }] }
      : t))
  const removeColumn  = (ti: number, ci: number) =>
    setTables(prev => prev.map((t, j) => j === ti
      ? { ...t, columns: t.columns.filter((_, k) => k !== ci) }
      : t))
  const patchColumn   = (ti: number, ci: number, patch: Partial<ColumnRow>) =>
    setTables(prev => prev.map((t, j) => j === ti
      ? { ...t, columns: t.columns.map((c, k) => k === ci ? { ...c, ...patch } : c) }
      : t))

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!name.trim() || !code.trim()) { setError('Tên và mã không được trống'); return }

    // Filter incomplete rows
    const validFields = fields.filter(f => f.field_name.trim() && f.field_key.trim())
    const validTables = tables
      .filter(t => t.table_name.trim() && t.table_key.trim())
      .map((t, ti) => ({
        table_name:  t.table_name.trim(),
        table_key:   t.table_key.trim(),
        description: t.description.trim() || null,
        sort_order:  ti,
        columns: t.columns
          .filter(c => c.column_name.trim() && c.column_key.trim())
          .map((c, ci) => ({
            column_name: c.column_name.trim(),
            column_key:  c.column_key.trim(),
            column_type: c.column_type,
            is_required: c.is_required,
            sort_order:  ci,
          })),
      }))

    setLoading(true); setError('')
    try {
      const payload = {
        name:            name.trim(),
        code:            code.trim(),
        category_id:     categoryId === '' ? 1 : Number(categoryId),
        is_active:       status === 'active',
        allowed_formats: formats,
        allow_multiple:  allowMultiple,
        system_prompt:   prompt,
        fields: validFields.map((f, i) => ({
          field_name:  f.field_name.trim(),
          field_key:   f.field_key.trim(),
          field_type:  f.field_type,
          position:    f.position,
          is_required: f.is_required,
          sort_order:  i,
        })),
        tables: validTables,
      }
      if (editData) await docTypeApi.update(editData.id, payload as Record<string, unknown>)
      else          await docTypeApi.create(payload as Record<string, unknown>)
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Có lỗi xảy ra, vui lòng thử lại')
    } finally { setLoading(false) }
  }

  if (!open) return null

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h3 className="font-semibold text-gray-800">
            {editData ? 'Chỉnh sửa cấu hình chứng từ' : 'Thêm loại chứng từ mới'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          {/* ── Thông tin cơ bản ─────────────────────────────────────────── */}
          <section>
            <SectionTitle>Thông tin cơ bản</SectionTitle>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div className="col-span-2">
                <FieldLabel>Tên chứng từ</FieldLabel>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder="Hóa đơn giá trị gia tăng" />
              </div>
              <div>
                <FieldLabel>Trạng thái</FieldLabel>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={status} onChange={e => setStatus(e.target.value as 'active' | 'inactive')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Nhóm chứng từ</FieldLabel>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={categoryId} onChange={e => setCategoryId(Number(e.target.value))}>
                  <option value="">-- Chọn nhóm --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Mã chứng từ</FieldLabel>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  value={code} onChange={e => setCode(e.target.value)}
                  placeholder="VAT_INV" />
              </div>
            </div>
          </section>

          {/* ── Định dạng ────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <SectionTitle className="mb-0">Định dạng hỗ trợ</SectionTitle>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                <span>Cho phép chọn nhiều file</span>
                <div onClick={() => setAllowMultiple(!allowMultiple)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${allowMultiple ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${allowMultiple ? 'translate-x-5' : ''}`} />
                </div>
              </label>
            </div>
            <div className="flex gap-5 flex-wrap">
              {FORMATS.map(f => (
                <label key={f} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                  <input type="checkbox" className="rounded accent-indigo-600"
                    checked={formats.includes(f)} onChange={() =>
                      setFormats(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f])} />
                  {f}
                </label>
              ))}
            </div>
          </section>

          {/* ── Trường thông tin ─────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div>
                <SectionTitle className="mb-0">Trường thông tin</SectionTitle>
                <p className="text-xs text-gray-400 mt-0.5">Thông tin dạng key-value (tiêu đề / chân trang chứng từ)</p>
              </div>
              <button onClick={addFieldRow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-colors">
                <Plus size={13} /> Thêm trường
              </button>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
                    <th className="px-3 py-2 text-left w-8 text-center">#</th>
                    <th className="px-3 py-2 text-left">Tên trường</th>
                    <th className="px-3 py-2 text-left">Key</th>
                    <th className="px-3 py-2 text-left w-28">Loại dữ liệu</th>
                    <th className="px-3 py-2 text-left w-24">Vị trí</th>
                    <th className="px-3 py-2 text-center w-16">Bắt buộc</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {fields.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-xs text-gray-400">
                        Chưa có trường nào — nhấn <strong>Thêm trường</strong> để bắt đầu
                      </td>
                    </tr>
                  )}
                  {fields.map((f, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50/50 group">
                      <td className="px-2 py-1.5 text-center text-xs text-gray-400 w-8">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <input className={inp} placeholder="Tên trường"
                          value={f.field_name}
                          onChange={e => patchField(i, { field_name: e.target.value })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input className={inpMono} placeholder="field_key"
                          value={f.field_key}
                          onChange={e => patchField(i, { field_key: e.target.value })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <select className={inp}
                          value={f.field_type}
                          onChange={e => patchField(i, { field_type: e.target.value })}>
                          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select className={inp}
                          value={f.position}
                          onChange={e => patchField(i, { position: e.target.value })}>
                          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" className="accent-indigo-600 cursor-pointer w-4 h-4"
                          checked={f.is_required}
                          onChange={e => patchField(i, { is_required: e.target.checked })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => removeField(i)}
                          className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Bảng dữ liệu ─────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div>
                <SectionTitle className="mb-0">Bảng dữ liệu</SectionTitle>
                <p className="text-xs text-gray-400 mt-0.5">Dữ liệu dạng bảng (ví dụ: chi tiết hàng hóa, mục chi phí)</p>
              </div>
              <button onClick={addTableRow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-colors">
                <Plus size={13} /> Thêm bảng
              </button>
            </div>

            <div className="space-y-3">
              {tables.length === 0 && (
                <div className="border border-dashed border-gray-200 rounded-lg py-6 text-center text-xs text-gray-400">
                  Chưa có bảng nào — nhấn <strong>Thêm bảng</strong> để bắt đầu
                </div>
              )}

              {tables.map((tbl, ti) => (
                <div key={ti} className="border border-gray-200 rounded-lg overflow-hidden">

                  {/* Table header – editable */}
                  <div className="bg-gray-50 border-b border-gray-200 px-3 py-2">
                    <div className="flex items-center gap-2">
                      {/* Expand toggle */}
                      <button onClick={() => toggleTable(ti)}
                        className="text-gray-400 hover:text-gray-600 shrink-0">
                        {tbl._open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                      <Table2 size={14} className="text-indigo-400 shrink-0" />

                      {/* Editable table name */}
                      <input
                        className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                        placeholder="Tên bảng *"
                        value={tbl.table_name}
                        onChange={e => patchTable(ti, { table_name: e.target.value })} />

                      {/* Editable key */}
                      <input
                        className="w-32 border border-gray-200 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-indigo-600"
                        placeholder="table_key *"
                        value={tbl.table_key}
                        onChange={e => patchTable(ti, { table_key: e.target.value })} />

                      {/* Editable description */}
                      <input
                        className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-gray-500"
                        placeholder="Mô tả (tuỳ chọn)"
                        value={tbl.description}
                        onChange={e => patchTable(ti, { description: e.target.value })} />

                      {/* Delete table */}
                      <button onClick={() => removeTable(ti)}
                        className="text-gray-300 hover:text-red-500 transition-colors shrink-0 ml-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Columns – shown when expanded */}
                  {tbl._open && (
                    <div className="px-3 pt-2 pb-3 bg-white">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 uppercase border-b border-gray-100">
                            <th className="pb-1.5 text-left w-7 text-center pl-1">#</th>
                            <th className="pb-1.5 text-left px-1.5">Tên cột</th>
                            <th className="pb-1.5 text-left px-1.5">Key</th>
                            <th className="pb-1.5 text-left px-1.5 w-28">Loại</th>
                            <th className="pb-1.5 text-center w-16">Bắt buộc</th>
                            <th className="pb-1.5 w-7" />
                          </tr>
                        </thead>
                        <tbody>
                          {tbl.columns.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-3 text-center text-gray-400">
                                Chưa có cột — nhấn <strong>+ Thêm cột</strong>
                              </td>
                            </tr>
                          )}
                          {tbl.columns.map((col, ci) => (
                            <tr key={ci} className="border-t border-gray-50 hover:bg-gray-50/50 group">
                              <td className="py-1.5 text-center text-gray-400 pl-1">{ci + 1}</td>
                              <td className="py-1.5 px-1">
                                <input className={inp} placeholder="Tên cột"
                                  value={col.column_name}
                                  onChange={e => patchColumn(ti, ci, { column_name: e.target.value })} />
                              </td>
                              <td className="py-1.5 px-1">
                                <input className={inpMono} placeholder="column_key"
                                  value={col.column_key}
                                  onChange={e => patchColumn(ti, ci, { column_key: e.target.value })} />
                              </td>
                              <td className="py-1.5 px-1">
                                <select className={inp}
                                  value={col.column_type}
                                  onChange={e => patchColumn(ti, ci, { column_type: e.target.value })}>
                                  {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </td>
                              <td className="py-1.5 text-center">
                                <input type="checkbox" className="accent-indigo-600 cursor-pointer w-3.5 h-3.5"
                                  checked={col.is_required}
                                  onChange={e => patchColumn(ti, ci, { is_required: e.target.checked })} />
                              </td>
                              <td className="py-1.5">
                                <button onClick={() => removeColumn(ti, ci)}
                                  className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button onClick={() => addColumnRow(ti)}
                        className="mt-2 flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors font-medium">
                        <Plus size={12} /> Thêm cột
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── Yêu cầu đặc thù ──────────────────────────────────────────── */}
          <section>
            <SectionTitle>YÊU CẦU ĐẶC THÙ</SectionTitle>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={3} value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="Trích xuất thông tin từ hóa đơn GTGT. Tập trung vào số hóa đơn, ngày lập, người bán, người mua, danh sách hàng hóa và tổng tiền." />
            <p className="text-xs text-gray-400 mt-1">
              Prompt giúp AI hiểu cấu trúc và cách trích xuất đặc thù của loại chứng từ này.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-xl shrink-0">
          <p className="text-xs text-gray-400">
            {fields.length} trường · {tables.length} bảng
            {tables.reduce((s, t) => s + t.columns.length, 0) > 0 &&
              ` · ${tables.reduce((s, t) => s + t.columns.length, 0)} cột`}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Hủy
            </button>
            <button onClick={submit} disabled={loading}
              className="px-5 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading ? 'Đang lưu...' : editData ? 'Lưu thay đổi' : 'Thêm mới'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Micro components ──────────────────────────────────────────────────────────

function SectionTitle({ children, className = 'mb-3' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-xs font-semibold text-gray-400 uppercase tracking-wider ${className}`}>
      {children}
    </p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>
}
