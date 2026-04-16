import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { orgApi } from '../../api/organizations'
import type { Organization } from '../../types'

interface Props {
  open: boolean
  editData?: Organization | null
  allOrgs: Organization[]
  onClose: () => void
  onSaved: () => void
}

const GROUPS = ['Ban Lãnh đạo', 'Kỹ thuật', 'Hành chính', 'Kinh doanh', 'Tài chính', 'Nhân sự', 'Khác']

export default function OrgModal({ open, editData, allOrgs, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: '', code: '', group_name: '', manager_name: '', parent_id: '' as string | number, description: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (editData) {
      setForm({
        name: editData.name,
        code: editData.code,
        group_name: editData.group_name ?? '',
        manager_name: editData.manager_name ?? '',
        parent_id: editData.parent_id ?? '',
        description: editData.description ?? '',
      })
    } else {
      setForm({ name: '', code: '', group_name: '', manager_name: '', parent_id: '', description: '' })
    }
    setError('')
  }, [editData, open])

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim() || !form.code.trim()) { setError('Tên và mã không được để trống'); return }
    setLoading(true); setError('')
    try {
      const payload = { ...form, parent_id: form.parent_id === '' ? null : Number(form.parent_id) }
      if (editData) await orgApi.update(editData.id, payload)
      else await orgApi.create(payload)
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-800">{editData ? 'Chỉnh sửa đơn vị' : 'Thêm mới đơn vị'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tên đơn vị *</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.name} onChange={e => set('name', e.target.value)} placeholder="Phòng Kế toán" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mã đơn vị *</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.code} onChange={e => set('code', e.target.value)} placeholder="KT" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nhóm</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.group_name} onChange={e => set('group_name', e.target.value)}>
                <option value="">-- Chọn nhóm --</option>
                {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Người phụ trách</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.manager_name} onChange={e => set('manager_name', e.target.value)} placeholder="Nguyễn Văn A" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Bộ phận quản lý</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.parent_id} onChange={e => set('parent_id', e.target.value)}>
              <option value="">-- Không có (Cấp gốc) --</option>
              {allOrgs
                .filter(o => o.id !== editData?.id)
                .map(o => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mô tả</label>
            <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="btn-secondary">Hủy</button>
          <button onClick={submit} disabled={loading}
            className="btn-primary disabled:opacity-50">
            {loading ? 'Đang lưu...' : editData ? 'Lưu thay đổi' : 'Thêm mới'}
          </button>
        </div>
      </div>
    </div>
  )
}
