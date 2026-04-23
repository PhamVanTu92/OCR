import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, X, Download, Eye,
  AlertCircle, FileText, Receipt, ExternalLink, Loader2,
  BadgeCheck, BadgeX, Building2, User, CalendarRange,
  Hash, SlidersHorizontal, Zap, ChevronDown, ChevronRight, Save, CheckCircle2,
  Link2, RefreshCw,
} from 'lucide-react'
import { purchaseInvoiceApi, type InvoiceListParams } from '../api/purchaseInvoices'
import type {
  PurchaseInvoiceItem, PurchaseInvoiceLineItem, ExternalApiSource, SavedInvoice,
  PurchaseInvoiceLinkedSource,
} from '../types'
import Pagination from '../components/Pagination'

const _toStr = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v)

// ─── Date helpers ─────────────────────────────────────────────────────────────
function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  if (/^\d{2}\/\d{2}\/\d{4}/.test(d)) return d.slice(0, 10)
  return d
}
function fmtDateTime(d?: string | null): string {
  if (!d) return '—'
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]} ${iso[4]}:${iso[5]}`
  return fmtDate(d)
}

// ─── Money / Status helpers ───────────────────────────────────────────────────
const fmtMoney = (n?: number | null) =>
  n != null ? n.toLocaleString('vi-VN') : '—'

const statusLabel = (code?: number | null) => {
  if (code === 0) return { text: 'Hợp lệ',       cls: 'bg-green-100  text-green-700  border-green-200'  }
  if (code === 1) return { text: 'Không hợp lệ', cls: 'bg-red-100    text-red-600    border-red-200'    }
  if (code === 2) return { text: 'Trùng',         cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
  if (code === 3) return { text: 'Có sai sót',    cls: 'bg-orange-100 text-orange-600 border-orange-200' }
  return           { text: '—',                   cls: 'bg-gray-100   text-gray-500   border-gray-200'  }
}

// ─── Input helpers ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label as React.ReactNode}</label>
      {children}
    </div>
  )
}
const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'

// ─── KTra check row ───────────────────────────────────────────────────────────
function KTraRow({ label, value }: { label: string; value?: string | boolean | null }) {
  if (value == null || value === '') return null
  const text = typeof value === 'boolean' ? (value ? 'Hợp lệ' : 'Không hợp lệ') : String(value)
  const isGood = typeof value === 'boolean' ? value
    : /trùng|hợp lệ|không có|đã được cấp/i.test(text) && !/không hợp lệ|chênh lệch/i.test(text)
  const isBad = typeof value === 'boolean' ? !value
    : /không hợp lệ|chênh lệch/i.test(text)
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className={`text-xs text-right font-medium ${isBad ? 'text-red-500' : isGood ? 'text-green-600' : 'text-gray-700'}`}>
        {typeof value === 'boolean' ? (value ? '✓ Hợp lệ' : '✗ Không hợp lệ') : text}
      </span>
    </div>
  )
}

// ─── Inline row helper ────────────────────────────────────────────────────────
function Row({ label, value, cls = 'text-gray-700' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${cls}`}>{value}</span>
    </div>
  )
}

type Err = { response?: { data?: { detail?: string } } }

// ─── SAP field cell (editable mini-input) ────────────────────────────────────
function SapCell({
  value, onChange, placeholder, color = 'text-indigo-600',
}: {
  value: string | null | undefined
  onChange: (v: string | null) => void
  placeholder?: string
  color?: string
}) {
  return (
    <input
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      placeholder={placeholder ?? '—'}
      className={`w-full min-w-[72px] bg-transparent border-b border-gray-200
        focus:border-indigo-400 outline-none text-[11px] font-mono py-0.5 text-center
        placeholder:text-gray-200 ${color}`}
    />
  )
}

