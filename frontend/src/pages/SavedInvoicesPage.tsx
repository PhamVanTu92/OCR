import React, { useEffect, useMemo, useState } from 'react'
import {
  Search, X, AlertCircle, Loader2,
  CalendarRange, Hash, SlidersHorizontal, CheckCircle2, Eye,
} from 'lucide-react'
import { purchaseInvoiceApi } from '../api/purchaseInvoices'
import type { SavedInvoice, PurchaseInvoiceItem, ExternalApiSource } from '../types'
import Pagination from '../components/Pagination'
import { InvoiceDetailDrawer } from './PurchaseInvoicesPage'

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
const fmtMoney = (n?: number | null) =>
  n != null ? n.toLocaleString('vi-VN') : '—'

const statusLabel = (code?: number | null) => {
  if (code === 0) return { text: 'Hợp lệ',       cls: 'bg-green-100  text-green-700  border-green-200'  }
  if (code === 1) return { text: 'Không hợp lệ', cls: 'bg-red-100    text-red-600    border-red-200'    }
  if (code === 2) return { text: 'Trùng',         cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
  if (code === 3) return { text: 'Có sai sót',    cls: 'bg-orange-100 text-orange-600 border-orange-200' }
  return           { text: '—',                   cls: 'bg-gray-100   text-gray-500   border-gray-200'  }
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label as React.ReactNode}</label>
      {children}
    </div>
  )
}
const inputCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'

type Err = { response?: { data?: { detail?: string } } }

// ─── Main page ────────────────────────────────────────────────────────────────
const today    = new Date().toISOString().slice(0, 10)
const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)

