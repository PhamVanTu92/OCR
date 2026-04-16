import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Calendar, FileText, Clock, CheckCircle2, XCircle,
  Loader2, RefreshCw, AlertCircle, Pencil, Save, X, Plus, Trash2,
  ShieldCheck, ShieldOff, PenLine, Link2, Send, Eye, ChevronDown, ChevronRight,
} from 'lucide-react'
import { ocrApi } from '../api/ocr'
import { docTypeApi } from '../api/documentTypes'
import { integrationApi } from '../api/integrations'
import type { Document, DocumentType, IntegrationConfig, ExportLogResponse } from '../types'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:    { label: 'Chờ OCR',        cls: 'bg-gray-100  text-gray-600',   icon: <Clock       size={13}/> },
  processing: { label: 'Đang xử lý',     cls: 'bg-blue-100  text-blue-700',   icon: <Loader2     size={13} className="animate-spin"/> },
  completed:  { label: 'Chờ xác nhận',   cls: 'bg-yellow-100 text-yellow-700',icon: <PenLine     size={13}/> },
  confirmed:  { label: 'Đã xác nhận',    cls: 'bg-green-100 text-green-700',  icon: <CheckCircle2 size={13}/> },
  failed:     { label: 'Lỗi',            cls: 'bg-red-100   text-red-600',    icon: <XCircle     size={13}/> },
}

// ── Helper: convert unknown value to editable string ─────────────────────────
const toStr = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v)

