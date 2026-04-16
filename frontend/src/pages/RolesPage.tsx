import React, { useEffect, useState } from 'react'
import {
  Shield, Plus, Pencil, Trash2, X, Check, KeyRound,
  Copy, AlertCircle,
} from 'lucide-react'
import { rolesApi } from '../api/roles'
import { apiTokensApi } from '../api/apiTokens'
import type { SystemRole, Permission, APITokenListItem, APITokenCreated } from '../types'

// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR_OPTIONS = [
  { value: 'indigo', label: 'Indigo', cls: 'bg-indigo-500' },
  { value: 'blue',   label: 'Blue',   cls: 'bg-blue-500'   },
  { value: 'green',  label: 'Green',  cls: 'bg-green-500'  },
  { value: 'red',    label: 'Red',    cls: 'bg-red-500'    },
  { value: 'amber',  label: 'Amber',  cls: 'bg-amber-500'  },
  { value: 'purple', label: 'Purple', cls: 'bg-purple-500' },
  { value: 'gray',   label: 'Gray',   cls: 'bg-gray-400'   },
]

const ROLE_BADGE: Record<string, string> = {
  red:    'bg-red-100    text-red-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  blue:   'bg-blue-100   text-blue-700',
  green:  'bg-green-100  text-green-700',
  gray:   'bg-gray-100   text-gray-600',
  amber:  'bg-amber-100  text-amber-700',
  purple: 'bg-purple-100 text-purple-700',
}

