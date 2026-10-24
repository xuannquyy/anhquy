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

const maskSensitiveData = (text: string): string => {
  let masked = text;

  // CCCD / CMND — 12 chữ số hoặc 9 chữ số đứng độc lập
  masked = masked.replace(/\b\d{12}\b/g, "[REDACTED]");
  masked = masked.replace(/\b\d{9}\b/g, "[REDACTED]");

  // Mã số thuế — 10 chữ số hoặc 10-3
  masked = masked.replace(/\b\d{10}-\d{3}\b/g, "[REDACTED]");
  masked = masked.replace(/\b\d{10}\b/g, "[REDACTED]");

  // Số tài khoản ngân hàng
  masked = masked.replace(
    /(?:tài khoản|STK|account|số TK)[:\s]*(\d[\d\s-]{5,18}\d)/gi,
    (match, p1) => match.replace(p1, "[REDACTED]")
  );

  return masked;
};

// ─── Lọc bộ tiêu chuẩn động ──────────────────────────────────────────────────

const getActiveStandardsForScan = async (userId: number, categoryId: number) => {
  const categoryStandards = await prisma.category_Standards.findMany({
    where: { category_id: categoryId },
    select: { standard_id: true },
  });
  const categoryStandardIds = categoryStandards.map((cs) => cs.standard_id);

  const excluded = await prisma.user_Excluded_Standards.findMany({
    where: { user_id: userId },
    select: { standard_id: true },
  });
  const excludedIds = new Set(excluded.map((e) => e.standard_id));

  const whereClause =
    categoryStandardIds.length > 0
      ? {
          id: { in: categoryStandardIds },
          is_active: true,
          OR: [{ created_by: null }, { created_by: userId }],
        }
      : {
          is_active: true,
          OR: [{ created_by: null }, { created_by: userId }],
        };

  const standards = await prisma.standards.findMany({
    where: whereClause,
    include: {
      Standard_Groups: { select: { group_code: true, group_name: true } },
    },
  });

  return standards.filter((s) => !excludedIds.has(s.id));
};

// ─── Cấu hình mô hình AI nội bộ (không cho người dùng nghiệp vụ chỉnh sửa) ────
// Chỉ cho phép model đã được đội kỹ thuật kiểm thử. Nếu biến môi trường bị nhập
// sai, hệ thống tự quay về model mặc định thay vì làm hỏng luồng rà soát.
const DEFAULT_ANALYSIS_MODEL = "gemini-3.8-flash";
const FALLBACK_ANALYSIS_MODEL = "gemini-3.5-flash-lite";
const ALLOWED_ANALYSIS_MODELS = new Set([
  DEFAULT_ANALYSIS_MODEL,
  FALLBACK_ANALYSIS_MODEL,
  "gemini-2.5-flash",
]);

const getConfiguredAnalysisModel = (): string => {
  const configured = process.env.AI_MODEL_NAME?.trim();
  if (configured && ALLOWED_ANALYSIS_MODELS.has(configured)) return configured;
  if (configured) {
    console.warn("[AI Service] AI_MODEL_NAME không nằm trong danh sách cho phép; dùng model mặc định.");
  }
  return DEFAULT_ANALYSIS_MODEL;
};

const getGeminiHttpStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  for (const value of [candidate.status, candidate.statusCode, candidate.code]) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isInteger(numeric) && numeric >= 400 && numeric <= 599) return numeric;
  }
  return undefined;
};

const isModelUnavailableError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const status = getGeminiHttpStatus(error);
  return status === 404 || /model.{0,40}(not found|not available|unsupported|does not exist)|not supported for generatecontent/i.test(message);
};

const toGeminiUserMessage = (error: unknown): { status: number; message: string } => {
  const status = getGeminiHttpStatus(error);
  const raw = error instanceof Error ? error.message : String(error);
  if (status === 401 || status === 403 || /api.?key|permission_denied|leaked/i.test(raw)) {
    return { status: 503, message: "Dịch vụ phân tích AI chưa được cấu hình hoặc chưa được cấp quyền. Vui lòng liên hệ quản trị hệ thống." };
  }
  if (status === 429 || /resource_exhausted|quota|rate.?limit/i.test(raw)) {
    return { status: 503, message: "Dịch vụ phân tích AI đang quá tải hoặc đã đạt giới hạn sử dụng. Vui lòng thử lại sau ít phút." };
  }
  if (status === 400) {
    return { status: 502, message: "AI không thể xử lý yêu cầu phân tích này. Vui lòng kiểm tra lại nội dung PDF hoặc liên hệ quản trị hệ thống." };
  }
  return { status: 502, message: "Không thể kết nối dịch vụ phân tích AI lúc này. Vui lòng thử lại sau." };
};

// ─── Tách chuỗi JSON an toàn từ phản hồi của LLM ─────────────────────────────

