import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Maximize2, X, Search } from 'lucide-react'
import { orgApi } from '../api/organizations'
import type { Organization } from '../types'
import OrgModal from '../components/Organization/OrgModal'
import OrgTree from '../components/OrgTree'
import Pagination from '../components/Pagination'

function flattenTree(nodes: Organization[]): Organization[] {
  const result: Organization[] = []
  const walk = (list: Organization[]) =>
    list.forEach(n => { result.push(n); if (n.children) walk(n.children) })
  walk(nodes)
  return result
}

export default function OrganizationsPage() {
  const [tree,      setTree]      = useState<Organization[]>([])
  const [flat,      setFlat]      = useState<Organization[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem,  setEditItem]  = useState<Organization | null>(null)
  const [expanded,  setExpanded]  = useState(false)

  // ── Filter & pagination state ─────────────────────────────────────────────
  const [search,   setSearch]   = useState('')
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    try {
      const [treeRes, flatRes] = await Promise.all([orgApi.tree(), orgApi.list()])
      setTree(treeRes.data)
      setFlat(flatRes.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // ── Client-side filter + pagination ──────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return flat
    const q = search.toLowerCase()
    return flat.filter(o =>
      o.name.toLowerCase().includes(q)       ||
      o.code.toLowerCase().includes(q)       ||
      (o.group_name ?? '').toLowerCase().includes(q) ||
      (o.manager_name ?? '').toLowerCase().includes(q)
    )
  }, [flat, search])

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1) }, [search])

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm('Vô hiệu hoá đơn vị này?')) return
    await orgApi.delete(id)
    load()
  }

  const openCreate = () => { setEditItem(null); setModalOpen(true) }
  const openEdit   = (org: Organization) => { setEditItem(org); setModalOpen(true) }

  const parentName = (org: Organization) =>
    flat.find(o => o.id === org.parent_id)?.name ?? '—'

  return (
    <div className="h-full flex flex-col gap-0">
      <h1 className="text-xl font-bold text-gray-800 mb-4">Cơ cấu tổ chức</h1>

      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── Left: Table ─────────────────────────────────────────────────── */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col min-h-0">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold text-gray-700">Danh sách phòng ban</h2>
            <button onClick={openCreate} className="btn-primary">
              <Plus size={16} /> Thêm mới
            </button>
          </div>

          {/* Search bar */}
          <div className="px-5 py-3 border-b">
            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm theo tên, mã, nhóm..."
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
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-gray-400">Đang tải...</div>
            ) : (
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr>
                    {['STT', 'Mã PB', 'Tên phòng ban', 'Nhóm', 'Người phụ trách', 'Bộ phận quản lý', ''].map(h => (
                      <th key={h} className="table-th whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((org, idx) => (
                    <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td text-gray-400 w-10">
                        {(page - 1) * pageSize + idx + 1}
                      </td>
                      <td className="table-td">
                        <span className="text-indigo-600 font-medium">{org.code}</span>
                      </td>
                      <td className="table-td font-medium text-gray-800">{org.name}</td>
                      <td className="table-td text-gray-500 text-sm">{org.group_name ?? '—'}</td>
                      <td className="table-td text-sm">{org.manager_name ?? '—'}</td>
                      <td className="table-td italic text-gray-400 text-sm">{parentName(org)}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(org)}
                            className="text-indigo-400 hover:text-indigo-600 transition-colors">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => handleDelete(org.id)}
                            className="text-red-400 hover:text-red-600 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-400">
                        {search ? 'Không tìm thấy đơn vị phù hợp' : 'Chưa có đơn vị nào'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <Pagination
              total={filtered.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={ps => { setPageSize(ps); setPage(1) }}
            />
          )}
        </div>

        {/* ── Right: Tree diagram ──────────────────────────────────────────── */}
        <div className="w-96 bg-white rounded-xl border border-gray-200 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
            <h2 className="font-semibold text-gray-700">Sơ đồ tổ chức</h2>
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600
                border border-gray-200 rounded px-2 py-1 transition-colors">
              <Maximize2 size={13} /> Mở rộng
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <OrgTree nodes={tree} />
          </div>
        </div>
      </div>

      {/* ── Expanded tree modal ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl w-full max-w-6xl h-full max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h3 className="font-semibold text-gray-800">Sơ đồ tổ chức</h3>
              <button onClick={() => setExpanded(false)}
                className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <OrgTree nodes={tree} />
            </div>
          </div>
        </div>
      )}

      <OrgModal
        open={modalOpen}
        editData={editItem}
        allOrgs={flat}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); load() }}
      />
    </div>
  )
}
