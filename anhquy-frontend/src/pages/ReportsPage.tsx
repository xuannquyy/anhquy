import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { MainLayout } from '../components/MainLayout'
import { RiskScoreBar, Spinner, StatusBadge, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { violationApi, supplierApi, documentApi } from '../api'
import {
  BarChart3, Download, Printer, Filter, Calendar, Building2,
  AlertTriangle, FileText, RotateCcw, ExternalLink
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ViolationItem {
  id: number
  document_id?: number
  violation_desc: string
  evidence_quote?: string
  recommendation?: string | null
  page_number?: number | null
  risk_level: 'High' | 'Medium' | 'Low'
  status: 'Pending' | 'Approved' | 'Rejected'
  created_at: string
  Documents?: { id: number; file_name: string; Suppliers?: { id: number; company_name: string } }
  Standards?: { standard_code: string; name: string; jurisdiction?: string | null }
}

interface SupplierItem {
  id: number
  company_name: string
  tax_code: string
  contact_email: string | null
  risk_score: number | null
  is_deleted: boolean
  created_at: string
  Categories?: { name: string } | null
}

interface DocumentItem {
  id: number
  file_name: string
  status: string
  uploaded_at?: string
  created_at?: string
}

type PeriodMode = 'week' | 'day' | 'month' | 'year' | 'all'
type WeekPreset = 'this_week' | 'last_7_days' | 'last_week' | 'custom_week'

// ─── Helper làm sạch ký tự cho Excel ──────────────────────────────────────────
function cleanText(str: string | null | undefined): string {
  if (!str) return ''
  return str.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Helper tính ngày đầu tuần & cuối tuần ────────────────────────────────────

function getWeekBounds(preset: WeekPreset, customWeekStr: string): { start: Date; end: Date; label: string } {
  const now = new Date()
  if (preset === 'last_7_days') {
    const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return {
      start,
      end,
      label: `7 ngày gần nhất (${start.toLocaleDateString('vi-VN')} – ${end.toLocaleDateString('vi-VN')})`,
    }
  }

  if (preset === 'custom_week' && customWeekStr) {
    const [yStr, wStr] = customWeekStr.split('-W')
    const y = Number(yStr)
    const w = Number(wStr)
    if (!isNaN(y) && !isNaN(w)) {
      const simple = new Date(y, 0, 1 + (w - 1) * 7)
      const dow = simple.getDay()
      const start = new Date(simple)
      if (dow <= 4) start.setDate(simple.getDate() - simple.getDay() + 1)
      else start.setDate(simple.getDate() + 8 - simple.getDay())
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      return {
        start,
        end,
        label: `Tuần ${w}/${y} (${start.toLocaleDateString('vi-VN')} – ${end.toLocaleDateString('vi-VN')})`,
      }
    }
  }

  const dayOfWeek = (now.getDay() + 6) % 7
  const start = new Date(now)
  start.setDate(now.getDate() - dayOfWeek - (preset === 'last_week' ? 7 : 0))
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return {
    start,
    end,
    label: `${preset === 'last_week' ? 'Tuần trước' : 'Tuần này'} (${start.toLocaleDateString('vi-VN')} – ${end.toLocaleDateString('vi-VN')})`,
  }
}

export default function ReportsPage() {
  const { user, role } = useAuth()

  const [violations, setViolations] = useState<ViolationItem[]>([])
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([])
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)

  const currentYear = new Date().getFullYear()
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [reportScope, setReportScope] = useState<'all' | 'violations' | 'suppliers'>('all')

  const [weekPreset, setWeekPreset] = useState<WeekPreset>('last_7_days')
  const [customWeek, setCustomWeek] = useState('')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [fromMonth, setFromMonth] = useState(1)
  const [fromMonthYear, setFromMonthYear] = useState(currentYear)
  const [toMonth, setToMonth] = useState(12)
  const [toMonthYear, setToMonthYear] = useState(currentYear)

  const [fromYear, setFromYear] = useState(currentYear - 1)
  const [toYear, setToYear] = useState(currentYear)

  const [riskFilter, setRiskFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      try {
        const [vRes, sRes, dRes] = await Promise.all([
          violationApi.getAll({ limit: 1000 }).catch(() => ({ data: { items: [] } })),
          supplierApi.getAll({ limit: 500, is_deleted: false }).catch(() => ({ data: { items: [] } })),
          documentApi.getAll({ limit: 500 }).catch(() => ({ data: { items: [] } })),
        ])

        const vData = vRes.data?.data || vRes.data || {}
        setViolations((vData as { items?: ViolationItem[] })?.items || [])

        const sData = sRes.data?.data || sRes.data || {}
        setSuppliers((sData as { items?: SupplierItem[] })?.items || [])

        const dData = dRes.data?.data || dRes.data || {}
        setDocuments((dData as { items?: DocumentItem[] })?.items || [])
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const matchesPeriod = (dateStr?: string) => {
    if (!dateStr || periodMode === 'all') return true
    const dt = new Date(dateStr)
    if (isNaN(dt.getTime())) return true

    if (periodMode === 'week') {
      const { start, end } = getWeekBounds(weekPreset, customWeek)
      const t = dt.getTime()
      return t >= start.getTime() && t <= end.getTime()
    }

    if (periodMode === 'day') {
      const t = dt.getTime()
      if (dateFrom) {
        const fromT = new Date(`${dateFrom}T00:00:00`).getTime()
        if (t < fromT) return false
      }
      if (dateTo) {
        const toT = new Date(`${dateTo}T23:59:59`).getTime()
        if (t > toT) return false
      }
      return true
    }

    if (periodMode === 'month') {
      const itemVal = dt.getFullYear() * 12 + (dt.getMonth() + 1)
      const startVal = fromMonthYear * 12 + fromMonth
      const endVal = toMonthYear * 12 + toMonth
      return itemVal >= Math.min(startVal, endVal) && itemVal <= Math.max(startVal, endVal)
    }

    if (periodMode === 'year') {
      const y = dt.getFullYear()
      return y >= Math.min(fromYear, toYear) && y <= Math.max(fromYear, toYear)
    }

    return true
  }

  const filteredViolations = useMemo(() => {
    return violations.filter((v) => {
      if (!matchesPeriod(v.created_at)) return false
      if (riskFilter && v.risk_level !== riskFilter) return false
      if (statusFilter && v.status !== statusFilter) return false
      if (supplierFilter && String(v.Documents?.Suppliers?.id) !== supplierFilter) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [violations, periodMode, weekPreset, customWeek, dateFrom, dateTo, fromMonth, fromMonthYear, toMonth, toMonthYear, fromYear, toYear, riskFilter, statusFilter, supplierFilter])

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (!matchesPeriod(s.created_at)) return false
      if (supplierFilter && String(s.id) !== supplierFilter) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers, periodMode, weekPreset, customWeek, dateFrom, dateTo, fromMonth, fromMonthYear, toMonth, toMonthYear, fromYear, toYear, supplierFilter])

  const periodDescription = useMemo(() => {
    if (periodMode === 'all') return 'Toàn bộ thời gian'
    if (periodMode === 'week') return getWeekBounds(weekPreset, customWeek).label
    if (periodMode === 'day') return `Từ ngày ${dateFrom || 'Đầu'} đến ngày ${dateTo || 'Hiện tại'}`
    if (periodMode === 'month') return `Từ Tháng ${fromMonth}/${fromMonthYear} đến Tháng ${toMonth}/${toMonthYear}`
    return `Từ Năm ${fromYear} đến Năm ${toYear}`
  }, [periodMode, weekPreset, customWeek, dateFrom, dateTo, fromMonth, fromMonthYear, toMonth, toMonthYear, fromYear, toYear])

  const handleResetFilters = () => {
    setPeriodMode('all')
    setReportScope('all')
    setRiskFilter('')
    setStatusFilter('')
    setSupplierFilter('')
    setDateFrom('')
    setDateTo('')
    toast.success('Đã đặt lại toàn bộ bộ lọc báo cáo.')
  }

  // ─── KẾT XUẤT EXCEL (.xls) CHUẨN CÓ KẺ BẢNG VÀ CHIA SHEET/SECTION ────────────
  const handleExportExcel = () => {
    toast.loading('Đang khởi tạo báo cáo Excel...', { id: 'excel' })
    
    let excelHtml = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <style>
          body { font-family: "Times New Roman", Arial, sans-serif; font-size: 11pt; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 30px; }
          th { background-color: #0B132B; color: #FFFFFF; font-weight: bold; padding: 10px 8px; border: 1px solid #475569; text-align: center; vertical-align: middle; }
          td { padding: 8px; border: 1px solid #CBD5E1; vertical-align: top; mso-number-format:"\\@"; }
          .header-title { font-size: 16pt; font-weight: bold; color: #0B132B; text-align: left; border: none; padding: 6px 0; }
          .header-meta { font-size: 11pt; color: #475569; text-align: left; border: none; padding-bottom: 16px; font-style: italic; }
          .section-title { font-size: 13pt; font-weight: bold; color: #791127; text-align: left; border: none; padding: 12px 0 6px 0; }
        </style>
      </head>
      <body>
        <table>
          <tr><td colspan="8" class="header-title">BÁO CÁO TỔNG HỢP KIỂM TOÁN CHUỖI CUNG ỨNG (HỆ THỐNG ANHQUY)</td></tr>
          <tr><td colspan="8" class="header-meta">Kỳ báo cáo: ${periodDescription} · Kết xuất lúc: ${new Date().toLocaleString('vi-VN')} · Người kết xuất: ${user?.full_name || 'Admin'}</td></tr>
        </table>`

    if (reportScope === 'suppliers' || reportScope === 'all') {
      const supRows = filteredSuppliers.map((s, idx) => {
        const sc = s.risk_score ?? 100
        const rank = sc >= 80 ? 'An toàn' : sc >= 50 ? 'Cảnh báo' : 'Nguy hiểm'
        const color = sc >= 80 ? '#0B132B' : sc >= 50 ? '#B45309' : '#791127'
        return `
          <tr>
            <td style="text-align:center;font-weight:bold">${idx + 1}</td>
            <td style="font-weight:bold">${escapeHtml(s.company_name)}</td>
            <td style="text-align:center">${escapeHtml(s.tax_code)}</td>
            <td>${escapeHtml(s.Categories?.name || '—')}</td>
            <td>${escapeHtml(s.contact_email || '—')}</td>
            <td style="text-align:center;font-weight:bold;color:${color}">${sc} / 100</td>
            <td style="text-align:center;font-weight:bold;color:${color}">${rank}</td>
            <td style="text-align:center">${new Date(s.created_at).toLocaleDateString('vi-VN')}</td>
          </tr>`
      }).join('')

      excelHtml += `
        <table>
          <tr><td colspan="8" class="section-title">I. BẢNG TỔNG HỢP ĐIỂM TÍN NHIỆM ĐỐI TÁC (${filteredSuppliers.length} đối tác)</td></tr>
          <thead>
            <tr>
              <th style="width:45px">STT</th>
              <th style="width:250px">Tên Công Ty</th>
              <th style="width:120px">Mã Số Thuế</th>
              <th style="width:160px">Ngành Nghề</th>
              <th style="width:180px">Email Liên Hệ</th>
              <th style="width:120px">Điểm Tín Nhiệm</th>
              <th style="width:120px">Xếp Loại Rủi Ro</th>
              <th style="width:110px">Ngày Tạo</th>
            </tr>
          </thead>
          <tbody>
            ${supRows || '<tr><td colspan="8" style="text-align:center">Không có nhà cung ứng nào trong kỳ báo cáo này</td></tr>'}
          </tbody>
        </table>`
    }

    if (reportScope === 'violations' || reportScope === 'all') {
      const violRows = filteredViolations.map((v, idx) => {
        const riskText = v.risk_level === 'High' ? 'Cao (-10đ)' : v.risk_level === 'Medium' ? 'Trung bình (-5đ)' : 'Thấp (-2đ)'
        const riskColor = v.risk_level === 'High' ? '#791127' : v.risk_level === 'Medium' ? '#B45309' : '#0B132B'
        const statusText = v.status === 'Pending' ? 'Chờ thẩm định' : v.status === 'Approved' ? 'Đã duyệt' : 'Đã bác bỏ'
        
        return `
          <tr>
            <td style="text-align:center;font-weight:bold">${idx + 1}</td>
            <td style="font-weight:bold">${escapeHtml(v.Documents?.Suppliers?.company_name || '—')}</td>
            <td>${escapeHtml(v.Documents?.file_name || '—')}</td>
            <td style="font-family:Consolas,monospace;font-weight:bold">${escapeHtml(v.Standards?.standard_code || '—')}</td>
            <td style="font-weight:bold;color:${riskColor};text-align:center">${riskText}</td>
            <td style="text-align:center">${statusText}</td>
            <td style="text-align:center">${v.page_number ?? '—'}</td>
            <td>${escapeHtml(cleanText(v.violation_desc))}</td>
            <td style="font-style:italic;color:#475569">"${escapeHtml(cleanText(v.evidence_quote))}"</td>
            <td>${escapeHtml(cleanText(v.recommendation))}</td>
            <td style="text-align:center">${new Date(v.created_at).toLocaleDateString('vi-VN')}</td>
          </tr>`
      }).join('')

      excelHtml += `
        <table>
          <tr><td colspan="11" class="section-title">II. BẢNG CHI TIẾT CẢNH BÁO VI PHẠM TỪ AI RAG (${filteredViolations.length} vi phạm)</td></tr>
          <thead>
            <tr>
              <th style="width:45px">STT</th>
              <th style="width:200px">Nhà Cung Ứng</th>
              <th style="width:200px">Hợp Đồng PDF</th>
              <th style="width:110px">Mã Tiêu Chuẩn</th>
              <th style="width:120px">Mức Rủi Ro</th>
              <th style="width:110px">Trạng Thái</th>
              <th style="width:60px">Trang</th>
              <th style="width:280px">Mô Tả Vi Phạm</th>
              <th style="width:300px">Bằng Chứng Trích Xuất (Nguyên văn)</th>
              <th style="width:240px">Khuyến Nghị Sửa Đổi</th>
              <th style="width:100px">Ngày Phát Hiện</th>
            </tr>
          </thead>
          <tbody>
            ${violRows || '<tr><td colspan="11" style="text-align:center">Không có cảnh báo vi phạm nào trong kỳ báo cáo này</td></tr>'}
          </tbody>
        </table>`
    }

    excelHtml += `</body></html>`

    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Bao-Cao-Kiem-Toan-ANHQUY-${new Date().toISOString().slice(0, 10)}.xls`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã xuất thành công Báo cáo Excel chuẩn Form!', { id: 'excel' })
  }

  // ─── KẾT XUẤT PDF TRỰC QUAN CHUẨN ROYAL MIDNIGHT & ROSEWOOD ─────────────────
  const handlePrintPDF = () => {
    const win = window.open('', '_blank')
    if (!win) {
      toast.error('Trình duyệt đang chặn Popup. Vui lòng cho phép để in báo cáo PDF.')
      return
    }

    const supRows = filteredSuppliers.map((s, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td style="font-weight:bold">${escapeHtml(s.company_name)}</td>
        <td style="font-family:monospace">${escapeHtml(s.tax_code)}</td>
        <td>${escapeHtml(s.Categories?.name || '—')}</td>
        <td style="text-align:center;font-weight:bold;color:${(s.risk_score ?? 100)>=80?'#0B132B':(s.risk_score ?? 100)>=50?'#B45309':'#791127'}">${s.risk_score ?? 100}/100</td>
      </tr>`).join('')

    const violRows = filteredViolations.map((v, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td style="font-weight:bold">${escapeHtml(v.Documents?.Suppliers?.company_name || '—')}</td>
        <td style="font-family:monospace;font-weight:bold">${escapeHtml(v.Standards?.standard_code || '—')}</td>
        <td style="font-weight:bold;text-align:center;color:${v.risk_level==='High'?'#791127':v.risk_level==='Medium'?'#B45309':'#0B132B'}">${v.risk_level}</td>
        <td style="text-align:center">${v.status === 'Approved'?'Đã duyệt':v.status==='Pending'?'Chờ duyệt':'Bác bỏ'}</td>
        <td style="font-size:11px">${escapeHtml(cleanText(v.violation_desc))}</td>
      </tr>`).join('')

    win.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
      <title>Báo cáo Kiểm toán Chuỗi Cung ứng – ANHQUY</title>
      <style>
        body { font-family: "Arial", sans-serif; margin: 40px; color: #0B132B; line-height: 1.4; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0B132B; padding-bottom: 16px; margin-bottom: 24px; }
        .header-left h1 { font-size: 22px; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; }
        .header-left p { font-size: 12px; color: #475569; margin: 0; }
        .brand { font-size: 28px; font-weight: 900; color: #0B132B; letter-spacing: -1px; }
        .brand span { color: #791127; }
        h2 { font-size: 14px; color: #791127; margin: 28px 0 10px; text-transform: uppercase; border-left: 4px solid #791127; padding-left: 8px; }
        .kpi-row { display: flex; gap: 12px; margin-bottom: 20px; }
        .kpi-box { flex: 1; border: 1px solid #CBD5E1; border-radius: 8px; padding: 12px; text-align: center; background: #F8FAFC; }
        .kpi-num { font-size: 24px; font-weight: bold; color: #0B132B; }
        .kpi-label { font-size: 11px; color: #475569; text-transform: uppercase; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
        th { background: #0B132B; color: #FFFFFF; padding: 10px 8px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
        .footer { margin-top: 40px; font-size: 10px; color: #64748B; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 12px; }
        @media print { button { display: none !important; } }
      </style></head><body>
      
      <div class="header">
        <div class="header-left">
          <h1>BÁO CÁO TỔNG HỢP KIỂM TOÁN CHUỖI CUNG ỨNG</h1>
          <p>Kỳ báo cáo: <strong>${periodDescription}</strong></p>
          <p>Người lập: ${escapeHtml(user?.full_name)} (${role}) · Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}</p>
        </div>
        <div class="brand">ANH<span>QUY</span></div>
      </div>

      <div class="kpi-row">
        <div class="kpi-box"><div class="kpi-num">${filteredSuppliers.length}</div><div class="kpi-label">Hồ sơ Đối tác</div></div>
        <div class="kpi-box"><div class="kpi-num" style="color:#791127">${filteredViolations.length}</div><div class="kpi-label">Tổng Vi phạm</div></div>
        <div class="kpi-box"><div class="kpi-num">${filteredViolations.filter(v=>v.risk_level==='High').length}</div><div class="kpi-label">Vi phạm Rủi ro Cao</div></div>
      </div>

      ${reportScope !== 'violations' ? `
        <h2>I. Điểm Tín Nhiệm & Xếp Loại Nhà Cung Ứng</h2>
        <table><thead><tr><th style="width:40px;text-align:center">STT</th><th>Tên Công ty Đối tác</th><th>Mã số thuế</th><th>Ngành nghề</th><th style="width:80px;text-align:center">Điểm số</th></tr></thead>
        <tbody>${supRows || '<tr><td colspan="5" style="text-align:center">Không có đối tác nào trong kỳ lọc</td></tr>'}</tbody></table>
      ` : ''}

      ${reportScope !== 'suppliers' ? `
        <h2>II. Danh sách Bóc tách Cảnh báo Vi phạm Hợp đồng</h2>
        <table><thead><tr><th style="width:40px;text-align:center">STT</th><th>Nhà cung ứng</th><th style="width:90px">Mã Chuẩn</th><th style="width:70px;text-align:center">Rủi ro</th><th style="width:80px;text-align:center">Trạng thái</th><th>Mô tả tóm tắt</th></tr></thead>
        <tbody>${violRows || '<tr><td colspan="6" style="text-align:center">Không có vi phạm nào trong kỳ lọc</td></tr>'}</tbody></table>
      ` : ''}

      <div class="footer">
        Báo cáo được kết xuất tự động từ Hệ thống AI Ethical Sourcing Auditor (ANHQUY) · Tuân thủ chuẩn RBA v8.0 & Pháp luật VN.
      </div>
    </body></html>`)
    
    win.document.close()
    win.onload = () => { win.print(); win.close() }
  }

  const yearsList = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear, currentYear + 1]
  const monthsList = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <MainLayout breadcrumb="Trung tâm Xuất Báo cáo">
      <div className="space-y-5">
        {/* ─── Header Banner ── */}
        <div className="bg-gradient-to-r from-Pine via-[#1E293B] to-Berry rounded-3xl p-6 text-white shadow-[0_14px_34px_rgba(11,19,43,0.18)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white/15 text-Snowflake text-xs font-bold mb-2">
              <BarChart3 className="w-4 h-4 text-Frostysilver" />
              <span>Báo cáo Kiểm toán Chuỗi cung ứng</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Trung tâm Kết xuất Báo cáo & Truy vấn
            </h1>
            <p className="text-xs sm:text-sm text-Snowflake/85 mt-1">
              Kỳ đang chọn: <strong className="text-white underline">{periodDescription}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-Snowflake text-xs font-bold rounded-2xl border border-white/15 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Đặt lại
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-Snowflake text-Pine text-xs font-extrabold rounded-2xl hover:bg-white shadow-md transition-all"
            >
              <Download className="w-4 h-4" />
              Xuất Excel
            </button>
            <button
              type="button"
              onClick={handlePrintPDF}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-Berry text-white text-xs font-extrabold rounded-2xl hover:bg-Berry/90 shadow-md border border-white/20 transition-all"
            >
              <Printer className="w-4 h-4" />
              In Báo cáo (PDF)
            </button>
          </div>
        </div>

        {/* ─── 3 Thẻ Tóm tắt Nhanh Kết quả Truy vấn ─────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl border border-Mist/20 p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-Pine text-white flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Đối tác trong kỳ lọc</p>
              <p className="text-2xl font-extrabold text-Pine">{filteredSuppliers.length}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-Mist/20 p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-Berry text-white flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Vi phạm khớp điều kiện</p>
              <p className="text-2xl font-extrabold text-Berry">{filteredViolations.length}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-Mist/20 p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-Mist text-Pine flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Tổng hợp đồng hệ thống</p>
              <p className="text-2xl font-extrabold text-Pine">{documents.length}</p>
            </div>
          </div>
        </div>

        {/* ─── Khung Cấu hình Truy vấn (Tuần / Ngày / Tháng / Năm / Tất cả) ─── */}
        <div className="bg-white rounded-3xl border border-Mist/20 p-6 shadow-sm space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-Mist/20 pb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-Berry" />
              <h3 className="text-sm font-extrabold text-Pine">
                1. Chọn Chu kỳ Thời gian Kết xuất
              </h3>
            </div>

            <div className="flex flex-wrap gap-1.5 bg-Snowflake/70 p-1.5 rounded-2xl border border-Mist/30">
              {[
                { key: 'week',  label: 'Theo Tuần' },
                { key: 'day',   label: 'Theo Ngày' },
                { key: 'month', label: 'Theo Tháng' },
                { key: 'year',  label: 'Theo Năm' },
                { key: 'all',   label: 'Toàn thời gian' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPeriodMode(tab.key as PeriodMode)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all ${
                    periodMode === tab.key
                      ? 'bg-Pine text-white shadow-sm'
                      : 'text-Pine hover:bg-white border border-transparent hover:border-Mist/30'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* 1. Bộ chọn Theo Tuần */}
          {periodMode === 'week' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-Snowflake/40 p-4 rounded-2xl border border-Mist/25">
              <div>
                <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">
                  Chọn nhanh tuần báo cáo
                </label>
                <select
                  value={weekPreset}
                  onChange={(e) => setWeekPreset(e.target.value as WeekPreset)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-Mist/40 bg-white text-sm text-Pine font-bold"
                >
                  <option value="last_7_days">7 ngày gần nhất</option>
                  <option value="this_week">Tuần này (Thứ 2 – Chủ nhật)</option>
                  <option value="last_week">Tuần trước</option>
                  <option value="custom_week">Chọn tuần cụ thể trong năm...</option>
                </select>
              </div>
              {weekPreset === 'custom_week' && (
                <div>
                  <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">
                    Chọn tuần trong năm
                  </label>
                  <input
                    type="week"
                    value={customWeek}
                    onChange={(e) => setCustomWeek(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-Mist/40 bg-white text-sm text-Pine font-bold"
                  />
                </div>
              )}
            </div>
          )}

          {/* 2. Bộ chọn Theo Ngày */}
          {periodMode === 'day' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-Snowflake/40 p-4 rounded-2xl border border-Mist/25">
              <div>
                <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">Từ ngày</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-Mist/40 bg-white text-sm text-Pine font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">Đến ngày</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-Mist/40 bg-white text-sm text-Pine font-bold"
                />
              </div>
            </div>
          )}

          {/* 3. Bộ chọn Theo Tháng */}
          {periodMode === 'month' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-Snowflake/40 p-4 rounded-2xl border border-Mist/25">
              <div>
                <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">Từ Tháng / Năm</label>
                <div className="flex gap-2">
                  <select
                    value={fromMonth}
                    onChange={(e) => setFromMonth(Number(e.target.value))}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-Mist/40 bg-white text-sm text-Branch font-bold"
                  >
                    {monthsList.map((m) => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                  <select
                    value={fromMonthYear}
                    onChange={(e) => setFromMonthYear(Number(e.target.value))}
                    className="w-28 px-3 py-2.5 rounded-xl border border-Mist/40 bg-white text-sm text-Branch font-bold"
                  >
                    {yearsList.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">Đến Tháng / Năm</label>
                <div className="flex gap-2">
                  <select
                    value={toMonth}
                    onChange={(e) => setToMonth(Number(e.target.value))}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-Mist/40 bg-white text-sm text-Branch font-bold"
                  >
                    {monthsList.map((m) => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                  <select
                    value={toMonthYear}
                    onChange={(e) => setToMonthYear(Number(e.target.value))}
                    className="w-28 px-3 py-2.5 rounded-xl border border-Mist/40 bg-white text-sm text-Branch font-bold"
                  >
                    {yearsList.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 4. Bộ chọn Theo Năm */}
          {periodMode === 'year' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-Snowflake/40 p-4 rounded-2xl border border-Mist/25">
              <div>
                <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">Từ Năm</label>
                <select
                  value={fromYear}
                  onChange={(e) => setFromYear(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-Mist/40 bg-white text-sm text-Branch font-bold"
                >
                  {yearsList.map((y) => (
                    <option key={y} value={y}>Năm {y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">Đến Năm</label>
                <select
                  value={toYear}
                  onChange={(e) => setToYear(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-Mist/40 bg-white text-sm text-Branch font-bold"
                >
                  {yearsList.map((y) => (
                    <option key={y} value={y}>Năm {y}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Bộ lọc chi tiết */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <div>
              <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">
                <Filter className="w-3 h-3 inline mr-1 text-Berry" />
                Nội dung xuất
              </label>
              <select
                value={reportScope}
                onChange={(e) => setReportScope(e.target.value as typeof reportScope)}
                className="w-full px-3 py-2.5 rounded-xl border border-Mist/40 bg-white text-xs sm:text-sm text-Branch font-bold"
              >
                <option value="all">Toàn diện (Đối tác + Vi phạm)</option>
                <option value="suppliers">Chỉ Bảng Điểm Nhà cung ứng</option>
                <option value="violations">Chỉ Bảng Cảnh báo Vi phạm</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">
                Lọc theo Nhà cung ứng
              </label>
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-Mist/40 bg-white text-xs sm:text-sm text-Branch font-bold"
              >
                <option value="">Tất cả nhà cung ứng</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.company_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">
                Mức độ rủi ro
              </label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                disabled={reportScope === 'suppliers'}
                className="w-full px-3 py-2.5 rounded-xl border border-Mist/40 bg-white text-xs sm:text-sm text-Branch font-bold disabled:opacity-50"
              >
                <option value="">Tất cả mức độ</option>
                <option value="High">Rủi ro Cao (High)</option>
                <option value="Medium">Trung bình (Medium)</option>
                <option value="Low">Rủi ro Thấp (Low)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase text-Pine mb-1.5">
                Trạng thái thẩm định
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                disabled={reportScope === 'suppliers'}
                className="w-full px-3 py-2.5 rounded-xl border border-Mist/40 bg-white text-xs sm:text-sm text-Branch font-bold disabled:opacity-50"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="Approved">Đã phê duyệt (Approved)</option>
                <option value="Pending">Chờ thẩm định (Pending)</option>
                <option value="Rejected">Đã bác bỏ (Rejected)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ─── Bảng Xem Trước Dữ Liệu Trực Tiếp (Live Preview) ──────────────── */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <div className="space-y-5">
            {reportScope !== 'violations' && (
              <div className="bg-white rounded-3xl border border-Mist/20 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-extrabold text-Pine">
                    Bảng 1: Điểm Tín nhiệm Đối tác Cung ứng ({filteredSuppliers.length} đơn vị)
                  </h3>
                  <Link to="/suppliers" className="text-xs font-extrabold text-Pine hover:underline">
                    Quản lý đối tác →
                  </Link>
                </div>
                {filteredSuppliers.length === 0 ? (
                  <EmptyState message="Không có nhà cung ứng nào trong khoảng thời gian đã chọn" />
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-Mist/25">
                    <table className="min-w-full text-xs divide-y divide-Mist/15">
                      <thead className="bg-Pine text-white">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold">Tên Công ty</th>
                          <th className="px-4 py-3 text-left font-bold">Mã số thuế</th>
                          <th className="px-4 py-3 text-left font-bold">Ngành nghề</th>
                          <th className="px-4 py-3 text-left font-bold">Điểm tín nhiệm</th>
                          <th className="px-4 py-3 text-left font-bold">Ngày tạo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-Mist/15">
                        {filteredSuppliers.map((s) => (
                          <tr key={s.id} className="hover:bg-Snowflake/40">
                            <td className="px-4 py-3 font-bold text-Pine">{s.company_name}</td>
                            <td className="px-4 py-3 font-mono text-Branch">{s.tax_code}</td>
                            <td className="px-4 py-3 text-Branch">{s.Categories?.name || '—'}</td>
                            <td className="px-4 py-3"><RiskScoreBar score={s.risk_score} /></td>
                            <td className="px-4 py-3 text-Mist">{new Date(s.created_at).toLocaleDateString('vi-VN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {reportScope !== 'suppliers' && (
              <div className="bg-white rounded-3xl border border-Mist/20 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-extrabold text-Pine">
                    Bảng 2: Danh sách Chi tiết Cảnh báo Vi phạm ({filteredViolations.length} bản ghi)
                  </h3>
                  <Link to="/violations" className="text-xs font-extrabold text-Pine hover:underline">
                    Trung tâm thẩm định →
                  </Link>
                </div>
                {filteredViolations.length === 0 ? (
                  <EmptyState message="Không có cảnh báo vi phạm nào khớp với bộ lọc thời gian" />
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-Mist/25">
                    <table className="min-w-full text-xs divide-y divide-Mist/15">
                      <thead className="bg-Pine text-white">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold">Đối tác / Hợp đồng</th>
                          <th className="px-4 py-3 text-left font-bold">Tiêu chuẩn</th>
                          <th className="px-4 py-3 text-left font-bold">Mức độ</th>
                          <th className="px-4 py-3 text-left font-bold">Trạng thái</th>
                          <th className="px-4 py-3 text-left font-bold">Mô tả vi phạm</th>
                          <th className="px-4 py-3 text-center font-bold">Kiểm toán</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-Mist/15">
                        {filteredViolations.map((v) => (
                          <tr key={v.id} className="hover:bg-Snowflake/40">
                            <td className="px-4 py-3">
                              <p className="font-bold text-Pine">{v.Documents?.Suppliers?.company_name || '—'}</p>
                              <p className="text-[11px] text-Mist">{v.Documents?.file_name}</p>
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-Pine">{v.Standards?.standard_code || '—'}</td>
                            <td className="px-4 py-3"><StatusBadge status={v.risk_level} /></td>
                            <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                            <td className="px-4 py-3 text-Branch max-w-xs truncate">{v.violation_desc}</td>
                            <td className="px-4 py-3 text-center">
                              {v.Documents?.id && (
                                <Link
                                  to={`/audit/${v.Documents.id}`}
                                  className="inline-flex items-center justify-center p-1.5 rounded-xl bg-Snowflake text-Pine hover:bg-Pine hover:text-white transition-colors border border-Mist/20"
                                  title="Mở Phòng Kiểm toán Split-view"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  )
}