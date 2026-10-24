import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Settings, Save, RefreshCw, Sliders, ShieldCheck, CheckCircle2 } from 'lucide-react'
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

// Danh mục cấu hình thân thiện (Đã loại bỏ AI_MODEL_NAME và các mã kỹ thuật trong ngoặc)
const CONFIG_META: Record<
  string,
  { label: string; desc: string; group: string; unit?: string; isBoolean?: boolean }
> = {
  ACCOUNT_LOCK_MINUTES: {
    label: 'Thời gian khóa tạm thời khi nhập sai mật khẩu',
    desc: 'Số phút khóa tài khoản tự động khi đăng nhập sai quá giới hạn',
    group: '1. Bảo mật & Chống dò mật khẩu (Brute-force)',
    unit: 'phút',
  },
  MAX_LOGIN_ATTEMPTS: {
    label: 'Số lần cho phép nhập sai mật khẩu tối đa',
    desc: 'Vượt quá số lần này, tài khoản sẽ bị tạm khóa để bảo vệ an toàn',
    group: '1. Bảo mật & Chống dò mật khẩu (Brute-force)',
    unit: 'lần',
  },
  AI_STRICT_RULE_MODE: {
    label: 'Chế độ Rà soát Pháp lý Nghiêm ngặt',
    desc: 'Khi bật, AI ưu tiên áp dụng quy định khắt khe hơn giữa Tiêu chuẩn RBA và Luật Việt Nam',
    group: '2. Phân tích Hợp đồng & Bảo mật Dữ liệu AI',
    isBoolean: true,
  },
  DATA_MASKING_ENABLED: {
    label: 'Tự động Ẩn danh Dữ liệu Nhạy cảm (Data Masking)',
    desc: 'Tự động che số CCCD, Mã số thuế và Số tài khoản thành [REDACTED] trước khi gửi sang AI',
    group: '2. Phân tích Hợp đồng & Bảo mật Dữ liệu AI',
    isBoolean: true,
  },
  MAX_UPLOAD_SIZE_MB: {
    label: 'Dung lượng file Hợp đồng PDF tối đa',
    desc: 'Giới hạn kích thước tối đa cho mỗi file hợp đồng PDF khi tải lên hệ thống',
    group: '2. Phân tích Hợp đồng & Bảo mật Dữ liệu AI',
    unit: 'MB',
  },
  DEFAULT_RISK_SCORE: {
    label: 'Điểm tín nhiệm khởi tạo mặc định',
    desc: 'Điểm ban đầu cấp cho mỗi đối tác nhà cung ứng mới khi thêm vào hệ thống',
    group: '3. Công thức Tính điểm & Mức trừ điểm Vi phạm',
    unit: 'điểm',
  },
  PENALTY_HIGH_RISK: {
    label: 'Mức trừ điểm đối với Vi phạm Nghiêm trọng (Cao)',
    desc: 'Số điểm bị trừ khỏi hồ sơ đối tác khi Quản lý phê duyệt 1 lỗi mức độ Cao',
    group: '3. Công thức Tính điểm & Mức trừ điểm Vi phạm',
    unit: 'điểm',
  },
  PENALTY_MEDIUM_RISK: {
    label: 'Mức trừ điểm đối với Vi phạm Trung bình',
    desc: 'Số điểm bị trừ khỏi hồ sơ đối tác khi Quản lý phê duyệt 1 lỗi mức độ Trung bình',
    group: '3. Công thức Tính điểm & Mức trừ điểm Vi phạm',
    unit: 'điểm',
  },
  PENALTY_LOW_RISK: {
    label: 'Mức trừ điểm đối với Vi phạm Nhẹ (Thấp)',
    desc: 'Số điểm bị trừ khỏi hồ sơ đối tác khi Quản lý phê duyệt 1 lỗi mức độ Thấp',
    group: '3. Công thức Tính điểm & Mức trừ điểm Vi phạm',
    unit: 'điểm',
  },
}

