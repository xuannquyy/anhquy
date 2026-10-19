import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import prisma from "../config/prisma";
import {
  extractAndSmartChunkPdf,
  retrieveRelevantChunksViaRag,
  ContractChunk,
} from "../vector-db/chroma.rag";

// ─── Kiểu lỗi nội bộ ─────────────────────────────────────────────────────────

interface ServiceError extends Error {
  httpStatus: number;
}

const makeError = (message: string, httpStatus: number): ServiceError => {
  const err = new Error(message) as ServiceError;
  err.httpStatus = httpStatus;
  return err;
};

// ─── Kiểu kết quả từ Gemini ───────────────────────────────────────────────────

interface GeminiViolationFinding {
  standard_id: number;
  risk_level: "High" | "Medium" | "Low";
  violation_desc: string;
  evidence_quote: string;
  page_number: number | null;
  recommendation: string;
}

interface GeminiResponse {
  findings: GeminiViolationFinding[];
}

// ─── Đọc cấu hình động từ bảng System_Configs ────────────────────────────────

const getSystemConfigMap = async (): Promise<Record<string, string>> => {
  const configs = await prisma.system_Configs.findMany();
  const map: Record<string, string> = {};
  for (const c of configs) {
    map[c.config_key] = c.config_value;
  }
  return map;
};

// ─── Data Masking ─────────────────────────────────────────────────────────────

/**
 * Ẩn danh các thông tin nhạy cảm trước khi gửi sang Gemini / ChromaDB.
 * - CCCD / CMND: 9 hoặc 12 chữ số liên tiếp
 * - Mã số thuế: 10 hoặc 13 chữ số (có thể có dấu gạch ngang)
 * - Số tài khoản ngân hàng: 6-19 chữ số liên tiếp (sau context từ khóa)
 */
const maskSensitiveData = (text: string): string => {
  let masked = text;

  // CCCD / CMND — 12 chữ số hoặc 9 chữ số đứng độc lập
  masked = masked.replace(/\b\d{12}\b/g, "[REDACTED]");
  masked = masked.replace(/\b\d{9}\b/g, "[REDACTED]");

  // Mã số thuế — 10 chữ số hoặc 10-3 (format MST chi nhánh)
  masked = masked.replace(/\b\d{10}-\d{3}\b/g, "[REDACTED]");
  masked = masked.replace(/\b\d{10}\b/g, "[REDACTED]");

  // Số tài khoản ngân hàng — context từ khóa "tài khoản", "STK", "account"
  masked = masked.replace(
    /(?:tài khoản|STK|account|số TK)[:\s]*(\d[\d\s-]{5,18}\d)/gi,
    (match, p1) => match.replace(p1, "[REDACTED]")
  );

  return masked;
};

// ─── Lọc bộ tiêu chuẩn động ──────────────────────────────────────────────────

/**
 * Công thức lọc bộ tiêu chuẩn động (SKILL.md §3.2):
 * Active Standards =
 *   (Tiêu chuẩn gốc [created_by IS NULL] + Tiêu chuẩn riêng của User [created_by = userId])
 *   - Các tiêu chuẩn bị User loại trừ trong bảng User_Excluded_Standards
 *   Chỉ lấy is_active = true và thuộc Category_Standards của loại hợp đồng (categoryId).
 */
const getActiveStandardsForScan = async (userId: number, categoryId: number) => {
  const categoryStandards = await prisma.category_Standards.findMany({
    where: { category_id: categoryId },
    select: { standard_id: true },
  });
  const categoryStandardIds = categoryStandards.map((cs) => cs.standard_id);

  if (categoryStandardIds.length === 0) return [];

  const excluded = await prisma.user_Excluded_Standards.findMany({
    where: { user_id: userId },
    select: { standard_id: true },
  });
  const excludedIds = new Set(excluded.map((e) => e.standard_id));

  const standards = await prisma.standards.findMany({
    where: {
      id: { in: categoryStandardIds },
      is_active: true,
      OR: [
        { created_by: null },      // Tiêu chuẩn hệ thống
        { created_by: userId },     // Tiêu chuẩn cá nhân của user
      ],
    },
    include: {
      Standard_Groups: { select: { group_code: true, group_name: true } },
    },
  });

  return standards.filter((s) => !excludedIds.has(s.id));
};

// ─── Bước 3 & 4: Đóng gói ngữ cảnh RAG & Gọi Gemini LLM ──────────────────────

