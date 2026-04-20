import React, { useEffect, useRef, useState } from 'react'
import {
  Settings, RefreshCw, Search, X, Download, Eye,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  FileText, Receipt, ExternalLink, Loader2, KeyRound,
  ShieldCheck,
} from 'lucide-react'
import { purchaseInvoiceApi, type InvoiceListParams } from '../api/purchaseInvoices'
import type {
  PurchaseInvoiceConfig, PurchaseInvoiceItem, PurchaseInvoiceLineItem, CaptchaResponse,
} from '../types'

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n?: number) =>
  n != null ? n.toLocaleString('vi-VN') : '—'

const statusLabel = (code?: number) => {
  if (code === 0) return { text: 'Hợp lệ',    cls: 'bg-green-100 text-green-700' }
  if (code === 1) return { text: 'Không hợp lệ', cls: 'bg-red-100 text-red-600' }
  if (code === 2) return { text: 'Trùng',      cls: 'bg-yellow-100 text-yellow-700' }
  return { text: 'Tất cả', cls: 'bg-gray-100 text-gray-500' }
}

// ─── Setting panel ────────────────────────────────────────────────────────────
function SettingsPanel({ onSaved }: { onSaved: () => void }) {
  const [open,       setOpen]       = useState(false)
  const [cfg,        setCfg]        = useState<PurchaseInvoiceConfig | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')

  // TCT login tab
  const [tctTab,     setTctTab]     = useState<'token'|'tct'>('token')
  const [captcha,    setCaptcha]    = useState<CaptchaResponse | null>(null)
  const [captchaVal, setCaptchaVal] = useState('')
  const [tctUser,    setTctUser]    = useState('')
  const [tctPass,    setTctPass]    = useState('')
  const [tctLoading, setTctLoading] = useState(false)

  useEffect(() => {
    purchaseInvoiceApi.getConfig().then(r => {
      setCfg(r.data)
      setTctUser(r.data.tct_username ?? '')
      setTctPass(r.data.tct_password ?? '')
    })
  }, [])

  const loadCaptcha = async () => {
    setTctLoading(true)
    try {
      const r = await purchaseInvoiceApi.getCaptcha()
      setCaptcha(r.data)
      setCaptchaVal('')
    } catch { setError('Không lấy được captcha') }
    finally { setTctLoading(false) }
  }

  const handleSaveToken = async () => {
    if (!cfg) return
    setSaving(true); setError(''); setSuccess('')
    try {
      await purchaseInvoiceApi.updateConfig({
        name:            cfg.name,
        matbao_base_url: cfg.matbao_base_url,
        matbao_token:    cfg.matbao_token ?? undefined,
      })
      setSuccess('Đã lưu cấu hình!')
      onSaved()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Lỗi lưu')
    } finally { setSaving(false) }
  }

  const handleLoginTCT = async () => {
    if (!captcha || !captchaVal.trim()) { setError('Nhập mã captcha'); return }
    setTctLoading(true); setError(''); setSuccess('')
    try {
      await purchaseInvoiceApi.loginTCT({
        username: tctUser, password: tctPass,
        cvalue: captchaVal, ckey: captcha.key,
      })
      setSuccess('Đăng nhập TCT thành công!')
      setCaptcha(null)
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Đăng nhập thất bại')
    } finally { setTctLoading(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-center gap-2 font-semibold text-gray-700">
          <Settings size={18} className="text-indigo-500" />
          Thiết lập kết nối Matbao API
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && cfg && (
        <div className="px-5 pb-5 border-t">
          {/* Tabs */}
          <div className="flex gap-1 mt-4 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
            {(['token', 'tct'] as const).map(tab => (
              <button key={tab} onClick={() => setTctTab(tab)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${tctTab === tab ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab === 'token' ? (
                  <span className="flex items-center gap-1.5"><KeyRound size={14} /> Cấu hình API Token</span>
                ) : (
                  <span className="flex items-center gap-1.5"><ShieldCheck size={14} /> Đăng nhập TCT</span>
                )}
              </button>
            ))}
          </div>

          {/* Alerts */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600 mb-3">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
              <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 mb-3">
              <CheckCircle2 size={15} /><span>{success}</span>
              <button onClick={() => setSuccess('')} className="ml-auto"><X size={13} /></button>
            </div>
          )}

          {/* Token tab */}
          {tctTab === 'token' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên cấu hình</label>
                  <input value={cfg.name}
                    onChange={e => setCfg({...cfg, name: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base URL API</label>
                  <input value={cfg.matbao_base_url}
                    onChange={e => setCfg({...cfg, matbao_base_url: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Matbao API Token <span className="text-red-500">*</span>
                </label>
                <input type="password"
                  value={cfg.matbao_token ?? ''}
                  onChange={e => setCfg({...cfg, matbao_token: e.target.value})}
                  placeholder="Nhập token Matbao..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <p className="text-xs text-gray-400 mt-1">
                  Lấy token tại trang quản trị Matbao: Quản lý hóa đơn → Quản lý hóa đơn đầu vào → Tạo mới
                </p>
              </div>
              <div className="flex justify-end">
                <button onClick={handleSaveToken} disabled={saving}
                  className="btn-primary">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Đang lưu...</> : 'Lưu cấu hình'}
                </button>
              </div>
            </div>
          )}

          {/* TCT tab */}
          {tctTab === 'tct' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Đăng nhập bằng tài khoản <strong>hoadondientu.gdt.gov.vn</strong> để đồng bộ hóa đơn từ Tổng cục Thuế.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập (MST)</label>
                  <input value={tctUser} onChange={e => setTctUser(e.target.value)}
                    placeholder="Mã số thuế..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
                  <input type="password" value={tctPass} onChange={e => setTctPass(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* Captcha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã captcha</label>
                <div className="flex items-center gap-3">
                  {captcha ? (
                    <div className="border border-gray-200 rounded-lg p-2 bg-white"
                      dangerouslySetInnerHTML={{ __html: captcha.content }} />
                  ) : (
                    <div className="w-32 h-12 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-400">
                      Chưa tải
                    </div>
                  )}
                  <button onClick={loadCaptcha} disabled={tctLoading}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                    <RefreshCw size={13} className={tctLoading ? 'animate-spin' : ''} />
                    {captcha ? 'Tải lại' : 'Tải captcha'}
                  </button>
                  <input value={captchaVal} onChange={e => setCaptchaVal(e.target.value)}
                    placeholder="Nhập captcha..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={handleLoginTCT} disabled={tctLoading || !captcha}
                  className="btn-primary">
                  {tctLoading ? <><Loader2 size={14} className="animate-spin" /> Đang đăng nhập...</> : 'Đăng nhập TCT'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Detail drawer ────────────────────────────────────────────────────────────
function InvoiceDetailDrawer({
  invoice, onClose,
}: {
  invoice: PurchaseInvoiceItem
  onClose: () => void
}) {
  const [detail,  setDetail]  = useState<PurchaseInvoiceItem | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (invoice.LinkDownloadXML) {
      setLoading(true)
      purchaseInvoiceApi.detailByUrl(invoice.LinkDownloadXML, 0)
        .then(r => setDetail(r.data))
        .catch(() => setDetail(invoice))
        .finally(() => setLoading(false))
    } else {
      setDetail(invoice)
    }
  }, [invoice])

  const inv = detail ?? invoice
  const lines: PurchaseInvoiceLineItem[] = inv.DSHHDVu ?? []

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="flex items-center gap-2">
              <Receipt size={18} className="text-indigo-500" />
              <h2 className="font-semibold text-gray-800">Chi tiết hóa đơn</h2>
              {inv.KHMSHDon && (
                <code className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-mono">
                  {inv.KHMSHDon}{inv.KHHDon}
                </code>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Số: {inv.SHDon ?? '—'} · Ngày lập: {inv.NLap ?? '—'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
            <Loader2 size={18} className="animate-spin" /> Đang tải chi tiết...
          </div>
        ) : (
          <div className="px-6 py-4 space-y-5">
            {/* Status */}
            {inv.TThai != null && (
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusLabel(inv.TThai).cls}`}>
                  {inv.TenTThai ?? statusLabel(inv.TThai).text}
                </span>
                {inv.TenLoaiHoaDon && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-medium">
                    {inv.TenLoaiHoaDon}
                  </span>
                )}
              </div>
            )}

            {/* Seller */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Người bán</h3>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                <p><span className="text-gray-500 w-28 inline-block">Tên:</span> <span className="font-medium">{inv.NBanTen ?? '—'}</span></p>
                <p><span className="text-gray-500 w-28 inline-block">MST:</span> {inv.NBanMST ?? '—'}</p>
                <p><span className="text-gray-500 w-28 inline-block">Địa chỉ:</span> {inv.NBanDChi ?? '—'}</p>
              </div>
            </section>

            {/* Buyer */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Người mua</h3>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                <p><span className="text-gray-500 w-28 inline-block">Tên:</span> <span className="font-medium">{inv.NMuaTen ?? '—'}</span></p>
                <p><span className="text-gray-500 w-28 inline-block">MST:</span> {inv.NMuaMST ?? '—'}</p>
                <p><span className="text-gray-500 w-28 inline-block">Địa chỉ:</span> {inv.NMuaDChi ?? '—'}</p>
              </div>
            </section>

            {/* Payment */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Thanh toán</h3>
              <div className="bg-indigo-50 rounded-lg p-3 space-y-1 text-sm">
                <p className="flex justify-between"><span className="text-gray-500">Tiền chưa thuế:</span><span className="font-medium">{fmt(inv.TgTCThue)} đ</span></p>
                <p className="flex justify-between"><span className="text-gray-500">Tiền thuế GTGT:</span><span className="font-medium">{fmt(inv.TgTThue)} đ</span></p>
                <p className="flex justify-between border-t border-indigo-100 pt-1 mt-1">
                  <span className="font-semibold text-gray-700">Tổng thanh toán:</span>
                  <span className="font-bold text-indigo-700 text-base">{fmt(inv.TgTTTBSo)} đ</span>
                </p>
                {inv.HTTToan && <p><span className="text-gray-500">Hình thức TT:</span> {inv.HTTToan}</p>}
              </div>
            </section>

            {/* Line items */}
            {lines.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Hàng hóa / Dịch vụ ({lines.length} dòng)
                </h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {['STT','Tên hàng','ĐVT','SL','Đơn giá','Thành tiền','Thuế'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{l.STT ?? i+1}</td>
                          <td className="px-3 py-2 text-gray-800 max-w-[180px]">
                            {l.MHHDVu && <span className="text-gray-400 mr-1">[{l.MHHDVu}]</span>}
                            {l.THHDVu}
                          </td>
                          <td className="px-3 py-2">{l.DVTinh ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{l.SLuong ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{fmt(l.DGia)}</td>
                          <td className="px-3 py-2 text-right font-medium">{fmt(l.ThTien)}</td>
                          <td className="px-3 py-2 text-right">{l.TSuat != null ? `${l.TSuat}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Downloads */}
            {(inv.LinkDownloadXML || inv.LinkDownloadPDF) && (
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tải xuống</h3>
                <div className="flex gap-2">
                  {inv.LinkDownloadXML && (
                    <a href={inv.LinkDownloadXML} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                      <Download size={14} /> XML
                      <ExternalLink size={11} className="text-gray-400" />
                    </a>
                  )}
                  {inv.LinkDownloadPDF && (
                    <a href={inv.LinkDownloadPDF} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 text-red-600">
                      <FileText size={14} /> PDF
                      <ExternalLink size={11} className="text-red-400" />
                    </a>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)

export default function PurchaseInvoicesPage() {
  const [invoices,  setInvoices]  = useState<PurchaseInvoiceItem[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [selected,  setSelected]  = useState<PurchaseInvoiceItem | null>(null)
  const [apiMode,   setApiMode]   = useState<'v1'|'tct'>('tct')

  // Filters
  const [comName,       setComName]       = useState('')
  const [comTaxCode,    setComTaxCode]    = useState('')
  const [fromDate,      setFromDate]      = useState(monthAgo)
  const [toDate,        setToDate]        = useState(today)
  const [trangthai,     setTrangthai]     = useState(-1)
  const [loaihoadon,    setLoaihoadon]    = useState(-1)
  const [invoiceNo,     setInvoiceNo]     = useState('')
  const [pattern,       setPattern]       = useState('')
  const [serial,        setSerial]        = useState('')

  const mountedRef = useRef(true)
  useEffect(() => { return () => { mountedRef.current = false } }, [])

  const fetchInvoices = async () => {
    setLoading(true); setError('')
    const params: InvoiceListParams = {
      fromDateYMD: fromDate || undefined,
      toDateYMD:   toDate   || undefined,
      trangthai,
      ...(comName.trim()    && { comName: comName.trim() }),
      ...(comTaxCode.trim() && { comTaxCode: comTaxCode.trim() }),
      ...(invoiceNo.trim()  && { no: parseInt(invoiceNo) }),
      ...(pattern.trim()    && { pattern: pattern.trim() }),
      ...(serial.trim()     && { serial: serial.trim() }),
      ...(apiMode === 'tct' && { loaihoadon }),
    }
    try {
      const fn = apiMode === 'tct'
        ? purchaseInvoiceApi.listInvoicesTCT
        : purchaseInvoiceApi.listInvoices
      const r = await fn(params)
      if (mountedRef.current) setInvoices(r.data.data ?? [])
    } catch (e: unknown) {
      if (mountedRef.current) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setError(msg ?? 'Không thể tải danh sách hóa đơn')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const clearFilters = () => {
    setComName(''); setComTaxCode(''); setFromDate(monthAgo); setToDate(today)
    setTrangthai(-1); setLoaihoadon(-1); setInvoiceNo(''); setPattern(''); setSerial('')
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-800">Hóa đơn đầu vào</h1>

      {/* Settings */}
      <SettingsPanel onSaved={() => {}} />

      {/* Invoice list */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-wrap gap-2">
          <div className="flex items-center gap-2 font-semibold text-gray-700">
            <Receipt size={18} className="text-indigo-500" />
            Danh sách hóa đơn đầu vào
            {!loading && invoices.length > 0 && (
              <span className="text-xs font-normal text-gray-400">({invoices.length} hóa đơn)</span>
            )}
          </div>
          {/* API mode toggle */}
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 p-0.5 rounded-lg text-xs">
              {(['tct', 'v1'] as const).map(m => (
                <button key={m} onClick={() => setApiMode(m)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors
                    ${apiMode === m ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  {m === 'tct' ? 'TCT (v2)' : 'Matbao (v1)'}
                </button>
              ))}
            </div>
            <button onClick={fetchInvoices} disabled={loading}
              className="btn-primary">
              {loading
                ? <><Loader2 size={14} className="animate-spin" /> Đang tải...</>
                : <><Search size={14} /> Tìm kiếm</>}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b bg-gray-50/60">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Date range */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {/* Seller */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tên người bán</label>
              <input value={comName} onChange={e => setComName(e.target.value)}
                placeholder="Tên công ty..."
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">MST người bán</label>
              <input value={comTaxCode} onChange={e => setComTaxCode(e.target.value)}
                placeholder="Mã số thuế..."
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {/* Invoice fields */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Số hóa đơn</label>
              <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)}
                placeholder="Số HĐ..."
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mẫu số HĐ</label>
              <input value={pattern} onChange={e => setPattern(e.target.value)}
                placeholder="Pattern..."
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ký hiệu HĐ</label>
              <input value={serial} onChange={e => setSerial(e.target.value)}
                placeholder="Serial..."
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {/* Status */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Trạng thái</label>
              <select value={trangthai} onChange={e => setTrangthai(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value={-1}>Tất cả</option>
                <option value={0}>Hợp lệ</option>
                <option value={1}>Không hợp lệ</option>
                <option value={2}>Trùng</option>
              </select>
            </div>
            {apiMode === 'tct' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Loại hóa đơn</label>
                <select value={loaihoadon} onChange={e => setLoaihoadon(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value={-1}>Tất cả</option>
                  <option value={1}>Có mã</option>
                  <option value={2}>Không mã</option>
                  <option value={3}>Máy tính tiền</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <button onClick={clearFilters}
              className="text-xs text-indigo-600 hover:underline">
              Xoá bộ lọc
            </button>
            <p className="text-xs text-gray-400">Nhấn <strong>Tìm kiếm</strong> để tải dữ liệu từ Matbao API</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
            <Loader2 size={20} className="animate-spin" /> Đang tải hóa đơn...
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <Receipt size={32} className="opacity-30" />
            <p className="text-sm">Chưa có dữ liệu — nhấn <strong>Tìm kiếm</strong> để tải hóa đơn</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['STT','Ký hiệu / Số HĐ','Ngày lập','Người bán','Người mua',
                    'Tiền chưa thuế','Tổng TT','Trạng thái','Thao tác'].map(h => (
                    <th key={h} className="table-th whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv, idx) => {
                  const st = statusLabel(inv.TThai)
                  return (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td text-gray-400 w-10">{idx + 1}</td>
                      <td className="table-td">
                        <div className="font-mono text-xs text-indigo-600">{inv.KHMSHDon}{inv.KHHDon}</div>
                        <div className="font-semibold text-gray-800">#{inv.SHDon}</div>
                      </td>
                      <td className="table-td whitespace-nowrap text-gray-600">
                        <div>{inv.NLap ?? '—'}</div>
                        {inv.NKy && <div className="text-xs text-gray-400">Ký: {inv.NKy}</div>}
                      </td>
                      <td className="table-td max-w-[180px]">
                        <div className="font-medium text-gray-800 truncate" title={inv.NBanTen}>{inv.NBanTen ?? '—'}</div>
                        <div className="text-xs text-gray-400 font-mono">{inv.NBanMST}</div>
                      </td>
                      <td className="table-td max-w-[180px]">
                        <div className="text-gray-700 truncate" title={inv.NMuaTen}>{inv.NMuaTen ?? '—'}</div>
                        <div className="text-xs text-gray-400 font-mono">{inv.NMuaMST}</div>
                      </td>
                      <td className="table-td text-right text-gray-700 whitespace-nowrap">
                        {fmt(inv.TgTCThue)}
                      </td>
                      <td className="table-td text-right font-semibold text-indigo-700 whitespace-nowrap">
                        {fmt(inv.TgTTTBSo)}
                      </td>
                      <td className="table-td">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
                          {inv.TenTThai ?? st.text}
                        </span>
                      </td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSelected(inv)}
                            title="Xem chi tiết"
                            className="text-indigo-400 hover:text-indigo-600 transition-colors">
                            <Eye size={15} />
                          </button>
                          {inv.LinkDownloadPDF && (
                            <a href={inv.LinkDownloadPDF} target="_blank" rel="noreferrer"
                              title="Tải PDF"
                              className="text-red-400 hover:text-red-600 transition-colors">
                              <FileText size={15} />
                            </a>
                          )}
                          {inv.LinkDownloadXML && (
                            <a href={inv.LinkDownloadXML} target="_blank" rel="noreferrer"
                              title="Tải XML"
                              className="text-gray-400 hover:text-gray-600 transition-colors">
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