const LEVEL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Safe:    { bg: 'bg-Snowflake/50',    text: 'text-Pine',   label: 'Mức độ An toàn' },
  Warning: { bg: 'bg-Frostysilver/30', text: 'text-Branch', label: 'Mức độ Cảnh báo' },
  Danger:  { bg: 'bg-Berry/10',        text: 'text-Berry',  label: 'Mức độ Nguy hiểm' },
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
        const [cfgRes, tRes] = await Promise.all([
          adminApi.getSystemConfigs(),
          adminApi.getRiskThresholds(),
        ])
        const rawCfg = cfgRes.data?.configs || cfgRes.data?.items || cfgRes.data?.data || cfgRes.data || []
        const rawT = tRes.data?.thresholds || tRes.data?.items || tRes.data?.data || tRes.data || []

        // Lọc bỏ AI_MODEL_NAME để tránh người dùng vô tình sửa tên model gây lỗi hệ thống
        const normalCfg: SystemConfig[] = (Array.isArray(rawCfg) ? rawCfg : []).filter(
          (c: SystemConfig) => c.config_key !== 'AI_MODEL_NAME' && Boolean(CONFIG_META[c.config_key])
        )
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
      const val = (editValues[key] ?? '').trim()
      await adminApi.updateSystemConfig(key, val)
      toast.success(`Đã lưu thiết lập "${CONFIG_META[key]?.label || key}".`)
      setConfigs((prev) => prev.map((c) => c.config_key === key ? { ...c, config_value: val } : c))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Lưu cấu hình thất bại.')
    } finally {
      setSavingKeys((prev) => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const handleSaveAllConfigs = async () => {
    if (dirtyConfigKeys.length === 0) {
      toast.info('Tất cả thông số hiện tại đã được lưu đồng bộ.')
      return
    }
    setSavingAll(true)
    try {
      await Promise.all(
        dirtyConfigKeys.map((key) => adminApi.updateSystemConfig(key, (editValues[key] ?? '').trim()))
      )
      setConfigs((prev) =>
        prev.map((c) =>
          dirtyConfigKeys.includes(c.config_key)
            ? { ...c, config_value: (editValues[c.config_key] ?? '').trim() }
            : c
        )
      )
      toast.success(`Đã lưu thành công ${dirtyConfigKeys.length} thiết lập hệ thống!`)
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
      toast.success(`Đã lưu ngưỡng "${LEVEL_STYLES[t.level_name]?.label || t.level_name}".`)
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
    const group = CONFIG_META[cfg.config_key]?.group || 'Thông số khác'
    if (!configsByGroup[group]) configsByGroup[group] = []
    configsByGroup[group].push(cfg)
  }

  return (
    <MainLayout breadcrumb="Tham số & Ngưỡng">
      <div className="space-y-5 max-w-5xl">
        {/* Header với nút Lưu luôn hiển thị rõ ràng */}
        <div className="bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight flex items-center gap-2">
              <Settings className="w-6 h-6 text-Berry" />
              Cấu hình Hệ thống & Ngưỡng Rủi ro
            </h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Điều chỉnh quy tắc bảo mật tài khoản, giới hạn tải file và thang điểm đánh giá nhà cung ứng
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveAllConfigs}
            disabled={savingAll}
            className={`inline-flex items-center gap-2 px-5 py-3 text-xs font-extrabold rounded-2xl transition-all shadow-sm flex-shrink-0 ${
              dirtyConfigKeys.length > 0
                ? 'bg-Berry text-white hover:bg-Berry/90 shadow-md animate-pulse'
                : 'bg-Pine text-white hover:bg-Pine/90'
            }`}
          >
            {savingAll ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
            {dirtyConfigKeys.length > 0
              ? `Lưu toàn bộ thay đổi (${dirtyConfigKeys.length})`
              : 'Lưu cấu hình hệ thống'}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <>
            {/* Các nhóm tham số cấu hình */}
            {Object.entries(configsByGroup).map(([group, items]) => (
              <div key={group} className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] overflow-hidden">
                <div className="px-6 py-4 border-b border-Mist/15 bg-Snowflake/40 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-Merlot" />
                    <h3 className="font-extrabold text-Merlot text-sm">{group}</h3>
                  </div>
                  <span className="text-[11px] font-semibold text-Mist">
                    Thay đổi thông số và bấm nút Lưu bên cạnh
                  </span>
                </div>

                <div className="divide-y divide-Mist/15">
                  {items.map((cfg) => {
                    const meta = CONFIG_META[cfg.config_key]
                    const currentVal = editValues[cfg.config_key] ?? ''
                    const isDirty = currentVal !== cfg.config_value
                    const isBool = meta?.isBoolean || currentVal === 'true' || currentVal === 'false'

                    return (
                      <div key={cfg.config_key} className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-Snowflake/20 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-Pine">
                              {meta?.label || cfg.config_key}
                            </span>
                            {isDirty && (
                              <span className="px-2 py-0.5 rounded-md bg-Berry/10 text-Berry text-[10px] font-extrabold">
                                Chưa lưu
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-Branch mt-0.5">{meta?.desc || cfg.description || ''}</p>
                        </div>

                        <div className="flex items-center gap-2.5 justify-end">
                          {isBool ? (
                            <button
                              type="button"
                              onClick={() =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  [cfg.config_key]: currentVal === 'true' ? 'false' : 'true',
                                }))
                              }
                              className={`px-4 py-2 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-2 ${
                                currentVal === 'true'
                                  ? 'bg-Pine text-white border-Pine'
                                  : 'bg-Snowflake text-Branch border-Mist/40'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${currentVal === 'true' ? 'bg-Snowflake' : 'bg-Mist'}`} />
                              {currentVal === 'true' ? 'Đang BẬT' : 'Đang TẮT'}
                            </button>
                          ) : (
                            <div className="relative flex items-center">
                              <input
                                type="number"
                                value={currentVal}
                                onChange={(e) => setEditValues((prev) => ({ ...prev, [cfg.config_key]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveConfig(cfg.config_key)
                                }}
                                className="w-36 pl-3.5 pr-12 py-2 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white font-extrabold text-Pine"
                              />
                              {meta?.unit && (
                                <span className="absolute right-3 text-xs font-bold text-Mist pointer-events-none">
                                  {meta.unit}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Nút Lưu luôn hiển thị rõ ràng trên từng dòng */}
                          <button
                            type="button"
                            onClick={() => handleSaveConfig(cfg.config_key)}
                            disabled={savingKeys.has(cfg.config_key)}
                            className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 ${
                              isDirty
                                ? 'bg-Berry text-white hover:bg-Berry/90 shadow-sm'
                                : 'bg-Snowflake text-Pine hover:bg-Pine hover:text-white border border-Mist/30'
                            }`}
                          >
                            {savingKeys.has(cfg.config_key) ? (
                              <Spinner size="sm" />
                            ) : isDirty ? (
                              <Save className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-Pine" />
                            )}
                            {isDirty ? 'Lưu ngay' : 'Đã lưu'}
                          </button>

                          {isDirty && (
                            <button
                              type="button"
                              onClick={() => setEditValues((prev) => ({ ...prev, [cfg.config_key]: cfg.config_value }))}
                              className="p-2 border border-Mist/40 text-Branch rounded-xl hover:bg-Snowflake transition-all"
                              title="Khôi phục giá trị cũ"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Ngưỡng Rủi ro Đối tác */}
            <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] overflow-hidden">
              <div className="px-6 py-4 border-b border-Mist/15 bg-Snowflake/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-Berry" />
                  <h3 className="font-extrabold text-Merlot text-sm">
                    4. Phân loại Ngưỡng Điểm Tín nhiệm Đối tác (Thang điểm 0 – 100)
                  </h3>
                </div>
              </div>

              <div className="divide-y divide-Mist/15">
                {thresholds.map((t) => {
                  const style = LEVEL_STYLES[t.level_name] || { bg: 'bg-Snowflake', text: 'text-Pine', label: t.level_name }
                  const ed = editThresholds[t.id] || {}
                  const isDirty = Object.keys(ed).length > 0
                  return (
                    <div key={t.id} className={`px-6 py-4 ${style.bg}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-4 h-4 rounded-md border border-black/15 shadow-sm" style={{ backgroundColor: ed.color_code || t.color_code }} />
                          <span className={`font-extrabold text-sm ${style.text}`}>{style.label}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveThreshold(t)}
                          disabled={savingThreshold === t.id}
                          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold rounded-xl transition-all shadow-sm ${
                            isDirty
                              ? 'bg-Berry text-white hover:bg-Berry/90'
                              : 'bg-Pine text-white hover:bg-Pine/90'
                          }`}
                        >
                          {savingThreshold === t.id ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
                          {isDirty ? 'Lưu thay đổi ngưỡng' : 'Lưu ngưỡng'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-extrabold uppercase text-Pine mb-1">Từ mức điểm (Min)</label>
                          <input
                            type="number" min={0} max={100}
                            value={ed.min_score ?? t.min_score}
                            onChange={(e) => setEditThresholds((prev) => ({ ...prev, [t.id]: { ...prev[t.id], min_score: Number(e.target.value) } }))}
                            className="w-full px-3.5 py-2 border border-Mist/40 rounded-xl text-sm font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold uppercase text-Pine mb-1">Đến mức điểm (Max)</label>
                          <input
                            type="number" min={0} max={100}
                            value={ed.max_score ?? t.max_score}
                            onChange={(e) => setEditThresholds((prev) => ({ ...prev, [t.id]: { ...prev[t.id], max_score: Number(e.target.value) } }))}
                            className="w-full px-3.5 py-2 border border-Mist/40 rounded-xl text-sm font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold uppercase text-Pine mb-1">Màu sắc nhận diện</label>
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