const callGeminiWithRagChunks = async (
  relevantChunks: ContractChunk[],
  standards: Array<{
    id: number;
    standard_code: string;
    name: string;
    content_i18n: string | null;
    jurisdiction: string | null;
    priority_level: number | null;
  }>,
  modelName: string,
  strictMode: boolean
): Promise<GeminiViolationFinding[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("Điền_")) {
    throw makeError("GEMINI_API_KEY chưa được cấu hình.", 500);
  }

  const genai = new GoogleGenAI({ apiKey });

  // Format danh sách tiêu chuẩn từ SQL Server (cả VI và EN)
  const standardsList = standards
    .map((s) => {
      let content = "";
      if (s.content_i18n) {
        try {
          const parsed = JSON.parse(s.content_i18n) as { vi?: string; en?: string };
          content = parsed.vi ?? parsed.en ?? "";
        } catch {
          content = s.content_i18n;
        }
      }
      return `- standard_id: ${s.id} | Mã: ${s.standard_code} \vert{} Tên: ${s.name} | Lãnh thổ: ${s.jurisdiction ?? "Global"} | Trọng số: ${s.priority_level ?? 1} | Nội dung: ${content}`;
    })
    .join("\n");

  // Format các đoạn bằng chứng đã được RAG lọc kèm đúng số Trang và Dòng
  const formattedEvidenceChunks = relevantChunks
    .map(
      (c) =>
        `[Trang ${c.pageNumber}, Dòng ${c.lineStart} | ${c.clauseTitle}]: "${c.content}"`
    )
    .join("\n\n");

  const strictRuleInstruction = strictMode
    ? `2. NGUYÊN TẮC PHÁP LÝ BẮT BUỘC: Nếu có mâu thuẫn giữa chuẩn Quốc tế RBA (Global) và Pháp luật Việt Nam (VN), BẮT BUỘC áp dụng "Tiêu chuẩn nào khắt khe hơn, bảo vệ quyền lợi người lao động và môi trường tốt hơn".`
    : `2. Đối chiếu độc lập từng tiêu chuẩn trong danh sách với nội dung hợp đồng.`;

  const prompt = `Bạn là Chuyên gia Kiểm toán Đạo đức Chuỗi cung ứng (Ethical Sourcing Auditor) theo chuẩn RBA v8.0 và Pháp luật Việt Nam.
Dưới đây là các đoạn điều khoản hợp đồng đã được hệ thống RAG trích xuất kèm số Trang/Dòng và Bộ tiêu chuẩn pháp lý từ SQL Server.

QUY TẮC QUAN TRỌNG:
1. Chỉ báo cáo các vi phạm thực sự có bằng chứng trong hợp đồng.
${strictRuleInstruction}
3. Trường "evidence_quote" BẮT BUỘC phải trích dẫn CHÍNH XÁC NGUYÊN VĂN 1 câu trong hợp đồng (không tự ý sửa chữ) để giao diện Split-view tìm và bôi vàng (highlight) trên PDF.
4. Trường "page_number" lấy đúng số Trang được ghi ở đầu mỗi đoạn [Trang X, Dòng Y].
5. Chỉ trả về chuỗi JSON thuần túy, KHÔNG bọc trong \`\`\`json hay markdown.

BỘ TIÊU CHUẨN ĐỐI CHIẾU (SQL SERVER):
${standardsList}

CÁC ĐOẠN BẰNG CHỨNG TRÍCH XUẤT TỪ HỢP ĐỒNG (RAG RETRIEVAL):
${formattedEvidenceChunks}

Trả về JSON theo đúng cấu trúc sau:
{"findings":[{"standard_id":number,"risk_level":"High"|"Medium"|"Low","violation_desc":"string","evidence_quote":"string","page_number":number|null,"recommendation":"string"}]}`;

  const response = await genai.models.generateContent({
    model: modelName || "gemini-1.5-flash",
    contents: prompt,
  });

  const rawText = response.text ?? "";

  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: GeminiResponse;
  try {
    parsed = JSON.parse(cleaned) as GeminiResponse;
  } catch {
    throw makeError(`Gemini trả về JSON không hợp lệ: ${cleaned.substring(0, 200)}`, 502);
  }

  if (!Array.isArray(parsed.findings)) {
    throw makeError("Gemini response thiếu key 'findings'.", 502);
  }

  return parsed.findings;
};

// ─── Service chính: Chạy quy trình 5 bước RAG + LLM ──────────────────────────

