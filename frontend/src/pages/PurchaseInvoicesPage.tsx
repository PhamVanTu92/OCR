import React, { useEffect, useState } from 'react'
import {
  Settings, RefreshCw, Search, X, Download, Eye,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  FileText, Receipt, ExternalLink, Loader2, KeyRound,
  BadgeCheck, BadgeX, Building2, User, CalendarRange,
  Hash, SlidersHorizontal,
} from 'lucide-react'
import { purchaseInvoiceApi, type InvoiceListParams } from '../api/purchaseInvoices'
import type { PurchaseInvoiceConfig, PurchaseInvoiceItem, PurchaseInvoiceLineItem } from '../types'

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** yyyy-MM-dd  →  dd/MM/yyyy */
function fmtDate(d?: string | null): string {
  if (!d) return '—'
  // ISO: 2026-03-01  hoặc  2026-03-01T15:23:06
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  // dd/MM/yyyy đã đúng
  if (/^\d{2}\/\d{2}\/\d{4}/.test(d)) return d.slice(0, 10)
  return d
}

/** yyyy-MM-dd  →  dd/MM/yyyy (cho display ngày tháng dạng dài) */
function fmtDateTime(d?: string | null): string {
  if (!d) return '—'
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]} ${iso[4]}:${iso[5]}`
  return fmtDate(d)
}

// ─── Money / Status helpers ───────────────────────────────────────────────────

const fmtMoney = (n?: number | null) =>
  n != null ? n.toLocaleString('vi-VN') : '—'

const statusLabel = (code?: number) => {
  if (code === 0) return { text: 'Hợp lệ',       cls: 'bg-green-100  text-green-700  border-green-200'  }
  if (code === 1) return { text: 'Không hợp lệ', cls: 'bg-red-100    text-red-600    border-red-200'    }
  if (code === 2) return { text: 'Trùng',         cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
  if (code === 3) return { text: 'Có sai sót',    cls: 'bg-orange-100 text-orange-600 border-orange-200' }
  return           { text: '—',                   cls: 'bg-gray-100   text-gray-500   border-gray-200'  }
}

// ─── Input helpers ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'

// ─── Settings panel ───────────────────────────────────────────────────────────
function SettingsPanel({ onSaved }: { onSaved: () => void }) {
  const [open,      setOpen]      = useState(false)
  const [cfg,       setCfg]       = useState<PurchaseInvoiceConfig | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [testing,   setTesting]   = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')
  const [tokenInfo, setTokenInfo] = useState('')

  useEffect(() => {
    purchaseInvoiceApi.getConfig().then(r => setCfg(r.data))
  }, [])

  const handleSave = async () => {
    if (!cfg) return
    setSaving(true); setError(''); setSuccess(''); setTokenInfo('')
    try {
      await purchaseInvoiceApi.updateConfig({
        name:            cfg.name,
        matbao_base_url: cfg.matbao_base_url,
        matbao_api_key:  cfg.matbao_api_key ?? undefined,
      })
      setSuccess('Đã lưu cấu hình!')
      onSaved()
    } catch (e: unknown) {
      setError((e as Err)?.response?.data?.detail ?? 'Lỗi lưu cấu hình')
    } finally { setSaving(false) }
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
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
          <Settings size={16} className="text-indigo-500" />
          Thiết lập kết nối API
          {cfg?.matbao_api_key && (
            <span className="text-xs font-normal text-green-600 flex items-center gap-1">
              <CheckCircle2 size={11} /> Đã cấu hình
            </span>
          )}
        </div>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>

      {open && cfg && (
        <div className="px-5 pb-5 border-t space-y-4 pt-4">
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

          <div className="grid grid-cols-2 gap-4">
            <Field label="Tên cấu hình">
              <input value={cfg.name} onChange={e => setCfg({ ...cfg, name: e.target.value })}
                className={inputCls} />
            </Field>
            <Field label="Base URL API">
              <input value={cfg.matbao_base_url}
                onChange={e => setCfg({ ...cfg, matbao_base_url: e.target.value })}
                className={`${inputCls} font-mono text-xs`} />
            </Field>
          </div>

          <Field label={
            <span className="flex items-center gap-1.5">
              <KeyRound size={12} className="text-indigo-400" />
              API Key (UUID) <span className="text-red-500">*</span>
            </span> as unknown as string
          }>
            <input type="password"
              value={cfg.matbao_api_key ?? ''}
              onChange={e => setCfg({ ...cfg, matbao_api_key: e.target.value })}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={`${inputCls} font-mono`} />
            <p className="text-xs text-gray-400 mt-1">
              Lấy tại trang quản trị hóa đơn đầu vào → API Key
            </p>
          </Field>

          <div className="flex justify-end gap-2">
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
  )
}

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

// ─── Detail drawer ────────────────────────────────────────────────────────────
function InvoiceDetailDrawer({ invoice, onClose }: { invoice: PurchaseInvoiceItem; onClose: () => void }) {
  const inv   = invoice
  const lines: PurchaseInvoiceLineItem[] = inv.DSHHDVu ?? []
  const ktra  = inv.KTra
  const st    = statusLabel(inv.TThai)

  return (
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

        {/* ── Body (scrollable) ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Badges trạng thái */}
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
                {inv.NBanMST  && <p className="font-mono text-indigo-600">{inv.NBanMST}</p>}
                {inv.NBanDChi && <p className="text-gray-500 leading-snug">{inv.NBanDChi}</p>}
                {inv.NBanSDT  && <p className="text-gray-500">📞 {inv.NBanSDT}</p>}
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

          {/* Hàng hóa */}
          {lines.length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Hàng hóa / Dịch vụ
                <span className="ml-1 text-indigo-500">({lines.length} dòng)</span>
              </h3>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 font-medium">
                    <tr>
                      <th className="px-3 py-2 text-center w-8">STT</th>
                      <th className="px-3 py-2 text-left">Tên hàng hóa / Dịch vụ</th>
                      <th className="px-3 py-2 text-center">ĐVT</th>
                      <th className="px-3 py-2 text-right">SL</th>
                      <th className="px-3 py-2 text-right">Đơn giá</th>
                      <th className="px-3 py-2 text-right">Thành tiền</th>
                      <th className="px-3 py-2 text-right">Thuế</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((l, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 text-center">{l.STT ?? i + 1}</td>
                        <td className="px-3 py-2 text-gray-800 max-w-[220px]">
                          {l.MHHDVu && (
                            <span className="text-[10px] text-indigo-400 font-mono mr-1">[{l.MHHDVu}]</span>
                          )}
                          <span className="leading-snug">{l.THHDVu}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-center">{l.DVTinh ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{l.SLuong ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(l.DGia)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmtMoney(l.ThTien)}</td>
                        <td className="px-3 py-2 text-right text-indigo-600 font-medium">
                          {l.TSuat != null ? String(l.TSuat) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
      </div>
    </div>
  )
}

// ─── Inline row helper (payment section) ──────────────────────────────────────
function Row({ label, value, cls = 'text-gray-700' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${cls}`}>{value}</span>
    </div>
  )
}