export default function SavedInvoicesPage() {
  const [invoices,     setInvoices]     = useState<SavedInvoice[]>([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [showFilter,   setShowFilter]   = useState(true)
  const [apiSources,   setApiSources]   = useState<ExternalApiSource[]>([])
  const [detailInv,    setDetailInv]    = useState<PurchaseInvoiceItem | null>(null)
  const [detailSaved,  setDetailSaved]  = useState<SavedInvoice | null>(null)

  // Parse raw_data of a saved record → PurchaseInvoiceItem for drawer
  const openDetail = (rec: SavedInvoice) => {
    if (!rec.raw_data) return
    try {
      const inv = JSON.parse(rec.raw_data) as PurchaseInvoiceItem
      setDetailSaved(rec)
      setDetailInv(inv)
    } catch { /* ignore */ }
  }

  // Pagination
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Filters (client-side)
  const [fromDate,   setFromDate]   = useState(monthAgo)
  const [toDate,     setToDate]     = useState(today)
  const [sellerName, setSellerName] = useState('')
  const [sellerMST,  setSellerMST]  = useState('')
  const [invoiceNo,  setInvoiceNo]  = useState('')

  const loadSaved = async () => {
    setLoading(true); setError('')
    try {
      const r = await purchaseInvoiceApi.listSaved()
      setInvoices(r.data)
      setPage(1)
    } catch (e: unknown) {
      setError((e as Err)?.response?.data?.detail ?? 'Không thể tải danh sách hóa đơn đã xử lý')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSaved()
    purchaseInvoiceApi.listApiSources()
      .then(r => setApiSources(r.data))
      .catch(() => { /* non-critical */ })
  }, [])

  const clearFilters = () => {
    setFromDate(monthAgo); setToDate(today)
    setSellerName(''); setSellerMST(''); setInvoiceNo('')
  }

  // Client-side filter
  const filtered = useMemo(() => {
    let list = invoices
    if (fromDate) list = list.filter(r => !r.inv_date || r.inv_date >= fromDate)
    if (toDate)   list = list.filter(r => !r.inv_date || r.inv_date <= toDate + 'T23:59:59')
    if (sellerName.trim()) {
      const q = sellerName.trim().toLowerCase()
      list = list.filter(r => r.seller_name?.toLowerCase().includes(q))
    }
    if (sellerMST.trim()) {
      const q = sellerMST.trim()
      list = list.filter(r => r.seller_tax_code?.includes(q))
    }
    if (invoiceNo.trim()) {
      const q = invoiceNo.trim()
      list = list.filter(r => r.inv_no?.includes(q))
    }
    return list
  }, [invoices, fromDate, toDate, sellerName, sellerMST, invoiceNo])

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <CheckCircle2 size={22} className="text-green-500" />
        <h1 className="text-xl font-bold text-gray-800">Hóa đơn đã xử lý</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">

        {/* ── Card header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={17} className="text-green-500" />
            <span className="font-semibold text-gray-700 text-sm">Danh sách hóa đơn đã xử lý</span>
            {!loading && filtered.length > 0 && (
              <span className="text-xs text-gray-400 font-normal">({filtered.length} hóa đơn)</span>
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
            <button onClick={loadSaved} disabled={loading} className="btn-primary">
              {loading
                ? <><Loader2 size={13} className="animate-spin" /> Đang tải...</>
                : <><Search size={13} /> Làm mới</>}
            </button>
          </div>
        </div>

        {/* ── Bộ lọc ────────────────────────────────────────────────── */}
        {showFilter && (
          <div className="px-5 py-3 border-b bg-gray-50/50">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Field label={<span className="flex items-center gap-1"><CalendarRange size={11} />Từ ngày</span>}>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label={<span className="flex items-center gap-1"><CalendarRange size={11} />Đến ngày</span>}>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Tên người bán">
                <input value={sellerName} onChange={e => setSellerName(e.target.value)}
                  placeholder="Tên công ty..." className={inputCls} />
              </Field>
              <Field label="MST người bán">
                <input value={sellerMST} onChange={e => setSellerMST(e.target.value)}
                  placeholder="Mã số thuế..." className={`${inputCls} font-mono`} />
              </Field>
              <Field label={<span className="flex items-center gap-1"><Hash size={11} />Số hóa đơn</span>}>
                <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)}
                  placeholder="Số HĐ..." className={inputCls} />
              </Field>
            </div>
            <div className="flex items-center justify-between mt-2.5">
              <button onClick={clearFilters} className="text-xs text-indigo-500 hover:underline">Xoá bộ lọc</button>
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
            <Loader2 size={20} className="animate-spin" /> Đang tải...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-2">
            <CheckCircle2 size={36} className="opacity-20" />
            <p className="text-sm">Chưa có hóa đơn nào được xử lý</p>
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
                  <th className="table-th text-center whitespace-nowrap">Ngày lưu</th>
                  <th className="table-th text-center">Mã NCC SAP</th>
                  <th className="table-th text-center">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map((rec, idx) => {
                  const rowNo = (page - 1) * pageSize + idx + 1
                  const st = statusLabel(rec.tthai)
                  return (
                    <tr key={rec.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="table-td text-center text-gray-400">{rowNo}</td>
                      <td className="table-td">
                        {rec.khhd && (
                          <div className="font-mono text-[11px] text-indigo-500 leading-tight">{rec.khhd}</div>
                        )}
                        <div className="font-semibold text-gray-800">#{rec.inv_no ?? '—'}</div>
                      </td>
                      <td className="table-td whitespace-nowrap text-gray-600 text-xs">
                        {fmtDate(rec.inv_date)}
                      </td>
                      <td className="table-td max-w-[160px]">
                        <div className="font-medium text-gray-800 truncate text-xs" title={rec.seller_name ?? ''}>
                          {rec.seller_name ?? '—'}
                        </div>
                        {rec.seller_tax_code && (
                          <div className="text-[11px] text-gray-400 font-mono">{rec.seller_tax_code}</div>
                        )}
                      </td>
                      <td className="table-td max-w-[160px]">
                        <div className="text-gray-700 truncate text-xs" title={rec.buyer_name ?? ''}>
                          {rec.buyer_name ?? '—'}
                        </div>
                        {rec.buyer_tax_code && (
                          <div className="text-[11px] text-gray-400 font-mono">{rec.buyer_tax_code}</div>
                        )}
                      </td>
                      <td className="table-td text-right text-xs text-gray-600 whitespace-nowrap">
                        {fmtMoney(rec.total_before_tax)}
                      </td>
                      <td className="table-td text-right text-xs font-semibold text-indigo-700 whitespace-nowrap">
                        {fmtMoney(rec.total_amount)}
                      </td>
                      <td className="table-td text-center">
                        {rec.kq_phan_tich
                          ? <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>
                              {rec.kq_phan_tich.length > 20 ? st.text : rec.kq_phan_tich}
                            </span>
                          : <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>
                              {st.text}
                            </span>
                        }
                      </td>
                      <td className="table-td text-center text-xs text-gray-400 whitespace-nowrap">
                        {fmtDateTime(rec.created_at)}
                      </td>
                      <td className="table-td text-center">
                        {rec.supplier_code
                          ? <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                              {rec.supplier_code}
                            </span>
                          : <span className="text-xs text-gray-300">—</span>
                        }
                      </td>
                      <td className="table-td text-center">
                        {rec.raw_data
                          ? <button onClick={() => openDetail(rec)}
                              title="Xem chi tiết"
                              className="text-indigo-400 hover:text-indigo-600 transition-colors">
                              <Eye size={15} />
                            </button>
                          : <span className="text-gray-200"><Eye size={15} /></span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Phân trang */}
        {!loading && filtered.length > 0 && (
          <Pagination
            total={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={size => { setPageSize(size); setPage(1) }}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        )}
      </div>

      {/* Detail drawer – dùng lại InvoiceDetailDrawer, InvID đã có trong savedInvIds nên hiện badge "Đã lưu" */}
      {detailInv && detailSaved && (
        <InvoiceDetailDrawer
          invoice={detailInv}
          apiSources={apiSources}
          savedInvIds={new Set(invoices.map(r => r.inv_id))}
          onSaved={() => loadSaved()}
          onClose={() => { setDetailInv(null); setDetailSaved(null) }}
          disableAutoFill={true}
        />
      )}
    </div>
  )
}