export const runAiScanService = async (documentId: number, userId: number) => {
  // 1. Kiểm tra Document
  const document = await prisma.documents.findUnique({
    where: { id: documentId },
    include: {
      Suppliers: { select: { id: true, is_deleted: true } },
    },
  });

  if (!document) throw makeError("Hợp đồng không tồn tại.", 404);
  if (document.Suppliers.is_deleted) throw makeError("Nhà cung cấp của hợp đồng này đã bị xóa.", 400);
  if (document.status === "Analyzing") throw makeError("Hợp đồng đang được phân tích, vui lòng chờ.", 409);

  await prisma.documents.update({
    where: { id: documentId },
    data: { status: "Analyzing" },
  });

  try {
    const filePath = path.join(process.cwd(), document.storage_url);
    if (!fs.existsSync(filePath)) {
      throw makeError(`File PDF không tìm thấy tại: ${document.storage_url}`, 404);
    }
    const fileBuffer = fs.readFileSync(filePath);

    // Đọc cấu hình từ bảng System_Configs
    const configMap = await getSystemConfigMap();
    const maskingEnabled = configMap["DATA_MASKING_ENABLED"] !== "false";
    const modelName = configMap["AI_MODEL_NAME"] || "gemini-1.5-flash";
    const strictMode = configMap["AI_STRICT_RULE_MODE"] !== "false";

    // BƯỚC 1: Smart Chunking theo từng Trang & Điều/Khoản + Data Masking
    const allChunks = await extractAndSmartChunkPdf(
      fileBuffer,
      documentId,
      maskingEnabled ? maskSensitiveData : (t) => t
    );

    if (allChunks.length === 0) {
      throw makeError("Không thể đọc nội dung văn bản từ file PDF. File có thể là ảnh scan.", 422);
    }

    // Lọc bộ tiêu chuẩn động từ SQL Server
    const activeStandards = await getActiveStandardsForScan(userId, document.category_id);
    if (activeStandards.length === 0) {
      await prisma.documents.update({
        where: { id: documentId },
        data: { status: "Analyzed", last_analyzed_at: new Date(), updated_at: new Date() },
      });
      return { violations: [], message: "Không có tiêu chuẩn nào áp dụng cho loại hợp đồng này." };
    }

    // BƯỚC 2: RAG Retrieval — Lọc ra các đoạn bằng chứng có liên quan ngữ nghĩa với Bộ tiêu chuẩn
    const apiKey = process.env.GEMINI_API_KEY ?? "";
    const relevantChunks = await retrieveRelevantChunksViaRag(allChunks, activeStandards, apiKey);

    // BƯỚC 3 & 4: Đóng gói Prompt & Gọi Gemini LLM suy luận lỗi
    const findings = await callGeminiWithRagChunks(
      relevantChunks,
      activeStandards,
      modelName,
      strictMode
    );

    // BƯỚC 5: Xóa các lỗi Pending cũ (nếu quét lại) và lưu danh sách lỗi mới vào bảng Violations
    const validStandardIds = new Set(activeStandards.map((s) => s.id));
    const violationsToCreate = findings.filter(
      (f) =>
        validStandardIds.has(f.standard_id) &&
        ["High", "Medium", "Low"].includes(f.risk_level) &&
        f.violation_desc &&
        f.evidence_quote
    );

    const createdViolations = await prisma.$transaction([
      prisma.violations.deleteMany({
        where: { document_id: documentId, status: "Pending" },
      }),
      ...violationsToCreate.map((f) =>
        prisma.violations.create({
          data: {
            document_id: documentId,
            standard_id: f.standard_id,
            risk_level: f.risk_level,
            violation_desc: f.violation_desc,
            evidence_quote: f.evidence_quote,
            page_number: f.page_number ?? null,
            recommendation: f.recommendation ?? null,
            status: "Pending",
          },
        })
      ),
    ]);

    // Bỏ phần tử đầu tiên (kết quả của deleteMany)
    const savedViolations = createdViolations.slice(1);

    await prisma.documents.update({
      where: { id: documentId },
      data: {
        status: "Analyzed",
        last_analyzed_at: new Date(),
        updated_at: new Date(),
      },
    });

    return { violations: savedViolations };
  } catch (error) {
    await prisma.documents.update({
      where: { id: documentId },
      data: { status: "Error", updated_at: new Date() },
    });
    throw error;
  }
};

/**
 * Lấy danh sách Violations của một Document (dùng trong Split-view).
 */
export const getViolationsByDocumentService = async (documentId: number) => {
  const document = await prisma.documents.findUnique({ where: { id: documentId } });
  if (!document) throw makeError("Hợp đồng không tồn tại.", 404);

  return prisma.violations.findMany({
    where: { document_id: documentId },
    include: {
      Standards: {
        select: {
          id: true,
          standard_code: true,
          name: true,
          jurisdiction: true,
          Standard_Groups: { select: { group_code: true, group_name: true } },
        },
      },
      Users: { select: { id: true, full_name: true } },
    },
    orderBy: [{ risk_level: "asc" }, { created_at: "desc" }],
  });
};