import React from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, ShieldAlert, AlertTriangle, CheckCircle,
  ExternalLink, Layers
} from 'lucide-react'

export interface SupplierRiskData {
  period: { from: string; to: string }
  totalActiveSuppliers: number
  safeCount: number
  warningCount: number
  dangerCount: number
  unscoredCount: number
  supplierRiskDistribution: {
    safePercentage: number
    warningPercentage: number
    dangerPercentage: number
    unscoredPercentage: number
  }
  approvedHighRiskViolationCount: number
  topRiskSuppliers: Array<{
    id: number
    supplierCode: string
    name: string
    riskScore: number | null
    approvedHighCount: number
    riskLevel: 'Safe' | 'Warning' | 'Danger'
  }>
  riskByStandardGroup: Array<{
    groupId: number
    groupCode: string
    groupName: string
    totalFindings: number
    pendingCount: number
    approvedCount: number
    rejectedCount: number
    confirmationRate: number | null
  }>
}

interface SupplierRiskSectionProps {
  data: SupplierRiskData | null
  loading: boolean
}

export const SupplierRiskSection: React.FC<SupplierRiskSectionProps> = ({ data, loading }) => {
  if (loading || !data) {
    return (
      <div className="bg-white rounded-2xl border border-Mist/30 p-6 shadow-sm flex items-center justify-center min-h-[160px]">
        <span className="text-xs font-semibold text-Mist">Đang tải dữ liệu rủi ro chuỗi cung ứng...</span>
      </div>
    )
  }

  const {
    totalActiveSuppliers,
    safeCount,
    warningCount,
    dangerCount,
    unscoredCount,
    supplierRiskDistribution,
    approvedHighRiskViolationCount,
    topRiskSuppliers,
    riskByStandardGroup,
  } = data

  const translateRiskLevel = (lvl: 'Safe' | 'Warning' | 'Danger') => {
    switch (lvl) {
      case 'Danger':
        return { label: 'Nguy hiểm', cls: 'bg-rose-100 text-rose-800 border-rose-200' }
      case 'Warning':
        return { label: 'Cảnh báo', cls: 'bg-amber-100 text-amber-800 border-amber-200' }
      case 'Safe':
      default:
        return { label: 'An toàn', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-Mist/30 p-4 sm:p-5 shadow-sm space-y-5">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-Mist/15 pb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-Pine font-sans flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-Pine" />
            Rủi ro nhà cung ứng và chuỗi cung ứng
          </h2>
          <p className="text-xs text-Branch/80 mt-0.5 font-medium leading-relaxed">
            Phân nhóm điểm tín nhiệm nhà cung ứng thực tế, vi phạm nghiêm trọng và phân tích theo 4 nhóm tiêu chuẩn.
          </p>
        </div>

        <Link
          to="/suppliers"
          className="text-xs font-bold text-Pine hover:text-Berry inline-flex items-center gap-1.5 self-start sm:self-center transition-colors flex-shrink-0"
        >
          <span>Quản lý nhà cung ứng ({totalActiveSuppliers})</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* ─── Phân bố rủi ro & Vi phạm High Approved ─────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Safe */}
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 hover:border-emerald-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-emerald-800">
              <span className="text-xs font-bold truncate">An toàn (&ge; 80 điểm)</span>
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono mt-2">{safeCount}</p>
          </div>
          <p className="text-xs text-emerald-800/80 font-medium mt-2 pt-2 border-t border-emerald-200/50">
            Chiếm <strong className="font-mono font-bold">{supplierRiskDistribution.safePercentage}%</strong> tổng đối tác
          </p>
        </div>

        {/* Warning */}
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 hover:border-amber-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-amber-800">
              <span className="text-xs font-bold truncate">Cảnh báo (50 - 79 điểm)</span>
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-700 font-mono mt-2">{warningCount}</p>
          </div>
          <p className="text-xs text-amber-800/80 font-medium mt-2 pt-2 border-t border-amber-200/50">
            Chiếm <strong className="font-mono font-bold">{supplierRiskDistribution.warningPercentage}%</strong> tổng đối tác
          </p>
        </div>

        {/* Danger */}
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 hover:border-rose-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-rose-800">
              <span className="text-xs font-bold truncate">Nguy hiểm (&lt; 50 điểm)</span>
              <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-rose-700 font-mono mt-2">{dangerCount}</p>
          </div>
          <p className="text-xs text-rose-800/80 font-medium mt-2 pt-2 border-t border-rose-200/50">
            Chiếm <strong className="font-mono font-bold">{supplierRiskDistribution.dangerPercentage}%</strong> tổng đối tác
          </p>
        </div>

        {/* Vi phạm High Approved */}
        <div className="p-4 rounded-xl border border-Pine/20 bg-Snowflake/40 hover:border-Pine/30 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-Pine">
              <span className="text-xs font-bold truncate">Lỗi High đã xác nhận</span>
              <ShieldAlert className="w-4 h-4 text-Berry flex-shrink-0" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-Berry font-mono mt-2">{approvedHighRiskViolationCount}</p>
          </div>
          <p className="text-xs text-Branch/80 font-medium mt-2 pt-2 border-t border-Mist/20">
            Đã duyệt trừ điểm ({unscoredCount} chưa chấm điểm)
          </p>
        </div>
      </div>

      {/* ─── Grid: Top 5 Nhà cung ứng & Thống kê 4 Nhóm Tiêu chuẩn ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">
        {/* Top 5 High-Risk Suppliers */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-Pine font-mono flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-Berry" />
              Top 5 Nhà cung ứng rủi ro cao nhất
            </h3>
          </div>

          <div className="rounded-xl border border-Mist/20 overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-Snowflake text-Pine font-black uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-3.5 py-2.5">Đối tác</th>
                  <th className="px-3.5 py-2.5 text-center">Điểm tín nhiệm</th>
                  <th className="px-3.5 py-2.5 text-center">Lỗi High duyệt</th>
                  <th className="px-3.5 py-2.5 text-right">Mức rủi ro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-Mist/15 font-medium text-Branch">
                {topRiskSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-Mist">
                      Chưa ghi nhận nhà cung ứng nào trong danh sách
                    </td>
                  </tr>
                ) : (
                  topRiskSuppliers.map((s) => {
                    const rLvl = translateRiskLevel(s.riskLevel)
                    return (
                      <tr key={s.id} className="hover:bg-Snowflake/40">
                        <td className="px-3.5 py-2.5">
                          <Link to={`/suppliers`} className="font-bold text-Pine hover:text-Berry transition-colors block truncate max-w-[160px]">
                            {s.name}
                          </Link>
                          <span className="text-[10px] text-Mist font-mono">{s.supplierCode}</span>
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-black">
                          {s.riskScore !== null ? (
                            <span className={s.riskScore < 50 ? 'text-Berry' : s.riskScore < 80 ? 'text-amber-600' : 'text-emerald-700'}>
                              {s.riskScore} / 100
                            </span>
                          ) : (
                            <span className="text-Mist">Chưa chấm</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-bold text-Berry">
                          {s.approvedHighCount}
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${rLvl.cls}`}>
                            {rLvl.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Phân bổ theo 4 Nhóm Tiêu chuẩn (Standard Groups) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-Pine font-mono flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-Pine" />
              Phát hiện vi phạm theo 4 nhóm tiêu chuẩn
            </h3>
          </div>

          <div className="rounded-xl border border-Mist/20 overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-Snowflake text-Pine font-black uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-3.5 py-2.5">Nhóm tiêu chuẩn</th>
                  <th className="px-3.5 py-2.5 text-center">Phát hiện</th>
                  <th className="px-3.5 py-2.5 text-center">Chờ duyệt</th>
                  <th className="px-3.5 py-2.5 text-center">Đã xác nhận</th>
                  <th className="px-3.5 py-2.5 text-right">Tỷ lệ duyệt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-Mist/15 font-medium text-Branch">
                {riskByStandardGroup.map((g) => (
                  <tr key={g.groupId} className="hover:bg-Snowflake/40">
                    <td className="px-3.5 py-2.5">
                      <span className="font-bold text-Pine block truncate max-w-[160px]">{g.groupName}</span>
                      <span className="text-[10px] text-Mist font-mono">{g.groupCode}</span>
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono font-bold text-Pine">
                      {g.totalFindings}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono text-amber-700">
                      {g.pendingCount}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono text-emerald-700 font-bold">
                      {g.approvedCount}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-black text-Pine">
                      {g.confirmationRate !== null ? `${g.confirmationRate}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
