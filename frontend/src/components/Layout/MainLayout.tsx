import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  Building2, FileText, ScanLine, LogOut,
  ChevronLeft, Menu, ChevronDown, ChevronRight, Folder,
  Users, ShieldCheck, Receipt, Settings, CheckCircle2,
} from 'lucide-react'
import { docTypeApi } from '../../api/documentTypes'
import type { DocumentCategory, DocumentType } from '../../types'

// ── DocType link: handles active state with query param ───────────────────────
function DocTypeLink({ dt }: { dt: DocumentType }) {
  const location    = useLocation()
  const [sp]        = useSearchParams()
  const isActive    = location.pathname === '/ocr' &&
                      sp.get('document_type_id') === String(dt.id)
  return (
    <Link
      to={`/ocr?document_type_id=${dt.id}`}
      className={`flex items-center gap-2 py-1.5 px-2 rounded text-xs transition-colors truncate
        ${isActive
          ? 'bg-indigo-50 text-indigo-600 font-semibold'
          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}
    >
      <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
      <span className="truncate">{dt.name}</span>
    </Link>
  )
}

// ── Nav link helper ───────────────────────────────────────────────────────────
function SideNavLink({
  to, icon, label, collapsed,
}: {
  to: string
  icon: React.ReactNode
  label: string
  collapsed: boolean
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
        ${isActive ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`
      }
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span>{label}</span>}
    </NavLink>
  )
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function MainLayout() {
  const { user, logout } = useAuth()
  const location         = useLocation()

  const [collapsed,      setCollapsed]      = useState(false)
  const [ocrOpen,        setOcrOpen]        = useState(false)
  const [invoiceOpen,    setInvoiceOpen]    = useState(false)
  const [openCats,       setOpenCats]       = useState<Set<number>>(new Set())
  const [categories,  setCategories]  = useState<DocumentCategory[]>([])
  const [docTypes,    setDocTypes]    = useState<DocumentType[]>([])

  // Auto-expand trees based on current path
  useEffect(() => {
    if (location.pathname.startsWith('/ocr'))              setOcrOpen(true)
    if (location.pathname.startsWith('/purchase-invoices')) setInvoiceOpen(true)
  }, [location.pathname])

  // Load categories + doc types once
  useEffect(() => {
    const load = async () => {
      try {
        const [catRes, dtRes] = await Promise.all([
          docTypeApi.listCategories(),
          docTypeApi.list(),
        ])
        setCategories(catRes.data)
        setDocTypes(dtRes.data)
        // Auto-open all categories by default
        setOpenCats(new Set(catRes.data.map(c => c.id)))
      } catch { /* non-critical */ }
    }
    load()
  }, [])

  const toggleCat = (id: number) =>
    setOpenCats(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const isOcrActive     = location.pathname.startsWith('/ocr')
  const isInvoiceActive = location.pathname.startsWith('/purchase-invoices')

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-200
        ${collapsed ? 'w-16' : 'w-60'}`}>

        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 shrink-0">
          {!collapsed && (
            <span className="font-bold text-indigo-600 text-sm tracking-wide truncate">
              FOXAI NATIVE
            </span>
          )}
          <button onClick={() => setCollapsed(!collapsed)}
            className="text-gray-400 hover:text-gray-600 shrink-0">
            {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto space-y-0.5">

          {/* Cơ cấu tổ chức */}
          <SideNavLink to="/organizations" icon={<Building2 size={18} />} label="Cơ cấu tổ chức" collapsed={collapsed} />

          {/* Loại chứng từ */}
          <SideNavLink to="/document-types" icon={<FileText size={18} />} label="Loại chứng từ" collapsed={collapsed} />

          {/* ── Xử lý OCR – expandable ─────────────────────────────────── */}
          <div>
            <button
              onClick={() => !collapsed && setOcrOpen(o => !o)}
              className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors
                ${isOcrActive
                  ? 'bg-indigo-50 text-indigo-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <ScanLine size={18} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Xử lý OCR</span>
                  {ocrOpen
                    ? <ChevronDown  size={14} className="opacity-60" />
                    : <ChevronRight size={14} className="opacity-60" />}
                </>
              )}
            </button>

            {/* Sub-tree: only shown when sidebar is expanded */}
            {!collapsed && ocrOpen && (
              <div className="mt-1 ml-7 space-y-0.5 border-l border-gray-100 pl-2">

                {/* All docs link */}
                <NavLink
                  to="/ocr"
                  end
                  className={({ isActive }) => {
                    const loc  = location
                    const sp   = new URLSearchParams(loc.search)
                    const all  = loc.pathname === '/ocr' && !sp.get('document_type_id')
                    return `flex items-center gap-2 py-1.5 px-2 rounded text-xs transition-colors
                      ${(isActive && all)
                        ? 'bg-indigo-50 text-indigo-600 font-semibold'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`
                  }}
                >
                  <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
                  Tất cả
                </NavLink>

                {/* Categories + doc types */}
                {categories.map(cat => {
                  const catDts = docTypes.filter(d => d.category_id === cat.id)
                  if (!catDts.length) return null
                  return (
                    <div key={cat.id}>
                      <button
                        onClick={() => toggleCat(cat.id)}
                        className="flex items-center gap-1.5 w-full py-1.5 px-2 rounded text-xs text-gray-500
                          hover:text-gray-800 hover:bg-gray-50 transition-colors"
                      >
                        <Folder size={12} className="shrink-0 text-indigo-300" />
                        <span className="flex-1 text-left font-medium truncate">{cat.name}</span>
                        {openCats.has(cat.id)
                          ? <ChevronDown  size={11} className="opacity-50 shrink-0" />
                          : <ChevronRight size={11} className="opacity-50 shrink-0" />}
                      </button>
                      {openCats.has(cat.id) && (
                        <div className="ml-3 space-y-0.5">
                          {catDts.map(dt => (
                            <DocTypeLink key={dt.id} dt={dt} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Xử lý hóa đơn đầu vào – expandable ──────────────────── */}
          <div>
            <button
              onClick={() => !collapsed && setInvoiceOpen(o => !o)}
              className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors
                ${isInvoiceActive
                  ? 'bg-indigo-50 text-indigo-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Receipt size={18} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Xử lý HĐ đầu vào</span>
                  {invoiceOpen
                    ? <ChevronDown  size={14} className="opacity-60" />
                    : <ChevronRight size={14} className="opacity-60" />}
                </>
              )}
            </button>

            {!collapsed && invoiceOpen && (
              <div className="mt-1 ml-7 space-y-0.5 border-l border-gray-100 pl-2">
                <NavLink
                  to="/purchase-invoices"
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-2 py-1.5 px-2 rounded text-xs transition-colors
                    ${isActive
                      ? 'bg-indigo-50 text-indigo-600 font-semibold'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`
                  }
                >
                  <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
                  Danh sách hóa đơn TCT
                </NavLink>
                <NavLink
                  to="/purchase-invoices/saved"
                  className={({ isActive }) =>
                    `flex items-center gap-2 py-1.5 px-2 rounded text-xs transition-colors
                    ${isActive
                      ? 'bg-green-50 text-green-600 font-semibold'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`
                  }
                >
                  <CheckCircle2 size={10} className="shrink-0 opacity-70" />
                  Danh sách đã xử lý
                </NavLink>
              </div>
            )}
          </div>

          {/* Divider – Quản trị hệ thống */}
          {!collapsed && (
            <div className="px-3 pt-3 pb-1">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Quản trị hệ thống
              </div>
            </div>
          )}
          {collapsed && <div className="my-1 border-t border-gray-100" />}

          {/* Thiết lập HĐ đầu vào */}
          <SideNavLink
            to="/purchase-invoice-settings"
            icon={<Settings size={18} />}
            label="Thiết lập HĐ đầu vào"
            collapsed={collapsed}
          />

          {/* Người dùng */}
          <SideNavLink to="/users" icon={<Users size={18} />} label="Người dùng" collapsed={collapsed} />

          {/* Vai trò & Quyền */}
          <SideNavLink to="/roles" icon={<ShieldCheck size={18} />} label="Vai trò & Quyền" collapsed={collapsed} />

        </nav>

        {/* User / Logout */}
        <div className="px-2 pb-4 shrink-0">
          {!collapsed && (
            <div className="px-3 py-2 mb-1 text-xs text-gray-500 truncate">
              {user?.full_name || user?.username}
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-600
              hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Đăng xuất</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <span className="text-sm text-gray-500">
            Xin chào,{' '}
            <span className="font-medium text-gray-700">{user?.full_name || user?.username}</span>
          </span>
          <span className="text-xs font-semibold text-gray-400 tracking-widest uppercase">
            YOUR TRUSTED PARTNER
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
