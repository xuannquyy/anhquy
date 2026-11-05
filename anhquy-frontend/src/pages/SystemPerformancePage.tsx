import { useState, useEffect, useCallback } from 'react'
import { MainLayout } from '../components/MainLayout'
import { Spinner } from '../components/ui'
import { sqaApi } from '../api'
import { toast } from 'sonner'
import { AlertCircle } from 'lucide-react'

import { SQAHeader } from '../components/sqa/SQAHeader'
import type { PeriodOption } from '../components/sqa/SQAHeader'
import { SQAOverallStatus } from '../components/sqa/SQAOverallStatus'
import type { SQAOverviewMetrics, SQADiagnosisBrief } from '../components/sqa/SQAOverallStatus'
import { AIQualitySection } from '../components/sqa/AIQualitySection'
import type { AIQualityData } from '../components/sqa/AIQualitySection'
import { DocumentHealthSection } from '../components/sqa/DocumentHealthSection'
import type { DocumentHealthData } from '../components/sqa/DocumentHealthSection'
import { SupplierRiskSection } from '../components/sqa/SupplierRiskSection'
import type { SupplierRiskData } from '../components/sqa/SupplierRiskSection'
import { SQADiagnosticCenter } from '../components/sqa/SQADiagnosticCenter'
import type { DiagnosticsData } from '../components/sqa/SQADiagnosticCenter'

