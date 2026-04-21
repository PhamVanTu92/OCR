import { useEffect, useState } from 'react'
import {
  Settings, RefreshCw, CheckCircle2, AlertCircle,
  X, Loader2, KeyRound, Receipt,
} from 'lucide-react'
import { purchaseInvoiceApi } from '../api/purchaseInvoices'
import type { PurchaseInvoiceConfig } from '../types'

type Err = { response?: { data?: { detail?: string } } }

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

export default function PurchaseInvoiceSettingsPage() {
  const [cfg,       setCfg]       = useState<PurchaseInvoiceConfig | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [testing,   setTesting]   = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')
  const [tokenInfo, setTokenInfo] = useState('')

  useEffect(() => {
    purchaseInvoiceApi.getConfig()
      .then(r => setCfg(r.data))
      .catch(() => setError('Không thể tải cấu hình'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!cfg) return
    setSaving(true); setError(''); setSuccess(''); setTokenInfo('')
    try {
      await purchaseInvoiceApi.updateConfig({
        name:            cfg.name,
        matbao_base_url: cfg.matbao_base_url,
        matbao_api_key:  cfg.matbao_api_key ?? undefined,
      })
      setSuccess('Đã lưu cấu hình thành công!')
    } catch (e: unknown) {
      setError((e as Err)?.response?.data?.detail ?? 'Lỗi lưu cấu hình')
    } finally { setSaving(false) }
  }

  const handleTestToken = async () => {
    setTesting(true); setError(''); setSuccess(''); setTokenInfo('')
    try {
      const r = await purchaseInvoiceApi.testToken()
      setSuccess(r.data.message)
      setTokenInfo(
        `Preview: ${r.data.token_preview} · Hết hạn sau ${Math.floor(r.data.expires_in_seconds / 60)} phút`
      )
    } catch (e: unknown) {
      setError((e as Err)?.response?.data?.detail ?? 'API key không hợp lệ')
    } finally { setTesting(false) }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Page title */}
      <div className="flex items-center gap-3">
        <Receipt size={22} className="text-indigo-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-800">Thiết lập hóa đơn đầu vào</h1>
          <p className="text-xs text-gray-400 mt-0.5">Cấu hình kết nối API lấy hóa đơn đầu vào</p>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 px-6 py-4 border-b">
          <Settings size={16} className="text-indigo-500" />
          <span className="font-semibold text-gray-700 text-sm">Kết nối API</span>
          {cfg?.matbao_api_key && (
            <span className="ml-auto text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 size={12} /> Đã cấu hình
            </span>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
              <Loader2 size={16} className="animate-spin" /> Đang tải...
            </div>
          )}

          {/* Error / Success banners */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')}><X size={12} /></button>
            </div>
          )}
          {success && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
                <CheckCircle2 size={14} />
                <span className="flex-1">{success}</span>
                <button onClick={() => setSuccess('')}><X size={12} /></button>
              </div>
              {tokenInfo && (
                <p className="text-xs text-gray-400 font-mono px-1">{tokenInfo}</p>
              )}
            </div>
          )}

          {cfg && !loading && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Tên cấu hình">
                  <input
                    value={cfg.name}
                    onChange={e => setCfg({ ...cfg, name: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Base URL API">
                  <input
                    value={cfg.matbao_base_url}
                    onChange={e => setCfg({ ...cfg, matbao_base_url: e.target.value })}
                    className={`${inputCls} font-mono text-xs`}
                    placeholder="https://api-hoadondauvao.matbao.in"
                  />
                </Field>
              </div>

              <Field label={
                <span className="flex items-center gap-1.5">
                  <KeyRound size={12} className="text-indigo-400" />
                  API Key (UUID) <span className="text-red-500">*</span>
                </span>
              }>
                <input
                  type="password"
                  value={cfg.matbao_api_key ?? ''}
                  onChange={e => setCfg({ ...cfg, matbao_api_key: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={`${inputCls} font-mono`}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Lấy tại trang quản trị hóa đơn đầu vào → Cài đặt → API Key
                </p>
              </Field>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <button
                  onClick={handleTestToken}
                  disabled={testing || !cfg.matbao_api_key}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm border border-indigo-200 text-indigo-600
                    rounded-lg hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {testing
                    ? <><Loader2 size={13} className="animate-spin" /> Đang kiểm tra...</>
                    : <><RefreshCw size={13} /> Kiểm tra API Key</>}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving
                    ? <><Loader2 size={13} className="animate-spin" /> Đang lưu...</>
                    : 'Lưu cấu hình'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
