import React, { useEffect, useMemo, useState } from 'react'
import {
  Plus, Pencil, Trash2, FileText, Link2, X,
  CheckCircle2, AlertCircle, Search,
} from 'lucide-react'
import { docTypeApi } from '../api/documentTypes'
import { integrationApi } from '../api/integrations'
import type { DocumentCategory, DocumentType, IntegrationConfig } from '../types'
import DocTypeModal from '../components/DocType/DocTypeModal'
import IntegrationConfigModal from '../components/Integration/IntegrationConfigModal'
import Pagination from '../components/Pagination'

export default function DocumentTypesPage() {
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [docTypes,   setDocTypes]   = useState<DocumentType[]>([])
  const [loading,    setLoading]    = useState(true)

  // Doc type modal
  const [dtModalOpen, setDtModalOpen] = useState(false)
  const [editItem,    setEditItem]    = useState<DocumentType | null>(null)

  // Integration panel (inline, per doc type)
  const [integrationDt,   setIntegrationDt]   = useState<DocumentType | null>(null)
  const [integrations,    setIntegrations]     = useState<IntegrationConfig[]>([])
  const [intLoading,      setIntLoading]       = useState(false)
  const [intModalOpen,    setIntModalOpen]     = useState(false)
  const [editIntegration, setEditIntegration]  = useState<IntegrationConfig | null>(null)

  // ── Filter + pagination ───────────────────────────────────────────────────
  const [search,      setSearch]      = useState('')
  const [filterCatId, setFilterCatId] = useState<number | ''>('')
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(20)

  const load = async () => {
    setLoading(true)
    try {
      const [catRes, dtRes] = await Promise.all([
        docTypeApi.listCategories(),
        docTypeApi.list(),
      ])
      setCategories(catRes.data)
      setDocTypes(dtRes.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Client-side filter
  const filtered = useMemo(() => {
    let list = docTypes
    if (filterCatId) list = list.filter(d => d.category_id === filterCatId)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)
      )
    }
    return list
  }, [docTypes, search, filterCatId])

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  useEffect(() => { setPage(1) }, [search, filterCatId])

  const handleDelete = async (id: number) => {
    if (!confirm('Vô hiệu hoá loại chứng từ này?')) return
    await docTypeApi.delete(id)
    load()
  }

  const openCreate = () => { setEditItem(null); setDtModalOpen(true) }

  const openEdit = async (dt: DocumentType) => {
    try {
      const { data } = await docTypeApi.get(dt.id)
      setEditItem(data)
    } catch { setEditItem(dt) }
    setDtModalOpen(true)
  }

  // ── Integration panel ─────────────────────────────────────────────────────
  const openIntegrations = async (dt: DocumentType) => {
    if (integrationDt?.id === dt.id) { setIntegrationDt(null); return }
    setIntegrationDt(dt)
    setIntLoading(true)
    try {
      const { data } = await integrationApi.list(dt.id)
      setIntegrations(data)
    } finally { setIntLoading(false) }
  }

  const refreshIntegrations = async () => {
    if (!integrationDt) return
    setIntLoading(true)
    try {
      const { data } = await integrationApi.list(integrationDt.id)
      setIntegrations(data)
    } finally { setIntLoading(false) }
  }

  const handleDeleteIntegration = async (intId: number) => {
    if (!integrationDt) return
    if (!confirm('Xoá cấu hình tích hợp này?')) return
    await integrationApi.delete(integrationDt.id, intId)
    refreshIntegrations()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Danh sách chứng từ OCR</h1>

      {/* ── Doc types table ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 text-gray-700 font-semibold">
            <FileText size={18} className="text-indigo-500" />
            Danh sách loại chứng từ
            {!loading && (
              <span className="text-xs font-normal text-gray-400 ml-1">
                ({filtered.length} loại)
              </span>
            )}
          </div>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> Thêm mới
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm theo tên hoặc mã..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm
                focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Category filter */}
          <select
            value={filterCatId}
            onChange={e => setFilterCatId(e.target.value ? Number(e.target.value) : '')}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700
              focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="">Tất cả nhóm</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {(search || filterCatId) && (
            <button
              onClick={() => { setSearch(''); setFilterCatId('') }}
              className="text-xs text-indigo-600 hover:underline">
              Xoá bộ lọc
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Đang tải...</div>
        ) : (
          <>
          <table className="w-full">
            <thead>
              <tr>
                {['STT', 'Tên chứng từ', 'Định dạng', 'Trạng thái', 'Thao tác'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.map((dt, idx) => (
                <React.Fragment key={dt.id}>
                  {/* ── Doc type row ─────────────────────────────────────── */}
                  <tr className={`hover:bg-gray-50 transition-colors
                    ${integrationDt?.id === dt.id ? 'bg-indigo-50/30' : ''}`}>
                    <td className="table-td text-gray-400 w-12">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="table-td">
                      <div className="font-medium text-gray-800">{dt.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{dt.code}</div>
                    </td>
                    <td className="table-td">
                      <div className="flex flex-wrap gap-1">
                        {(dt.allowed_formats ?? []).map((f, i, arr) => (
                          <React.Fragment key={f}>
                            <span className="text-indigo-600 text-xs font-medium">{f}</span>
                            {i < arr.length - 1 && <span className="text-gray-300">,</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </td>
                    <td className="table-td">
                      {dt.is_active ? (
                        <span className="flex items-center gap-1.5 text-sm text-green-600">
                          <span className="w-2 h-2 rounded-full bg-green-500" /> Hoạt động
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm text-red-500">
                          <span className="w-2 h-2 rounded-full bg-red-500" /> Không hoạt động
                        </span>
                      )}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(dt)} title="Chỉnh sửa loại chứng từ"
                          className="text-indigo-400 hover:text-indigo-600 transition-colors">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => openIntegrations(dt)}
                          title="Cấu hình tích hợp"
                          className={`transition-colors ${integrationDt?.id === dt.id
                            ? 'text-indigo-600'
                            : 'text-gray-400 hover:text-indigo-500'}`}>
                          <Link2 size={15} />
                        </button>
                        <button onClick={() => handleDelete(dt.id)} title="Vô hiệu hoá"
                          className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* ── Inline integration panel ──────────────────────────── */}
                  {integrationDt?.id === dt.id && (
                    <tr>
                      <td colSpan={5}
                        className="bg-indigo-50/40 border-b border-indigo-100 px-6 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
                            <Link2 size={15} />
                            Cấu hình tích hợp — <span className="font-normal">{dt.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setEditIntegration(null); setIntModalOpen(true) }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white
                                bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
                              <Plus size={12} /> Thêm cấu hình
                            </button>
                            <button onClick={() => setIntegrationDt(null)}
                              className="text-gray-400 hover:text-gray-600">
                              <X size={16} />
                            </button>
                          </div>
                        </div>

                        {intLoading ? (
                          <p className="text-xs text-gray-400 py-2">Đang tải...</p>
                        ) : integrations.length === 0 ? (
                          <div className="text-xs text-gray-400 py-4 text-center border
                            border-dashed border-indigo-200 rounded-lg">
                            Chưa có cấu hình tích hợp — nhấn <strong>Thêm cấu hình</strong> để khai báo
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {integrations.map(intg => (
                              <div key={intg.id}
                                className="bg-white border border-gray-200 rounded-lg
                                  px-4 py-3 flex items-center gap-4">
                                <span className={`w-2 h-2 rounded-full shrink-0
                                  ${intg.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-gray-800">
                                      {intg.name}
                                    </span>
                                    <code className="text-xs text-indigo-500 bg-indigo-50
                                      px-1.5 py-0.5 rounded">
                                      {intg.code}
                                    </code>
                                    {intg.root_key && (
                                      <span className="text-xs text-gray-400">
                                        envelope: <code className="text-gray-600">{intg.root_key}</code>
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-gray-400 mt-0.5">
                                    <span>
                                      {(intg.field_mappings ?? []).length} field mapping
                                    </span>
                                    <span>
                                      {(intg.table_mappings ?? []).length} table mapping
                                    </span>
                                    {intg.target_url ? (
                                      <span className="text-indigo-500 truncate max-w-xs">
                                        {intg.http_method} → {intg.target_url}
                                      </span>
                                    ) : (
                                      <span className="italic">Không có endpoint</span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  {intg.is_active
                                    ? <span className="text-xs text-green-600 flex items-center gap-1">
                                        <CheckCircle2 size={11}/> Kích hoạt
                                      </span>
                                    : <span className="text-xs text-gray-400 flex items-center gap-1">
                                        <AlertCircle size={11}/> Tắt
                                      </span>}
                                  <button
                                    onClick={async () => {
                                      const { data } = await integrationApi.get(dt.id, intg.id)
                                      setEditIntegration(data)
                                      setIntModalOpen(true)
                                    }}
                                    className="text-indigo-400 hover:text-indigo-600 transition-colors">
                                    <Pencil size={13} />
                                  </button>
                                  <button onClick={() => handleDeleteIntegration(intg.id)}
                                    className="text-red-400 hover:text-red-600 transition-colors">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    {search || filterCatId ? 'Không tìm thấy loại chứng từ phù hợp' : 'Chưa có loại chứng từ nào'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <Pagination
            total={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={ps => { setPageSize(ps); setPage(1) }}
          />
          </>
        )}
      </div>

      {/* ── OCR Settings ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <FileText size={18} className="text-indigo-500" />
          <div>
            <p className="font-semibold text-gray-700">Tham số xử lý OCR (Gemini AI)</p>
            <p className="text-xs text-gray-400">
              Điều chỉnh độ chính xác và tốc độ xử lý trích xuất dữ liệu
            </p>
          </div>
        </div>
        <div className="px-5 py-5 grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phiên bản AI Model</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              * Các model mới nhất từ Google giúp tăng tốc độ trích xuất dữ liệu
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">API Key (Gemini API)</label>
            <div className="relative">
              <input type="password" placeholder="Nhập API Key của bạn..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10" />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                👁
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              * API Key được sử dụng để kết nối với dịch vụ Google Gemini AI
            </p>
          </div>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}
      <DocTypeModal
        open={dtModalOpen}
        editData={editItem}
        categories={categories}
        onClose={() => setDtModalOpen(false)}
        onSaved={() => { setDtModalOpen(false); load() }}
      />

      {integrationDt && (
        <IntegrationConfigModal
          open={intModalOpen}
          docType={integrationDt}
          editData={editIntegration}
          onClose={() => setIntModalOpen(false)}
          onSaved={() => { setIntModalOpen(false); refreshIntegrations() }}
        />
      )}
    </div>
  )
}
