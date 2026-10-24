import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChevronLeft, ShieldCheck, AlertTriangle, FileText,
  CheckCircle2, XCircle, Printer, Building2, Scale
} from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { Spinner, EmptyState, StatusBadge, RiskScoreBar } from '../components/ui'
import { documentApi } from '../api'
import type { ExportableDocument, ViolationItem } from './AuditWorkspacePage'
import { cleanVietnamesePdfText } from './AuditWorkspacePage'
import { useAuth } from '../context/AuthContext'

function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── HÀM KẾT XUẤT BẢN IN VĂN BẢN HÀNH CHÍNH A4 TRÌNH BAN GIÁM ĐỐC (CHUẨN 100%) ─
function printOfficialExecutiveReportA4(
  contractDoc: ExportableDocument,
  actionableViolations: ViolationItem[],
  customRedlines: Record<number, string>,
  currentScore: number,
  scoreClassification: string,
  executiveHeadline: string,
  executiveSummaryParagraph: string,
  auditorName: string,
  auditorRole: string
) {
  const highCount = actionableViolations.filter((v) => v.risk_level === 'High').length
  const mediumCount = actionableViolations.filter((v) => v.risk_level === 'Medium').length
  const lowCount = actionableViolations.filter((v) => v.risk_level === 'Low').length
  const approvedCount = actionableViolations.filter((v) => v.status === 'Approved').length
  const pendingCount = actionableViolations.filter((v) => v.status === 'Pending').length

  const tableRowsHtml =
    actionableViolations.length === 0
      ? `<tr>
          <td colspan="5" style="text-align:center;padding:16px;font-weight:bold;color:#047857">
            Dự thảo hợp đồng tuân thủ đầy đủ quy định pháp luật hiện hành và Bộ tiêu chuẩn RBA v8.0. Không phát hiện điều khoản vi phạm.
          </td>
        </tr>`
      : actionableViolations
          .map((v, idx) => {
            const redline =
              customRedlines[v.id] ||
              v.recommendation ||
              'Đề nghị bãi bỏ điều khoản chưa phù hợp và điều chỉnh theo đúng quy định của Bộ luật Lao động Việt Nam và Tiêu chuẩn RBA v8.0.'
            const riskLabel =
              v.risk_level === 'High'
                ? 'Rủi ro Cao (-10đ)'
                : v.risk_level === 'Medium'
                ? 'Trung bình (-5đ)'
                : 'Rủi ro Thấp (-2đ)'
            const riskColor =
              v.risk_level === 'High' ? '#6B212C' : v.risk_level === 'Medium' ? '#B45309' : '#014BAA'
            const statusText = v.status === 'Approved' ? 'Đã phê duyệt' : 'Chờ thẩm định'

            return `
              <tr>
                <td style="text-align:center;font-weight:bold">${idx + 1}</td>
                <td>
                  <div style="font-weight:bold;color:#014BAA">${escapeHtml(v.Standards?.standard_code || 'RBA')}</div>
                  <div style="font-size:10.5pt;margin-top:2px;font-weight:bold">${escapeHtml(v.Standards?.name || '')}</div>
                  <div style="font-size:9.5pt;color:#475569;margin-top:3px">
                    Vị trí: <strong>Trang ${v.page_number ?? '?'}</strong><br/>
                    Mức độ: <strong style="color:${riskColor}">${riskLabel}</strong><br/>
                    Trạng thái: <strong>${statusText}</strong>
                  </div>
                </td>
                <td style="text-align:justify">
                  <div style="margin-bottom:6px">${escapeHtml(cleanVietnamesePdfText(v.violation_desc))}</div>
                  <div style="background:#FFF1F2;border-left:3px solid #6B212C;padding:6px 8px;font-style:italic;font-size:10pt;color:#51121A">
                    <strong>Dẫn chiếu nguyên văn (Trang ${v.page_number ?? '?'}):</strong><br/>
                    "${escapeHtml(cleanVietnamesePdfText(v.evidence_quote))}"
                  </div>
                </td>
                <td style="text-align:justify;background:#ECFDF5;color:#047857;font-weight:600">
                  ${escapeHtml(cleanVietnamesePdfText(redline))}
                </td>
              </tr>`
          })
          .join('')

  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <title>Báo cáo Thẩm định Hợp đồng #DOC-${contractDoc.id} - ${escapeHtml(contractDoc.file_name)}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 15mm 15mm 15mm 18mm;
      }
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body {
        font-family: "Times New Roman", Times, serif;
        font-size: 11.5pt;
        line-height: 1.45;
        color: #0A1020;
        margin: 0;
        padding: 0;
        background: #FFFFFF;
      }
      .gov-header {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 14px;
        border-bottom: 2px solid #014BAA;
      }
      .gov-header td {
        border: none;
        padding: 0 0 10px 0;
        vertical-align: top;
      }
      .logo-badge {
        display: inline-block;
        width: 34px;
        height: 34px;
        line-height: 30px;
        text-align: center;
        background: #014BAA;
        color: #FFFFFF;
        font-family: Arial, sans-serif;
        font-weight: 900;
        font-size: 13pt;
        border-radius: 6px;
        border: 2px solid #EBBC62;
        margin-right: 8px;
        vertical-align: middle;
      }
      .report-title {
        text-align: center;
        margin: 14px 0 14px 0;
      }
      .report-title h1 {
        font-size: 15pt;
        font-weight: bold;
        color: #014BAA;
        text-transform: uppercase;
        margin: 0 0 4px 0;
      }
      .report-title p {
        font-size: 11pt;
        font-style: italic;
        margin: 0;
      }
      .section-heading {
        font-size: 11.5pt;
        font-weight: bold;
        text-transform: uppercase;
        color: #014BAA;
        margin: 14px 0 6px 0;
      }
      table.formal-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 12px;
        font-size: 11pt;
      }
      table.formal-table th {
        background-color: #014BAA !important;
        color: #FFFFFF !important;
        font-weight: bold;
        padding: 7px 8px;
        border: 1px solid #0A1020;
        text-align: center;
      }
      table.formal-table td {
        padding: 7px 8px;
        border: 1px solid #475569;
        vertical-align: top;
      }
      tr {
        page-break-inside: avoid;
      }
      .verdict-box {
        border: 1.5px solid #6B212C;
        background: #FFF1F2;
        padding: 10px 12px;
        margin-bottom: 14px;
        page-break-inside: avoid;
      }
      .signature-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 22px;
        page-break-inside: avoid;
      }
      .signature-table td {
        border: none;
        width: 33.33%;
        text-align: center;
        vertical-align: top;
        padding: 4px;
      }
    </style>
  </head>
  <body>
    <table class="gov-header">
      <tr>
        <td style="width:52%">
          <div>
            <span class="logo-badge">AQ</span>
            <span style="display:inline-block;vertical-align:middle">
              <strong style="font-size:11pt;color:#014BAA">HỆ THỐNG KIỂM TOÁN TUÂN THỦ ANHQUY</strong><br/>
              <span style="font-size:9.5pt;font-weight:bold">PHÒNG PHÁP CHẾ & KIỂM SOÁT RỦI RO</span>
            </span>
          </div>
          <div style="font-size:10pt;margin-top:4px">Số: <strong>BC-KT/2026/DOC-${contractDoc.id}</strong></div>
        </td>
        <td style="width:48%;text-align:right">
          <div style="font-weight:bold;font-size:11pt">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div style="font-weight:bold;font-size:11pt;text-decoration:underline">Độc lập – Tự do – Hạnh phúc</div>
          <div style="font-size:10pt;font-style:italic;margin-top:4px">
            Ngày lập: ${new Date().toLocaleDateString('vi-VN')} · Người lập: ${escapeHtml(auditorName)} (${escapeHtml(auditorRole)})
          </div>
        </td>
      </tr>
    </table>

    <div class="report-title">
      <h1>BÁO CÁO KẾT QUẢ THẨM ĐỊNH TUÂN THỦ HỢP ĐỒNG</h1>
      <p>(V/v: Đánh giá rủi ro pháp lý và mức độ tuân thủ Bộ tiêu chuẩn RBA v8.0 & Pháp luật Việt Nam)</p>
    </div>

    <p style="margin:0 0 6px 0"><strong>Kính gửi:</strong> <strong>Ban Giám đốc / Hội đồng Thẩm định Hợp đồng</strong></p>
    <p style="margin:0 0 10px 0;text-align:justify">
      <strong>Căn cứ thực hiện:</strong> Căn cứ Bộ luật Dân sự 2015, Bộ luật Lao động 2019, Luật Thương mại 2005, các văn bản quy phạm pháp luật chuyên ngành hiện hành và Bộ Quy tắc Ứng xử Liên minh Doanh nghiệp có Trách nhiệm (RBA v8.0).
    </p>

    <div class="section-heading">I. THÔNG TIN HỒ SƠ HỢP ĐỒNG & PHÁP NHÂN ĐỐI TÁC</div>
    <table class="formal-table">
      <tr>
        <td style="width:22%;font-weight:bold;background:#F8FAFC">Tên văn bản dự thảo:</td>
        <td style="width:28%"><strong>${escapeHtml(contractDoc.file_name)}</strong></td>
        <td style="width:22%;font-weight:bold;background:#F8FAFC">Pháp nhân đối tác:</td>
        <td style="width:28%"><strong>${escapeHtml(contractDoc.Suppliers?.company_name || '—')}</strong></td>
      </tr>
      <tr>
        <td style="font-weight:bold;background:#F8FAFC">Nhóm hợp đồng:</td>
        <td>${escapeHtml(contractDoc.Categories?.name || 'Hợp đồng thương mại')}</td>
        <td style="font-weight:bold;background:#F8FAFC">Chỉ số tín nhiệm:</td>
        <td><strong>${currentScore} / 100 điểm</strong> (${escapeHtml(scoreClassification)})</td>
      </tr>
      <tr>
        <td style="font-weight:bold;background:#F8FAFC">Mã toàn vẹn SHA-256:</td>
        <td colspan="3" style="font-family:Consolas,monospace;font-size:9.5pt;word-break:break-all">
          ${escapeHtml(contractDoc.file_hash || 'Đã xác thực toàn vẹn trên máy chủ ANHQUY')}
        </td>
      </tr>
    </table>

    <div class="section-heading">II. TỔNG HỢP ĐỊNH LƯỢNG & Ý KIẾN KIẾN NGHỊ TRÌNH BAN GIÁM ĐỐC</div>
    <table class="formal-table">
      <thead>
        <tr>
          <th>Tổng điều khoản phát hiện</th>
          <th>Rủi ro Cao (Trọng yếu)</th>
          <th>Rủi ro Trung bình / Thấp</th>
          <th>Tiến độ thẩm định</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align:center;font-weight:bold;font-size:12pt">${actionableViolations.length}</td>
          <td style="text-align:center;font-weight:bold;font-size:12pt;color:#6B212C">${highCount}</td>
          <td style="text-align:center;font-weight:bold;font-size:12pt">${mediumCount} / ${lowCount}</td>
          <td style="text-align:center;font-weight:bold">${approvedCount} Đã duyệt · ${pendingCount} Chờ duyệt</td>
        </tr>
      </tbody>
    </table>

    <div class="verdict-box">
      <div style="font-weight:bold;color:#6B212C;text-transform:uppercase;margin-bottom:4px">
        ĐỀ XUẤT CHÍNH THỨC: ${escapeHtml(executiveHeadline)}
      </div>
      <div style="text-align:justify">
        ${escapeHtml(executiveSummaryParagraph)}
      </div>
    </div>

    <div class="section-heading">III. BẢNG PHÂN TÍCH CHI TIẾT RỦI RO PHÁP LÝ & PHƯƠNG ÁN KIẾN NGHỊ HIỆU CHỈNH</div>
    <table class="formal-table">
      <thead>
        <tr>
          <th style="width:38px">STT</th>
          <th style="width:155px">Mã Tiêu chuẩn & Mức độ Rủi ro</th>
          <th>Nội dung chưa phù hợp & Dẫn chiếu Dự thảo</th>
          <th style="width:230px">Phương án Kiến nghị Hiệu chỉnh Điều khoản</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>

    <table class="signature-table">
      <tr>
        <td>
          <strong>CÁN BỘ LẬP BÁO CÁO</strong><br/>
          <i style="font-size:10pt">(Ký và ghi rõ họ tên)</i>
          <div style="height:65px"></div>
          <strong>${escapeHtml(auditorName)}</strong>
        </td>
        <td>
          <strong>TRƯỞNG BỘ PHẬN PHÁP CHẾ</strong><br/>
          <i style="font-size:10pt">(Kiểm soát & Thẩm định)</i>
          <div style="height:65px"></div>
          <strong>................................................</strong>
        </td>
        <td>
          <strong>PHÊ DUYỆT CỦA BAN GIÁM ĐỐC</strong><br/>
          <i style="font-size:10pt">(Ý kiến chỉ đạo & Ký duyệt)</i>
          <div style="height:65px"></div>
          <strong>................................................</strong>
        </td>
      </tr>
    </table>
  </body>
  </html>`

  const win = window.open('', '_blank')
  if (!win) {
    toast.error('Trình duyệt đang chặn cửa sổ bật lên (Popup). Vui lòng cho phép mở Popup để xuất bản in PDF.')
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

export default function ContractSummaryPage() {
  const { id } = useParams<{ id: string }>()
  const documentId = Number(id)
  const navigate = useNavigate()
  const { user, role } = useAuth()

  const [contractDoc, setContractDoc] = useState<ExportableDocument | null>(null)
  const [violations, setViolations] = useState<ViolationItem[]>([])
  const [loading, setLoading] = useState(true)

  const [customRedlines] = useState<Record<number, string>>(() => {
    try {
      const saved = localStorage.getItem(`anhquy_redlines_doc_${documentId}`)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [docRes, violRes] = await Promise.all([
        documentApi.getById(documentId),
        documentApi.getViolations(documentId).catch(() => ({ data: { violations: [] } })),
      ])
      const rawDoc = docRes.data?.document || docRes.data?.data || docRes.data
      setContractDoc(rawDoc as ExportableDocument)

      const rawViols = violRes.data?.violations || violRes.data?.items || violRes.data?.data || []
      setViolations(Array.isArray(rawViols) ? rawViols : [])
    } catch {
      toast.error('Không thể tải dữ liệu báo cáo thẩm định.')
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <MainLayout breadcrumb="Báo cáo Thẩm định Hợp đồng">
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    )
  }

  if (!contractDoc) {
    return (
      <MainLayout breadcrumb="Báo cáo Thẩm định Hợp đồng">
        <EmptyState message="Không tìm thấy hồ sơ hợp đồng" />
      </MainLayout>
    )
  }

  const actionableViolations = violations.filter((v) => v.status !== 'Rejected')
  const highCount = actionableViolations.filter((v) => v.risk_level === 'High').length
  const mediumCount = actionableViolations.filter((v) => v.risk_level === 'Medium').length
  const lowCount = actionableViolations.filter((v) => v.risk_level === 'Low').length
  const approvedCount = actionableViolations.filter((v) => v.status === 'Approved').length
  const pendingCount = actionableViolations.filter((v) => v.status === 'Pending').length

  const penaltyPoints = actionableViolations
  .filter((v) => v.status === 'Approved')
  .reduce((sum, v) => sum + (v.risk_level === 'High' ? 10 : v.risk_level === 'Medium' ? 5 : 2), 0)
const currentScore = Math.max(0, 100 - penaltyPoints)

  const scoreClassification =
    currentScore >= 80
      ? 'Đạt chuẩn an toàn (Safe)'
      : currentScore >= 50
      ? 'Cần kiểm soát rủi ro (Warning)'
      : 'Rủi ro trọng yếu (High Risk)'

  const executiveHeadline =
    highCount > 0
      ? 'PHÁT HIỆN RỦI RO PHÁP LÝ TRỌNG YẾU — ĐỀ NGHỊ TẠM HOÃN KÝ KẾT ĐỂ ĐÀM PHÁN, HIỆU CHỈNH ĐIỀU KHOẢN'
      : actionableViolations.length > 0
      ? 'TỒN TẠI ĐIỀU KHOẢN CHƯA HOÀN TOÀN PHÙ HỢP — ĐỀ NGHỊ HIỆU CHỈNH DỰ THẢO TRƯỚC KHI KÝ KẾT'
      : 'HỒ SƠ HỢP ĐỒNG ĐẠT YÊU CẦU TUÂN THỦ PHÁP LUẬT & TIÊU CHUẨN RBA — ĐỦ ĐIỀU KIỆN PHÊ DUYỆT KÝ KẾT'

  const executiveSummaryParagraph =
    highCount > 0
      ? `Qua quá trình rà soát và thẩm định độc lập, dự thảo hợp đồng tồn tại ${highCount} điều khoản có mức độ rủi ro pháp lý cao (cùng ${mediumCount + lowCount} nội dung rủi ro trung bình/thấp), chưa phù hợp với quy định pháp luật Việt Nam hiện hành và Bộ Quy tắc Ứng xử RBA v8.0. Bộ phận Kiểm toán Pháp chế kính đề nghị Ban Giám đốc chưa phê duyệt ký kết bản dự thảo hiện tại; đồng thời yêu cầu pháp nhân đối tác thực hiện sửa đổi, bổ sung các điều khoản theo phương án kiến nghị tại Mục III trước khi trình ký chính thức.`
      : actionableViolations.length > 0
      ? `Dự thảo hợp đồng cơ bản đáp ứng khung giao dịch thương mại nhưng còn tồn tại ${actionableViolations.length} điều khoản cần được hoàn thiện để đảm bảo tính chặt chẽ về mặt pháp lý và tiêu chuẩn chuỗi cung ứng. Bộ phận Kiểm toán Pháp chế kính đề nghị Ban Giám đốc yêu cầu đối tác phối hợp hiệu chỉnh các nội dung chi tiết tại Mục III nhằm bảo vệ tối đa quyền và lợi ích hợp pháp của doanh nghiệp.`
      : `Toàn bộ các điều khoản trong dự thảo hợp đồng phù hợp với quy định của Pháp luật Việt Nam và tiêu chuẩn đạo đức chuỗi cung ứng RBA v8.0, không phát hiện rủi ro pháp lý trọng yếu. Bộ phận Kiểm toán Pháp chế kính trình Ban Giám đốc xem xét, phê duyệt ký kết hợp đồng.`

  const handleExportFormalPdf = () => {
    // Ghi Audit Log âm thầm vào Console/Storage, KHÔNG bật Toast đè lên màn hình in PDF
    console.info(
      `[AUDIT LOG] Xuất Báo cáo Thẩm định Hợp đồng #DOC-${contractDoc.id} (${contractDoc.file_name}) bởi ${user?.full_name || 'Admin'} lúc ${new Date().toISOString()}`
    )
    printOfficialExecutiveReportA4(
      contractDoc,
      actionableViolations,
      customRedlines,
      currentScore,
      scoreClassification,
      executiveHeadline,
      executiveSummaryParagraph,
      user?.full_name || 'Chuyên viên Kiểm toán',
      role || 'Admin'
    )
  }

  return (
    <MainLayout breadcrumb="Báo cáo Thẩm định Hợp đồng">
      <div className="max-w-5xl mx-auto space-y-5 pb-12">
        {/* Thanh công cụ điều hướng (Nút đứng yên, đổi màu mượt khi di chuột) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(`/audit/${documentId}`)}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-Pine bg-white px-4 py-2.5 rounded-2xl border border-Pine/30 hover:bg-Snowflake shadow-sm transition-colors duration-200"
          >
            <ChevronLeft className="w-4 h-4 text-Pine" />
            Quay lại Phòng Kiểm toán
          </button>

          <button
            type="button"
            onClick={handleExportFormalPdf}
            className="inline-flex items-center gap-2 text-xs font-extrabold text-white bg-Pine px-5 py-2.5 rounded-2xl hover:bg-Branch shadow-sm transition-colors duration-200"
          >
            <Printer className="w-4 h-4 text-Sunny" />
            Xuất Bản In Báo Cáo (PDF)
          </button>
        </div>

        {/* GIAO DIỆN BÁO CÁO HÀNH CHÍNH - PHÁP CHẾ TRÊN MÀN HÌNH */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_10px_28px_rgba(10,16,32,0.06)] border border-Mist/25">
          {/* 1. QUỐC HIỆU - TIÊU NGỮ & LOGO ĐƠN VỊ KIỂM TOÁN */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-Pine pb-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-Pine text-white flex items-center justify-center font-black text-lg tracking-tighter shadow-sm flex-shrink-0 border-2 border-Sunny">
                AQ
              </div>
              <div>
                <div className="text-sm font-black tracking-wide text-Pine uppercase">
                  HỆ THỐNG KIỂM TOÁN TUÂN THỦ ANHQUY
                </div>
                <div className="text-xs font-bold text-Branch/80">
                  PHÒNG PHÁP CHẾ & KIỂM SOÁT RỦI RO CHUỖI CUNG ỨNG
                </div>
                <div className="text-[11px] text-Mist font-semibold mt-0.5">
                  Số: BC-KT/2026/DOC-{contractDoc.id}
                </div>
              </div>
            </div>

            <div className="sm:text-right w-full sm:w-auto">
              <div className="text-xs font-extrabold text-Branch uppercase tracking-wide">
                CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
              </div>
              <div className="text-xs font-bold text-Branch underline underline-offset-4">
                Độc lập – Tự do – Hạnh phúc
              </div>
              <div className="text-[11px] text-Mist italic mt-1">
                Ngày lập báo cáo: {new Date().toLocaleDateString('vi-VN')} · Người lập: {user?.full_name || 'Quản trị viên'} ({role})
              </div>
            </div>
          </div>

          {/* 2. TIÊU ĐỀ VĂN BẢN & KÍNH GỬI BAN GIÁM ĐỐC */}
          <div className="text-center mb-5">
            <h1 className="text-xl sm:text-2xl font-black text-Pine uppercase tracking-tight">
              BÁO CÁO KẾT QUẢ THẨM ĐỊNH TUÂN THỦ HỢP ĐỒNG
            </h1>
            <p className="text-xs sm:text-sm text-Branch/80 font-semibold mt-1">
              (V/v: Đánh giá rủi ro pháp lý và mức độ tuân thủ Bộ tiêu chuẩn RBA v8.0 & Pháp luật Việt Nam)
            </p>
          </div>

          <div className="bg-Snowflake/35 rounded-2xl p-4 border border-Mist/30 mb-5 text-xs sm:text-sm text-Branch space-y-1.5">
            <p>
              <strong className="text-Pine">Kính gửi:</strong>{' '}
              <strong>Ban Giám đốc / Hội đồng Thẩm định Hợp đồng</strong>
            </p>
            <p className="leading-relaxed text-justify">
              <strong className="text-Pine">Căn cứ thực hiện:</strong> Căn cứ Bộ luật Dân sự 2015, Bộ luật Lao động 2019, Luật Thương mại 2005, các văn bản quy phạm pháp luật chuyên ngành hiện hành và Bộ Quy tắc Ứng xử Liên minh Doanh nghiệp có Trách nhiệm (RBA v8.0).
            </p>
          </div>

          {/* 3. MỤC I: THÔNG TIN HỒ SƠ HỢP ĐỒNG & PHÁP NHÂN ĐỐI TÁC */}
          <div className="mb-5">
            <h2 className="text-xs sm:text-sm font-extrabold text-Pine uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-l-4 border-Pine pl-2.5">
              <FileText className="w-4 h-4 text-Pine" />
              I. Thông tin Hồ sơ Hợp đồng & Pháp nhân Đối tác
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl p-4 border border-Mist/35">
                <div className="text-[11px] font-extrabold text-Pine uppercase mb-2">
                  1. Hồ sơ Văn bản Dự thảo
                </div>
                <div className="space-y-1.5 text-xs text-Branch">
                  <p>
                    <span className="text-Mist font-semibold">Tên tập tin:</span>{' '}
                    <strong className="text-Branch">{contractDoc.file_name}</strong>
                  </p>
                  <p>
                    <span className="text-Mist font-semibold">Nhóm hợp đồng:</span>{' '}
                    <strong>{contractDoc.Categories?.name || 'Hợp đồng thương mại'}</strong>
                  </p>
                  <p>
                    <span className="text-Mist font-semibold">Trạng thái rà soát:</span>{' '}
                    <StatusBadge status={pendingCount > 0 ? 'Pending' : 'Approved'} />
                  </p>
                  <div className="pt-1">
                    <span className="text-[10px] text-Mist font-semibold block mb-0.5">
                      Mã băm kiểm tra toàn vẹn (SHA-256):
                    </span>
                    <div className="font-mono text-[10px] bg-Snowflake/50 px-2 py-1 rounded border border-Mist/25 break-all text-Branch">
                      {contractDoc.file_hash || 'Đã xác thực toàn vẹn trên hệ thống'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-Mist/35">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-extrabold text-Pine uppercase flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-Pine" />
                    2. Pháp nhân Đối tác Cung ứng
                  </span>
                  <span className="text-[11px] font-extrabold text-Pine bg-Pine/10 px-2 py-0.5 rounded-lg">
                    {scoreClassification}
                  </span>
                </div>
                <div className="space-y-2 text-xs text-Branch">
                  <p>
                    <span className="text-Mist font-semibold">Tên doanh nghiệp:</span>{' '}
                    <strong className="text-Branch text-sm block mt-0.5">
                      {contractDoc.Suppliers?.company_name || '—'}
                    </strong>
                  </p>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-Mist font-semibold">Chỉ số tín nhiệm tuân thủ:</span>
                      <strong className="text-Pine">{currentScore} / 100 điểm</strong>
                    </div>
                    <RiskScoreBar score={currentScore} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. MỤC II: TỔNG HỢP ĐỊNH LƯỢNG & Ý KIẾN KIẾN NGHỊ TRÌNH BAN GIÁM ĐỐC */}
          <div className="mb-6">
            <h2 className="text-xs sm:text-sm font-extrabold text-Pine uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-l-4 border-Pine pl-2.5">
              <Scale className="w-4 h-4 text-Pine" />
              II. Đánh giá Tổng quan & Kiến nghị Phê duyệt của Bộ phận Kiểm toán
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="bg-Snowflake/30 border border-Mist/30 rounded-xl p-2.5 text-center">
                <div className="text-lg font-black text-Pine">{actionableViolations.length}</div>
                <div className="text-[11px] font-bold text-Branch/75">Tổng điều khoản phát hiện</div>
              </div>
              <div className="bg-DangerBg border border-DangerBorder rounded-xl p-2.5 text-center">
                <div className="text-lg font-black text-Berry">{highCount}</div>
                <div className="text-[11px] font-bold text-Berry">Rủi ro Cao (Trọng yếu)</div>
              </div>
              <div className="bg-WarnBg border border-Sunny rounded-xl p-2.5 text-center">
                <div className="text-lg font-black text-Branch">
                  {mediumCount} / {lowCount}
                </div>
                <div className="text-[11px] font-bold text-Branch/80">Rủi ro Trung bình / Thấp</div>
              </div>
              <div className="bg-SafeBg border border-SafeBorder rounded-xl p-2.5 text-center">
                <div className="text-xs font-extrabold text-SafeGreen py-1">
                  {approvedCount} Đã duyệt · {pendingCount} Chờ duyệt
                </div>
                <div className="text-[11px] font-bold text-Branch/75">Tiến độ thẩm định</div>
              </div>
            </div>

            <div
              className={`rounded-2xl p-4 border-l-4 ${
                highCount > 0
                  ? 'bg-DangerBg border-l-Berry border border-DangerBorder'
                  : actionableViolations.length > 0
                  ? 'bg-WarnBg border-l-Sunny border border-Sunny'
                  : 'bg-SafeBg border-l-SafeGreen border border-SafeBorder'
              }`}
            >
              <div
                className={`text-xs sm:text-sm font-black uppercase mb-1.5 flex items-center gap-1.5 ${
                  highCount > 0
                    ? 'text-Berry'
                    : actionableViolations.length > 0
                    ? 'text-Branch'
                    : 'text-SafeGreen'
                }`}
              >
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                <span>Đề xuất chính thức: {executiveHeadline}</span>
              </div>
              <p className="text-xs sm:text-[13px] text-Branch leading-relaxed text-justify font-medium">
                {executiveSummaryParagraph}
              </p>
              {pendingCount > 0 && (
                <p className="text-[11px] text-Berry mt-2 pt-2 border-t border-Berry/20 font-bold italic">
                  * Lưu ý quản trị: Hồ sơ hiện còn {pendingCount} nội dung cảnh báo đang ở trạng thái chờ Quản lý Pháp chế (Manager) phê duyệt chính thức.
                </p>
              )}
            </div>
          </div>

          {/* 5. MỤC III: BẢNG PHÂN TÍCH CHI TIẾT CÁC PHÁT HIỆN & PHƯƠNG ÁN HIỆU CHỈNH */}
          <div>
            <h2 className="text-xs sm:text-sm font-extrabold text-Pine uppercase tracking-wider mb-3 flex items-center gap-1.5 border-l-4 border-Berry pl-2.5">
              <AlertTriangle className="w-4 h-4 text-Berry" />
              III. Bảng Phân tích Chi tiết Rủi ro Pháp lý & Phương án Kiến nghị Hiệu chỉnh ({actionableViolations.length} nội dung)
            </h2>

            {actionableViolations.length === 0 ? (
              <div className="text-center py-10 bg-SafeBg rounded-2xl border border-SafeBorder">
                <ShieldCheck className="w-12 h-12 text-SafeGreen mx-auto mb-2" />
                <p className="font-bold text-SafeGreen text-base">
                  Dự thảo hợp đồng tuân thủ đầy đủ quy định pháp luật và bộ tiêu chuẩn RBA v8.0.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {actionableViolations.map((v, idx) => {
                  const redline =
                    customRedlines[v.id] ||
                    v.recommendation ||
                    'Đề nghị bãi bỏ điều khoản chưa phù hợp và điều chỉnh theo đúng quy định của Bộ luật Lao động Việt Nam và Tiêu chuẩn RBA v8.0.'
                  return (
                    <div
                      key={v.id}
                      className="border border-Mist/35 rounded-2xl overflow-hidden bg-white"
                    >
                      <div className="bg-Snowflake/45 px-4 py-2.5 border-b border-Mist/25 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-Pine text-white text-xs font-extrabold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-mono text-xs font-extrabold text-Pine bg-white px-2 py-0.5 rounded border border-Mist/30">
                            {v.Standards?.standard_code || 'RBA'}
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold text-Branch">
                            {v.Standards?.name || 'Tiêu chuẩn tuân thủ'}
                          </span>
                          {v.page_number && (
                            <span className="text-[11px] font-bold text-Branch bg-Sunny/40 px-2 py-0.5 rounded">
                              Trang {v.page_number}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={v.risk_level} />
                          <StatusBadge status={v.status} />
                        </div>
                      </div>

                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-Berry uppercase">
                            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>1. Nội dung chưa phù hợp & Dẫn chiếu dự thảo</span>
                          </div>
                          <p className="text-xs sm:text-[13px] font-semibold text-Branch leading-relaxed text-justify">
                            {cleanVietnamesePdfText(v.violation_desc)}
                          </p>
                          <div className="bg-DangerBg p-3 rounded-xl border border-DangerBorder text-xs text-Merlot italic leading-relaxed text-justify">
                            <span className="font-bold not-italic text-Berry block mb-0.5 text-[11px]">
                              Trích dẫn nguyên văn tại Trang {v.page_number ?? '?'}:
                            </span>
                            "{cleanVietnamesePdfText(v.evidence_quote)}"
                          </div>
                        </div>

                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-extrabold text-SafeGreen uppercase">
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>2. Phương án kiến nghị hiệu chỉnh điều khoản</span>
                          </div>
                          <div className="bg-SafeBg p-3.5 rounded-xl border border-SafeBorder text-xs sm:text-[13px] leading-relaxed font-bold text-SafeGreen flex-1 text-justify">
                            {cleanVietnamesePdfText(redline)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 6. MỤC IV: CHỮ KÝ XÁC NHẬN & PHÊ DUYỆT CỦA BAN GIÁM ĐỐC */}
          <div className="mt-8 pt-5 border-t-2 border-Mist/30 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-xs">
            <div>
              <p className="font-extrabold text-Branch uppercase">CÁN BỘ LẬP BÁO CÁO</p>
              <p className="text-[11px] text-Mist italic mt-0.5">(Ký và ghi rõ họ tên)</p>
              <div className="h-20" />
              <p className="font-bold text-Pine uppercase">{user?.full_name || 'Chuyên viên Kiểm toán'}</p>
            </div>
            <div>
              <p className="font-extrabold text-Branch uppercase">TRƯỞNG BỘ PHẬN PHÁP CHẾ</p>
              <p className="text-[11px] text-Mist italic mt-0.5">(Kiểm soát & Thẩm định)</p>
              <div className="h-20" />
              <p className="font-bold text-Branch">................................................</p>
            </div>
            <div>
              <p className="font-extrabold text-Pine uppercase">PHÊ DUYỆT CỦA BAN GIÁM ĐỐC</p>
              <p className="text-[11px] text-Mist italic mt-0.5">(Ý kiến chỉ đạo & Ký duyệt)</p>
              <div className="h-20" />
              <p className="font-bold text-Branch">................................................</p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}