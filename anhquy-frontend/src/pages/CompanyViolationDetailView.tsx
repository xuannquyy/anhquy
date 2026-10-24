import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChevronLeft, Building2, FileText, AlertTriangle, CheckCircle2,
  XCircle, ExternalLink, BookOpen, Lightbulb, Eye, Layers,
  ClipboardCheck, Printer, ShieldCheck
} from 'lucide-react'
import { RiskScoreBar, StatusBadge } from '../components/ui'
import { cleanVietnamesePdfText } from './AuditWorkspacePage'

export interface DetailViolation {
  id: number
  document_id?: number
  risk_level: 'High' | 'Medium' | 'Low'
  status: 'Pending' | 'Approved' | 'Rejected'
  violation_desc: string
  evidence_quote: string
  page_number: number | null
  recommendation: string | null
  reviewed_at?: string | null
  created_at?: string
  Documents?: {
    id: number
    file_name: string
    Suppliers?: { id: number; company_name: string; tax_code?: string; risk_score?: number | null }
  }
  Standards?: {
    id: number
    standard_code: string
    name: string
    jurisdiction: string | null
  }
  Users?: { id: number; full_name: string }
}

export interface ContractGroupItem {
  docId: number
  fileName: string
  violations: DetailViolation[]
  highCount: number
  pendingCount: number
  approvedCount: number
}

export interface CompanyViolationGroup {
  companyKey: string
  companyId?: number
  companyName: string
  riskScore: number | null
  items: DetailViolation[]
  contractsMap: Map<number, ContractGroupItem>
  highCount: number
  pendingCount: number
  approvedCount: number
}

interface Props {
  companyGroup: CompanyViolationGroup
  canApprove: boolean
  canExport: boolean
  auditorName: string
  onBack: () => void
  onReviewSingle: (violationId: number, status: 'Approved' | 'Rejected') => void
  onBatchApproveContract: (violations: DetailViolation[]) => void
  onOpenDetailModal: (v: DetailViolation) => void
}

