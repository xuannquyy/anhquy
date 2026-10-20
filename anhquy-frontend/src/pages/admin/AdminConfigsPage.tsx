import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Settings, Save, RefreshCw } from 'lucide-react'
import { MainLayout } from '../../components/MainLayout'
import { Spinner } from '../../components/ui'
import { adminApi } from '../../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemConfig {
  id: number
  config_key: string
  config_value: string
  description?: string | null
}

interface RiskThreshold {
  id: number
  level_name: 'Safe' | 'Warning' | 'Danger'
  min_score: number
  max_score: number
  color_code: string
  description?: string | null
}

const CONFIG_LABELS: Record<string, { label: string; desc: string; group: string }> = {
  AI_MODEL_NAME:         { label: 'Tên Model AI',           desc: 'Model Gemini sử dụng khi phân tích hợp đồng', group: 'AI & Phân tích' },
  AI_STRICT_RULE_MODE:   { label: 'Chế độ Nghiêm ngặt AI',  desc: 'true = áp dụng chuẩn khắt khe hơn giữa RBA và Luật VN', group: 'AI & Phân tích' },
  DATA_MASKING_ENABLED:  { label: 'Bật Data Masking',       desc: 'true = ẩn CCCD/MST/STK thành [REDACTED] trước khi gửi AI', group: 'AI & Phân tích' },
  MAX_UPLOAD_SIZE_MB:    { label: 'Kích thước tải lên tối đa (MB)', desc: 'Giới hạn dung lượng file PDF tải lên', group: 'AI & Phân tích' },
  DEFAULT_RISK_SCORE:    { label: 'Điểm rủi ro ban đầu',    desc: 'Điểm khởi tạo mặc định của nhà cung ứng mới (100)', group: 'Tính điểm rủi ro' },
  PENALTY_HIGH_RISK:     { label: 'Điểm trừ – Mức Cao (High)',     desc: 'Số điểm trừ mỗi vi phạm High được Manager duyệt', group: 'Tính điểm rủi ro' },
  PENALTY_MEDIUM_RISK:   { label: 'Điểm trừ – Mức Trung bình (Medium)', desc: 'Số điểm trừ mỗi vi phạm Medium được Manager duyệt', group: 'Tính điểm rủi ro' },
  PENALTY_LOW_RISK:      { label: 'Điểm trừ – Mức Thấp (Low)',   desc: 'Số điểm trừ mỗi vi phạm Low được Manager duyệt', group: 'Tính điểm rủi ro' },
  MAX_LOGIN_ATTEMPTS:    { label: 'Số lần đăng nhập sai tối đa', desc: 'Chạm ngưỡng này tài khoản sẽ bị tạm khóa Brute-force', group: 'Bảo mật' },
  ACCOUNT_LOCK_MINUTES:  { label: 'Thời gian khóa tạm thời (phút)',  desc: 'Thời gian khóa tài khoản khi sai mật khẩu quá số lần quy định', group: 'Bảo mật' },
}

const LEVEL_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  Safe:    { bg: 'bg-emerald-50',  text: 'text-emerald-700', label: 'An toàn' },
  Warning: { bg: 'bg-amber-50',    text: 'text-amber-700',   label: 'Cảnh báo' },
  Danger:  { bg: 'bg-Berry/10',    text: 'text-Berry',       label: 'Nguy hiểm' },
}

