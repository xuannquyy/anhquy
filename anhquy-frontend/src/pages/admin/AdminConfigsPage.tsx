import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Settings, Save, RefreshCw, Sliders, ShieldCheck } from 'lucide-react'
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

const CONFIG_LABELS: Record<string, { label: string; desc: string; group: string; isBoolean?: boolean }> = {
  AI_MODEL_NAME:         { label: 'Tên Model AI',           desc: 'Model Gemini sử dụng khi phân tích hợp đồng', group: 'AI & Phân tích' },
  AI_STRICT_RULE_MODE:   { label: 'Chế độ Nghiêm ngặt AI',  desc: 'Bật = áp dụng chuẩn khắt khe hơn giữa RBA và Luật VN', group: 'AI & Phân tích', isBoolean: true },
  DATA_MASKING_ENABLED:  { label: 'Bật Data Masking tự động', desc: 'Bật = ẩn danh CCCD/MST/STK thành [REDACTED] trước khi gửi AI', group: 'AI & Phân tích', isBoolean: true },
  MAX_UPLOAD_SIZE_MB:    { label: 'Kích thước tải lên tối đa (MB)', desc: 'Giới hạn dung lượng file PDF tải lên', group: 'AI & Phân tích' },
  DEFAULT_RISK_SCORE:    { label: 'Điểm rủi ro ban đầu',    desc: 'Điểm khởi tạo mặc định của nhà cung ứng mới (100)', group: 'Tính điểm rủi ro' },
  PENALTY_HIGH_RISK:     { label: 'Điểm trừ – Mức Cao (High)',     desc: 'Số điểm trừ mỗi vi phạm High được Manager duyệt', group: 'Tính điểm rủi ro' },
  PENALTY_MEDIUM_RISK:   { label: 'Điểm trừ – Mức Trung bình (Medium)', desc: 'Số điểm trừ mỗi vi phạm Medium được Manager duyệt', group: 'Tính điểm rủi ro' },
  PENALTY_LOW_RISK:      { label: 'Điểm trừ – Mức Thấp (Low)',   desc: 'Số điểm trừ mỗi vi phạm Low được Manager duyệt', group: 'Tính điểm rủi ro' },
  MAX_LOGIN_ATTEMPTS:    { label: 'Số lần đăng nhập sai tối đa', desc: 'Chạm ngưỡng này tài khoản sẽ bị tạm khóa Brute-force', group: 'Bảo mật' },
  ACCOUNT_LOCK_MINUTES:  { label: 'Thời gian khóa tạm thời (phút)',  desc: 'Thời gian khóa tài khoản khi sai mật khẩu quá số lần quy định', group: 'Bảo mật' },
}

const LEVEL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Safe:    { bg: 'bg-Snowflake/50',     text: 'text-Pine',   label: 'An toàn (Safe)' },
  Warning: { bg: 'bg-Frostysilver/25',  text: 'text-Branch', label: 'Cảnh báo (Warning)' },
  Danger:  { bg: 'bg-Berry/10',         text: 'text-Berry',  label: 'Nguy hiểm (Danger)' },
}