// ─── Error type helper ────────────────────────────────────────────────────────
type Err = { response?: { data?: { detail?: string } } }

// ─── Main page ────────────────────────────────────────────────────────────────
const today    = new Date().toISOString().slice(0, 10)
const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)

export default function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = useState<PurchaseInvoiceItem[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [selected, setSelected] = useState<PurchaseInvoiceItem | null>(null)
  const [showFilter, setShowFilter] = useState(true)

  // Bộ lọc
  const [fromDate,   setFromDate]   = useState(monthAgo)
  const [toDate,     setToDate]     = useState(today)
  const [comName,    setComName]    = useState('')
  const [comTaxCode, setComTaxCode] = useState('')
  const [invoiceNo,  setInvoiceNo]  = useState('')
  const [pattern,    setPattern]    = useState('')
  const [serial,     setSerial]     = useState('')
  const [trangthai,  setTrangthai]  = useState(-1)

  const fetchInvoices = async () => {
    setLoading(true)
    setError('')
    const params: InvoiceListParams = {
      // Định dạng API: yyyy-MM-dd (giữ nguyên từ input)
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
      <h1 className="text-xl font-bold text-gray-800">Hóa đơn đầu vào</h1>

      {/* Settings */}
      <SettingsPanel onSaved={() => {}} />

      {/* Invoice list card */}
      <div className="bg-white rounded-xl border border-gray-200">

        {/* ── Card header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Receipt size={17} className="text-indigo-500" />
            <span className="font-semibold text-gray-700 text-sm">Danh sách hóa đơn đầu vào</span>
            {!loading && invoices.length > 0 && (
              <span className="text-xs text-gray-400 font-normal">({invoices.length} hóa đơn)</span>
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

        {/* ── Bộ lọc ──────────────────────────────────────────────────── */}
        {showFilter && (
          <div className="px-5 py-3 border-b bg-gray-50/50">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">

              {/* Khoảng ngày */}
              <Field label={<span className="flex items-center gap-1"><CalendarRange size={11} />Từ ngày</span> as unknown as string}>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                  className={inputCls} />
              </Field>
              <Field label={<span className="flex items-center gap-1"><CalendarRange size={11} />Đến ngày</span> as unknown as string}>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                  className={inputCls} />
              </Field>

              {/* Người bán */}
              <Field label="Tên người bán">
                <input value={comName} onChange={e => setComName(e.target.value)}
                  placeholder="Tên công ty..." className={inputCls} />
              </Field>
              <Field label="MST người bán">
                <input value={comTaxCode} onChange={e => setComTaxCode(e.target.value)}
                  placeholder="Mã số thuế..." className={`${inputCls} font-mono`} />
              </Field>

              {/* Trạng thái */}
              <Field label="Trạng thái">
                <select value={trangthai} onChange={e => setTrangthai(Number(e.target.value))}
                  className={inputCls}>
                  <option value={-1}>Tất cả</option>
                  <option value={0}>Hợp lệ</option>
                  <option value={1}>Không hợp lệ</option>
                  <option value={2}>Trùng</option>
                  <option value={3}>Có sai sót</option>
                </select>
              </Field>

              {/* Số / ký hiệu */}
              <Field label={<span className="flex items-center gap-1"><Hash size={11} />Số hóa đơn</span> as unknown as string}>
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
              <button onClick={clearFilters} className="text-xs text-indigo-500 hover:underline">
                Xoá bộ lọc
              </button>
              <p className="text-xs text-gray-400">
                Lọc theo khoảng ngày: <strong>{fmtDate(fromDate)}</strong> – <strong>{fmtDate(toDate)}</strong>
              </p>
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={13} /></button>
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
            <Loader2 size={20} className="animate-spin" /> Đang tải hóa đơn...
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-2">
            <Receipt size={36} className="opacity-20" />
            <p className="text-sm">Chưa có dữ liệu — nhấn <strong className="text-indigo-600">Tìm kiếm</strong> để tải</p>
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
                {invoices.map((inv, idx) => {
                  const st = statusLabel(inv.TThai)
                  return (
                    <tr key={idx} className="hover:bg-indigo-50/30 transition-colors cursor-default">
                      <td className="table-td text-center text-gray-400">{idx + 1}</td>

                      {/* Ký hiệu + số */}
                      <td className="table-td">
                        {inv.KHMSHDon && (
                          <div className="font-mono text-[11px] text-indigo-500 leading-tight">
                            {inv.KHMSHDon}{inv.KHHDon}
                          </div>
                        )}
                        <div className="font-semibold text-gray-800">#{inv.SHDon ?? '—'}</div>
                      </td>

                      {/* Ngày lập (dd/MM/yyyy) */}
                      <td className="table-td whitespace-nowrap text-gray-600 text-xs">
                        <div className="font-medium">{fmtDate(inv.NLap)}</div>
                        {inv.NKy ? <div className="text-gray-400">Ký: {fmtDate(inv.NKy)}</div> : null}
                      </td>

                      {/* Người bán */}
                      <td className="table-td max-w-[160px]">
                        <div className="font-medium text-gray-800 truncate text-xs" title={inv.NBanTen}>
                          {inv.NBanTen ?? '—'}
                        </div>
                        {inv.NBanMST && (
                          <div className="text-[11px] text-gray-400 font-mono">{inv.NBanMST}</div>
                        )}
                      </td>

                      {/* Người mua */}
                      <td className="table-td max-w-[160px]">
                        <div className="text-gray-700 truncate text-xs" title={inv.NMuaTen}>
                          {inv.NMuaTen ?? '—'}
                        </div>
                        {inv.NMuaMST && (
                          <div className="text-[11px] text-gray-400 font-mono">{inv.NMuaMST}</div>
                        )}
                      </td>

                      {/* Tiền */}
                      <td className="table-td text-right text-xs text-gray-600 whitespace-nowrap">
                        {fmtMoney(inv.TgTCThue)}
                      </td>
                      <td className="table-td text-right text-xs font-semibold text-indigo-700 whitespace-nowrap">
                        {fmtMoney(inv.TgTTTBSo)}
                      </td>

                      {/* Trạng thái */}
                      <td className="table-td text-center">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>
                          {inv.TenTThai
                            ? (inv.TenTThai.length > 20 ? st.text : inv.TenTThai)
                            : st.text}
                        </span>
                      </td>

                      {/* Thao tác */}
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
      </div>

      {/* Detail drawer */}
      {selected && (
        <InvoiceDetailDrawer invoice={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