function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── HÀM IN BÁO CÁO TỔNG HỢP TOÀN CÔNG TY (GỘP TẤT CẢ HỢP ĐỒNG CỦA ĐỐI TÁC) ─
function printCompanyWideExecutiveReportA4(
  companyGroup: CompanyViolationGroup,
  contractsList: ContractGroupItem[],
  currentCompanyScore: number,
  auditorName: string
) {
  const actionableItems = companyGroup.items.filter((v) => v.status !== 'Rejected')
  const highCount = actionableItems.filter((v) => v.risk_level === 'High').length
  const mediumCount = actionableItems.filter((v) => v.risk_level === 'Medium').length
  const lowCount = actionableItems.filter((v) => v.risk_level === 'Low').length
  const approvedCount = actionableItems.filter((v) => v.status === 'Approved').length
  const pendingCount = actionableItems.filter((v) => v.status === 'Pending').length

  const scoreClassification =
    currentCompanyScore >= 80
      ? 'Đạt chuẩn an toàn (Safe)'
      : currentCompanyScore >= 50
      ? 'Cần kiểm soát rủi ro (Warning)'
      : 'Rủi ro trọng yếu (High Risk)'

  const executiveVerdict =
    highCount > 0
      ? 'PHÁT HIỆN RỦI RO PHÁP LÝ TRỌNG YẾU TRÊN HỒ SƠ ĐỐI TÁC — ĐỀ NGHỊ TẠM HOÃN KÝ KẾT VÀ YÊU CẦU ĐÀM PHÁN, HIỆU CHỈNH ĐIỀU KHOẢN'
      : actionableItems.length > 0
      ? 'TỒN TẠI ĐIỀU KHOẢN CHƯA HOÀN TOÀN PHÙ HỢP — ĐỀ NGHỊ ĐỐI TÁC HIỆU CHỈNH DỰ THẢO TRƯỚC KHI KÝ KẾT'
      : 'HỒ SƠ ĐỐI TÁC ĐẠT YÊU CẦU TUÂN THỦ PHÁP LUẬT & TIÊU CHUẨN RBA — ĐỦ ĐIỀU KIỆN PHÊ DUYỆT'

  const contractsSummaryRows = contractsList
    .map(
      (c, i) => `
      <tr>
        <td style="text-align:center;font-weight:bold">${i + 1}</td>
        <td><strong>${escapeHtml(c.fileName)}</strong> (Mã hồ sơ: #DOC-${c.docId})</td>
        <td style="text-align:center;font-weight:bold">${c.violations.length}</td>
        <td style="text-align:center;font-weight:bold;color:#6B212C">${c.highCount}</td>
        <td style="text-align:center">${
          c.pendingCount > 0 ? `${c.pendingCount} chờ thẩm định` : `Đã thẩm định (${c.approvedCount} duyệt)`
        }</td>
      </tr>`
    )
    .join('')

  const detailRows = actionableItems
    .map((v, idx) => {
      const riskLabel =
        v.risk_level === 'High'
          ? 'Rủi ro Cao (-10đ)'
          : v.risk_level === 'Medium'
          ? 'Trung bình (-5đ)'
          : 'Rủi ro Thấp (-2đ)'
      const riskColor =
        v.risk_level === 'High' ? '#6B212C' : v.risk_level === 'Medium' ? '#B45309' : '#014BAA'

      return `
        <tr>
          <td style="text-align:center;font-weight:bold">${idx + 1}</td>
          <td>
            <div style="font-weight:bold;color:#0A1020">${escapeHtml(v.Documents?.file_name || '—')}</div>
            <div style="font-weight:bold;color:#014BAA;margin-top:3px">${escapeHtml(v.Standards?.standard_code || 'RBA')}</div>
            <div style="font-size:10pt">${escapeHtml(v.Standards?.name || '')}</div>
            <div style="font-size:9.5pt;color:#475569;margin-top:3px">
              Trang ${v.page_number ?? '?'} · <strong style="color:${riskColor}">${riskLabel}</strong>
            </div>
          </td>
          <td style="text-align:justify">
            <div style="margin-bottom:5px">${escapeHtml(cleanVietnamesePdfText(v.violation_desc))}</div>
            <div style="background:#FFF1F2;border-left:3px solid #6B212C;padding:5px 7px;font-style:italic;font-size:10pt;color:#51121A">
              "${escapeHtml(cleanVietnamesePdfText(v.evidence_quote))}"
            </div>
          </td>
          <td style="text-align:justify;background:#ECFDF5;color:#047857;font-weight:600">
            ${escapeHtml(cleanVietnamesePdfText(v.recommendation))}
          </td>
        </tr>`
    })
    .join('')

  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <title>Báo cáo Thẩm định Toàn Công ty - ${escapeHtml(companyGroup.companyName)}</title>
    <style>
      @page { size: A4 portrait; margin: 14mm 14mm 14mm 16mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.45; color: #0A1020; margin: 0; background: #FFF; }
      .gov-header { width: 100%; border-collapse: collapse; margin-bottom: 12px; border-bottom: 2px solid #014BAA; }
      .gov-header td { border: none; padding: 0 0 8px 0; vertical-align: top; }
      .logo-badge { display: inline-block; width: 32px; height: 32px; line-height: 28px; text-align: center; background: #014BAA; color: #FFF; font-family: Arial, sans-serif; font-weight: 900; border-radius: 6px; border: 2px solid #EBBC62; margin-right: 8px; }
      h1 { font-size: 14.5pt; color: #014BAA; text-transform: uppercase; margin: 0 0 4px 0; text-align: center; }
      .section-heading { font-size: 11pt; font-weight: bold; text-transform: uppercase; color: #014BAA; margin: 12px 0 6px 0; }
      table.formal-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10.5pt; }
      table.formal-table th { background: #014BAA !important; color: #FFF !important; padding: 6px 7px; border: 1px solid #0A1020; text-align: center; }
      table.formal-table td { padding: 6px 7px; border: 1px solid #475569; vertical-align: top; }
      tr { page-break-inside: avoid; }
    </style>
  </head>
  <body>
    <table class="gov-header">
      <tr>
        <td style="width:52%">
          <span class="logo-badge">AQ</span>
          <span style="display:inline-block;vertical-align:middle">
            <strong style="color:#014BAA">HỆ THỐNG KIỂM TOÁN TUÂN THỦ ANHQUY</strong><br/>
            <span style="font-size:9.5pt;font-weight:bold">PHÒNG PHÁP CHẾ & KIỂM SOÁT RỦI RO</span>
          </span>
        </td>
        <td style="width:48%;text-align:right">
          <div style="font-weight:bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div style="font-weight:bold;text-decoration:underline">Độc lập – Tự do – Hạnh phúc</div>
          <div style="font-size:9.5pt;font-style:italic;margin-top:3px">Ngày lập: ${new Date().toLocaleDateString('vi-VN')} · Người lập: ${escapeHtml(auditorName)}</div>
        </td>
      </tr>
    </table>

    <h1>BÁO CÁO TỔNG HỢP THẨM ĐỊNH ĐỐI TÁC CUNG ỨNG</h1>
    <p style="text-align:center;font-style:italic;margin:0 0 12px 0">
      Đối tác: <strong>${escapeHtml(companyGroup.companyName)}</strong> · Tổng số hợp đồng rà soát: <strong>${contractsList.length} hợp đồng</strong>
    </p>

    <div class="section-heading">I. TỔNG HỢP ĐIỂM TÍN NHIỆM & DANH MỤC HỢP ĐỒNG RÀ SOÁT</div>
    <p style="margin:0 0 6px 0">
      • <strong>Chỉ số tín nhiệm hiện tại của Đối tác:</strong> <strong style="color:#014BAA">${currentCompanyScore} / 100 điểm</strong> (${escapeHtml(scoreClassification)}) — Tổng cảnh báo: <strong>${actionableItems.length}</strong> (${highCount} Cao, ${mediumCount} Trung bình, ${lowCount} Thấp · ${approvedCount} Đã duyệt, ${pendingCount} Chờ duyệt).
    </p>
    <table class="formal-table">
      <thead>
        <tr>
          <th style="width:40px">STT</th>
          <th>Tên Văn bản Hợp đồng PDF</th>
          <th style="width:90px">Tổng lỗi</th>
          <th style="width:90px">Rủi ro Cao</th>
          <th style="width:150px">Tiến độ thẩm định</th>
        </tr>
      </thead>
      <tbody>${contractsSummaryRows}</tbody>
    </table>

    <div style="border:1.5px solid #6B212C;background:#FFF1F2;padding:9px 11px;margin-bottom:12px">
      <strong style="color:#6B212C">KẾT LUẬN & KIẾN NGHỊ TRÌNH BAN GIÁM ĐỐC:</strong><br/>
      <span>${escapeHtml(executiveVerdict)}</span>
    </div>

    <div class="section-heading">II. BẢNG PHÂN TÍCH CHI TIẾT CÁC ĐIỀU KHOẢN VI PHẠM TRÊN TOÀN BỘ HỢP ĐỒNG</div>
    <table class="formal-table">
      <thead>
        <tr>
          <th style="width:36px">STT</th>
          <th style="width:170px">Hợp đồng & Mã Tiêu chuẩn</th>
          <th>Nội dung chưa phù hợp & Dẫn chiếu Dự thảo</th>
          <th style="width:220px">Phương án Kiến nghị Hiệu chỉnh</th>
        </tr>
      </thead>
      <tbody>${detailRows}</tbody>
    </table>
  </body>
  </html>`

  const win = window.open('', '_blank')
  if (!win) {
    toast.error('Trình duyệt đang chặn Popup. Vui lòng cho phép mở Popup để in báo cáo PDF.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.onload = () => {
    setTimeout(() => {
      win.focus()
      win.print()
    }, 200)
  }
}

export default function CompanyViolationDetailView({
  companyGroup,
  canApprove,
  canExport,
  auditorName,
  onBack,
  onReviewSingle,
  onBatchApproveContract,
  onOpenDetailModal,
}: Props) {
  const navigate = useNavigate()

  const contractsList = useMemo(
    () => Array.from(companyGroup.contractsMap.values()),
    [companyGroup]
  )

  const [selectedDocId, setSelectedDocId] = useState<number | 'ALL'>(
    contractsList.length > 0 ? contractsList[0].docId : 'ALL'
  )

  const [statusTab, setStatusTab] = useState<'ALL' | 'Pending' | 'High'>('ALL')
  // Chế độ xem: 'audit' (Thẩm định từng lỗi) hoặc 'company_summary' (Báo cáo Tổng hợp Toàn Công ty gồm tất cả hợp đồng)
  const [viewMode, setViewMode] = useState<'audit' | 'company_summary'>('audit')

  const activeContract = useMemo(
    () => (selectedDocId === 'ALL' ? null : contractsList.find((c) => c.docId === selectedDocId) || null),
    [contractsList, selectedDocId]
  )

  const baseViolations = useMemo(() => {
    if (selectedDocId === 'ALL') return companyGroup.items
    return activeContract?.violations || []
  }, [selectedDocId, companyGroup.items, activeContract])

  const filteredViolations = useMemo(() => {
    return baseViolations.filter((v) => {
      if (statusTab === 'Pending' && v.status !== 'Pending') return false
      if (statusTab === 'High' && v.risk_level !== 'High') return false
      return true
    })
  }, [baseViolations, statusTab])

  const pendingInCurrent = baseViolations.filter((v) => v.status === 'Pending')
  const highInCurrent = baseViolations.filter((v) => v.risk_level === 'High')

  const penaltyPoints = companyGroup.items
    .filter((v) => v.status === 'Approved')
    .reduce((sum, v) => sum + (v.risk_level === 'High' ? 10 : v.risk_level === 'Medium' ? 5 : 2), 0)
  const currentCompanyScore = Math.max(0, 100 - penaltyPoints)

  return (
    <div className="space-y-4">
      {/* ── Thanh Header Công ty: Hiển thị rõ Báo cáo Tổng hợp Toàn Công ty (Gộp tất cả hợp đồng) ── */}
      <div className="bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(10,16,32,0.06)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-Snowflake hover:bg-Pine hover:text-white text-Pine text-xs font-extrabold transition-colors duration-200 flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Danh sách Công ty
          </button>

          <div className="w-11 h-11 rounded-2xl bg-Pine text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <Building2 className="w-5 h-5" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-Pine">{companyGroup.companyName}</h2>
              <span className="px-2.5 py-0.5 rounded-xl bg-Berry text-white text-xs font-extrabold">
                {companyGroup.items.length} cảnh báo
              </span>
              <span className="px-2.5 py-0.5 rounded-xl bg-Snowflake text-Branch text-xs font-bold">
                {contractsList.length} hợp đồng PDF
              </span>
            </div>
            <div className="mt-1.5 max-w-xs">
              <RiskScoreBar score={currentCompanyScore} />
            </div>
          </div>
        </div>

        {/* Nút trên thanh Công ty: Xem Báo cáo Tổng hợp Toàn Công ty (cả 2 hợp đồng) - Đứng yên, không nhấp nháy */}
        {canExport && (
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'company_summary' ? (
              <>
                <button
                  type="button"
                  onClick={() => setViewMode('audit')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-Snowflake text-Pine hover:bg-Pine hover:text-white text-xs font-extrabold rounded-2xl transition-colors duration-200"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Quay lại Thẩm định Hợp đồng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    console.info(`[AUDIT LOG] Xuất Báo cáo Tổng hợp Toàn Công ty "${companyGroup.companyName}" (${contractsList.length} hợp đồng) bởi ${auditorName}`)
                    printCompanyWideExecutiveReportA4(companyGroup, contractsList, currentCompanyScore, auditorName)
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-Pine text-white hover:bg-Branch text-xs font-extrabold rounded-2xl shadow-sm transition-colors duration-200"
                >
                  <Printer className="w-4 h-4 text-Sunny" />
                  Xuất Bản In Toàn Công Ty (PDF A4)
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setViewMode('company_summary')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-Pine text-white hover:bg-Branch text-xs font-extrabold rounded-2xl shadow-sm transition-colors duration-200"
                title="Xem Báo cáo Tổng hợp gộp tất cả các hợp đồng của công ty này"
              >
                <ClipboardCheck className="w-4 h-4 text-Sunny" />
                Báo cáo Tổng hợp Toàn Công ty ({contractsList.length} hợp đồng)
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── CHẾ ĐỘ XEM 1: BÁO CÁO TỔNG HỢP TOÀN CÔNG TY (GỘP CẢ 2 HỢP ĐỒNG) ── */}
      {viewMode === 'company_summary' ? (
        <div className="bg-white rounded-3xl border border-Mist/25 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="border-b-2 border-Pine pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-Pine bg-Pine/10 px-2.5 py-1 rounded-lg">
                Báo cáo Tổng hợp Cấp Pháp nhân Đối tác
              </span>
              <h3 className="text-xl font-black text-Pine uppercase mt-2">
                BÁO CÁO THẨM ĐỊNH TUÂN THỦ ĐỐI TÁC: {companyGroup.companyName}
              </h3>
              <p className="text-xs text-Branch/75 font-semibold mt-0.5">
                Tổng hợp toàn bộ {contractsList.length} hồ sơ hợp đồng PDF ({companyGroup.items.length} phát hiện kiểm toán) · Người lập: {auditorName}
              </p>
            </div>
            <div className="bg-Snowflake/50 px-4 py-2.5 rounded-2xl border border-Mist/30 text-right">
              <span className="text-[11px] font-bold text-Mist block">Chỉ số tín nhiệm đối tác:</span>
              <span className="text-lg font-black text-Pine">{currentCompanyScore} / 100 điểm</span>
            </div>
          </div>

          {/* Bảng tóm tắt từng hợp đồng của công ty */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-Pine mb-3 border-l-4 border-Pine pl-2.5">
              I. Danh mục Hồ sơ Hợp đồng thuộc Công ty ({contractsList.length} hợp đồng)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {contractsList.map((c, i) => (
                <div key={c.docId} className="rounded-2xl border border-Mist/35 p-4 bg-Snowflake/20 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-Pine">
                        Hợp đồng #{i + 1}: {c.fileName}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-DangerBg text-Berry text-[11px] font-extrabold border border-DangerBorder">
                        {c.violations.length} cảnh báo ({c.highCount} Cao)
                      </span>
                    </div>
                    <p className="text-[11px] text-Branch/75 font-semibold mt-1">
                      Tiến độ: {c.pendingCount > 0 ? `${c.pendingCount} cảnh báo chờ duyệt` : `Đã hoàn tất thẩm định (${c.approvedCount} đã duyệt)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-Mist/20">
                    <Link
                      to={`/audit/${c.docId}`}
                      className="flex-1 text-center py-1.5 rounded-xl bg-white border border-Pine/30 text-Pine hover:bg-Pine hover:text-white text-xs font-extrabold transition-colors"
                    >
                      Mở PDF Split-view
                    </Link>
                    <Link
                      to={`/audit/${c.docId}/summary`}
                      className="flex-1 text-center py-1.5 rounded-xl bg-Pine text-white hover:bg-Branch text-xs font-extrabold transition-colors"
                    >
                      Báo cáo riêng Hợp đồng này
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Danh sách toàn bộ lỗi gộp theo từng hợp đồng */}
          <div className="space-y-5">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-Berry border-l-4 border-Berry pl-2.5">
              II. Chi tiết Rủi ro Pháp lý & Phương án Hiệu chỉnh theo từng Hợp đồng
            </h4>
            {contractsList.map((c, cIdx) => (
              <div key={c.docId} className="rounded-2xl border border-Mist/35 overflow-hidden">
                <div className="bg-Pine text-white px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-extrabold">
                    {cIdx + 1}. Hợp đồng: {c.fileName} ({c.violations.length} nội dung)
                  </span>
                  <Link
                    to={`/audit/${c.docId}/summary`}
                    className="text-[11px] font-extrabold text-Sunny hover:underline"
                  >
                    Xem bản in riêng hợp đồng này →
                  </Link>
                </div>
                <div className="p-4 space-y-3 bg-white">
                  {c.violations.map((v, vIdx) => (
                    <div key={v.id} className="rounded-xl border border-Mist/25 p-3.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-Pine">
                          Mục {cIdx + 1}.{vIdx + 1} · {v.Standards?.standard_code} – {v.Standards?.name} (Trang {v.page_number ?? '?'})
                        </span>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={v.risk_level} />
                          <StatusBadge status={v.status} />
                        </div>
                      </div>
                      <p className="text-xs text-Branch font-semibold">{cleanVietnamesePdfText(v.violation_desc)}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div className="bg-DangerBg p-2.5 rounded-lg border border-DangerBorder text-xs text-Merlot italic">
                          <strong className="not-italic text-Berry block text-[10px] uppercase">Dẫn chiếu dự thảo:</strong>
                          "{cleanVietnamesePdfText(v.evidence_quote)}"
                        </div>
                        <div className="bg-SafeBg p-2.5 rounded-lg border border-SafeBorder text-xs text-SafeGreen font-bold">
                          <strong className="block text-[10px] uppercase">Phương án kiến nghị hiệu chỉnh:</strong>
                          {cleanVietnamesePdfText(v.recommendation)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── CHẾ ĐỘ XEM 2: BỐ CỤC 2 CỘT THẨM ĐỊNH TỪNG HỢP ĐỒNG ── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* CỘT TRÁI (4 Cột): Chọn Hợp đồng — Mỗi hợp đồng có nút "Báo cáo Hợp đồng" riêng biệt */}
          <div className="lg:col-span-4 bg-white rounded-3xl border border-white p-4 shadow-[0_10px_28px_rgba(10,16,32,0.06)] space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-Pine flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-Berry" />
                1. Hợp đồng của Đối tác ({contractsList.length})
              </h3>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setSelectedDocId('ALL')}
                className={`w-full text-left p-3.5 rounded-2xl border transition-colors ${
                  selectedDocId === 'ALL'
                    ? 'bg-Pine text-white border-Pine shadow-md'
                    : 'bg-Snowflake/40 hover:bg-Snowflake text-Branch border-Mist/25'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold">Tất cả hợp đồng của công ty</span>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${
                    selectedDocId === 'ALL' ? 'bg-Sunny text-Branch' : 'bg-Pine text-white'
                  }`}>
                    {companyGroup.items.length} lỗi
                  </span>
                </div>
              </button>

              {contractsList.map((contract) => {
                const isSelected = selectedDocId === contract.docId
                return (
                  <div
                    key={contract.docId}
                    onClick={() => setSelectedDocId(contract.docId)}
                    className={`p-3.5 rounded-2xl border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-Pine text-white border-Pine shadow-md'
                        : 'bg-white hover:bg-Snowflake/40 text-Branch border-Mist/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-Sunny' : 'text-Pine'}`} />
                        <span className="text-xs font-extrabold truncate" title={contract.fileName}>
                          {contract.fileName}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold flex-shrink-0 ${
                        isSelected ? 'bg-Berry text-white' : 'bg-DangerBg text-Berry'
                      }`}>
                        {contract.violations.length} lỗi
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2 text-[11px]">
                      {contract.pendingCount > 0 ? (
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          isSelected ? 'bg-Sunny text-Branch' : 'bg-WarnBg text-Branch border border-Sunny'
                        }`}>
                          {contract.pendingCount} chờ duyệt
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-SafeBg text-SafeGreen'
                        }`}>
                          Đã duyệt xong
                        </span>
                      )}
                    </div>

                    {/* 2 Nút hành động rõ ràng cho từng Hợp đồng riêng lẻ */}
                    <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2.5 border-t border-current/15 text-[11px]">
                      <Link
                        to={`/audit/${contract.docId}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl font-extrabold transition-colors ${
                          isSelected
                            ? 'bg-white/15 hover:bg-white/25 text-white'
                            : 'bg-Snowflake/60 hover:bg-Pine hover:text-white text-Pine'
                        }`}
                      >
                        <ExternalLink className="w-3 h-3" />
                        PDF Split-view
                      </Link>

                      {canExport && (
                        <Link
                          to={`/audit/${contract.docId}/summary`}
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl font-extrabold transition-colors ${
                            isSelected
                              ? 'bg-Sunny text-Branch hover:bg-white'
                              : 'bg-Berry text-white hover:bg-Merlot'
                          }`}
                          title={`Xem Báo cáo Thẩm định của riêng hợp đồng ${contract.fileName}`}
                        >
                          <ClipboardCheck className="w-3 h-3" />
                          Báo cáo HĐ này
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* CỘT PHẢI (8 Cột): Chi tiết Vi phạm của Hợp đồng đang chọn */}
          <div className="lg:col-span-8 space-y-3">
            {/* Thanh tiêu đề chỉ rõ đang xem Hợp đồng nào + Nút mở Báo cáo của riêng hợp đồng đó */}
            <div className="bg-white rounded-3xl border border-white p-4 shadow-[0_10px_28px_rgba(10,16,32,0.06)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-Mist/20">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-Pine flex-shrink-0" />
                  <span className="text-xs font-extrabold text-Branch truncate">
                    {activeContract
                      ? `Hợp đồng đang chọn: ${activeContract.fileName}`
                      : `Đang hiển thị: Tất cả ${contractsList.length} hợp đồng của đối tác`}
                  </span>
                </div>

                {canExport && activeContract && (
                  <Link
                    to={`/audit/${activeContract.docId}/summary`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-Pine text-white hover:bg-Branch text-xs font-extrabold rounded-xl transition-colors duration-200 shadow-sm"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5 text-Sunny" />
                    Báo cáo Hợp đồng này
                  </Link>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusTab('ALL')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-colors ${
                      statusTab === 'ALL' ? 'bg-Pine text-white shadow-sm' : 'bg-Snowflake/60 text-Branch hover:bg-Snowflake'
                    }`}
                  >
                    Tất cả lỗi ({baseViolations.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusTab('Pending')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-colors ${
                      statusTab === 'Pending' ? 'bg-Sunny text-Branch shadow-sm' : 'bg-Snowflake/60 text-Branch hover:bg-Snowflake'
                    }`}
                  >
                    Chờ Manager duyệt ({pendingInCurrent.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusTab('High')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-colors ${
                      statusTab === 'High' ? 'bg-Berry text-white shadow-sm' : 'bg-Snowflake/60 text-Branch hover:bg-Snowflake'
                    }`}
                  >
                    Mức độ Cao ({highInCurrent.length})
                  </button>
                </div>

                {canApprove && pendingInCurrent.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onBatchApproveContract(pendingInCurrent)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Merlot transition-colors duration-200 shadow-sm"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Duyệt toàn bộ {pendingInCurrent.length} lỗi chờ
                  </button>
                )}
              </div>
            </div>

            {filteredViolations.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-Mist/20">
                <ShieldCheck className="w-10 h-10 text-SafeGreen mx-auto mb-2" />
                <p className="text-sm font-bold text-Branch">Không có cảnh báo nào trong mục đang chọn.</p>
              </div>
            ) : (
              filteredViolations.map((v, idx) => (
                <div
                  key={v.id}
                  className="bg-white rounded-3xl border border-Mist/25 border-l-4 border-l-Berry p-4 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-Pine text-white text-xs font-extrabold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <StatusBadge status={v.risk_level} />
                      {selectedDocId === 'ALL' && v.Documents?.file_name && (
                        <span className="text-[11px] font-extrabold text-Pine bg-Snowflake px-2 py-0.5 rounded-lg border border-Mist/30">
                          {v.Documents.file_name}
                        </span>
                      )}
                      {v.Standards && (
                        <span className="font-mono text-xs font-extrabold text-Pine bg-Pine/10 px-2.5 py-0.5 rounded-lg border border-Pine/20">
                          {v.Standards.standard_code} – {v.Standards.name}
                        </span>
                      )}
                      {v.page_number && (
                        <span className="text-xs font-extrabold text-Branch bg-Sunny/45 px-2.5 py-0.5 rounded-lg">
                          Trang {v.page_number}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={v.status} />
                      <button
                        type="button"
                        onClick={() => onOpenDetailModal(v)}
                        className="p-1.5 rounded-xl bg-Snowflake text-Pine hover:bg-Pine hover:text-white transition-colors"
                        title="Xem chi tiết"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm font-semibold text-Branch leading-relaxed">
                    {cleanVietnamesePdfText(v.violation_desc)}
                  </p>

                  {v.evidence_quote && (
                    <div className="bg-DangerBg border-l-4 border-l-Berry border border-DangerBorder rounded-xl p-3 text-xs">
                      <span className="font-extrabold text-Berry uppercase text-[11px] flex items-center gap-1.5 mb-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        Điều khoản phát hiện trong Hợp đồng PDF (Trang {v.page_number ?? '?'}):
                      </span>
                      <p className="italic text-Merlot font-semibold leading-relaxed">
                        "{cleanVietnamesePdfText(v.evidence_quote)}"
                      </p>
                    </div>
                  )}

                  {v.recommendation && (
                    <div className="bg-SafeBg border-l-4 border-l-SafeGreen border border-SafeBorder rounded-xl p-3 text-xs">
                      <span className="font-extrabold text-SafeGreen uppercase text-[11px] flex items-center gap-1.5 mb-1">
                        <Lightbulb className="w-3.5 h-3.5" />
                        Phương án kiến nghị hiệu chỉnh điều khoản:
                      </span>
                      <p className="text-SafeGreen font-bold leading-relaxed">
                        {cleanVietnamesePdfText(v.recommendation)}
                      </p>
                    </div>
                  )}

                  {canApprove && v.status === 'Pending' && (
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-Mist/15">
                      <button
                        type="button"
                        onClick={() => onReviewSingle(v.id, 'Approved')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Merlot transition-colors shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Phê duyệt lỗi – Trừ điểm
                      </button>
                      <button
                        type="button"
                        onClick={() => onReviewSingle(v.id, 'Rejected')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-Mist/40 text-Branch text-xs font-bold rounded-xl hover:bg-Snowflake transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5 text-Mist" />
                        Bác bỏ cảnh báo
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}