function extractJsonString(raw: string): string {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

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
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("Điền_")) {
    throw makeError("GEMINI_API_KEY chưa được cấu hình trong file .env của Backend.", 500);
  }

  const genai = new GoogleGenAI({ apiKey });

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
      return `- standard_id: ${s.id} | Mã: ${s.standard_code} | Tên: ${s.name} | Lãnh thổ: ${s.jurisdiction ?? "Global"} | Trọng số: ${s.priority_level ?? 1} | Nội dung: ${content}`;
    })
    .join("\n");

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

  let rawText = "";
  let selectedModel = modelName;

  const generate = async (candidate: string): Promise<string> => {
    const startedAt = Date.now();
    try {
      const response = await genai.models.generateContent({
        model: candidate,
        contents: prompt,
      });
      const text = response.text ?? "";
      console.info(`[AI Service] Gemini generateContent hoàn tất trong ${Date.now() - startedAt} ms.`);
      if (!text.trim()) throw makeError("AI không trả về nội dung phân tích.", 502);
      return text;
    } catch (error: unknown) {
      const status = getGeminiHttpStatus(error);
      console.error(`[AI Service] Gọi Gemini thất bại (model=${candidate}, status=${status ?? "unknown"}, durationMs=${Date.now() - startedAt}).`);
      throw error;
    }
  };

  try {
    rawText = await generate(modelName);
  } catch (primaryError: unknown) {
    // Chỉ chuyển model khi model chính thực sự không tồn tại/không hỗ trợ.
    // Không đổi model khi lỗi quota, API key, quyền truy cập hay lỗi mạng.
    if (!isModelUnavailableError(primaryError) || modelName === FALLBACK_ANALYSIS_MODEL) {
      const friendly = toGeminiUserMessage(primaryError);
      throw makeError(friendly.message, friendly.status);
    }

    console.warn("[AI Service] Model phân tích chính không khả dụng; thử model dự phòng đã được kiểm thử.");
    selectedModel = FALLBACK_ANALYSIS_MODEL;
    try {
      rawText = await generate(FALLBACK_ANALYSIS_MODEL);
    } catch (fallbackError: unknown) {
      const friendly = toGeminiUserMessage(fallbackError);
      throw makeError(friendly.message, friendly.status);
    }
  }

  console.log(`[AI Service] Phân tích hợp đồng thành công bằng cấu hình model nội bộ: ${selectedModel}`);

  const jsonStr = extractJsonString(rawText);

  let parsed: GeminiResponse;
  try {
    parsed = JSON.parse(jsonStr) as GeminiResponse;
  } catch {
    throw makeError(`Gemini trả về JSON không hợp lệ: ${jsonStr.substring(0, 200)}`, 502);
  }

  if (!Array.isArray(parsed.findings)) {
    throw makeError("Gemini response thiếu key 'findings'.", 502);
  }

  return parsed.findings;
};

// ─── Service chính: Chạy quy trình 5 bước RAG + LLM ──────────────────────────

export const runAiScanService = async (documentId: number, userId: number) => {
  const document = await prisma.documents.findUnique({
    where: { id: documentId },
    include: {
      Suppliers: { select: { id: true, is_deleted: true } },
    },
  });

  if (!document) throw makeError("Hợp đồng không tồn tại.", 404);
  if (document.Suppliers.is_deleted)
    throw makeError("Nhà cung cấp của hợp đồng này đã bị xóa.", 400);
  if (document.status === "Analyzing")
    throw makeError("Hợp đồng đang được phân tích, vui lòng chờ.", 409);

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

    const configMap = await getSystemConfigMap();
    const maskingEnabled = configMap["DATA_MASKING_ENABLED"] !== "false";
    const modelName = getConfiguredAnalysisModel();
    const strictMode = configMap["AI_STRICT_RULE_MODE"] !== "false";

    // BƯỚC 1: Smart Chunking theo từng Trang & Điều/Khoản + Data Masking
    const extractionStartedAt = Date.now();
    const allChunks = await extractAndSmartChunkPdf(
      fileBuffer,
      documentId,
      maskingEnabled ? maskSensitiveData : (t) => t
    );
    console.info(`[AI Service] Trích xuất PDF hoàn tất: ${allChunks.length} đoạn trong ${Date.now() - extractionStartedAt} ms.`);

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

    // BƯỚC 2: RAG Retrieval
    const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    const ragStartedAt = Date.now();
    const relevantChunks = await retrieveRelevantChunksViaRag(allChunks, activeStandards, apiKey);
    console.info(`[AI Service] Truy xuất bằng chứng hoàn tất: ${relevantChunks.length}/${allChunks.length} đoạn trong ${Date.now() - ragStartedAt} ms.`);

    // BƯỚC 3 & 4: Đóng gói Prompt & Gọi Gemini LLM
    const findings = await callGeminiWithRagChunks(
      relevantChunks,
      activeStandards,
      modelName,
      strictMode
    );

    // BƯỚC 5: Lưu danh sách lỗi mới vào bảng Violations
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