export default function AdminConfigsPage() {
  const [configs, setConfigs] = useState<SystemConfig[]>([])
  const [thresholds, setThresholds] = useState<RiskThreshold[]>([])
  const [loading, setLoading] = useState(true)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const [editThresholds, setEditThresholds] = useState<Record<number, Partial<RiskThreshold>>>({})
  const [savingThreshold, setSavingThreshold] = useState<number | null>(null)

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      try {
        const [cfgRes, tRes] = await Promise.all([adminApi.getSystemConfigs(), adminApi.getRiskThresholds()])
        const rawCfg = cfgRes.data?.configs || cfgRes.data?.items || cfgRes.data?.data || cfgRes.data || []
        const rawT = tRes.data?.thresholds || tRes.data?.items || tRes.data?.data || tRes.data || []

        const normalCfg: SystemConfig[] = Array.isArray(rawCfg) ? rawCfg : []
        const normalT: RiskThreshold[] = Array.isArray(rawT) ? rawT : []

        setConfigs(normalCfg)
        setThresholds(normalT)

        const ev: Record<string, string> = {}
        normalCfg.forEach((c) => { ev[c.config_key] = c.config_value })
        setEditValues(ev)
      } catch {
        toast.error('Không thể tải cấu hình hệ thống.')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const handleSaveConfig = async (key: string) => {
    setSavingKeys((prev) => new Set(prev).add(key))
    try {
      await adminApi.updateSystemConfig(key, editValues[key] || '')
      toast.success(`Đã lưu cấu hình "${CONFIG_LABELS[key]?.label || key}".`)
      setConfigs((prev) => prev.map((c) => c.config_key === key ? { ...c, config_value: editValues[key] } : c))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Lưu thất bại.')
    } finally {
      setSavingKeys((prev) => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const handleSaveThreshold = async (t: RiskThreshold) => {
    setSavingThreshold(t.id)
    try {
      const updates = editThresholds[t.id] || {}
      await adminApi.updateRiskThreshold(t.id, {
        min_score: updates.min_score ?? t.min_score,
        max_score: updates.max_score ?? t.max_score,
        color_code: updates.color_code ?? t.color_code,
      })
      toast.success(`Đã cập nhật ngưỡng "${t.level_name}".`)
      setThresholds((prev) => prev.map((x) => x.id === t.id ? { ...x, ...updates } : x))
      setEditThresholds((prev) => { const n = { ...prev }; delete n[t.id]; return n })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Lưu ngưỡng thất bại.')
    } finally {
      setSavingThreshold(null)
    }
  }

  const configsByGroup: Record<string, SystemConfig[]> = {}
  for (const cfg of configs) {
    const group = CONFIG_LABELS[cfg.config_key]?.group || 'Tham số Khác'
    if (!configsByGroup[group]) configsByGroup[group] = []
    configsByGroup[group].push(cfg)
  }

  return (
    <MainLayout breadcrumb="Cấu hình Hệ thống">
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-Pine flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Cấu hình Hệ thống & Ngưỡng Rủi ro
          </h1>
          <p className="text-sm text-Mist mt-0.5">Điều chỉnh tham số AI, Bảo mật và Thang điểm đánh giá đối tác</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <>
            {/* System Configs */}
            {Object.entries(configsByGroup).map(([group, items]) => (
              <div key={group} className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-Mist/10 bg-Snowflake/40">
                  <h3 className="font-semibold text-Pine text-sm">{group}</h3>
                </div>
                <div className="divide-y divide-Mist/10">
                  {items.map((cfg) => {
                    const meta = CONFIG_LABELS[cfg.config_key]
                    const isDirty = editValues[cfg.config_key] !== cfg.config_value
                    return (
                      <div key={cfg.config_key} className="px-5 py-4 flex items-start gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-Pine mb-0.5">
                            {meta?.label || cfg.config_key}
                            <span className="ml-2 font-mono text-xs text-Mist">({cfg.config_key})</span>
                          </label>
                          <p className="text-xs text-Mist mb-2">{meta?.desc || cfg.description || ''}</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editValues[cfg.config_key] ?? ''}
                              onChange={(e) => setEditValues((prev) => ({ ...prev, [cfg.config_key]: e.target.value }))}
                              className="flex-1 px-3 py-2 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white font-mono text-Branch"
                            />
                            {isDirty && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSaveConfig(cfg.config_key)}
                                  disabled={savingKeys.has(cfg.config_key)}
                                  className="px-3 py-2 bg-Pine text-white text-xs font-medium rounded-md hover:bg-Pine/90 disabled:opacity-60 transition-all flex items-center gap-1.5"
                                  title="Lưu"
                                >
                                  {savingKeys.has(cfg.config_key) ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
                                  Lưu
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditValues((prev) => ({ ...prev, [cfg.config_key]: cfg.config_value }))}
                                  className="p-2 border border-Mist/40 text-Mist rounded-md hover:bg-Snowflake transition-all"
                                  title="Hoàn tác"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Risk Thresholds */}
            <div className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-Mist/10 bg-Snowflake/40">
                <h3 className="font-semibold text-Pine text-sm">Ngưỡng Rủi ro Đối tác (Risk Thresholds)</h3>
              </div>
              <div className="divide-y divide-Mist/10">
                {thresholds.map((t) => {
                  const colors = LEVEL_COLORS[t.level_name] || { bg: 'bg-Snowflake', text: 'text-Branch', label: t.level_name }
                  const ed = editThresholds[t.id] || {}
                  const isDirty = Object.keys(ed).length > 0
                  return (
                    <div key={t.id} className={`px-5 py-4 ${colors.bg}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="w-3.5 h-3.5 rounded-sm border border-black/10" style={{ backgroundColor: ed.color_code || t.color_code }} />
                        <span className={`font-semibold text-sm ${colors.text}`}>{colors.label} ({t.level_name})</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-Mist mb-1">Điểm tối thiểu (Min)</label>
                          <input
                            type="number" min={0} max={100}
                            value={ed.min_score ?? t.min_score}
                            onChange={(e) => setEditThresholds((prev) => ({ ...prev, [t.id]: { ...prev[t.id], min_score: Number(e.target.value) } }))}
                            className="w-full px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-Pine/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-Mist mb-1">Điểm tối đa (Max)</label>
                          <input
                            type="number" min={0} max={100}
                            value={ed.max_score ?? t.max_score}
                            onChange={(e) => setEditThresholds((prev) => ({ ...prev, [t.id]: { ...prev[t.id], max_score: Number(e.target.value) } }))}
                            className="w-full px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-Pine/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-Mist mb-1">Mã màu hiển thị (Hex)</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={ed.color_code || t.color_code}
                              onChange={(e) => setEditThresholds((prev) => ({ ...prev, [t.id]: { ...prev[t.id], color_code: e.target.value } }))}
                              className="flex-1 px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white font-mono focus:outline-none focus:ring-2 focus:ring-Pine/30"
                            />
                            <input
                              type="color"
                              value={ed.color_code || t.color_code}
                              onChange={(e) => setEditThresholds((prev) => ({ ...prev, [t.id]: { ...prev[t.id], color_code: e.target.value } }))}
                              className="h-9 w-9 rounded-md border border-Mist/40 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                      {isDirty && (
                        <div className="flex gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => handleSaveThreshold(t)}
                            disabled={savingThreshold === t.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-Pine text-white text-xs rounded-md hover:bg-Pine/90 disabled:opacity-60 transition-all"
                          >
                            {savingThreshold === t.id ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
                            Lưu ngưỡng
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditThresholds((prev) => { const n = { ...prev }; delete n[t.id]; return n })}
                            className="px-3 py-1.5 border border-Mist/40 text-Mist text-xs rounded-md hover:bg-white transition-all"
                          >
                            Hủy
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  )
}