import React, { useEffect, useMemo, useState } from 'react'
import {
  Plus, Pencil, Trash2, FileText, Link2, X,
  CheckCircle2, AlertCircle, Search, FolderOpen, ChevronDown, ChevronUp,
  Settings, Database, KeyRound, Play, Info, Loader2, RefreshCw,
} from 'lucide-react'
import { docTypeApi } from '../api/documentTypes'
import { integrationApi } from '../api/integrations'
import { docTypeSettingsApi } from '../api/docTypeSettings'
import type { DocumentCategory, DocumentType, IntegrationConfig, DocTypeSapConfig, DocTypeApiSource, ApiFieldMapping } from '../types'
import DocTypeModal from '../components/DocType/DocTypeModal'
import IntegrationConfigModal from '../components/Integration/IntegrationConfigModal'
import Pagination from '../components/Pagination'

// ── Category Modal ────────────────────────────────────────────────────────────
interface CatModalProps {
  open: boolean
  editData: DocumentCategory | null
  onClose: () => void
  onSaved: () => void
}

function CategoryModal({ open, editData, onClose, onSaved }: CatModalProps) {
  const [name,        setName]        = useState('')
  const [code,        setCode]        = useState('')
  const [description, setDescription] = useState('')
  const [isActive,    setIsActive]    = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (open) {
      setName(editData?.name ?? '')
      setCode(editData?.code ?? '')
      setDescription(editData?.description ?? '')
      setIsActive(editData?.is_active ?? true)
      setError('')
    }
  }, [open, editData])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !code.trim()) { setError('Tên và mã không được để trống'); return }
    setSaving(true); setError('')
    try {
      if (editData) {
        await docTypeApi.updateCategory(editData.id, { name, code, description: description || null, is_active: isActive })
      } else {
        await docTypeApi.createCategory({ name, code, description: description || null, is_active: isActive })
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Có lỗi xảy ra')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-800">
            {editData ? 'Chỉnh sửa nhóm chứng từ' : 'Thêm nhóm chứng từ'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên nhóm <span className="text-red-500">*</span>
            </label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="VD: Hóa đơn, Hợp đồng..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mã nhóm <span className="text-red-500">*</span>
            </label>
            <input
              value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="VD: INV, CONTRACT..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono
                focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">Chỉ chữ hoa, số và dấu gạch dưới</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="Mô tả ngắn về nhóm chứng từ..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="cat-active" checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded" />
            <label htmlFor="cat-active" className="text-sm text-gray-700">Kích hoạt</label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Huỷ
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700
                disabled:opacity-60 flex items-center gap-1.5">
              {saving ? 'Đang lưu...' : (editData ? 'Cập nhật' : 'Thêm mới')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DocumentTypesPage() {
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [docTypes,   setDocTypes]   = useState<DocumentType[]>([])
  const [loading,    setLoading]    = useState(true)

  // Category panel
  const [catPanelOpen, setCatPanelOpen] = useState(false)
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [editCat,      setEditCat]      = useState<DocumentCategory | null>(null)
  const [catError,     setCatError]     = useState('')

  // Doc type modal
  const [dtModalOpen, setDtModalOpen] = useState(false)
  const [editItem,    setEditItem]    = useState<DocumentType | null>(null)

  // Integration panel (inline, per doc type)
  const [integrationDt,   setIntegrationDt]   = useState<DocumentType | null>(null)
  const [integrations,    setIntegrations]     = useState<IntegrationConfig[]>([])
  const [intLoading,      setIntLoading]       = useState(false)
  const [intModalOpen,    setIntModalOpen]     = useState(false)
  const [editIntegration, setEditIntegration]  = useState<IntegrationConfig | null>(null)

  // Settings panel (SAP + API sources, inline per doc type)
  const [settingsDt,      setSettingsDt]      = useState<DocumentType | null>(null)
  const [settingsTab,     setSettingsTab]     = useState<'sap' | 'api'>('sap')
  const [sapCfg,          setSapCfg]          = useState<DocTypeSapConfig | null>(null)
  const [sapLoading,      setSapLoading]      = useState(false)
  const [sapSaving,       setSapSaving]       = useState(false)
  const [sapTesting,      setSapTesting]      = useState(false)
  const [sapMsg,          setSapMsg]          = useState<{ ok: boolean; text: string } | null>(null)
  // SAP form fields
  const [sapUrl,          setSapUrl]          = useState('')
  const [sapDb,           setSapDb]           = useState('')
  const [sapUser,         setSapUser]         = useState('')
  const [sapPass,         setSapPass]         = useState('')
  const [sapActive,       setSapActive]       = useState(true)
  // API sources
  const [apiSources,      setApiSources]      = useState<DocTypeApiSource[]>([])
  const [apiLoading,      setApiLoading]      = useState(false)
  const [apiSrcModal,     setApiSrcModal]     = useState(false)
  const [editApiSrc,      setEditApiSrc]      = useState<DocTypeApiSource | null>(null)
  const [apiSaving,       setApiSaving]       = useState(false)
  const [apiMsg,          setApiMsg]          = useState<{ ok: boolean; text: string } | null>(null)
  const [apiDeleting,     setApiDeleting]     = useState<number | null>(null)
  const [invoking,        setInvoking]        = useState<number | null>(null)
  // API source form
  const [fName,     setFName]     = useState('')
  const [fDesc,     setFDesc]     = useState('')
  const [fUrl,      setFUrl]      = useState('')
  const [fSelect,   setFSelect]   = useState('')
  const [fFilter,   setFFilter]   = useState('')
  const [fExtra,    setFExtra]    = useState('')
  const [fMaps,     setFMaps]     = useState<ApiFieldMapping[]>([{ api_field: '', label: '', ocr_field: null }])
  const [fSapAuth,  setFSapAuth]  = useState(true)
  const [fCategory, setFCategory] = useState('')
  const [fActive,   setFActive]   = useState(true)

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

  // ── Category handlers ─────────────────────────────────────────────────────
  const handleDeleteCat = async (cat: DocumentCategory) => {
    const used = docTypes.filter(d => d.category_id === cat.id).length
    if (used > 0) {
      setCatError(`Nhóm "${cat.name}" đang có ${used} loại chứng từ, không thể xoá.`)
      return
    }
    if (!confirm(`Xoá nhóm chứng từ "${cat.name}"?`)) return
    setCatError('')
    try {
      await docTypeApi.deleteCategory(cat.id)
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setCatError(msg ?? 'Không thể xoá nhóm này')
    }
  }

  const openCreateCat = () => { setEditCat(null); setCatModalOpen(true) }
  const openEditCat   = (cat: DocumentCategory) => { setEditCat(cat); setCatModalOpen(true) }

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

  // ── Settings panel handlers ───────────────────────────────────────────────
  const openSettings = async (dt: DocumentType) => {
    if (settingsDt?.id === dt.id) { setSettingsDt(null); return }
    setSettingsDt(dt)
    setSettingsTab('sap')
    setSapMsg(null); setApiMsg(null)
    // Load SAP config
    setSapLoading(true)
    try {
      const { data } = await docTypeSettingsApi.getSapConfig(dt.id)
      setSapCfg(data)
      setSapUrl(data.sap_base_url ?? '')
      setSapDb(data.sap_company_db ?? '')
      setSapUser(data.sap_username ?? '')
      setSapPass('')
      setSapActive(data.is_active)
    } finally { setSapLoading(false) }
    // Load API sources
    setApiLoading(true)
    try {
      const { data } = await docTypeSettingsApi.listApiSources(dt.id)
      setApiSources(data)
    } finally { setApiLoading(false) }
  }

  const handleSaveSap = async () => {
    if (!settingsDt) return
    setSapSaving(true); setSapMsg(null)
    try {
      const { data } = await docTypeSettingsApi.updateSapConfig(settingsDt.id, {
        sap_base_url:   sapUrl   || null,
        sap_company_db: sapDb    || null,
        sap_username:   sapUser  || null,
        sap_password:   sapPass  || undefined,
        is_active:      sapActive,
      })
      setSapCfg(data); setSapPass('')
      setSapMsg({ ok: true, text: 'Đã lưu cấu hình SAP!' })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSapMsg({ ok: false, text: msg ?? 'Lưu thất bại' })
    } finally { setSapSaving(false) }
  }

  const handleTestSap = async () => {
    if (!settingsDt) return
    setSapTesting(true); setSapMsg(null)
    try {
      const { data } = await docTypeSettingsApi.testSapLogin(settingsDt.id)
      setSapMsg({ ok: true, text: data.message })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSapMsg({ ok: false, text: msg ?? 'Đăng nhập thất bại' })
    } finally { setSapTesting(false) }
  }

  const loadApiSources = async () => {
    if (!settingsDt) return
    setApiLoading(true)
    try {
      const { data } = await docTypeSettingsApi.listApiSources(settingsDt.id)
      setApiSources(data)
    } finally { setApiLoading(false) }
  }

  const openAddApiSrc = () => {
    setEditApiSrc(null)
    setFName(''); setFDesc(''); setFUrl(''); setFSelect(''); setFFilter(''); setFExtra('')
    setFMaps([{ api_field: '', label: '', ocr_field: null }])
    setFSapAuth(true); setFCategory(''); setFActive(true)
    setApiSrcModal(true)
  }

  const openEditApiSrc = (src: DocTypeApiSource) => {
    setEditApiSrc(src)
    setFName(src.name); setFDesc(src.description ?? ''); setFUrl(src.base_url)
    setFSelect(src.select_fields ?? ''); setFFilter(src.filter_template ?? '')
    setFExtra(src.extra_params ?? '')
    setFMaps(src.field_mappings.length ? src.field_mappings.map(m => ({ ...m })) : [{ api_field: '', label: '', ocr_field: null }])
    setFSapAuth(src.use_sap_auth); setFCategory(src.category ?? ''); setFActive(src.is_active)
    setApiSrcModal(true)
  }

  const handleSaveApiSrc = async () => {
    if (!settingsDt) return
    if (!fName.trim()) { setApiMsg({ ok: false, text: 'Tên không được trống' }); return }
    if (!fUrl.trim())  { setApiMsg({ ok: false, text: 'Base URL không được trống' }); return }
    setApiSaving(true); setApiMsg(null)
    const validMaps = fMaps.filter(m => m.api_field.trim())
    const payload = {
      name: fName.trim(), description: fDesc || null,
      base_url: fUrl.trim(), select_fields: fSelect || null,
      filter_template: fFilter || null, extra_params: fExtra || null,
      field_mappings: validMaps, use_sap_auth: fSapAuth,
      category: fCategory || null, is_active: fActive,
    }
    try {
      if (editApiSrc) {
        await docTypeSettingsApi.updateApiSource(settingsDt.id, editApiSrc.id, payload)
      } else {
        await docTypeSettingsApi.createApiSource(settingsDt.id, payload)
      }
      setApiSrcModal(false)
      loadApiSources()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setApiMsg({ ok: false, text: msg ?? 'Lưu thất bại' })
    } finally { setApiSaving(false) }
  }

  const handleDeleteApiSrc = async (id: number) => {
    if (!settingsDt || !confirm('Xoá API source này?')) return
    setApiDeleting(id)
    try {
      await docTypeSettingsApi.deleteApiSource(settingsDt.id, id)
      setApiSources(prev => prev.filter(s => s.id !== id))
    } finally { setApiDeleting(null) }
  }

  const handleInvokeApiSrc = async (src: DocTypeApiSource) => {
    if (!settingsDt) return
    setInvoking(src.id)
    try {
      const { data } = await docTypeSettingsApi.invokeApiSource(settingsDt.id, src.id, {})
      alert(`Gọi thành công – ${data.count} bản ghi\n\nURL: ${data.url_called}`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(`Lỗi: ${msg ?? 'Gọi API thất bại'}`)
    } finally { setInvoking(null) }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Danh sách chứng từ OCR</h1>

      {/* ── Category panel ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Header – click to toggle */}
        <button
          onClick={() => { setCatPanelOpen(v => !v); setCatError('') }}
          className="w-full flex items-center justify-between px-5 py-4 border-b hover:bg-gray-50/60 transition-colors">
          <div className="flex items-center gap-2 text-gray-700 font-semibold">
            <FolderOpen size={18} className="text-indigo-500" />
            Nhóm chứng từ
            <span className="text-xs font-normal text-gray-400 ml-1">
              ({categories.length} nhóm)
            </span>
          </div>
          <div className="flex items-center gap-3">
            {!catPanelOpen && (
              <div className="flex gap-1.5 flex-wrap max-w-lg">
                {categories.slice(0, 6).map(c => (
                  <span key={c.id}
                    className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100
                      px-2 py-0.5 rounded-full font-medium">
                    {c.name}
                  </span>
                ))}
                {categories.length > 6 && (
                  <span className="text-xs text-gray-400">+{categories.length - 6}</span>
                )}
              </div>
            )}
            {catPanelOpen
              ? <ChevronUp size={16} className="text-gray-400" />
              : <ChevronDown size={16} className="text-gray-400" />}
          </div>
        </button>

        {catPanelOpen && (
          <div className="px-5 py-4">
            {/* Error */}
            {catError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg
                px-3 py-2 text-sm text-red-600 mb-3">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{catError}</span>
                <button onClick={() => setCatError('')} className="ml-auto text-red-400 hover:text-red-600">
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Add button */}
            <div className="flex justify-end mb-3">
              <button onClick={openCreateCat} className="btn-primary">
                <Plus size={15} /> Thêm nhóm
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div className="text-center py-6 text-gray-400 text-sm">Đang tải...</div>
            ) : categories.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm border border-dashed
                border-gray-200 rounded-lg">
                Chưa có nhóm chứng từ nào — nhấn <strong>Thêm nhóm</strong> để khai báo
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {['STT', 'Tên nhóm', 'Mã', 'Mô tả', 'Số loại CT', 'Trạng thái', 'Thao tác'].map(h => (
                      <th key={h} className="table-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {categories.map((cat, idx) => {
                    const dtCount = docTypes.filter(d => d.category_id === cat.id).length
                    return (
                      <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-td text-gray-400 w-10">{idx + 1}</td>
                        <td className="table-td font-medium text-gray-800">{cat.name}</td>
                        <td className="table-td">
                          <code className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-mono">
                            {cat.code}
                          </code>
                        </td>
                        <td className="table-td text-gray-500 max-w-xs truncate">
                          {cat.description ?? <span className="text-gray-300 italic">—</span>}
                        </td>
                        <td className="table-td text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                            ${dtCount > 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                            {dtCount}
                          </span>
                        </td>
                        <td className="table-td">
                          {cat.is_active ? (
                            <span className="flex items-center gap-1.5 text-sm text-green-600">
                              <span className="w-2 h-2 rounded-full bg-green-500" /> Hoạt động
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-sm text-gray-400">
                              <span className="w-2 h-2 rounded-full bg-gray-300" /> Tắt
                            </span>
                          )}
                        </td>
                        <td className="table-td">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditCat(cat)}
                              title="Chỉnh sửa"
                              className="text-indigo-400 hover:text-indigo-600 transition-colors">
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => handleDeleteCat(cat)}
                              title="Xoá nhóm"
                              className="text-red-400 hover:text-red-600 transition-colors
                                disabled:opacity-40"
                              disabled={dtCount > 0}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

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
                    ${integrationDt?.id === dt.id ? 'bg-indigo-50/30' : ''}
                    ${settingsDt?.id === dt.id ? 'bg-amber-50/30' : ''}`}>
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
                        <button onClick={() => openSettings(dt)}
                          title="Kết nối SAP & API nguồn"
                          className={`transition-colors ${settingsDt?.id === dt.id
                            ? 'text-amber-600'
                            : 'text-gray-400 hover:text-amber-500'}`}>
                          <Settings size={15} />
                        </button>
                        <button onClick={() => handleDelete(dt.id)} title="Vô hiệu hoá"
                          className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* ── Inline settings panel (SAP + API sources) ────────── */}
                  {settingsDt?.id === dt.id && (
                    <tr>
                      <td colSpan={5} className="bg-amber-50/40 border-b border-amber-100 px-6 py-5">

                        {/* Panel header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                            <Settings size={15} />
                            Thiết lập kết nối — <span className="font-normal">{dt.name}</span>
                          </div>
                          <button onClick={() => setSettingsDt(null)} className="text-gray-400 hover:text-gray-600">
                            <X size={16} />
                          </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-1 mb-4 border-b border-amber-100">
                          {(['sap', 'api'] as const).map(tab => (
                            <button key={tab} onClick={() => setSettingsTab(tab)}
                              className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors
                                ${settingsTab === tab
                                  ? 'bg-white border border-b-white border-amber-200 text-amber-700 -mb-px'
                                  : 'text-gray-500 hover:text-amber-600'}`}>
                              {tab === 'sap' ? '🔗 Kết nối SAP B1' : '🌐 API nguồn dữ liệu ngoài'}
                            </button>
                          ))}
                        </div>

                        {/* SAP Tab */}
                        {settingsTab === 'sap' && (
                          <div className="space-y-4">
                            {sapLoading ? (
                              <div className="text-xs text-gray-400 flex items-center gap-2 py-2">
                                <Loader2 size={13} className="animate-spin" /> Đang tải...
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                      SAP Base URL
                                    </label>
                                    <input value={sapUrl} onChange={e => setSapUrl(e.target.value)}
                                      placeholder="https://IP:50000"
                                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                        font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                      CompanyDB
                                    </label>
                                    <input value={sapDb} onChange={e => setSapDb(e.target.value)}
                                      placeholder="SBODemoVN"
                                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                        focus:outline-none focus:ring-2 focus:ring-amber-400" />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                      Username
                                    </label>
                                    <input value={sapUser} onChange={e => setSapUser(e.target.value)}
                                      placeholder="manager"
                                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                        focus:outline-none focus:ring-2 focus:ring-amber-400" />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                      Password <span className="text-gray-400 font-normal">(để trống = giữ nguyên)</span>
                                    </label>
                                    <input type="password" value={sapPass} onChange={e => setSapPass(e.target.value)}
                                      placeholder="••••••••"
                                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                                        focus:outline-none focus:ring-2 focus:ring-amber-400" />
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <input type="checkbox" id={`sap-active-${dt.id}`}
                                    checked={sapActive} onChange={e => setSapActive(e.target.checked)}
                                    className="w-4 h-4 text-amber-500 rounded" />
                                  <label htmlFor={`sap-active-${dt.id}`} className="text-sm text-gray-600">
                                    Kích hoạt kết nối SAP
                                  </label>
                                </div>

                                {/* Status message */}
                                {sapMsg && (
                                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm
                                    ${sapMsg.ok
                                      ? 'bg-green-50 border border-green-200 text-green-700'
                                      : 'bg-red-50 border border-red-200 text-red-600'}`}>
                                    {sapMsg.ok
                                      ? <CheckCircle2 size={13} />
                                      : <AlertCircle size={13} />}
                                    <span className="flex-1">{sapMsg.text}</span>
                                    <button onClick={() => setSapMsg(null)}><X size={11} /></button>
                                  </div>
                                )}

                                {/* Buttons */}
                                <div className="flex items-center gap-2">
                                  <button onClick={handleSaveSap} disabled={sapSaving}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs text-white
                                      bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-60
                                      transition-colors">
                                    {sapSaving
                                      ? <><Loader2 size={12} className="animate-spin" /> Đang lưu...</>
                                      : <><Database size={12} /> Lưu cấu hình</>}
                                  </button>
                                  <button onClick={handleTestSap} disabled={sapTesting || !sapCfg?.sap_base_url}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs
                                      border border-amber-300 text-amber-700 rounded-lg
                                      hover:bg-amber-50 disabled:opacity-50 transition-colors">
                                    {sapTesting
                                      ? <><Loader2 size={12} className="animate-spin" /> Đang kiểm tra...</>
                                      : <><RefreshCw size={12} /> Kiểm tra kết nối</>}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* API Sources Tab */}
                        {settingsTab === 'api' && (
                          <div className="space-y-3">
                            {/* Tab toolbar */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">
                                {apiSources.length} API source đã cấu hình
                              </span>
                              <button onClick={openAddApiSrc}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white
                                  bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors">
                                <Plus size={12} /> Thêm API source
                              </button>
                            </div>

                            {/* API msg */}
                            {apiMsg && (
                              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm
                                ${apiMsg.ok
                                  ? 'bg-green-50 border border-green-200 text-green-700'
                                  : 'bg-red-50 border border-red-200 text-red-600'}`}>
                                {apiMsg.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                                <span className="flex-1">{apiMsg.text}</span>
                                <button onClick={() => setApiMsg(null)}><X size={11} /></button>
                              </div>
                            )}

                            {apiLoading ? (
                              <div className="text-xs text-gray-400 flex items-center gap-2 py-2">
                                <Loader2 size={13} className="animate-spin" /> Đang tải...
                              </div>
                            ) : apiSources.length === 0 ? (
                              <div className="text-xs text-gray-400 py-6 text-center border
                                border-dashed border-amber-200 rounded-lg">
                                Chưa có API source — nhấn <strong>Thêm API source</strong> để khai báo
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {apiSources.map(src => (
                                  <div key={src.id}
                                    className="bg-white border border-gray-200 rounded-lg px-4 py-3
                                      flex items-start gap-3">
                                    <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5
                                      ${src.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium text-gray-800">{src.name}</span>
                                        {src.category && (
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
                                            ${src.category === 'seller'
                                              ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                              : 'bg-purple-50 text-purple-600 border border-purple-100'}`}>
                                            {src.category === 'seller' ? 'Người bán' : 'Dòng hàng'}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-400 font-mono truncate mt-0.5">
                                        {src.base_url}
                                      </p>
                                      <p className="text-[11px] text-gray-400 mt-0.5">
                                        {src.field_mappings.length} mapping
                                        {src.use_sap_auth ? ' · SAP auth' : ''}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button onClick={() => handleInvokeApiSrc(src)}
                                        disabled={invoking === src.id}
                                        title="Gọi thử API"
                                        className="text-green-500 hover:text-green-700 disabled:opacity-50
                                          transition-colors">
                                        {invoking === src.id
                                          ? <Loader2 size={13} className="animate-spin" />
                                          : <Play size={13} />}
                                      </button>
                                      <button onClick={() => openEditApiSrc(src)}
                                        title="Chỉnh sửa"
                                        className="text-indigo-400 hover:text-indigo-600 transition-colors">
                                        <Pencil size={13} />
                                      </button>
                                      <button onClick={() => handleDeleteApiSrc(src.id)}
                                        disabled={apiDeleting === src.id}
                                        title="Xoá"
                                        className="text-red-400 hover:text-red-600 disabled:opacity-50
                                          transition-colors">
                                        {apiDeleting === src.id
                                          ? <Loader2 size={13} className="animate-spin" />
                                          : <Trash2 size={13} />}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}

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
      <CategoryModal
        open={catModalOpen}
        editData={editCat}
        onClose={() => setCatModalOpen(false)}
        onSaved={() => { setCatModalOpen(false); load() }}
      />

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

      {/* ── API Source Add/Edit Modal ─────────────────────────────────────── */}
      {apiSrcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <Info size={16} className="text-amber-500" />
                {editApiSrc ? 'Chỉnh sửa API source' : 'Thêm API source mới'}
                {settingsDt && (
                  <span className="text-xs font-normal text-gray-400 ml-1">— {settingsDt.name}</span>
                )}
              </h2>
              <button onClick={() => setApiSrcModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {apiMsg && (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm
                  ${apiMsg.ok
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-600'}`}>
                  {apiMsg.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  <span className="flex-1">{apiMsg.text}</span>
                  <button onClick={() => setApiMsg(null)}><X size={11} /></button>
                </div>
              )}

              {/* Basic info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tên *</label>
                  <input value={fName} onChange={e => setFName(e.target.value)}
                    placeholder="VD: SAP Orders theo MST"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả</label>
                  <input value={fDesc} onChange={e => setFDesc(e.target.value)}
                    placeholder="Ghi chú..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Chạy tự động</label>
                  <select value={fCategory} onChange={e => setFCategory(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                    <option value="">— Thủ công</option>
                    <option value="seller">🏢 Người bán – tự động khi mở</option>
                    <option value="line_item">📦 Hàng hóa – tự động từng dòng</option>
                  </select>
                </div>
              </div>

              {/* Endpoint */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Base URL *</label>
                <input value={fUrl} onChange={e => setFUrl(e.target.value)}
                  placeholder="https://IP:50000/b1s/v1/Orders"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono
                    focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">$select</label>
                  <input value={fSelect} onChange={e => setFSelect(e.target.value)}
                    placeholder="DocEntry,U_MST,DocDate"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono
                      focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Extra params</label>
                  <input value={fExtra} onChange={e => setFExtra(e.target.value)}
                    placeholder="$top=100&$orderby=DocDate desc"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono
                      focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  $filter — dùng {'{'}placeholder{'}'} từ context chứng từ
                </label>
                <input value={fFilter} onChange={e => setFFilter(e.target.value)}
                  placeholder="Cancelled eq 'tNO' and U_MST eq '{NBanMST}'"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono
                    focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>

              {/* Field mappings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">Mapping trường API → đích</label>
                  <button onClick={() => setFMaps(p => [...p, { api_field: '', label: '', ocr_field: null }])}
                    className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 font-medium">
                    <Plus size={12} /> Thêm trường
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 px-0.5">
                  {['Trường API (JSON key)', 'Nhãn hiển thị', 'Trường đích (ocr_field)', ''].map(h => (
                    <span key={h} className="text-[11px] font-medium text-gray-400">{h}</span>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {fMaps.map((m, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center">
                      <input value={m.api_field}
                        onChange={e => setFMaps(p => p.map((x, j) => j === i ? { ...x, api_field: e.target.value } : x))}
                        placeholder="DocEntry"
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono
                          focus:outline-none focus:ring-1 focus:ring-amber-400" />
                      <input value={m.label}
                        onChange={e => setFMaps(p => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                        placeholder="Số đơn hàng"
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs
                          focus:outline-none focus:ring-1 focus:ring-amber-400" />
                      <input value={m.ocr_field ?? ''}
                        onChange={e => setFMaps(p => p.map((x, j) => j === i ? { ...x, ocr_field: e.target.value || null } : x))}
                        placeholder="ItemCode / NBanMa..."
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono
                          focus:outline-none focus:ring-1 focus:ring-amber-400" />
                      <button onClick={() => setFMaps(p => p.filter((_, j) => j !== i))}
                        disabled={fMaps.length === 1}
                        className="text-gray-300 hover:text-red-500 disabled:opacity-20 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={fSapAuth} onChange={e => setFSapAuth(e.target.checked)}
                    className="w-4 h-4 text-amber-500 rounded" />
                  <KeyRound size={13} className="text-amber-500" />
                  Dùng xác thực SAP B1
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={fActive} onChange={e => setFActive(e.target.checked)}
                    className="w-4 h-4 text-amber-500 rounded" />
                  Kích hoạt
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
              <button onClick={() => setApiSrcModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Huỷ
              </button>
              <button onClick={handleSaveApiSrc} disabled={apiSaving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white
                  bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-60 transition-colors">
                {apiSaving
                  ? <><Loader2 size={14} className="animate-spin" /> Đang lưu...</>
                  : editApiSrc ? 'Cập nhật' : 'Thêm mới'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