export default function SystemPerformancePage() {
  const [period, setPeriod] = useState<PeriodOption>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  // State các section dữ liệu SQA
  const [overallStatus, setOverallStatus] = useState<'HEALTHY' | 'ATTENTION' | 'CRITICAL' | 'INSUFFICIENT_DATA'>('INSUFFICIENT_DATA')
  const [metrics, setMetrics] = useState<SQAOverviewMetrics | null>(null)
  const [topDiagnoses, setTopDiagnoses] = useState<SQADiagnosisBrief[]>([])
  const [aiQuality, setAiQuality] = useState<AIQualityData | null>(null)
  const [docHealth, setDocHealth] = useState<DocumentHealthData | null>(null)
  const [supplierRisk, setSupplierRisk] = useState<SupplierRiskData | null>(null)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null)

  // Phân trang danh sách hợp đồng lỗi trong DocumentHealth
  const [failedDocsPage, setFailedDocsPage] = useState(1)

  // Hàm chuyển đổi Date sang định dạng YYYY-MM-DD theo giờ địa phương (tránh lỗi lệch ngày của toISOString)
  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  // Tính toán query params ngày tháng
  const getDateParams = useCallback(() => {
    if (period === 'custom') {
      if (customFrom && customTo) {
        return { from: customFrom, to: customTo }
      }
      return {}
    }

    const now = new Date()
    const endStr = formatLocalDate(now)
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
    const start = new Date(now)
    start.setDate(start.getDate() - days)
    const startStr = formatLocalDate(start)

    return { period, from: startStr, to: endStr }
  }, [period, customFrom, customTo])

  // Tải dữ liệu toàn diện từ 5 API SQA của Backend
  const fetchSqaData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const dateParams = getDateParams()

    try {
      const [overviewRes, aiQualityRes, docHealthRes, supplierRiskRes, diagnosticsRes] = await Promise.all([
        sqaApi.getOverview(dateParams).catch((err) => {
          console.error('[SQA Overview Error]', err)
          return null
        }),
        sqaApi.getAIQuality(dateParams).catch((err) => {
          console.error('[SQA AI Quality Error]', err)
          return null
        }),
        sqaApi.getDocumentHealth({ ...dateParams, page: failedDocsPage, limit: 5 }).catch((err) => {
          console.error('[SQA Document Health Error]', err)
          return null
        }),
        sqaApi.getSupplierRisk(dateParams).catch((err) => {
          console.error('[SQA Supplier Risk Error]', err)
          return null
        }),
        sqaApi.getDiagnostics(dateParams).catch((err) => {
          console.error('[SQA Diagnostics Error]', err)
          return null
        }),
      ])

      // Kiểm tra nếu tất cả API đều lỗi kết nối
      const allFailed = !overviewRes && !aiQualityRes && !docHealthRes && !supplierRiskRes && !diagnosticsRes
      if (allFailed) {
        throw new Error('Không thể kết nối đến máy chủ SQA. Vui lòng kiểm tra lại dịch vụ Backend.')
      }

      if (overviewRes?.data?.data) {
        setOverallStatus(overviewRes.data.data.overallStatus)
        setMetrics(overviewRes.data.data.metrics)
        setTopDiagnoses(overviewRes.data.data.topDiagnoses || [])
        setLastUpdated(overviewRes.data.data.generatedAt)
      }

      if (aiQualityRes?.data?.data) {
        setAiQuality(aiQualityRes.data.data)
      }

      if (docHealthRes?.data?.data) {
        setDocHealth(docHealthRes.data.data)
      }

      if (supplierRiskRes?.data?.data) {
        setSupplierRisk(supplierRiskRes.data.data)
      }

      if (diagnosticsRes?.data?.data) {
        setDiagnostics(diagnosticsRes.data.data)
      }

      if (isRefresh) {
        toast.success('Đã cập nhật dữ liệu chất lượng AI mới nhất!')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải toàn bộ dữ liệu SQA.'
      setError(msg)
      toast.error('Lỗi khi tải dữ liệu SQA: ' + msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [getDateParams, failedDocsPage])

  useEffect(() => {
    fetchSqaData()
  }, [fetchSqaData])

  const handleFailedDocsPageChange = async (newPage: number) => {
    setFailedDocsPage(newPage)
    const dateParams = getDateParams()
    try {
      const res = await sqaApi.getDocumentHealth({ ...dateParams, page: newPage, limit: 5 })
      if (res?.data?.data) {
        setDocHealth(res.data.data)
      }
    } catch {
      toast.error('Không thể chuyển trang danh sách lỗi.')
    }
  }

  return (
    <MainLayout breadcrumb="Trung tâm kiểm soát chất lượng AI">
      <div className="space-y-5 pb-10">
        {/* SECTION 01 — HEADER & BỘ LỌC THỜI GIAN */}
        <SQAHeader
          period={period}
          onPeriodChange={(p) => {
            setPeriod(p)
            setFailedDocsPage(1)
          }}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          onRefresh={() => fetchSqaData(true)}
          loading={refreshing}
          lastUpdated={lastUpdated}
        />

        {/* Xử lý trạng thái Lỗi toàn cục */}
        {error && (
          <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 flex items-center justify-between gap-3 text-rose-800 shadow-sm">
            <div className="flex items-center gap-2.5 text-xs font-bold">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchSqaData()}
              className="px-3.5 py-1.5 bg-white text-xs font-bold rounded-xl border border-rose-300 hover:bg-rose-100 transition-colors shadow-xs cursor-pointer flex-shrink-0"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Trạng thái Loading ban đầu */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-Mist/30 shadow-sm space-y-3">
            <Spinner size="lg" />
            <p className="text-xs font-bold text-Pine">Đang đối chiếu chỉ số chất lượng AI & rà soát dữ liệu SQA...</p>
          </div>
        ) : (
          <>
            {/* SECTION 02 — TỔNG QUAN CHẤT LƯỢNG HỆ THỐNG & CHẨN ĐOÁN ĐIỀU HÀNH */}
            <SQAOverallStatus
              overallStatus={overallStatus}
              metrics={metrics}
              topDiagnoses={topDiagnoses}
            />

            {/* SECTION 03 — CHẤT LƯỢNG PHÂN TÍCH AI & XÁC MINH CỦA CON NGƯỜI */}
            <AIQualitySection
              data={aiQuality}
              loading={loading}
            />

            {/* SECTION 04 — SỨC KHỎE XỬ LÝ HỢP ĐỒNG */}
            <DocumentHealthSection
              data={docHealth}
              loading={loading}
              onPageChange={handleFailedDocsPageChange}
            />

            {/* SECTION 05 — RỦI RO NHÀ CUNG ỨNG VÀ CHUỖI CUNG ỨNG */}
            <SupplierRiskSection
              data={supplierRisk}
              loading={loading}
            />

            {/* SECTION 06 — TRUNG TÂM CHẨN ĐOÁN VÀ HÀNH ĐỘNG KHẮC PHỤC */}
            <SQADiagnosticCenter
              data={diagnostics}
              loading={loading}
            />
          </>
        )}
      </div>
    </MainLayout>
  )
}
