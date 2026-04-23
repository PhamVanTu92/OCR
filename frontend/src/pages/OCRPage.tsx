import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, RefreshCw, Eye, ScanLine, UploadCloud, X, Search, Filter, Trash2,
} from 'lucide-react'
import { ocrApi } from '../api/ocr'
import { docTypeApi } from '../api/documentTypes'
import { orgApi } from '../api/organizations'
import type { Document, DocumentType, Organization } from '../types'
import { useAuth } from '../contexts/AuthContext'
import Pagination from '../components/Pagination'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:    { label: 'Chờ OCR',      cls: 'bg-gray-100   text-gray-600'  },
  processing: { label: 'Đang xử lý',   cls: 'bg-blue-100   text-blue-700'  },
  completed:  { label: 'Chờ xác nhận', cls: 'bg-yellow-100 text-yellow-700' },
  confirmed:  { label: 'Đã xác nhận',  cls: 'bg-green-100  text-green-700'  },
  failed:     { label: 'Lỗi',          cls: 'bg-red-100    text-red-600'    },
}

const STATUS_OPTIONS = [
  { value: '',          label: 'Tất cả trạng thái' },
  { value: 'pending',   label: 'Chờ OCR'      },
  { value: 'processing',label: 'Đang xử lý'   },
  { value: 'completed', label: 'Chờ xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận'  },
  { value: 'failed',    label: 'Lỗi'          },
]