export default function AdminConfigsPage() {
  const [configs, setConfigs] = useState<SystemConfig[]>([])
  const [thresholds, setThresholds] = useState<RiskThreshold[]>([])
  const [loading, setLoading] = useState(true)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const [savingAll, setSavingAll] = useState(false)
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

  const dirtyConfigKeys = configs
    .filter((c) => editValues[c.config_key] !== c.config_value)
    .map((c) => c.config_key)

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

  const handleSaveAllDirtyConfigs = async () => {
    if (dirtyConfigKeys.length === 0) return
    setSavingAll(true)
    try {
      await Promise.all(
        dirtyConfigKeys.map((key) => adminApi.updateSystemConfig(key, editValues[key] || ''))
      )
      setConfigs((prev) =>
        prev.map((c) =>
          dirtyConfigKeys.includes(c.config_key)
            ? { ...c, config_value: editValues[c.config_key] }
            : c
        )
      )
      toast.success(`Đã lưu đồng loạt ${dirtyConfigKeys.length} cấu hình hệ thống!`)
    } catch {
      toast.error('Có lỗi khi lưu đồng loạt cấu hình.')
    } finally {
      setSavingAll(false)
    }
  }

  const handleSaveThreshold = async (t: RiskThreshold) => {
    const updates = editThresholds[t.id] || {}
    const minVal = updates.min_score ?? t.min_score
    const maxVal = updates.max_score ?? t.max_score

    if (minVal < 0 || maxVal > 100 || minVal >= maxVal) {
      toast.error('Khoảng điểm không hợp lệ (Điểm tối thiểu phải nhỏ hơn Điểm tối đa trong phạm vi 0–100).')
      return
    }

    setSavingThreshold(t.id)
    try {
      await adminApi.updateRiskThreshold(t.id, {
        min_score: minVal,
        max_score: maxVal,
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
    <MainLayout breadcrumb="Tham số & Ngưỡng">
      <div className="space-y-5 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight flex items-center gap-2">
              <Settings className="w-6 h-6 text-Berry" />
              Cấu hình Hệ thống & Ngưỡng Rủi ro
            </h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Điều chỉnh tham số AI RAG, Cơ chế bảo vệ Brute-force và Thang điểm tín nhiệm đối tác
            </p>
          </div>

          {dirtyConfigKeys.length > 0 && (
            <button
              type="button"
              onClick={handleSaveAllDirtyConfigs}
              disabled={savingAll}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-Berry text-white text-xs font-extrabold rounded-2xl hover:bg-Berry/90 shadow-md transition-all"
            >
              {savingAll ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
              Lưu tất cả thay đổi ({dirtyConfigKeys.length})
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <>
            {/* System Configs */}
            {Object.entries(configsByGroup).map(([group, items]) => (
              <div key={group} className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] overflow-hidden">
                <div className="px-6 py-4 border-b border-Mist/15 bg-Snowflake/40 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-Pine" />
                  <h3 className="font-extrabold text-Pine text-sm">{group}</h3>
                </div>
                <div className="divide-y divide-Mist/15">
                  {items.map((cfg) => {
                    const meta = CONFIG_LABELS[cfg.config_key]
                    const currentVal = editValues[cfg.config_key] ?? ''
                    const isDirty = currentVal !== cfg.config_value
                    const isBool = meta?.isBoolean || currentVal === 'true' || currentVal === 'false'

                    return (
                      <div key={cfg.config_key} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-extrabold text-Pine mb-0.5">
                            {meta?.label || cfg.config_key}
                            <span className="ml-2 font-mono text-xs font-semibold text-Mist">({cfg.config_key})</span>
                          </label>
                          <p className="text-xs text-Branch">{meta?.desc || cfg.description || ''}</p>
                        </div>

                        <div className="flex items-center gap-2.5 sm:w-72 justify-end">
                          {isBool ? (
                            <button
                              type="button"
                              onClick={() =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  [cfg.config_key]: currentVal === 'true' ? 'false' : 'true',
                                }))
                              }
                              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-2 ${
                                currentVal === 'true'
                                  ? 'bg-Pine text-white border-Pine'
                                  : 'bg-Snowflake text-Branch border-Mist/40'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${currentVal === 'true' ? 'bg-Snowflake' : 'bg-Mist'}`} />
                              {currentVal === 'true' ? 'Đang BẬT (true)' : 'Đang TẮT (false)'}
                            </button>
                          ) : (
                            <input
                              type="text"
                              value={currentVal}
                              onChange={(e) => setEditValues((prev) => ({ ...prev, [cfg.config_key]: e.target.value }))}
                              className="flex-1 px-3.5 py-2 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-Snowflake/20 font-mono font-bold text-Pine"
                            />
                          )}

                          {isDirty && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveConfig(cfg.config_key)}
                                disabled={savingKeys.has(cfg.config_key)}
                                className="px-3.5 py-2 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Berry/90 disabled:opacity-60 transition-all flex items-center gap-1.5 shadow-sm"
                                title="Lưu"
                              >
                                {savingKeys.has(cfg.config_key) ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
                                Lưu
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditValues((prev) => ({ ...prev, [cfg.config_key]: cfg.config_value }))}
                                className="p-2 border border-Mist/40 text-Branch rounded-xl hover:bg-Snowflake transition-all"
                                title="Hoàn tác"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Risk Thresholds */}
            <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] overflow-hidden">
              <div className="px-6 py-4 border-b border-Mist/15 bg-Snowflake/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-Berry" />
                  <h3 className="font-extrabold text-Pine text-sm">Ngưỡng Rủi ro Đối tác (Risk Thresholds 0 – 100 điểm)</h3>
                </div>
              </div>

              <div className="divide-y divide-Mist/15">
                {thresholds.map((t) => {
                  const style = LEVEL_STYLES[t.level_name] || { bg: 'bg-Snowflake', text: 'text-Pine', label: t.level_name }
                  const ed = editThresholds[t.id] || {}
                  const isDirty = Object.keys(ed).length > 0
                  return (
                    <div key={t.id} className={`px-6 py-4 ${style.bg}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="w-4 h-4 rounded-md border border-black/15 shadow-sm" style={{ backgroundColor: ed.color_code || t.color_code }} />
                        <span className={`font-extrabold text-sm ${style.text}`}>{style.label}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-extrabold uppercase text-Pine mb-1">Điểm tối thiểu (Min)</label>
                          <input
                            type="number" min={0} max={100}
                            value={ed.min_score ?? t.min_score}
                            onChange={(e) => setEditThresholds((prev) => ({ ...prev, [t.id]: { ...prev[t.id], min_score: Number(e.target.value) } }))}
                            className="w-full px-3.5 py-2 border border-Mist/40 rounded-xl text-sm font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold uppercase text-Pine mb-1">Điểm tối đa (Max)</label>
                          <input
                            type="number" min={0} max={100}
                            value={ed.max_score ?? t.max_score}
                            onChange={(e) => setEditThresholds((prev) => ({ ...prev, [t.id]: { ...prev[t.id], max_score: Number(e.target.value) } }))}
                            className="w-full px-3.5 py-2 border border-Mist/40 rounded-xl text-sm font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold uppercase text-Pine mb-1">Mã màu hiển thị (Hex)</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={ed.color_code || t.color_code}
                              onChange={(e) => setEditThresholds((prev) => ({ ...prev, [t.id]: { ...prev[t.id], color_code: e.target.value } }))}
                              className="flex-1 px-3.5 py-2 border border-Mist/40 rounded-xl text-sm bg-white font-mono font-bold text-Pine focus:outline-none focus:border-Pine"
                            />
                            <input
                              type="color"
                              value={ed.color_code || t.color_code}
                              onChange={(e) => setEditThresholds((prev) => ({ ...prev, [t.id]: { ...prev[t.id], color_code: e.target.value } }))}
                              className="h-9 w-10 rounded-xl border border-Mist/40 cursor-pointer bg-white p-0.5"
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
                            className="flex items-center gap-1.5 px-4 py-2 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 disabled:opacity-60 transition-all shadow-sm"
                          >
                            {savingThreshold === t.id ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
                            Lưu ngưỡng
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditThresholds((prev) => { const n = { ...prev }; delete n[t.id]; return n })}
                            className="px-4 py-2 border border-Mist/40 bg-white text-Branch text-xs font-bold rounded-xl hover:bg-Snowflake transition-all"
                          >
                            Hủy bỏ
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