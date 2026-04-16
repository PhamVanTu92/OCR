import React, { useEffect, useMemo, useState } from 'react'
import {
  Users, Search, X, Shield, Building2,
  ToggleLeft, ToggleRight, Plus, Trash2, AlertCircle,
} from 'lucide-react'
import { usersApi } from '../api/users'
import { rolesApi } from '../api/roles'
import { orgApi } from '../api/organizations'
import type { UserDetail, SystemRole, Organization } from '../types'
import Pagination from '../components/Pagination'

// ── Color helpers ─────────────────────────────────────────────────────────────
const ROLE_COLOR: Record<string, string> = {
  red:    'bg-red-100 text-red-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  gray:   'bg-gray-100 text-gray-600',
  amber:  'bg-amber-100 text-amber-700',
  purple: 'bg-purple-100 text-purple-700',
}
const roleCls = (color: string) => ROLE_COLOR[color] ?? ROLE_COLOR.gray

// ── User detail drawer ─────────────────────────────────────────────────────────
function UserDrawer({
  user, allRoles, allOrgs, onClose, onRefresh,
}: {
  user: UserDetail
  allRoles: SystemRole[]
  allOrgs: Organization[]
  onClose: () => void
  onRefresh: () => void
}) {
  const [tab,        setTab]        = useState<'roles' | 'orgs'>('roles')
  const [saving,     setSaving]     = useState(false)
  const [saveErr,    setSaveErr]    = useState('')
  const [fullName,   setFullName]   = useState(user.full_name ?? '')
  const [isActive,   setIsActive]   = useState(user.is_active)
  const [userOrgs,   setUserOrgs]   = useState<{
    organization_id: number
    organization_name: string
    organization_code: string
    role: string
    is_primary: boolean
  }[]>([])

  const [selRoleId,  setSelRoleId]  = useState<number | ''>('')
  const [selOrgId,   setSelOrgId]   = useState<number | ''>('')
  const [selOrgRole, setSelOrgRole] = useState('member')

  useEffect(() => {
    usersApi.getOrgs(user.id).then(r => setUserOrgs(r.data)).catch(() => {})
  }, [user.id])

  const saveInfo = async () => {
    setSaving(true); setSaveErr('')
    try {
      await usersApi.update(user.id, { full_name: fullName || undefined, is_active: isActive })
      onRefresh()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSaveErr(msg || 'Lưu thất bại')
    } finally { setSaving(false) }
  }

  const assignRole = async () => {
    if (!selRoleId) return
    try {
      await usersApi.assignRole(user.id, Number(selRoleId))
      setSelRoleId('')
      onRefresh()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg || 'Lỗi khi gán vai trò')
    }
  }

  const removeRole = async (roleId: number) => {
    try {
      await usersApi.removeRole(user.id, roleId)
      onRefresh()
    } catch { alert('Lỗi khi thu hồi vai trò') }
  }

  const assignOrg = async () => {
    if (!selOrgId) return
    try {
      await usersApi.assignOrg(user.id, { organization_id: Number(selOrgId), role: selOrgRole })
      const r = await usersApi.getOrgs(user.id)
      setUserOrgs(r.data)
      setSelOrgId('')
      onRefresh()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg || 'Lỗi khi phân bổ đơn vị')
    }
  }

  const removeOrg = async (orgId: number) => {
    try {
      await usersApi.removeOrg(user.id, orgId)
      const r = await usersApi.getOrgs(user.id)
      setUserOrgs(r.data)
      onRefresh()
    } catch { alert('Lỗi khi xoá khỏi đơn vị') }
  }

  const availableRoles = allRoles.filter(r => !user.roles.some(ur => ur.id === r.id))
  const availableOrgs  = allOrgs.filter(o => !userOrgs.some(uo => uo.organization_id === o.id))

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white h-full flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <div className="font-semibold text-gray-800">{user.full_name || user.username}</div>
            <div className="text-xs text-gray-400">{user.email}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Basic info */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">Thông tin cơ bản</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Họ và tên</label>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Trạng thái tài khoản</span>
              <button onClick={() => setIsActive(v => !v)}>
                {isActive
                  ? <ToggleRight size={28} className="text-green-500" />
                  : <ToggleLeft  size={28} className="text-gray-400" />}
              </button>
            </div>
            {saveErr && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{saveErr}</p>
            )}
            <button
              onClick={saveInfo}
              disabled={saving}
              className="btn-primary w-full disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b flex gap-0">
            {[
              { key: 'roles', icon: <Shield size={14} />,    label: 'Vai trò' },
              { key: 'orgs',  icon: <Building2 size={14} />, label: 'Đơn vị'  },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as 'roles' | 'orgs')}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors
                  ${tab === t.key
                    ? 'border-indigo-500 text-indigo-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Roles tab */}
          {tab === 'roles' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 min-h-[28px]">
                {user.roles.length === 0 && (
                  <span className="text-sm text-gray-400">Chưa có vai trò nào</span>
                )}
                {user.roles.map(r => (
                  <span key={r.id}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${roleCls(r.color)}`}>
                    {r.display_name}
                    <button onClick={() => removeRole(r.id)} className="hover:opacity-70">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              {availableRoles.length > 0 && (
                <div className="flex gap-2">
                  <select
                    value={selRoleId}
                    onChange={e => setSelRoleId(Number(e.target.value))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Chọn vai trò --</option>
                    {availableRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.display_name}</option>
                    ))}
                  </select>
                  <button onClick={assignRole} disabled={!selRoleId}
                    className="btn-primary disabled:opacity-50">
                    <Plus size={15} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Orgs tab */}
          {tab === 'orgs' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                {userOrgs.length === 0 && (
                  <span className="text-sm text-gray-400">Chưa thuộc đơn vị nào</span>
                )}
                {userOrgs.map(uo => (
                  <div key={uo.organization_id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{uo.organization_name}</div>
                      <div className="text-xs text-gray-400">{uo.organization_code} · {uo.role}</div>
                    </div>
                    <button onClick={() => removeOrg(uo.organization_id)}
                      className="text-red-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              {availableOrgs.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <select
                    value={selOrgId}
                    onChange={e => setSelOrgId(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Chọn đơn vị --</option>
                    {availableOrgs.map(o => (
                      <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <select
                      value={selOrgRole}
                      onChange={e => setSelOrgRole(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="manager">Quản lý</option>
                      <option value="member">Thành viên</option>
                      <option value="viewer">Chỉ xem</option>
                    </select>
                    <button onClick={assignOrg} disabled={!selOrgId}
                      className="btn-primary disabled:opacity-50">
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users,        setUsers]        = useState<UserDetail[]>([])
  const [allRoles,     setAllRoles]     = useState<SystemRole[]>([])
  const [allOrgs,      setAllOrgs]      = useState<Organization[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')

  const [search,       setSearch]       = useState('')
  const [filterActive, setFilterActive] = useState<'' | 'true' | 'false'>('')
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(20)

  const [selected, setSelected] = useState<UserDetail | null>(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [uRes, rRes, oRes] = await Promise.all([
        usersApi.list({
          search:    search   || undefined,
          is_active: filterActive === '' ? undefined : filterActive === 'true',
          limit: 500,
        }),
        rolesApi.list(),
        orgApi.list(),
      ])
      setUsers(uRes.data)
      setAllRoles(rRes.data)
      setAllOrgs(oRes.data)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      if (status === 403) {
        setError('Bạn không có quyền xem danh sách người dùng.')
      } else {
        setError('Không thể tải dữ liệu. Vui lòng thử lại.')
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Run fresh load when filters change (after mount)
  const isFirstRender = React.useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setPage(1)
    load()
  }, [search, filterActive])

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize
    return users.slice(start, start + pageSize)
  }, [users, page, pageSize])

  const refreshSelected = async () => {
    await load()
    if (selected) {
      try {
        const r = await usersApi.get(selected.id)
        setSelected(r.data)
      } catch { /* non-critical */ }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Users size={22} className="text-indigo-500" />
        <h1 className="text-xl font-bold text-gray-800">Quản lý người dùng</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {/* Filter bar */}
        <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm tên, email, username..."
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

          <select
            value={filterActive}
            onChange={e => setFilterActive(e.target.value as '' | 'true' | 'false')}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700
              focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Đã vô hiệu hoá</option>
          </select>

          {!loading && !error && (
            <span className="ml-auto text-xs text-gray-400">{users.length} người dùng</span>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 px-5 py-8 text-sm text-amber-700 bg-amber-50">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading / Table */}
        {!error && (
          loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Đang tải...</div>
          ) : (
            <>
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr>
                    {['STT', 'Tên đăng nhập', 'Họ và tên', 'Email', 'Vai trò', 'Trạng thái', ''].map(h => (
                      <th key={h} className="table-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((u, idx) => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td text-gray-400 w-10">{(page - 1) * pageSize + idx + 1}</td>
                      <td className="table-td font-medium text-indigo-600">{u.username}</td>
                      <td className="table-td text-gray-800">{u.full_name || '—'}</td>
                      <td className="table-td text-gray-500 text-sm">{u.email}</td>
                      <td className="table-td">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0
                            ? <span className="text-xs text-gray-400">—</span>
                            : u.roles.map(r => (
                              <span key={r.id}
                                className={`px-1.5 py-0.5 rounded text-xs font-medium ${roleCls(r.color)}`}>
                                {r.display_name}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="table-td">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                          ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full
                            ${u.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {u.is_active ? 'Hoạt động' : 'Vô hiệu'}
                        </span>
                      </td>
                      <td className="table-td">
                        <button
                          onClick={() => setSelected(u)}
                          className="text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200
                            hover:border-indigo-400 rounded px-2 py-1 transition-colors"
                        >
                          Quản lý
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!users.length && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-400">
                        {search ? 'Không tìm thấy người dùng' : 'Chưa có người dùng nào'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {users.length > 0 && (
                <Pagination
                  total={users.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={ps => { setPageSize(ps); setPage(1) }}
                />
              )}
            </>
          )
        )}
      </div>

      {selected && (
        <UserDrawer
          user={selected}
          allRoles={allRoles}
          allOrgs={allOrgs}
          onClose={() => setSelected(null)}
          onRefresh={refreshSelected}
        />
      )}
    </div>
  )
}