// ─── Detail drawer ────────────────────────────────────────────────────────────
export function InvoiceDetailDrawer({
  invoice, apiSources, linkedSources, savedInvIds, onSaved, onClose, disableAutoFill = false,
}: {
  invoice: PurchaseInvoiceItem
  apiSources: ExternalApiSource[]
  linkedSources: PurchaseInvoiceLinkedSource[]
  savedInvIds: Set<string>
  onSaved: (inv: SavedInvoice) => void
  onClose: () => void
  disableAutoFill?: boolean   // true khi xem hóa đơn đã lưu – không gọi lại API ngoài
}) {
  const inv  = invoice
  const ktra = inv.KTra
  const st   = statusLabel(inv.TThai)

  // ── Editable line items (SAP fields) ────────────────────────────────────────
  const [editLines, setEditLines] = useState<PurchaseInvoiceLineItem[]>([])

  useEffect(() => {
    const mapped = (inv.DSHHDVu ?? []).map(l => ({
      ...l,
      ItemCode: l.ItemCode ?? null,
      ItemName: l.ItemName ?? null,
      UomId:    l.UomId   ?? null,
      TaxCode:  l.TaxCode ?? null,
    }))
    setEditLines(mapped)
    setSellerApiData({})
    setEditInvFields({})
    // Auto-fill chỉ chạy khi KHÔNG ở chế độ xem lại hóa đơn đã lưu
    if (!disableAutoFill) {
      runAutoFillLines(apiSources, mapped)
      runAutoFillSeller(apiSources)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.InvID])

  const updateLine = (i: number, key: keyof PurchaseInvoiceLineItem, val: string | null) =>
    setEditLines(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l))

  // ── API fill state ────────────────────────────────────────────────────────────
  const [autoFillingLines,  setAutoFillingLines]  = useState(false)
  const [sellerApiData,     setSellerApiData]      = useState<Record<string, string>>({})
  const [autoFillingSeller, setAutoFillingSeller]  = useState(false)
  // Các trường header được fill từ seller API (NBanMa, SupplierCode…) → gộp vào khi lưu
  const [editInvFields, setEditInvFields] = useState<Partial<PurchaseInvoiceItem>>({})
  const [linesPickerOpen,   setLinesPickerOpen]    = useState(false)
  const [manualFillingId,   setManualFillingId]    = useState<number | null>(null)
  const [linesFillMsg,      setLinesFillMsg]       = useState<{ ok: boolean; msg: string } | null>(null)
  const linesPickerRef = useRef<HTMLDivElement>(null)

  // Close lines picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (linesPickerRef.current && !linesPickerRef.current.contains(e.target as Node))
        setLinesPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Shared invoice header context ─────────────────────────────────────────────
  const _headerCtx = (): Record<string, string | null> => ({
    NBanMST:  inv.NBanMST  ?? null,
    NBanTen:  inv.NBanTen  ?? null,
    NBanMa:   inv.NBanMa   ?? null,
    NBanDChi: inv.NBanDChi ?? null,
    NMuaMST:  inv.NMuaMST  ?? null,
    NMuaTen:  inv.NMuaTen  ?? null,
    SHDon:    inv.SHDon != null ? String(inv.SHDon) : null,
    InvID:    inv.InvID    ?? null,
    NLap:     inv.NLap     ?? null,
    KHMSHDon: inv.KHMSHDon ?? null,
    KHHDon:   inv.KHHDon   ?? null,
    DVTTe:    inv.DVTTe    ?? null,
    HTTToan:  inv.HTTToan  ?? null,
  })

  // ── Line context (header + fields của từng dòng) ──────────────────────────────
  const _lineCtx = (line: PurchaseInvoiceLineItem): Record<string, string | null> => ({
    ..._headerCtx(),
    MHHDVu:  line.MHHDVu  ?? null,
    THHDVu:  line.THHDVu  ?? null,
    DVTinh:  line.DVTinh  ?? null,
    SLuong:  line.SLuong  != null ? String(line.SLuong) : null,
    DGia:    line.DGia    != null ? String(line.DGia)   : null,
    TSuat:   line.TSuat   != null ? String(line.TSuat)  : null,
    ItemCode: line.ItemCode ?? null,
    ItemName: line.ItemName ?? null,
    UomId:   line.UomId   ?? null,
    TaxCode: line.TaxCode  ?? null,
  })

  // ── Apply one API response row to a single line ───────────────────────────────
  const _applyRowToLine = (
    line: PurchaseInvoiceLineItem,
    row: Record<string, unknown>,
    src: ExternalApiSource,
  ): PurchaseInvoiceLineItem => {
    const upd: Partial<PurchaseInvoiceLineItem> = {}
    src.field_mappings.forEach(m => {
      const val = row[m.api_field]
      if (val != null && m.ocr_field)
        (upd as Record<string, unknown>)[m.ocr_field] = String(val)
    })
    return { ...line, ...upd }
  }

  // ── Apply list result to lines by index (fallback cho source không dùng line ctx) ─
  const _applyRowsToLines = (
    lines: PurchaseInvoiceLineItem[],
    rows: Record<string, unknown>[],
    src: ExternalApiSource,
  ): PurchaseInvoiceLineItem[] =>
    lines.map((line, i) => i < rows.length ? _applyRowToLine(line, rows[i], src) : line)

  // ── Auto-fill lines: line_item sources → gọi API từng dòng với line context ────
  const runAutoFillLines = async (sources: ExternalApiSource[], linesInit?: PurchaseInvoiceLineItem[]) => {
    const targets = sources.filter(s => s.is_active && s.category === 'line_item')
    if (targets.length === 0) return
    setAutoFillingLines(true)
    try {
      let merged = [...(linesInit ?? editLines)]
      for (const src of targets) {
        // gọi song song cho tất cả dòng, mỗi dòng dùng context riêng
        const results = await Promise.allSettled(
          merged.map(line => purchaseInvoiceApi.invokeApiSource(src.id, _lineCtx(line)))
        )
        merged = merged.map((line, i) => {
          const res = results[i]
          if (res.status === 'fulfilled') {
            const rows = res.value.data.data
            if (rows?.length) return _applyRowToLine(line, rows[0], src)
          }
          return line
        })
      }
      setEditLines(merged)
    } finally {
      setAutoFillingLines(false)
    }
  }

  // ── Manual fill all lines: any chosen source, called ONCE ─────────────────────
  const handleFillAllLines = async (srcId: number) => {
    const src = apiSources.find(s => s.id === srcId)
    if (!src) return
    setManualFillingId(srcId); setLinesPickerOpen(false); setLinesFillMsg(null)
    try {
      const r = await purchaseInvoiceApi.invokeApiSource(srcId, _headerCtx())
      const rows = r.data.data
      if (!rows?.length) {
        setLinesFillMsg({ ok: false, msg: 'API không trả về dữ liệu' })
        return
      }
      setEditLines(prev => _applyRowsToLines(prev, rows, src))
      setLinesFillMsg({ ok: true, msg: `Đã điền từ "${src.name}" (${rows.length} dòng)` })
    } catch (e: unknown) {
      setLinesFillMsg({ ok: false, msg: (e as Err)?.response?.data?.detail ?? 'Gọi API thất bại' })
    } finally {
      setManualFillingId(null)
    }
  }

  // ── Auto-fill seller: gọi ONCE, apply ocr_field về editInvFields + hiển thị panel ─
  const runAutoFillSeller = async (sources: ExternalApiSource[]) => {
    const targets = sources.filter(s => s.is_active && s.category === 'seller')
    if (targets.length === 0) return
    setAutoFillingSeller(true)
    try {
      const display: Record<string, string> = {}
      const fields:  Partial<PurchaseInvoiceItem> = {}
      for (const src of targets) {
        try {
          const r = await purchaseInvoiceApi.invokeApiSource(src.id, _headerCtx())
          const rows = r.data.data
          if (rows?.length) {
            src.field_mappings.forEach(m => {
              const val = rows[0][m.api_field]
              if (val != null) {
                display[m.label || m.api_field] = String(val)
                // Apply về invoice field nếu có ocr_field (vd: NBanMa, SupplierCode)
                if (m.ocr_field)
                  (fields as Record<string, unknown>)[m.ocr_field] = String(val)
              }
            })
          }
        } catch { /* ignore per-source error */ }
      }
      setSellerApiData(display)
      if (Object.keys(fields).length)
        setEditInvFields(prev => ({ ...prev, ...fields }))
    } finally {
      setAutoFillingSeller(false)
    }
  }

  // ── Linked sources picker ─────────────────────────────────────────────────────
  const [lLinkedExpanded,   setLLinkedExpanded]   = useState(false)
  const [lLinkedSrcExp,     setLLinkedSrcExp]     = useState<Record<number, boolean>>({})
  const [lLinkedSearching,  setLLinkedSearching]  = useState<Record<number, boolean>>({})
  const [lLinkedResults,    setLLinkedResults]    = useState<Record<number, Record<string, unknown>[]>>({})
  const [lLinkedSelected,   setLLinkedSelected]   = useState<Record<number, Record<string, unknown> | null>>({})
  const [lLinkedApplying,   setLLinkedApplying]   = useState<number | null>(null)
  const [lShowTargets,      setLShowTargets]      = useState(false)
  const autoLinkedRef = useRef(false)

  const handleLinkedSearch = async (src: PurchaseInvoiceLinkedSource, silent = false) => {
    setLLinkedSearching(p => ({ ...p, [src.id]: true }))
    setLLinkedSelected(p => ({ ...p, [src.id]: null }))
    try {
      const r = await purchaseInvoiceApi.invokeLinkedSource(src.id, _headerCtx())
      setLLinkedResults(p => ({ ...p, [src.id]: r.data.data }))
      if (r.data.count > 0)
        setLLinkedSrcExp(p => ({ ...p, [src.id]: true }))
    } catch (e: unknown) {
      if (!silent)
        alert((e as Err)?.response?.data?.detail ?? 'Gọi linked source thất bại')
    } finally {
      setLLinkedSearching(p => ({ ...p, [src.id]: false }))
    }
  }

  // Auto-search all linked sources when invoice opens
  useEffect(() => {
    if (!linkedSources.length || disableAutoFill) return
    if (autoLinkedRef.current) return
    autoLinkedRef.current = true
    setLLinkedExpanded(true)
    linkedSources.forEach(src => handleLinkedSearch(src, true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.InvID, linkedSources.length])

  const handleLinkedApply = (src: PurchaseInvoiceLinkedSource) => {
    const row = lLinkedSelected[src.id]
    if (!row) return
    setLLinkedApplying(src.id)

    // Apply header mappings → editInvFields
    if (src.header_mappings.length) {
      const patch: Partial<PurchaseInvoiceItem> = {}
      src.header_mappings.forEach(m => {
        if (m.ocr_field && row[m.api_field] != null)
          (patch as Record<string, unknown>)[m.ocr_field] = String(row[m.api_field])
      })
      setEditInvFields(prev => ({ ...prev, ...patch }))
    }

    // Apply line mappings → editLines (by index via lines_key)
    if (src.lines_key && src.line_mappings.length) {
      const rawLines = row[src.lines_key]
      if (Array.isArray(rawLines)) {
        setEditLines(prev => prev.map((line, i) => {
          if (i >= rawLines.length) return line
          const apiLine = rawLines[i] as Record<string, unknown>
          const patch: Partial<PurchaseInvoiceLineItem> = {}
          src.line_mappings.forEach(m => {
            if (m.ocr_field && apiLine[m.api_field] != null)
              (patch as Record<string, unknown>)[m.ocr_field] = String(apiLine[m.api_field])
          })
          return { ...line, ...patch }
        }))
      }
    }

    setLLinkedApplying(null)
  }

  // ── Save invoice ─────────────────────────────────────────────────────────────
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState<{ ok: boolean; msg: string } | null>(null)
  const isSaved = inv.InvID ? savedInvIds.has(inv.InvID) : false
  // Đủ dữ liệu để lưu: có InvID và ít nhất số HĐ hoặc MST người bán
  const canSave = !!(inv.InvID && (inv.SHDon || inv.NBanMST))

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true); setSaveMsg(null)
    try {
      const r = await purchaseInvoiceApi.saveInvoice({ ...inv, ...editInvFields, DSHHDVu: editLines })
      onSaved(r.data)
      setSaveMsg({ ok: true, msg: 'Đã lưu hóa đơn thành công' })
    } catch (e: unknown) {
      setSaveMsg({ ok: false, msg: (e as Err)?.response?.data?.detail ?? 'Lưu thất bại' })
    } finally {
      setSaving(false)
    }
  }

  const activeApiSources  = apiSources.filter(s => s.is_active)
  // Ở chế độ disableAutoFill (xem lại HĐ đã lưu) → ẩn picker, không gọi API ngoài
  const manualApiSources  = disableAutoFill ? [] : activeApiSources.filter(s => !s.category)

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="shrink-0 border-b px-6 py-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Receipt size={16} className="text-indigo-500 shrink-0" />
                <h2 className="font-semibold text-gray-800 text-sm leading-tight">
                  {inv.THDon ?? 'Chi tiết hóa đơn'}
                </h2>
                {inv.KHMSHDon && (
                  <code className="text-[11px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono">
                    {inv.KHMSHDon}{inv.KHHDon}
                  </code>
                )}
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>
                  {inv.TenTThai || st.text}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Số HĐ: <strong className="text-gray-600">#{inv.SHDon ?? '—'}</strong>
                {' · '}Ngày lập: <strong className="text-gray-600">{fmtDate(inv.NLap)}</strong>
                {inv.NKy ? <> · Ký: {fmtDate(inv.NKy)}</> : null}
                {inv.HTTToan ? <> · {inv.HTTToan}</> : null}
              </p>
              {inv.MCCQT && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Mã CQT: <span className="font-mono">{inv.MCCQT}</span>
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 shrink-0">
              <X size={18} />
            </button>
          </div>

          {/* ── Body ─────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Status badges */}
            {(inv.TrangThaiHD || inv.KQPhanTich || inv.NguonUpload || inv.NgayImport) && (
              <div className="flex flex-wrap gap-2 items-center">
                {inv.TrangThaiHD && (
                  <span className="text-[11px] bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-full font-medium">
                    {inv.TrangThaiHD}
                  </span>
                )}
                {inv.KQPhanTich && (
                  <span className={`text-[11px] border px-2.5 py-1 rounded-full font-medium
                    ${/hợp lệ/i.test(inv.KQPhanTich)
                      ? 'bg-green-50 text-green-700 border-green-100'
                      : 'bg-yellow-50 text-yellow-700 border-yellow-100'}`}>
                    {inv.KQPhanTich}
                  </span>
                )}
                {inv.NguonUpload && (
                  <span className="text-[11px] bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                    Nguồn: {inv.NguonUpload}
                  </span>
                )}
                {inv.NgayImport && (
                  <span className="text-[11px] text-gray-400">
                    Nhập: {fmtDateTime(inv.NgayImport)}
                  </span>
                )}
              </div>
            )}

            {/* Người bán + Người mua */}
            <div className="grid grid-cols-2 gap-3">
              <section>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Building2 size={11} className="text-indigo-400" /> Người bán
                </h3>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-xs">
                  <p className="font-semibold text-gray-800 leading-snug">{inv.NBanTen ?? '—'}</p>
                  {inv.NBanMST  && <p className="font-mono text-indigo-600">MST: {inv.NBanMST}</p>}
                  {inv.NBanMa   && <p className="font-mono text-violet-600">Mã NB: {inv.NBanMa}</p>}
                  {inv.NBanDChi && <p className="text-gray-500 leading-snug">{inv.NBanDChi}</p>}
                  {inv.NBanSDT  && <p className="text-gray-500">📞 {inv.NBanSDT}</p>}
                  {/* Seller auto-fill data */}
                  {autoFillingSeller && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-600 mt-1">
                      <Loader2 size={9} className="animate-spin" /> Đang tra cứu API...
                    </div>
                  )}
                  {!autoFillingSeller && Object.keys(sellerApiData).length > 0 && (
                    <div className="border-t border-violet-100 mt-1.5 pt-1.5 space-y-0.5">
                      {Object.entries(sellerApiData).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2">
                          <span className="text-[10px] text-gray-400 shrink-0">{k}</span>
                          <span className="text-[10px] font-mono text-violet-700 text-right truncate">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
              <section>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <User size={11} className="text-indigo-400" /> Người mua
                </h3>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-xs">
                  <p className="font-semibold text-gray-800 leading-snug">{inv.NMuaTen ?? '—'}</p>
                  {inv.NMuaMST  && <p className="font-mono text-indigo-600">{inv.NMuaMST}</p>}
                  {inv.NMuaDChi && <p className="text-gray-500 leading-snug">{inv.NMuaDChi}</p>}
                </div>
              </section>
            </div>

            {/* Thanh toán */}
            <section>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Thanh toán</h3>
              <div className="bg-indigo-50 rounded-lg p-3 space-y-1.5 text-sm">
                <Row label="Tiền chưa thuế"   value={`${fmtMoney(inv.TgTCThue)} đ`} />
                <Row label="Tiền thuế GTGT"   value={`${fmtMoney(inv.TgTThue)} đ`} />
                {inv.TTCKTMai != null && inv.TTCKTMai !== 0 && (
                  <Row label="Chiết khấu TM" value={`-${fmtMoney(inv.TTCKTMai)} đ`} cls="text-orange-600" />
                )}
                <div className="flex justify-between border-t border-indigo-100 pt-1.5">
                  <span className="font-semibold text-gray-700">Tổng thanh toán</span>
                  <span className="font-bold text-indigo-700 text-base">{fmtMoney(inv.TgTTTBSo)} đ</span>
                </div>
                {inv.TgTTTBChu && (
                  <p className="text-xs text-gray-400 italic">({inv.TgTTTBChu})</p>
                )}
                {inv.DVTTe && <p className="text-xs text-gray-500">Đơn vị: {inv.DVTTe}</p>}
              </div>
            </section>

            {/* Hàng hóa / Dịch vụ */}
            {editLines.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                    Hàng hóa / Dịch vụ
                    <span className="text-indigo-500">({editLines.length} dòng)</span>
                  </h3>
                  {/* Section-level ⚡ picker — chỉ hiện khi có source thủ công */}
                  {manualApiSources.length > 0 && (
                    <div className="relative" ref={linesPickerRef}>
                      <button
                        onClick={() => setLinesPickerOpen(v => !v)}
                        disabled={autoFillingLines || manualFillingId != null}
                        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border
                          border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100
                          disabled:opacity-40 transition-colors">
                        {(autoFillingLines || manualFillingId != null)
                          ? <Loader2 size={10} className="animate-spin" />
                          : <Zap size={10} />}
                        Tự động điền
                        <ChevronDown size={9} />
                      </button>
                      {linesPickerOpen && (
                        <div className="absolute right-0 top-8 z-50 bg-white border border-gray-200
                          rounded-xl shadow-xl min-w-[220px] py-1 text-left">
                          <p className="px-3 py-1.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wide border-b">
                            Chọn API nguồn (áp dụng toàn bộ dòng)
                          </p>
                          {manualApiSources.map(src => (
                            <button key={src.id}
                              onClick={() => handleFillAllLines(src.id)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 text-gray-700 leading-snug">
                              <div className="font-medium">{src.name}</div>
                              {src.description && (
                                <div className="text-[10px] text-gray-400">{src.description}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Status banners */}
                {autoFillingLines && (
                  <div className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg mb-2
                    bg-amber-50 text-amber-700 border border-amber-100">
                    <Loader2 size={10} className="animate-spin" />
                    Đang tự động điền từ API...
                  </div>
                )}
                {linesFillMsg && (
                  <div className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg mb-2
                    ${linesFillMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {linesFillMsg.ok ? '✓' : '✗'} {linesFillMsg.msg}
                    <button className="ml-auto" onClick={() => setLinesFillMsg(null)}><X size={10} /></button>
                  </div>
                )}

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="text-xs" style={{ minWidth: '900px' }}>
                    <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-center w-8">STT</th>
                        <th className="px-3 py-2 text-left">Tên hàng hóa / Dịch vụ</th>
                        <th className="px-2 py-2 text-center text-indigo-500" title="SAP – Mã hàng hóa">
                          ItemCode
                        </th>
                        <th className="px-2 py-2 text-center text-indigo-500" title="SAP – Tên hàng hóa">
                          ItemName
                        </th>
                        <th className="px-2 py-2 text-center">ĐVT</th>
                        <th className="px-2 py-2 text-center text-indigo-500" title="SAP – Mã đơn vị tính">
                          UomId
                        </th>
                        <th className="px-2 py-2 text-right">SL</th>
                        <th className="px-2 py-2 text-right">Đơn giá</th>
                        <th className="px-2 py-2 text-right">TT</th>
                        <th className="px-2 py-2 text-center">Thuế</th>
                        <th className="px-2 py-2 text-center text-indigo-500" title="SAP – Mã thuế">
                          TaxCode
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {editLines.map((l, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-gray-400 text-center">{l.STT ?? i + 1}</td>
                          <td className="px-3 py-2 text-gray-800" style={{ maxWidth: 180 }}>
                            {l.MHHDVu && (
                              <span className="text-[10px] text-indigo-400 font-mono mr-1">[{l.MHHDVu}]</span>
                            )}
                            <span className="leading-snug">{l.THHDVu}</span>
                          </td>

                          {/* SAP – ItemCode */}
                          <td className="px-2 py-1.5 text-center">
                            <SapCell
                              value={l.ItemCode}
                              onChange={v => updateLine(i, 'ItemCode', v)}
                              placeholder="Mã hàng"
                            />
                          </td>

                          {/* SAP – ItemName */}
                          <td className="px-2 py-1.5 text-center">
                            <SapCell
                              value={l.ItemName}
                              onChange={v => updateLine(i, 'ItemName', v)}
                              placeholder="Tên SAP"
                              color="text-gray-600"
                            />
                          </td>

                          <td className="px-2 py-2 text-gray-500 text-center whitespace-nowrap">
                            {l.DVTinh ?? '—'}
                          </td>

                          {/* SAP – UomId */}
                          <td className="px-2 py-1.5 text-center">
                            <SapCell
                              value={l.UomId}
                              onChange={v => updateLine(i, 'UomId', v)}
                              placeholder="ĐVT"
                              color="text-violet-600"
                            />
                          </td>

                          <td className="px-2 py-2 text-right text-gray-700">{l.SLuong ?? '—'}</td>
                          <td className="px-2 py-2 text-right text-gray-700 whitespace-nowrap">{fmtMoney(l.DGia)}</td>
                          <td className="px-2 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{fmtMoney(l.ThTien)}</td>
                          <td className="px-2 py-2 text-center text-gray-600 whitespace-nowrap">
                            {l.TSuat != null ? String(l.TSuat) : '—'}
                          </td>

                          {/* SAP – TaxCode */}
                          <td className="px-2 py-1.5 text-center">
                            <SapCell
                              value={l.TaxCode}
                              onChange={v => updateLine(i, 'TaxCode', v)}
                              placeholder="Thuế"
                              color="text-green-600"
                            />
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  <span className="text-indigo-500 font-semibold">ItemCode · ItemName · UomId · TaxCode</span>
                  {' '}— chỉnh sửa trực tiếp. Nhấn{' '}
                  <span className="text-amber-500 font-semibold">Tự động điền</span>
                  {' '}để gọi API và điền toàn bộ dòng cùng lúc.
                </p>
              </section>
            )}

            {/* ── Chứng từ liên kết ───────────────────────────────────────── */}
            {linkedSources.length > 0 && !disableAutoFill && (
              <section className="border border-indigo-200 rounded-lg overflow-hidden">
                {/* Section header */}
                <button
                  onClick={() => setLLinkedExpanded(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-2.5
                    bg-indigo-50 hover:bg-indigo-100 transition-colors text-left">
                  <div className="flex items-center gap-2 text-sm font-medium text-indigo-800">
                    <Link2 size={14} className="text-indigo-500"/>
                    Chứng từ liên kết
                  </div>
                  <div className="flex items-center gap-2">
                    {linkedSources.map(src => {
                      const cnt = lLinkedResults[src.id]?.length
                      const isLoading = lLinkedSearching[src.id]
                      return (
                        <span key={src.id}
                          className={`text-[11px] px-2 py-0.5 rounded-full font-medium
                            ${isLoading ? 'bg-gray-100 text-gray-400'
                              : cnt === undefined ? 'bg-gray-100 text-gray-400'
                              : cnt > 0 ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-gray-100 text-gray-400'}`}>
                          {isLoading
                            ? <span className="flex items-center gap-1">
                                <Loader2 size={10} className="animate-spin"/>{src.name}
                              </span>
                            : `${src.name}: ${cnt ?? '…'}`}
                        </span>
                      )
                    })}
                    {lLinkedExpanded
                      ? <ChevronDown  size={14} className="text-indigo-400"/>
                      : <ChevronRight size={14} className="text-indigo-400"/>}
                  </div>
                </button>

                {lLinkedExpanded && (
                  <div className="divide-y divide-indigo-100">
                    {linkedSources.map(src => {
                      const results   = lLinkedResults[src.id] ?? []
                      const selected  = lLinkedSelected[src.id] ?? null
                      const srcLoading = lLinkedSearching[src.id] ?? false
                      const srcOpen   = lLinkedSrcExp[src.id] ?? false
                      const dispCols  = src.display_columns.length
                        ? src.display_columns
                        : Object.keys(results[0] ?? {})
                            .filter(k => k !== src.lines_key)
                            .slice(0, 5)
                            .map(k => ({ api_field: k, label: k }))

                      return (
                        <div key={src.id}>
                          {/* Per-source row */}
                          <button
                            onClick={() => setLLinkedSrcExp(p => ({ ...p, [src.id]: !p[src.id] }))}
                            className="w-full flex items-center justify-between px-4 py-2.5
                              hover:bg-gray-50 transition-colors text-left">
                            <div className="flex items-center gap-2 min-w-0">
                              {srcLoading
                                ? <Loader2 size={13} className="animate-spin text-indigo-400 shrink-0"/>
                                : results.length > 0
                                  ? <CheckCircle2 size={13} className="text-green-500 shrink-0"/>
                                  : <AlertCircle  size={13} className="text-gray-300 shrink-0"/>}
                              <span className="text-sm font-medium text-gray-800">{src.name}</span>
                              {!srcLoading && lLinkedResults[src.id] !== undefined && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-full
                                  ${results.length > 0
                                    ? 'bg-indigo-50 text-indigo-600'
                                    : 'bg-gray-100 text-gray-400'}`}>
                                  {results.length} phù hợp
                                </span>
                              )}
                              {src.description && (
                                <span className="text-xs text-gray-400 truncate hidden sm:block">
                                  — {src.description}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span role="button"
                                onClick={e => { e.stopPropagation(); handleLinkedSearch(src) }}
                                className="text-gray-300 hover:text-indigo-500 transition-colors p-0.5"
                                title="Tải lại">
                                <RefreshCw size={12}
                                  className={srcLoading ? 'animate-spin text-indigo-400' : ''}/>
                              </span>
                              {srcOpen
                                ? <ChevronDown  size={13} className="text-gray-400"/>
                                : <ChevronRight size={13} className="text-gray-400"/>}
                            </div>
                          </button>

                          {/* Results table */}
                          {srcOpen && (
                            <div className="px-4 pb-3 space-y-2">
                              {srcLoading ? (
                                <div className="flex items-center gap-2 py-4 justify-center text-xs text-gray-400">
                                  <Loader2 size={13} className="animate-spin"/> Đang tải...
                                </div>
                              ) : results.length === 0 ? (
                                <div className="text-xs text-gray-400 py-4 text-center
                                  border border-dashed border-gray-200 rounded-lg">
                                  Không tìm thấy chứng từ phù hợp
                                </div>
                              ) : (
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                  <div className="overflow-auto max-h-56">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
                                          {dispCols.map(c => (
                                            <th key={c.api_field}
                                              className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">
                                              {c.label}
                                            </th>
                                          ))}
                                          <th className="w-6"/>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {results.map((row, ri) => {
                                          const isSel = selected === row
                                          return (
                                            <tr key={ri}
                                              onClick={() => setLLinkedSelected(p => ({
                                                ...p, [src.id]: isSel ? null : row,
                                              }))}
                                              className={`cursor-pointer transition-colors
                                                ${isSel
                                                  ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300'
                                                  : 'hover:bg-gray-50'}`}>
                                              {dispCols.map(c => (
                                                <td key={c.api_field}
                                                  className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                                  {_toStr(row[c.api_field])}
                                                </td>
                                              ))}
                                              <td className="px-2 text-center">
                                                {isSel && <CheckCircle2 size={12} className="text-indigo-500"/>}
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Footer */}
                                  <div className="flex items-center justify-between px-3 py-2
                                    border-t border-gray-100 bg-gray-50">
                                    <span className="text-xs text-gray-400">
                                      {selected
                                        ? '✓ Đã chọn — nhấn Áp dụng để điền vào hóa đơn'
                                        : 'Nhấn vào dòng để chọn chứng từ'}
                                    </span>
                                    <button
                                      onClick={() => handleLinkedApply(src)}
                                      disabled={!selected || lLinkedApplying === src.id}
                                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5
                                        text-xs text-white bg-indigo-600 rounded-lg
                                        hover:bg-indigo-700 transition-colors disabled:opacity-40">
                                      {lLinkedApplying === src.id
                                        ? <><Loader2 size={11} className="animate-spin"/> Đang áp dụng...</>
                                        : <><CheckCircle2 size={11}/> Áp dụng</>}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Detail preview of selected row */}
                              {selected && (() => {
                                const hdrMaps  = src.header_mappings.filter(m => m.api_field)
                                const lnMaps   = src.line_mappings.filter(m => m.api_field)
                                const rawLines = src.lines_key ? selected[src.lines_key] : null
                                const lines    = Array.isArray(rawLines)
                                  ? rawLines as Record<string, unknown>[]
                                  : []
                                if (!hdrMaps.length && !lnMaps.length) return null
                                return (
                                  <div className="border border-indigo-200 rounded-lg overflow-hidden bg-indigo-50/40">
                                    <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100
                                      flex items-center justify-between">
                                      <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                                        <CheckCircle2 size={11} className="text-indigo-500"/>
                                        Chi tiết chứng từ đã chọn
                                      </span>
                                      <button
                                        onClick={() => setLShowTargets(v => !v)}
                                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors
                                          ${lShowTargets
                                            ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                                            : 'bg-white text-gray-400 border-gray-200 hover:text-indigo-600'}`}>
                                        {lShowTargets ? '↩ Ẩn cột đích' : '↩ Cột đích'}
                                      </button>
                                    </div>

                                    {hdrMaps.length > 0 && (
                                      <div className="px-3 pt-2.5 pb-1">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                                          Thông tin header
                                        </p>
                                        <table className="w-full text-xs">
                                          <tbody>
                                            {hdrMaps.map((m, mi) => (
                                              <tr key={mi} className={mi % 2 === 0 ? 'bg-white/60' : ''}>
                                                <td className="py-1 pr-2 text-gray-500 whitespace-nowrap w-2/5 font-medium">
                                                  {m.label || m.api_field}
                                                </td>
                                                <td className="py-1 text-gray-800">
                                                  {selected[m.api_field] != null && selected[m.api_field] !== ''
                                                    ? _toStr(selected[m.api_field])
                                                    : <span className="text-gray-300 italic">–</span>}
                                                </td>
                                                {lShowTargets && m.ocr_field && (
                                                  <td className="py-1 pl-2 text-right whitespace-nowrap">
                                                    <code className="text-[10px] font-mono text-indigo-500 bg-indigo-50 px-1 rounded">
                                                      → {m.ocr_field}
                                                    </code>
                                                  </td>
                                                )}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}

                                    {lnMaps.length > 0 && lines.length > 0 && (
                                      <div className="px-3 pt-2 pb-3">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                                          Dòng chi tiết ({lines.length} dòng)
                                        </p>
                                        <div className="border border-gray-200 rounded overflow-hidden">
                                          <div className="overflow-auto max-h-40">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="bg-gray-100 sticky top-0">
                                                  <th className="px-2 py-1 text-left text-gray-400 font-medium w-6">#</th>
                                                  {lnMaps.map(m => (
                                                    <th key={m.api_field}
                                                      className="px-2 py-1 text-left text-gray-500 font-medium whitespace-nowrap">
                                                      {m.label || m.api_field}
                                                      {lShowTargets && m.ocr_field && (
                                                        <span className="ml-1 text-[9px] font-mono text-indigo-400">
                                                          →{m.ocr_field}
                                                        </span>
                                                      )}
                                                    </th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-gray-100">
                                                {lines.map((ln, li) => (
                                                  <tr key={li} className="bg-white">
                                                    <td className="px-2 py-1 text-gray-400 text-center">{li + 1}</td>
                                                    {lnMaps.map(m => (
                                                      <td key={m.api_field} className="px-2 py-1 text-gray-700 whitespace-nowrap">
                                                        {ln[m.api_field] != null && ln[m.api_field] !== ''
                                                          ? _toStr(ln[m.api_field])
                                                          : <span className="text-gray-300 italic">–</span>}
                                                      </td>
                                                    ))}
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {/* KTra */}
            {ktra && (
              <section>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  {inv.TThai === 0
                    ? <BadgeCheck size={12} className="text-green-500" />
                    : <BadgeX size={12} className="text-red-400" />}
                  Kết quả kiểm tra hợp lệ (CQT)
                </h3>
                <div className="bg-gray-50 rounded-lg px-3 py-1 text-xs">
                  <KTraRow label="Trạng thái tổng thể"       value={ktra.TrangThai} />
                  <KTraRow label="Tên người bán"             value={ktra.NBanTen} />
                  <KTraRow label="MST người bán"             value={ktra.NBanMST} />
                  <KTraRow label="Địa chỉ người bán"         value={ktra.NBanDChi} />
                  <KTraRow label="Tình trạng NNT (bên bán)"  value={ktra.NBanNDTrangThaiHDMST} />
                  <KTraRow label="Tên người mua"             value={ktra.NMuaTen} />
                  <KTraRow label="MST người mua"             value={ktra.NMuaMST} />
                  <KTraRow label="Địa chỉ người mua"         value={ktra.NMuaDChi} />
                  <KTraRow label="Tình trạng NNT (bên mua)"  value={ktra.NMuaNDTrangThaiHDMST} />
                  <KTraRow label="Tổng tiền chưa thuế"        value={ktra.TgTCThue} />
                  <KTraRow label="Tổng tiền thuế"             value={ktra.TgTThue} />
                  <KTraRow label="Tổng tiền thanh toán"       value={ktra.TgTTTBSo} />
                  <KTraRow label="Chiết khấu thương mại"      value={ktra.TTCKTMai} />
                  <KTraRow label="Chữ ký số (MST)"            value={ktra.ChuKyMST} />
                  <KTraRow label="Hiệu lực chữ ký"            value={ktra.ChuKyHieuLuc} />
                </div>
                {inv.KQKiemTraHDon && (
                  <p className="text-xs text-gray-500 mt-1.5 italic px-1">{inv.KQKiemTraHDon}</p>
                )}
              </section>
            )}

            {/* Downloads */}
            {(inv.LinkDownloadXML || inv.LinkDownloadPDF) && (
              <section>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tải xuống</h3>
                <div className="flex gap-2">
                  {inv.LinkDownloadXML && (
                    <a href={inv.LinkDownloadXML} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                      <Download size={13} /> XML <ExternalLink size={10} className="text-gray-400" />
                    </a>
                  )}
                  {inv.LinkDownloadPDF && (
                    <a href={inv.LinkDownloadPDF} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 text-red-600 transition-colors">
                      <FileText size={13} /> PDF <ExternalLink size={10} className="text-red-400" />
                    </a>
                  )}
                </div>
              </section>
            )}

          </div>

          {/* ── Sticky footer – nút Lưu ───────────────────────────────────── */}
          <div className="shrink-0 border-t px-6 py-3 bg-gray-50/80 flex items-center gap-3">
            {isSaved ? (
              <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <CheckCircle2 size={14} />
                Đã lưu vào danh sách xử lý
              </div>
            ) : (
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                title={!canSave ? 'Cần có InvID và số HĐ hoặc MST người bán' : 'Lưu hóa đơn vào danh sách đã xử lý'}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed
                  bg-indigo-600 text-white hover:bg-indigo-700 disabled:hover:bg-indigo-600">
                {saving
                  ? <><Loader2 size={13} className="animate-spin" /> Đang lưu...</>
                  : <><Save size={13} /> Lưu hóa đơn</>}
              </button>
            )}
            {saveMsg && (
              <div className={`flex items-center gap-1.5 text-xs flex-1
                ${saveMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
                {saveMsg.ok ? '✓' : '✗'} {saveMsg.msg}
                <button className="ml-auto text-gray-400 hover:text-gray-600"
                  onClick={() => setSaveMsg(null)}><X size={10} /></button>
              </div>
            )}
          </div>
        </div>
      </div>

    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
const today    = new Date().toISOString().slice(0, 10)
const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)

export default function PurchaseInvoicesPage() {
  const [invoices,  setInvoices]  = useState<PurchaseInvoiceItem[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [selected,  setSelected]  = useState<PurchaseInvoiceItem | null>(null)
  const [showFilter, setShowFilter] = useState(true)

  // API sources + linked sources + saved invoice IDs (for drawer)
  const [apiSources,     setApiSources]     = useState<ExternalApiSource[]>([])
  const [linkedSources,  setLinkedSources]  = useState<PurchaseInvoiceLinkedSource[]>([])
  const [savedInvIds,    setSavedInvIds]    = useState<Set<string>>(new Set())

  // Phân trang
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Lọc bỏ HĐ đã xử lý (đã lưu) khỏi danh sách TCT
  const unprocessed = useMemo(
    () => invoices.filter(inv => !inv.InvID || !savedInvIds.has(inv.InvID)),
    [invoices, savedInvIds],
  )

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize
    return unprocessed.slice(start, start + pageSize)
  }, [unprocessed, page, pageSize])

  // Bộ lọc
  const [fromDate,   setFromDate]   = useState(monthAgo)
  const [toDate,     setToDate]     = useState(today)
  const [comName,    setComName]    = useState('')
  const [comTaxCode, setComTaxCode] = useState('')
  const [invoiceNo,  setInvoiceNo]  = useState('')
  const [pattern,    setPattern]    = useState('')
  const [serial,     setSerial]     = useState('')
  const [trangthai,  setTrangthai]  = useState(-1)

  // Load API sources + linked sources + saved IDs once
  useEffect(() => {
    purchaseInvoiceApi.listApiSources()
      .then(r => setApiSources(r.data))
      .catch(() => { /* non-critical */ })
    purchaseInvoiceApi.listLinkedSources()
      .then(r => setLinkedSources(r.data.filter(s => s.is_active)))
      .catch(() => { /* non-critical */ })
    purchaseInvoiceApi.listSaved()
      .then(r => setSavedInvIds(new Set(r.data.map(s => s.inv_id))))
      .catch(() => { /* non-critical */ })
  }, [])

  const fetchInvoices = async () => {
    setLoading(true)
    setError('')
    const params: InvoiceListParams = {
      fromDateYMD: fromDate || undefined,
      toDateYMD:   toDate   || undefined,
      trangthai,
      ...(comName.trim()    && { comName:    comName.trim() }),
      ...(comTaxCode.trim() && { comTaxCode: comTaxCode.trim() }),
      ...(invoiceNo.trim()  && { no:         parseInt(invoiceNo) }),
      ...(pattern.trim()    && { pattern:    pattern.trim() }),
      ...(serial.trim()     && { serial:     serial.trim() }),
    }
    try {
      const r = await purchaseInvoiceApi.listInvoices(params)
      setInvoices(r.data.data ?? [])
      setPage(1)
    } catch (e: unknown) {
      setError((e as Err)?.response?.data?.detail ?? 'Không thể tải danh sách hóa đơn')
    } finally {
      setLoading(false)
    }
  }

  const clearFilters = () => {
    setComName(''); setComTaxCode(''); setInvoiceNo(''); setPattern(''); setSerial('')
    setFromDate(monthAgo); setToDate(today); setTrangthai(-1)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Receipt size={22} className="text-indigo-500" />
        <h1 className="text-xl font-bold text-gray-800">Xử lý hóa đơn đầu vào</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">

        {/* ── Card header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Receipt size={17} className="text-indigo-500" />
            <span className="font-semibold text-gray-700 text-sm">Danh sách hóa đơn TCT</span>
            {!loading && unprocessed.length > 0 && (
              <span className="text-xs text-gray-400 font-normal">
                ({unprocessed.length} hóa đơn
                {invoices.length > unprocessed.length
                  ? `, đã ẩn ${invoices.length - unprocessed.length} đã xử lý`
                  : ''})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilter(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors
                ${showFilter ? 'border-indigo-200 text-indigo-600 bg-indigo-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              <SlidersHorizontal size={13} />
              Bộ lọc
            </button>
            <button onClick={fetchInvoices} disabled={loading} className="btn-primary">
              {loading
                ? <><Loader2 size={13} className="animate-spin" /> Đang tải...</>
                : <><Search size={13} /> Tìm kiếm</>}
            </button>
          </div>
        </div>

        {/* ── Bộ lọc ────────────────────────────────────────────────── */}
        {showFilter && (
          <div className="px-5 py-3 border-b bg-gray-50/50">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <Field label={<span className="flex items-center gap-1"><CalendarRange size={11} />Từ ngày</span>}>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label={<span className="flex items-center gap-1"><CalendarRange size={11} />Đến ngày</span>}>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Tên người bán">
                <input value={comName} onChange={e => setComName(e.target.value)}
                  placeholder="Tên công ty..." className={inputCls} />
              </Field>
              <Field label="MST người bán">
                <input value={comTaxCode} onChange={e => setComTaxCode(e.target.value)}
                  placeholder="Mã số thuế..." className={`${inputCls} font-mono`} />
              </Field>
              <Field label="Trạng thái">
                <select value={trangthai} onChange={e => setTrangthai(Number(e.target.value))} className={inputCls}>
                  <option value={-1}>Tất cả</option>
                  <option value={0}>Hợp lệ</option>
                  <option value={1}>Không hợp lệ</option>
                  <option value={2}>Trùng</option>
                  <option value={3}>Có sai sót</option>
                </select>
              </Field>
              <Field label={<span className="flex items-center gap-1"><Hash size={11} />Số hóa đơn</span>}>
                <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)}
                  placeholder="Số HĐ..." className={inputCls} />
              </Field>
              <Field label="Mẫu số HĐ">
                <input value={pattern} onChange={e => setPattern(e.target.value)}
                  placeholder="1C22..." className={inputCls} />
              </Field>
              <Field label="Ký hiệu HĐ">
                <input value={serial} onChange={e => setSerial(e.target.value)}
                  placeholder="C22MHA..." className={inputCls} />
              </Field>
            </div>
            <div className="flex items-center justify-between mt-2.5">
              <button onClick={clearFilters} className="text-xs text-indigo-500 hover:underline">Xoá bộ lọc</button>
              <p className="text-xs text-gray-400">
                Lọc theo khoảng ngày: <strong>{fmtDate(fromDate)}</strong> – <strong>{fmtDate(toDate)}</strong>
              </p>
            </div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={13} /></button>
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
            <Loader2 size={20} className="animate-spin" /> Đang tải hóa đơn...
          </div>
        ) : unprocessed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-2">
            <Receipt size={36} className="opacity-20" />
            <p className="text-sm">
              {invoices.length === 0
                ? <>Chưa có dữ liệu — nhấn <strong className="text-indigo-600">Tìm kiếm</strong> để tải</>
                : 'Tất cả hóa đơn đã được xử lý'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="table-th w-10 text-center">STT</th>
                  <th className="table-th">Ký hiệu / Số HĐ</th>
                  <th className="table-th whitespace-nowrap">Ngày lập</th>
                  <th className="table-th">Người bán</th>
                  <th className="table-th">Người mua</th>
                  <th className="table-th text-right whitespace-nowrap">Tiền chưa thuế</th>
                  <th className="table-th text-right whitespace-nowrap">Tổng TT</th>
                  <th className="table-th text-center">Trạng thái</th>
                  <th className="table-th text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map((inv, idx) => {
                  const rowNo = (page - 1) * pageSize + idx + 1
                  const st = statusLabel(inv.TThai)
                  return (
                    <tr key={inv.InvID ?? idx} className="hover:bg-indigo-50/30 transition-colors cursor-default">
                      <td className="table-td text-center text-gray-400">{rowNo}</td>
                      <td className="table-td">
                        {inv.KHMSHDon && (
                          <div className="font-mono text-[11px] text-indigo-500 leading-tight">
                            {inv.KHMSHDon}{inv.KHHDon}
                          </div>
                        )}
                        <div className="font-semibold text-gray-800">#{inv.SHDon ?? '—'}</div>
                      </td>
                      <td className="table-td whitespace-nowrap text-gray-600 text-xs">
                        <div className="font-medium">{fmtDate(inv.NLap)}</div>
                        {inv.NKy ? <div className="text-gray-400">Ký: {fmtDate(inv.NKy)}</div> : null}
                      </td>
                      <td className="table-td max-w-[160px]">
                        <div className="font-medium text-gray-800 truncate text-xs" title={inv.NBanTen}>
                          {inv.NBanTen ?? '—'}
                        </div>
                        {inv.NBanMST && (
                          <div className="text-[11px] text-gray-400 font-mono">{inv.NBanMST}</div>
                        )}
                        {inv.SupplierCode && (
                          <div className="text-[11px] text-indigo-500 font-mono">NCC: {inv.SupplierCode}</div>
                        )}
                      </td>
                      <td className="table-td max-w-[160px]">
                        <div className="text-gray-700 truncate text-xs" title={inv.NMuaTen}>
                          {inv.NMuaTen ?? '—'}
                        </div>
                        {inv.NMuaMST && (
                          <div className="text-[11px] text-gray-400 font-mono">{inv.NMuaMST}</div>
                        )}
                      </td>
                      <td className="table-td text-right text-xs text-gray-600 whitespace-nowrap">
                        {fmtMoney(inv.TgTCThue)}
                      </td>
                      <td className="table-td text-right text-xs font-semibold text-indigo-700 whitespace-nowrap">
                        {fmtMoney(inv.TgTTTBSo)}
                      </td>
                      <td className="table-td text-center">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>
                          {inv.KQPhanTich
                            ? (inv.KQPhanTich.length > 20 ? st.text : inv.KQPhanTich)
                            : st.text}
                        </span>
                      </td>
                      <td className="table-td text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setSelected(inv)} title="Xem chi tiết"
                            className="text-indigo-400 hover:text-indigo-600 transition-colors">
                            <Eye size={15} />
                          </button>
                          {inv.LinkDownloadPDF && (
                            <a href={inv.LinkDownloadPDF} target="_blank" rel="noreferrer"
                              title="Tải PDF" className="text-red-400 hover:text-red-600 transition-colors">
                              <FileText size={15} />
                            </a>
                          )}
                          {inv.LinkDownloadXML && (
                            <a href={inv.LinkDownloadXML} target="_blank" rel="noreferrer"
                              title="Tải XML" className="text-gray-400 hover:text-gray-600 transition-colors">
                              <Download size={15} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Phân trang */}
        {!loading && unprocessed.length > 0 && (
          <Pagination
            total={unprocessed.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={size => { setPageSize(size); setPage(1) }}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <InvoiceDetailDrawer
          invoice={selected}
          apiSources={apiSources}
          linkedSources={linkedSources}
          savedInvIds={savedInvIds}
          onSaved={saved => setSavedInvIds(prev => new Set([...prev, saved.inv_id]))}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