// ── Component ─────────────────────────────────────────────────────────────────
export default function OCRDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  // ── Data state ──────────────────────────────────────────────────────────────
  const [doc,     setDoc]     = useState<Document | null>(null)
  const [docType, setDocType] = useState<DocumentType | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editMode,    setEditMode]    = useState(false)
  const [editFields,  setEditFields]  = useState<Record<string, string>>({})
  const [editTables,  setEditTables]  = useState<Record<string, Record<string, string>[]>>({})
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState('')

  // ── Confirm state ────────────────────────────────────────────────────────────
  const [confirming,   setConfirming]   = useState(false)
  const [unconfirming, setUnconfirming] = useState(false)
  const [retrying,     setRetrying]     = useState(false)

  // ── Integration / export state ────────────────────────────────────────────
  const [integrations,   setIntegrations]   = useState<IntegrationConfig[]>([])
  const [intExpanded,    setIntExpanded]     = useState(false)
  const [previewIntId,   setPreviewIntId]    = useState<number | null>(null)
  const [previewJson,    setPreviewJson]     = useState<string>('')
  const [previewLoading, setPreviewLoading]  = useState(false)
  const [exportingId,    setExportingId]     = useState<number | null>(null)
  const [exportLogs,     setExportLogs]      = useState<ExportLogResponse[]>([])
  const [logsExpanded,   setLogsExpanded]    = useState(false)

  const blobRef = useRef<string | null>(null)

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = async (docId: number) => {
    setLoading(true); setError('')
    try {
      const { data } = await ocrApi.get(docId)
      setDoc(data)

      try {
        const { data: dt } = await docTypeApi.get(data.document_type_id)
        setDocType(dt)
      } catch { /* non-critical */ }

      // Load integrations for this doc type
      try {
        const { data: ints } = await integrationApi.list(data.document_type_id)
        setIntegrations(ints.filter(i => i.is_active))
      } catch { /* non-critical */ }

      try {
        const res = await ocrApi.getFile(docId)
        const url = URL.createObjectURL(res.data as Blob)
        if (blobRef.current) URL.revokeObjectURL(blobRef.current)
        blobRef.current = url
        setFileUrl(url)
      } catch { /* file may be missing */ }
    } catch {
      setError('Không thể tải thông tin chứng từ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return
    load(Number(id))
    return () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current) }
  }, [id])

  // ── Enter edit mode: snapshot current data ───────────────────────────────────
  const startEdit = () => {
    if (!doc?.result) return
    const fields = doc.result.extracted_fields ?? {}
    const tables = doc.result.extracted_tables ?? {}

    // Convert to string maps for editing
    setEditFields(
      Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toStr(v)]))
    )
    setEditTables(
      Object.fromEntries(
        Object.entries(tables).map(([tKey, rows]) => [
          tKey,
          (rows as Record<string, unknown>[]).map(row =>
            Object.fromEntries(Object.entries(row).map(([k, v]) => [k, toStr(v)]))
          ),
        ])
      )
    )
    setSaveError('')
    setEditMode(true)
  }

  const cancelEdit = () => { setEditMode(false); setSaveError('') }

  // ── Save edits ────────────────────────────────────────────────────────────────
  const saveEdits = async () => {
    if (!doc) return
    setSaving(true); setSaveError('')
    try {
      const { data } = await ocrApi.updateResult(doc.id, {
        extracted_fields: editFields as Record<string, unknown>,
        extracted_tables: editTables as Record<string, Record<string, unknown>[]>,
      })
      setDoc(data)
      setEditMode(false)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSaveError(msg || 'Lưu thất bại, vui lòng thử lại')
    } finally {
      setSaving(false)
    }
  }

  // ── Confirm ───────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!doc || !confirm('Xác nhận dữ liệu này? Sau khi xác nhận, dữ liệu sẵn sàng tích hợp.')) return
    setConfirming(true)
    try {
      const { data } = await ocrApi.confirm(doc.id)
      setDoc(data)
    } finally { setConfirming(false) }
  }

  // ── Unconfirm ─────────────────────────────────────────────────────────────────
  const handleUnconfirm = async () => {
    if (!doc || !confirm('Huỷ xác nhận chứng từ này? Dữ liệu sẽ chuyển về trạng thái chờ xác nhận.')) return
    setUnconfirming(true)
    try {
      const { data } = await ocrApi.unconfirm(doc.id)
      setDoc(data)
    } finally { setUnconfirming(false) }
  }

  // ── Retry ─────────────────────────────────────────────────────────────────────
  const handleRetry = async () => {
    if (!doc) return
    setRetrying(true)
    try {
      await ocrApi.retry(doc.id)
      await load(doc.id)
    } finally { setRetrying(false) }
  }

  // ── Table edit helpers ────────────────────────────────────────────────────────
  const patchCell = (tKey: string, ri: number, col: string, val: string) =>
    setEditTables(prev => ({
      ...prev,
      [tKey]: prev[tKey].map((row, i) => i === ri ? { ...row, [col]: val } : row),
    }))

  const addRow = (tKey: string) => {
    const cols = editTables[tKey]?.[0] ? Object.keys(editTables[tKey][0]) : []
    const emptyRow = Object.fromEntries(cols.map(c => [c, '']))
    setEditTables(prev => ({ ...prev, [tKey]: [...(prev[tKey] ?? []), emptyRow] }))
  }

  const deleteRow = (tKey: string, ri: number) =>
    setEditTables(prev => ({ ...prev, [tKey]: prev[tKey].filter((_, i) => i !== ri) }))

  // ── Integration helpers ───────────────────────────────────────────────────────
  const handlePreview = async (intId: number) => {
    if (!doc) return
    if (previewIntId === intId) { setPreviewIntId(null); return }
    setPreviewIntId(intId); setPreviewLoading(true)
    try {
      const { data } = await integrationApi.previewExport(doc.id, intId)
      setPreviewJson(JSON.stringify(data.payload, null, 2))
    } catch { setPreviewJson('// Lỗi khi tạo preview') }
    finally { setPreviewLoading(false) }
  }

  const handleExport = async (intId: number) => {
    if (!doc) return
    setExportingId(intId)
    try {
      await integrationApi.export(doc.id, intId)
      const { data: logs } = await integrationApi.listExportLogs(doc.id)
      setExportLogs(logs)
      setLogsExpanded(true)
    } finally { setExportingId(null) }
  }

  const loadExportLogs = async () => {
    if (!doc) return
    const { data } = await integrationApi.listExportLogs(doc.id)
    setExportLogs(data)
    setLogsExpanded(true)
  }

  // ── Build lookup maps ─────────────────────────────────────────────────────────
  const fieldNameMap: Record<string, string> = {}
  docType?.fields.forEach(f => { fieldNameMap[f.field_key] = f.field_name })

  const tableMap: Record<string, { name: string; cols: Record<string, string> }> = {}
  docType?.tables.forEach(t => {
    const cols: Record<string, string> = {}
    t.columns.forEach(c => { cols[c.column_key] = c.column_name })
    tableMap[t.table_key] = { name: t.table_name, cols }
  })

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center text-gray-400 -m-6"
        style={{ height: 'calc(100vh - 56px)' }}>
        <Loader2 size={24} className="animate-spin mr-2" /> Đang tải...
      </div>
    )
  }
  if (error || !doc) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 text-gray-400 -m-6"
        style={{ height: 'calc(100vh - 56px)' }}>
        <AlertCircle size={32} />
        <p>{error || 'Không tìm thấy chứng từ'}</p>
        <button onClick={() => navigate('/ocr')} className="text-sm text-indigo-600 hover:underline">
          ← Quay lại danh sách
        </button>
      </div>
    )
  }

  const st      = STATUS_MAP[doc.status] ?? { label: doc.status, cls: 'bg-gray-100 text-gray-600', icon: null }
  const isImage = doc.mime_type?.startsWith('image/')
  const canEdit = doc.status === 'completed' || doc.status === 'confirmed'

  // Data to display: prefer editTables/editFields when in editMode
  const displayFields = editMode ? editFields : (doc.result?.extracted_fields ?? {}) as Record<string, unknown>
  const displayTables = editMode ? editTables : (doc.result?.extracted_tables ?? {}) as Record<string, Record<string, unknown>[]>

  return (
    <div className="flex flex-col -m-6" style={{ height: 'calc(100vh - 56px)' }}>

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b shrink-0">
        <button onClick={() => navigate('/ocr')}
          className="text-gray-400 hover:text-gray-700 transition-colors shrink-0">
          <ArrowLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-800 truncate">{doc.file_name}</h2>
            {doc.result?.is_manually_edited && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200
                px-1.5 py-0.5 rounded font-medium shrink-0">
                Đã chỉnh sửa
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400 mt-0.5">
            <span className="flex items-center gap-1">
              <Calendar size={11}/> {new Date(doc.created_at).toLocaleString('vi-VN')}
            </span>
            <span className="flex items-center gap-1">
              <FileText size={11}/> {docType?.name ?? `#${doc.document_type_id}`}
            </span>
            {doc.result?.processing_time_ms && (
              <span className="flex items-center gap-1">
                <Clock size={11}/> {doc.result.processing_time_ms} ms
              </span>
            )}
            {doc.confirmed_at && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 size={11}/>
                Xác nhận: {new Date(doc.confirmed_at).toLocaleString('vi-VN')}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Retry (failed) */}
          {doc.status === 'failed' && (
            <button onClick={handleRetry} disabled={retrying}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-orange-600
                border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50">
              <RefreshCw size={13} className={retrying ? 'animate-spin' : ''}/> Thử lại
            </button>
          )}

          {/* Edit / Save / Cancel (completed or confirmed) */}
          {canEdit && !editMode && (
            <button onClick={startEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-600
                border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors">
              <Pencil size={13}/> Chỉnh sửa
            </button>
          )}
          {editMode && (
            <>
              <button onClick={cancelEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600
                  border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <X size={13}/> Hủy
              </button>
              <button onClick={saveEdits} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white
                  bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
                <Save size={13}/> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </>
          )}

          {/* Confirm (completed → confirmed) */}
          {doc.status === 'completed' && !editMode && (
            <button onClick={handleConfirm} disabled={confirming}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-white
                bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium">
              <ShieldCheck size={13}/> {confirming ? 'Đang xác nhận...' : 'Xác nhận'}
            </button>
          )}

          {/* Unconfirm (confirmed → completed) */}
          {doc.status === 'confirmed' && !editMode && (
            <button onClick={handleUnconfirm} disabled={unconfirming}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600
                border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
              <ShieldOff size={13}/> {unconfirming ? '...' : 'Huỷ xác nhận'}
            </button>
          )}

          {/* Status badge */}
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${st.cls}`}>
            {st.icon} {st.label}
          </span>
        </div>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div className="shrink-0 bg-red-50 border-b border-red-200 px-5 py-2 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={14}/> {saveError}
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: file preview */}
        <div className="w-1/2 flex flex-col border-r border-gray-200 bg-gray-100 min-w-0">
          <div className="px-4 py-2 bg-white border-b text-xs font-semibold text-gray-400 uppercase tracking-wider shrink-0">
            File gốc
          </div>
          <div className="flex-1 overflow-hidden">
            {fileUrl ? (
              isImage ? (
                <div className="h-full overflow-auto flex items-start justify-center p-4">
                  <img src={fileUrl} alt={doc.file_name}
                    className="max-w-full shadow-lg rounded" />
                </div>
              ) : (
                <iframe src={fileUrl} title="Document preview" className="w-full h-full border-0"/>
              )
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                <div className="text-center">
                  <FileText size={32} className="mx-auto mb-2 opacity-40"/>
                  <p>Không thể xem trước file</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: data panel */}
        <div className="w-1/2 flex flex-col min-w-0">
          <div className="px-4 py-2 bg-white border-b text-xs font-semibold text-gray-400 uppercase tracking-wider shrink-0 flex items-center justify-between">
            <span>Kết quả trích xuất</span>
            {editMode && (
              <span className="text-indigo-500 normal-case font-normal">Đang chỉnh sửa…</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* Failed */}
            {doc.status === 'failed' && (
              <div className="p-5">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                  <strong>Lỗi xử lý:</strong> {doc.error_message || 'Không xác định'}
                </div>
              </div>
            )}

            {/* Pending / Processing */}
            {(doc.status === 'pending' || doc.status === 'processing') && (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                <Loader2 size={18} className="animate-spin mr-2"/>
                {doc.status === 'processing' ? 'Đang xử lý OCR...' : 'Đang chờ xử lý...'}
              </div>
            )}

            {/* Completed / Confirmed */}
            {(doc.status === 'completed' || doc.status === 'confirmed') && (
              <div className="p-5 space-y-6">

                {/* ── Fields ─────────────────────────────────────────────── */}
                {Object.keys(displayFields).length > 0 && (
                  <section>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Thông tin trích xuất
                    </p>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody>
                          {Object.entries(displayFields).map(([key, val], i) => (
                            <tr key={key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                              <td className="px-4 py-2 font-medium text-gray-500 w-2/5 border-r
                                border-gray-100 text-xs align-middle">
                                {fieldNameMap[key] || key}
                              </td>
                              <td className="px-3 py-1.5 align-middle">
                                {editMode ? (
                                  <input
                                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm
                                      focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                                    value={editFields[key] ?? ''}
                                    onChange={e =>
                                      setEditFields(prev => ({ ...prev, [key]: e.target.value }))
                                    }
                                  />
                                ) : (
                                  <span className="text-gray-800">
                                    {val === null || val === undefined || val === ''
                                      ? <span className="text-gray-300 italic">–</span>
                                      : String(val)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* ── Tables ─────────────────────────────────────────────── */}
                {Object.entries(displayTables).map(([tableKey, rows]) => {
                  if (!rows) return null
                  const tInfo    = tableMap[tableKey]
                  const rowsArr  = rows as Record<string, unknown>[]
                  const editRows = editMode ? (editTables[tableKey] ?? []) : rowsArr
                  const cols     = editRows.length > 0
                    ? Object.keys(editRows[0])
                    : rowsArr.length > 0 ? Object.keys(rowsArr[0]) : []
                  if (!cols.length && !editMode) return null

                  return (
                    <section key={tableKey}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        {tInfo?.name || tableKey}
                        <span className="ml-2 normal-case font-normal text-gray-300">
                          ({editMode ? editTables[tableKey]?.length ?? 0 : rowsArr.length} dòng)
                        </span>
                      </p>
                      <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="px-3 py-2 text-xs font-semibold text-gray-400 w-9">#</th>
                              {cols.map(col => (
                                <th key={col}
                                  className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                                  {tInfo?.cols[col] || col}
                                </th>
                              ))}
                              {editMode && <th className="w-9"/>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(editMode ? editTables[tableKey] ?? [] : rowsArr).map((row, ri) => (
                              <tr key={ri} className={`hover:bg-gray-50 transition-colors ${editMode ? 'group' : ''}`}>
                                <td className="px-3 py-2 text-xs text-gray-400 text-center">{ri + 1}</td>
                                {cols.map(col => (
                                  <td key={col} className="px-2 py-1.5">
                                    {editMode ? (
                                      <input
                                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs
                                          focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white min-w-[80px]"
                                        value={(row as Record<string, string>)[col] ?? ''}
                                        onChange={e => patchCell(tableKey, ri, col, e.target.value)}
                                      />
                                    ) : (
                                      <span className="text-gray-700 whitespace-nowrap">
                                        {(row as Record<string, unknown>)[col] === null
                                          || (row as Record<string, unknown>)[col] === undefined
                                          || (row as Record<string, unknown>)[col] === ''
                                          ? <span className="text-gray-300 italic">–</span>
                                          : String((row as Record<string, unknown>)[col])}
                                      </span>
                                    )}
                                  </td>
                                ))}
                                {editMode && (
                                  <td className="px-2 py-1.5 text-center">
                                    <button onClick={() => deleteRow(tableKey, ri)}
                                      className="text-gray-300 hover:text-red-500 transition-colors">
                                      <Trash2 size={13}/>
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Add row button */}
                      {editMode && (
                        <button onClick={() => addRow(tableKey)}
                          className="mt-2 flex items-center gap-1 text-xs text-indigo-500
                            hover:text-indigo-700 transition-colors font-medium">
                          <Plus size={12}/> Thêm dòng
                        </button>
                      )}
                    </section>
                  )
                })}

                {/* Empty state */}
                {Object.keys(displayFields).length === 0 &&
                  Object.keys(displayTables).length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-12">
                    <FileText size={28} className="mx-auto mb-2 opacity-40"/>
                    Không có dữ liệu trích xuất
                  </div>
                )}

                {/* Meta */}
                {doc.result?.model_used && !editMode && (
                  <div className="flex flex-wrap gap-4 text-xs text-gray-400 pt-2 border-t border-gray-100">
                    <span>Model: <strong className="text-gray-600">{doc.result.model_used}</strong></span>
                    {doc.result.processing_time_ms && (
                      <span>Thời gian: <strong className="text-gray-600">{doc.result.processing_time_ms} ms</strong></span>
                    )}
                    {doc.result.is_manually_edited && doc.result.edited_at && (
                      <span className="text-amber-600">
                        Chỉnh sửa lúc: <strong>{new Date(doc.result.edited_at).toLocaleString('vi-VN')}</strong>
                      </span>
                    )}
                  </div>
                )}

                {/* Confirm CTA banner (only when completed, not editing) */}
                {doc.status === 'completed' && !editMode && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4
                    flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Dữ liệu chờ xác nhận</p>
                      <p className="text-xs text-yellow-600 mt-0.5">
                        Kiểm tra và chỉnh sửa nếu cần, sau đó xác nhận để sẵn sàng tích hợp.
                      </p>
                    </div>
                    <button onClick={handleConfirm} disabled={confirming}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                        text-white bg-green-600 rounded-lg hover:bg-green-700
                        transition-colors disabled:opacity-50">
                      <ShieldCheck size={15}/>
                      {confirming ? 'Đang xác nhận...' : 'Xác nhận'}
                    </button>
                  </div>
                )}

                {/* Confirmed badge banner */}
                {doc.status === 'confirmed' && !editMode && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3
                    flex items-center gap-3 text-sm text-green-700">
                    <CheckCircle2 size={18} className="shrink-0"/>
                    <div>
                      <span className="font-medium">Đã xác nhận</span>
                      {doc.confirmed_at && (
                        <span className="text-green-600 ml-2 text-xs">
                          – {new Date(doc.confirmed_at).toLocaleString('vi-VN')}
                        </span>
                      )}
                      <p className="text-xs text-green-600 mt-0.5">
                        Dữ liệu sẵn sàng tích hợp với hệ thống khác.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Integration Export section ──────────────────────── */}
                {(doc.status === 'completed' || doc.status === 'confirmed') && !editMode
                  && integrations.length > 0 && (
                  <section className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Section header */}
                    <button
                      onClick={() => setIntExpanded(o => !o)}
                      className="w-full flex items-center justify-between px-4 py-3
                        bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <Link2 size={15} className="text-indigo-500"/>
                        Xuất dữ liệu tích hợp
                        <span className="text-xs font-normal text-gray-400">
                          ({integrations.length} cấu hình)
                        </span>
                      </div>
                      {intExpanded
                        ? <ChevronDown  size={15} className="text-gray-400"/>
                        : <ChevronRight size={15} className="text-gray-400"/>}
                    </button>

                    {intExpanded && (
                      <div className="divide-y divide-gray-100">
                        {integrations.map(intg => (
                          <div key={intg.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div>
                                <span className="text-sm font-medium text-gray-800">{intg.name}</span>
                                <code className="text-xs text-indigo-500 bg-indigo-50
                                  px-1.5 py-0.5 rounded ml-2">{intg.code}</code>
                                {intg.target_url && (
                                  <span className="text-xs text-gray-400 ml-2 truncate">
                                    {intg.http_method} → {intg.target_url}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => handlePreview(intg.id)}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs
                                    text-indigo-600 border border-indigo-200 rounded-lg
                                    hover:bg-indigo-50 transition-colors">
                                  <Eye size={12}/>
                                  {previewIntId === intg.id ? 'Ẩn' : 'Xem JSON'}
                                </button>
                                <button
                                  onClick={() => handleExport(intg.id)}
                                  disabled={exportingId === intg.id}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs
                                    text-white bg-indigo-600 rounded-lg hover:bg-indigo-700
                                    transition-colors disabled:opacity-50">
                                  <Send size={12}/>
                                  {exportingId === intg.id ? 'Đang gửi...' : 'Gửi'}
                                </button>
                              </div>
                            </div>

                            {/* JSON preview */}
                            {previewIntId === intg.id && (
                              <div className="mt-2">
                                {previewLoading ? (
                                  <p className="text-xs text-gray-400 py-2">Đang tạo preview...</p>
                                ) : (
                                  <pre className="bg-gray-900 text-green-300 text-xs rounded-lg
                                    p-3 overflow-auto max-h-48 font-mono leading-relaxed">
                                    {previewJson}
                                  </pre>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Export logs */}
                        <div className="px-4 py-2 bg-gray-50">
                          <button
                            onClick={logsExpanded ? () => setLogsExpanded(false) : loadExportLogs}
                            className="text-xs text-gray-500 hover:text-gray-700 transition-colors
                              flex items-center gap-1">
                            {logsExpanded ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                            Lịch sử xuất ({exportLogs.length})
                          </button>
                          {logsExpanded && exportLogs.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {exportLogs.slice(0, 5).map(log => (
                                <div key={log.id}
                                  className="flex items-center gap-3 text-xs text-gray-500">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0
                                    ${log.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`}/>
                                  <span>{new Date(log.exported_at).toLocaleString('vi-VN')}</span>
                                  <span className="text-gray-400">
                                    {log.status === 'success'
                                      ? `HTTP ${log.response_status ?? '–'}`
                                      : log.error_message?.slice(0, 60)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