// ── Role modal (create / edit) ────────────────────────────────────────────────
function RoleModal({
  editData, allPermissions, onClose, onSaved,
}: {
  editData: SystemRole | null
  allPermissions: Permission[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!editData

  const [name,        setName]        = useState(editData?.name ?? '')
  const [displayName, setDisplayName] = useState(editData?.display_name ?? '')
  const [description, setDescription] = useState(editData?.description ?? '')
  const [color,       setColor]       = useState(editData?.color ?? 'indigo')
  const [selected,    setSelected]    = useState<Set<number>>(
    new Set(editData?.permissions.map(p => p.id) ?? [])
  )
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState('')

  // Group permissions by category
  const grouped = allPermissions.reduce<Record<string, Permission[]>>((acc, p) => {
    ;(acc[p.category] ??= []).push(p)
    return acc
  }, {})

  const togglePerm = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleCategory = (perms: Permission[]) => {
    const ids = perms.map(p => p.id)
    const allOn = ids.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      allOn ? ids.forEach(id => next.delete(id)) : ids.forEach(id => next.add(id))
      return next
    })
  }

  const handleSave = async () => {
    if (!displayName.trim()) { setError('Vui lòng nhập tên hiển thị'); return }
    if (!isEdit && !name.trim()) { setError('Vui lòng nhập tên vai trò'); return }

    setSaving(true); setError('')
    try {
      if (isEdit) {
        await rolesApi.update(editData!.id, {
          display_name:   displayName,
          description:    description || undefined,
          color,
          permission_ids: [...selected],
        })
      } else {
        await rolesApi.create({
          name,
          display_name:   displayName,
          description:    description || undefined,
          color,
          permission_ids: [...selected],
        })
      }
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Lưu thất bại')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h3 className="font-semibold text-gray-800">
            {isEdit ? `Chỉnh sửa: ${editData!.display_name}` : 'Tạo vai trò mới'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle size={15} />{error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {!isEdit && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Tên vai trò (slug) <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value.replace(/\s/g, '_').toLowerCase())}
                  placeholder="vd: content_editor"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
            )}
            <div className={isEdit ? 'col-span-2' : ''}>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                Tên hiển thị <span className="text-red-500">*</span>
              </label>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="vd: Biên tập viên"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mô tả</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none
                focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Màu nhãn</label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-7 h-7 rounded-full ${c.cls} transition-transform
                    ${color === c.value ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Permissions matrix */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">Phân quyền</label>
              <span className="text-xs text-gray-400">{selected.size} / {allPermissions.length} quyền</span>
            </div>
            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
              {Object.entries(grouped).map(([cat, perms]) => {
                const allOn = perms.every(p => selected.has(p.id))
                const someOn = perms.some(p => selected.has(p.id))
                return (
                  <div key={cat}>
                    {/* Category header */}
                    <button
                      onClick={() => toggleCategory(perms)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50
                        hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-700">{cat}</span>
                      <span className={`w-4 h-4 rounded flex items-center justify-center border text-xs
                        ${allOn
                          ? 'bg-indigo-500 border-indigo-500 text-white'
                          : someOn
                            ? 'bg-indigo-100 border-indigo-400 text-indigo-600'
                            : 'border-gray-300 text-transparent'}`}>
                        {(allOn || someOn) && <Check size={11} />}
                      </span>
                    </button>
                    {/* Permission rows */}
                    <div className="grid grid-cols-2 gap-0 divide-y divide-gray-50">
                      {perms.map(p => (
                        <label key={p.id}
                          className="flex items-start gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => togglePerm(p.id)}
                            className="mt-0.5 accent-indigo-600"
                          />
                          <div>
                            <div className="text-sm text-gray-800">{p.name}</div>
                            <div className="text-xs text-gray-400 font-mono">{p.code}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl shrink-0">
          <button onClick={onClose} className="btn-secondary">Hủy</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo vai trò'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── API Token panel ────────────────────────────────────────────────────────────
function APITokenPanel() {
  const [tokens,    setTokens]    = useState<APITokenListItem[]>([])
  const [loading,   setLoading]   = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [newName,   setNewName]   = useState('')
  const [newToken,  setNewToken]  = useState<APITokenCreated | null>(null)
  const [copied,    setCopied]    = useState(false)
  const [showForm,  setShowForm]  = useState(false)

  const load = async () => {
    setLoading(true)
    try { setTokens((await apiTokensApi.list()).data) }
    catch { /* silently ignore – user may not have tokens */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await apiTokensApi.create({ name: newName })
      setNewToken(res.data)
      setNewName(''); setShowForm(false)
      load()
    } finally { setCreating(false) }
  }

  const handleRevoke = async (id: number) => {
    if (!confirm('Thu hồi token này?')) return
    await apiTokensApi.revoke(id)
    load()
  }

  const copyToken = () => {
    if (!newToken) return
    navigator.clipboard.writeText(newToken.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-indigo-500" />
          <span className="font-semibold text-gray-700">API Token tích hợp</span>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          <Plus size={15} /> Tạo token mới
        </button>
      </div>

      {/* New token alert */}
      {newToken && (
        <div className="mx-5 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              Sao chép token ngay — sẽ không thể xem lại sau khi đóng!
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-amber-200 rounded px-3 py-2
              font-mono text-gray-800 truncate select-all">
              {newToken.token}
            </code>
            <button
              onClick={copyToken}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${copied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
            >
              {copied ? <><Check size={14} /> Đã chép</> : <><Copy size={14} /> Sao chép</>}
            </button>
            <button onClick={() => setNewToken(null)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
          <input
            type="text"
            placeholder="Tên token (vd: SAP Integration)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button onClick={handleCreate} disabled={!newName.trim() || creating}
            className="btn-primary disabled:opacity-50">
            {creating ? 'Đang tạo...' : 'Tạo'}
          </button>
          <button onClick={() => setShowForm(false)} className="btn-secondary">Hủy</button>
        </div>
      )}

      {/* Token list */}
      {loading ? (
        <div className="flex items-center justify-center h-24 text-gray-400">Đang tải...</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              {['Tên', 'Token prefix', 'Lần dùng cuối', 'Hết hạn', 'Trạng thái', ''].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tokens.map(t => (
              <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                <td className="table-td font-medium text-gray-800">{t.name}</td>
                <td className="table-td font-mono text-xs text-gray-500">{t.token_prefix}</td>
                <td className="table-td text-xs text-gray-500">
                  {t.last_used_at
                    ? new Date(t.last_used_at).toLocaleString('vi-VN')
                    : 'Chưa dùng'}
                </td>
                <td className="table-td text-xs text-gray-500">
                  {t.expires_at
                    ? new Date(t.expires_at).toLocaleDateString('vi-VN')
                    : 'Không giới hạn'}
                </td>
                <td className="table-td">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                    ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${t.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {t.is_active ? 'Hoạt động' : 'Đã thu hồi'}
                  </span>
                </td>
                <td className="table-td">
                  {t.is_active && (
                    <button onClick={() => handleRevoke(t.id)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                      title="Thu hồi token">
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!tokens.length && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400">
                  Chưa có API token nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* Usage hint */}
      <div className="px-5 py-3 border-t bg-gray-50 rounded-b-xl">
        <p className="text-xs text-gray-500">
          Dùng token này như Bearer token trong header{' '}
          <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-700">Authorization: Bearer oct_…</code>
          {' '}để gọi API từ hệ thống ngoài.
        </p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RolesPage() {
  const [roles,      setRoles]      = useState<SystemRole[]>([])
  const [allPerms,   setAllPerms]   = useState<Permission[]>([])
  const [loading,    setLoading]    = useState(true)
  const [pageError,  setPageError]  = useState('')
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editItem,   setEditItem]   = useState<SystemRole | null>(null)
  const [expanded,   setExpanded]   = useState<number | null>(null)

  const load = async () => {
    setLoading(true); setPageError('')
    try {
      const [rRes, pRes] = await Promise.all([rolesApi.list(), rolesApi.listPermissions()])
      setRoles(rRes.data)
      setAllPerms(pRes.data)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setPageError(status === 403
        ? 'Bạn không có quyền xem danh sách vai trò.'
        : 'Không thể tải dữ liệu vai trò. Vui lòng thử lại.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (role: SystemRole) => {
    if (role.is_system) { alert('Không thể xoá vai trò hệ thống'); return }
    if (!confirm(`Xoá vai trò "${role.display_name}"?`)) return
    await rolesApi.delete(role.id)
    load()
  }

  const openCreate = () => { setEditItem(null); setModalOpen(true) }
  const openEdit   = (r: SystemRole) => { setEditItem(r); setModalOpen(true) }

  // Group permissions by category for expanded view
  const grouped = (perms: Permission[]) =>
    perms.reduce<Record<string, Permission[]>>((acc, p) => {
      ;(acc[p.category] ??= []).push(p)
      return acc
    }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield size={22} className="text-indigo-500" />
        <h1 className="text-xl font-bold text-gray-800">Quản lý vai trò & quyền</h1>
      </div>

      {/* ── Roles table ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <span className="font-semibold text-gray-700">Danh sách vai trò</span>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> Tạo vai trò mới
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Đang tải...</div>
        ) : pageError ? (
          <div className="flex items-center gap-3 px-5 py-8 text-sm text-amber-700 bg-amber-50">
            <AlertCircle size={18} className="shrink-0" />
            <span>{pageError}</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {roles.map(role => {
              const isOpen = expanded === role.id
              const badgeCls = ROLE_BADGE[role.color] ?? ROLE_BADGE.gray
              const grp = grouped(role.permissions)

              return (
                <div key={role.id}>
                  {/* Role row */}
                  <div
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpanded(isOpen ? null : role.id)}
                  >
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badgeCls}`}>
                      {role.display_name}
                    </span>
                    {role.is_system && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">hệ thống</span>
                    )}
                    <span className="text-sm text-gray-500 flex-1">{role.description || '—'}</span>
                    <span className="text-xs text-gray-400">{role.permissions.length} quyền</span>
                    {!role.is_system && (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(role)}
                          className="text-indigo-400 hover:text-indigo-600 p-1 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(role)}
                          className="text-red-400 hover:text-red-600 p-1 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                    {role.is_system && (
                      <button onClick={e => { e.stopPropagation(); openEdit(role) }}
                        className="text-indigo-400 hover:text-indigo-600 p-1 transition-colors">
                        <Pencil size={14} />
                      </button>
                    )}
                    <span className="text-gray-400 ml-1">
                      {isOpen
                        ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      }
                    </span>
                  </div>

                  {/* Permission breakdown */}
                  {isOpen && (
                    <div className="bg-gray-50 px-5 py-4 border-t border-gray-100">
                      {role.permissions.length === 0 ? (
                        <p className="text-sm text-gray-400">Vai trò này chưa có quyền nào</p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {Object.entries(grp).map(([cat, perms]) => (
                            <div key={cat}>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">{cat}</div>
                              <div className="space-y-1">
                                {perms.map(p => (
                                  <div key={p.id}
                                    className="flex items-center gap-1.5 text-xs text-gray-700">
                                    <Check size={11} className="text-green-500 shrink-0" />
                                    {p.name}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── API Tokens ────────────────────────────────────────────────────────── */}
      <APITokenPanel />

      {/* ── Modal ─────────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <RoleModal
          editData={editItem}
          allPermissions={allPerms}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }}
        />
      )}
    </div>
  )
}