export default function OCRPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [searchParams] = useSearchParams()
  const filterDocTypeId = searchParams.get('document_type_id')
    ? Number(searchParams.get('document_type_id')) : undefined

  // ── Data ──────────────────────────────────────────────────────────────────
  const [docs,     setDocs]     = useState<Document[]>([])
  const [total,    setTotal]    = useState(0)
  const [docTypes, setDocTypes] = useState<DocumentType[]>([])
  const [orgs,     setOrgs]     = useState<Organization[]>([])
  const [loading,  setLoading]  = useState(true)

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,     setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [searchInput,  setSearchInput]  = useState('')  // debounced input

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // ── Delete ────────────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // ── Upload modal ──────────────────────────────────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [file,      setFile]      = useState<File | null>(null)
  const [dtId,      setDtId]      = useState<number | ''>('')
  const [orgId,     setOrgId]     = useState<number | ''>('')
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')

  // ── Load docs ─────────────────────────────────────────────────────────────
  const loadDocs = async (p = page, ps = pageSize) => {
    setLoading(true)
    try {
      const { data, total: t } = await ocrApi.list({
        document_type_id: filterDocTypeId,
        status:           filterStatus || undefined,
        search:           search       || undefined,
        limit:            ps,
        offset:           (p - 1) * ps,
      })
      setDocs(data)
      setTotal(t)
    } finally { setLoading(false) }
  }

  // Initial load + load ref data once
  useEffect(() => {
    const init = async () => {
      const [dtRes, orgRes] = await Promise.all([docTypeApi.list(), orgApi.list()])
      setDocTypes(dtRes.data)
      setOrgs(orgRes.data)
      if (filterDocTypeId) setDtId(filterDocTypeId)
      else if (dtRes.data.length) setDtId(dtRes.data[0].id)
      if (user?.organization_ids?.length) setOrgId(user.organization_ids[0])
    }
    init()
  }, [])

  useEffect(() => {
    setPage(1)
    loadDocs(1, pageSize)
  }, [filterDocTypeId, filterStatus, search])

  useEffect(() => {
    loadDocs(page, pageSize)
  }, [page, pageSize])

  // Debounce search input → search state
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file || !dtId || !orgId) { setUploadErr('Vui lòng chọn đầy đủ thông tin'); return }
    setUploading(true); setUploadErr('')
    try {
      await ocrApi.upload(file, Number(dtId), Number(orgId))
      setUploadOpen(false); setFile(null)
      loadDocs(1, pageSize); setPage(1)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setUploadErr(msg || 'Upload thất bại')
    } finally { setUploading(false) }
  }

  const handleRetry = async (id: number) => {
    await ocrApi.retry(id)
    loadDocs(page, pageSize)
  }

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Xoá chứng từ "${doc.file_name}"? Thao tác này không thể hoàn tác.`)) return
    setDeletingId(doc.id)
    try {
      await ocrApi.delete(doc.id)
      loadDocs(page, pageSize)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg || 'Xoá thất bại')
    } finally {
      setDeletingId(null)
    }
  }

  const dtName = (id: number) => docTypes.find(d => d.id === id)?.name ?? String(id)
  const activeDocType = filterDocTypeId ? docTypes.find(d => d.id === filterDocTypeId) : null
  const pageTitle = activeDocType ? `OCR – ${activeDocType.name}` : 'Xử lý OCR chứng từ'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">{pageTitle}</h1>
        <button onClick={() => setUploadOpen(true)} className="btn-primary">
          <Plus size={16} /> Tải lên chứng từ
        </button>
      </div>

      {/* ── Table card ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">

        {/* Header + filter bar */}
        <div className="px-5 py-4 border-b space-y-3">
          <div className="flex items-center gap-2">
            <ScanLine size={18} className="text-indigo-500" />
            <span className="font-semibold text-gray-700">Danh sách chứng từ OCR</span>
            {activeDocType && (
              <span className="ml-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                {activeDocType.name}
              </span>
            )}
            {!loading && (
              <span className="ml-auto text-xs text-gray-400">{total} bản ghi</span>
            )}
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm theo tên file..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(''); setSearch('') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1.5">
              <Filter size={14} className="text-gray-400" />
              <select
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Reset filters */}
            {(searchInput || filterStatus) && (
              <button
                onClick={() => { setSearchInput(''); setSearch(''); setFilterStatus(''); setPage(1) }}
                className="text-xs text-indigo-600 hover:underline">
                Xoá bộ lọc
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Đang tải...</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr>
                  {['STT', 'Tên file', 'Loại chứng từ', 'Trạng thái', 'Ngày tải lên', 'Thao tác'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map((doc, idx) => {
                  const st = STATUS_MAP[doc.status] ?? { label: doc.status, cls: 'bg-gray-100 text-gray-600' }
                  const rowNum = (page - 1) * pageSize + idx + 1
                  return (
                    <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td text-gray-400 w-12">{rowNum}</td>
                      <td className="table-td font-medium text-gray-800 max-w-[220px] truncate" title={doc.file_name}>
                        {doc.file_name}
                      </td>
                      <td className="table-td text-gray-600 text-sm">{dtName(doc.document_type_id)}</td>
                      <td className="table-td">
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="table-td text-gray-500 text-xs">
                        {new Date(doc.created_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/ocr/documents/${doc.id}`)}
                            title="Xem chi tiết"
                            className="text-indigo-400 hover:text-indigo-600 transition-colors">
                            <Eye size={15} />
                          </button>
                          {doc.status === 'failed' && (
                            <button onClick={() => handleRetry(doc.id)}
                              title="Thử lại"
                              className="text-orange-400 hover:text-orange-600 transition-colors">
                              <RefreshCw size={15} />
                            </button>
                          )}
                          {doc.status === 'completed' && (
                            <button
                              onClick={() => handleDelete(doc)}
                              disabled={deletingId === doc.id}
                              title="Xoá chứng từ"
                              className="text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors">
                              {deletingId === doc.id
                                ? <RefreshCw size={15} className="animate-spin" />
                                : <Trash2 size={15} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!docs.length && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400">
                      {search || filterStatus ? 'Không tìm thấy chứng từ phù hợp' : 'Chưa có chứng từ nào'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <Pagination
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={ps => { setPageSize(ps); setPage(1) }}
            />
          </>
        )}
      </div>

      {/* ── Upload modal ────────────────────────────────────────────────────── */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-gray-800">Tải lên chứng từ</h3>
              <button onClick={() => { setUploadOpen(false); setFile(null); setUploadErr('') }}
                className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {uploadErr && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{uploadErr}</p>}

              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center
                  cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                <UploadCloud size={32} className="mx-auto text-gray-400 mb-2" />
                {file ? (
                  <p className="text-sm font-medium text-indigo-600">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Click để chọn file hoặc kéo thả vào đây</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, WEBP – tối đa 10MB</p>
                  </>
                )}
                <input ref={fileRef} type="file" className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Loại chứng từ</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={dtId} onChange={e => setDtId(Number(e.target.value))}>
                  <option value="">-- Chọn loại chứng từ --</option>
                  {docTypes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Đơn vị tổ chức</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={orgId} onChange={e => setOrgId(Number(e.target.value))}>
                  <option value="">-- Chọn đơn vị --</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
              <button onClick={() => { setUploadOpen(false); setFile(null) }} className="btn-secondary">Hủy</button>
              <button onClick={handleUpload} disabled={uploading || !file}
                className="btn-primary disabled:opacity-50">
                {uploading ? 'Đang xử lý...' : 'Tải lên & Xử lý'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
