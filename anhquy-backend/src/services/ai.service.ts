import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import prisma from "../config/prisma";
import {
  extractAndSmartChunkPdf,
  normalizeVietnameseSyllablesBasic,
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

// ─── Cấu hình mô hình AI nội bộ ──────────────────────────────────────────────
const DEFAULT_ANALYSIS_MODEL = "gemini-2.5-flash"; 
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
//
// gemini-2.5-flash đôi khi trả về:
//   (A) Mảng trực tiếp:   [{ "standard_id": 1, ... }, ...]
//   (B) Object đơn:        { "standard_id": 1, ... }
//   (C) Chuẩn:             { "findings": [...] }
//
// extractJsonString() cố gắng lấy khối JSON đầu tiên (object hoặc array).
// normalizeGeminiResponse() chuẩn hóa cả 3 trường hợp về GeminiResponse.

function extractJsonString(raw: string): string {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Thử lấy array trước (gemini-2.5-flash hay trả mảng trực tiếp)
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  const hasArray = firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket;
  const hasObject = firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace;

  if (hasArray && hasObject) {
    // Lấy khối bắt đầu sớm hơn (array hoặc object đứng ngoài cùng)
    return firstBracket < firstBrace
      ? cleaned.substring(firstBracket, lastBracket + 1)
      : cleaned.substring(firstBrace, lastBrace + 1);
  }
  if (hasArray) return cleaned.substring(firstBracket, lastBracket + 1);
  if (hasObject) return cleaned.substring(firstBrace, lastBrace + 1);
  return cleaned;
}

// Chuẩn hóa bất kỳ dạng JSON nào mà Gemini trả về → GeminiResponse chuẩn
function normalizeGeminiResponse(rawParsed: unknown): GeminiResponse {
  // Trường hợp (C) chuẩn: { "findings": [...] }
  if (
    rawParsed !== null &&
    typeof rawParsed === "object" &&
    !Array.isArray(rawParsed) &&
    Array.isArray((rawParsed as Record<string, unknown>)["findings"])
  ) {
    return rawParsed as GeminiResponse;
  }

  // Trường hợp (A): Mảng trực tiếp [{ standard_id, ... }, ...]
  if (Array.isArray(rawParsed)) {
    console.warn("[AI Service] Gemini trả về mảng trực tiếp — tự động bọc vào { findings: [...] }");
    return { findings: rawParsed as GeminiViolationFinding[] };
  }

  // Trường hợp (B): Object đơn có chứa standard_id
  if (
    rawParsed !== null &&
    typeof rawParsed === "object" &&
    !Array.isArray(rawParsed) &&
    "standard_id" in (rawParsed as Record<string, unknown>)
  ) {
    console.warn("[AI Service] Gemini trả về object đơn — tự động bọc vào { findings: [object] }");
    return { findings: [rawParsed as GeminiViolationFinding] };
  }

  // Fallback: trả về findings rỗng thay vì crash
  console.error("[AI Service] Không nhận ra cấu trúc JSON từ Gemini:", JSON.stringify(rawParsed).substring(0, 300));
  return { findings: [] };
}

export interface CallGeminiResult {
  findings: GeminiViolationFinding[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelName: string;
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
): Promise<CallGeminiResult> => {
  // ── Ưu tiên 1: Đọc GEMINI_API_KEY từ bảng System_Configs (được Admin quản lý) ──
  // ── Ưu tiên 2: Fallback về process.env.GEMINI_API_KEY từ file .env ────────────
  const configMap = await getSystemConfigMap();
  const dbApiKey = configMap["GEMINI_API_KEY"]?.trim();
  const apiKey = (dbApiKey && !dbApiKey.startsWith("Điền_"))
    ? dbApiKey
    : process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || apiKey.startsWith("Điền_")) {
    throw makeError(
      "GEMINI_API_KEY chưa được cấu hình. Vui lòng thiết lập trong Quản trị → Cấu hình Hệ thống hoặc file .env của Backend.",
      500
    );
  }

  if (dbApiKey && !dbApiKey.startsWith("Điền_")) {
    console.info("[AI Service] Sử dụng GEMINI_API_KEY từ System_Configs (quản lý bởi Admin).");
  } else {
    console.info("[AI Service] Sử dụng GEMINI_API_KEY từ file .env (fallback mặc định).");
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
3. Trường "evidence_quote" BẮT BUỘC trích dẫn đúng câu điều khoản vi phạm trong hợp đồng. LƯU Ý CHUẨN HÓA NGỮ CẢNH (LLM Text Normalization): Nếu văn bản PDF gốc bị lỗi dính chữ hoặc rớt khoảng trắng tiếng Việt (ví dụ: "hóachất", "bảohộcánhân", "Ngườ i", "phảinộp"), BẮT BUỘC chuẩn hóa lại khoảng trắng tiếng Việt đúng chính tả ("hóa chất", "bảo hộ cá nhân", "Người", "phải nộp") trong cả "evidence_quote", "violation_desc" và "recommendation", nhưng giữ nguyên từ vựng gốc của hợp đồng.
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
  let usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;

  const generate = async (candidate: string): Promise<string> => {
    const startedAt = Date.now();
    try {
      const response = await genai.models.generateContent({
        model: candidate,
        contents: prompt,
        // Ép model trả về JSON thuần — tránh markdown wrapper và truncate giữa chừng
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        },
      });
      const text = response.text ?? "";
      if (response.usageMetadata) {
        usageMetadata = {
          promptTokenCount: response.usageMetadata.promptTokenCount,
          candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
          totalTokenCount: response.usageMetadata.totalTokenCount,
        };
      }
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

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(jsonStr);
  } catch {
    // Log đủ 500 ký tự để debug dễ hơn
    throw makeError(`Gemini trả về JSON không hợp lệ: ${jsonStr.substring(0, 500)}`, 502);
  }

  // normalizeGeminiResponse xử lý cả 3 dạng: array, object đơn, chuẩn {findings:[]}
  const parsed = normalizeGeminiResponse(rawParsed);

  return { findings: parsed.findings, usageMetadata, modelName: selectedModel };
};

// ─── Hàm nội bộ: Toàn bộ pipeline RAG + LLM chạy nền ────────────────────────
//
// Hàm này KHÔNG được export và KHÔNG được await từ bên ngoài.
// Nó tự quản lý vòng đời: cập nhật status "Analyzed"/"Error" vào DB khi xong.
// Controller chỉ cần gọi runAiScanService() và trả 202 ngay lập tức.
const _runAiScanBackground = async (
  documentId: number,
  userId: number,
  storagePath: string,
  categoryId: number,
  logId: number,
  analysisStartedAt: Date
): Promise<void> => {
  const jobStartedAt = analysisStartedAt.getTime();
  console.info(`[AI Background] Bắt đầu pipeline RAG+LLM cho document #${documentId} (Log #${logId}).`);

  let appliedModelName = "gemini-2.5-flash";

  try {
    const filePath = path.join(process.cwd(), storagePath);
    if (!fs.existsSync(filePath)) {
      throw makeError(`File PDF không tìm thấy tại: ${storagePath}`, 404);
    }
    const fileBuffer = fs.readFileSync(filePath);

    const configMap = await getSystemConfigMap();
    const maskingEnabled = configMap["DATA_MASKING_ENABLED"] !== "false";
    const dbModelName = configMap["AI_MODEL_NAME"]?.trim();
    appliedModelName = (dbModelName && dbModelName !== "") ? dbModelName : "gemini-2.5-flash";
    const strictMode = configMap["AI_STRICT_RULE_MODE"] !== "false";

    // BƯỚC 1: Smart Chunking + Data Masking
    const extractionStartedAt = Date.now();
    const allChunks = await extractAndSmartChunkPdf(
      fileBuffer,
      documentId,
      maskingEnabled ? maskSensitiveData : (t) => t
    );
    console.info(`[AI Background] Trích xuất PDF: ${allChunks.length} đoạn trong ${Date.now() - extractionStartedAt} ms.`);

    if (allChunks.length === 0) {
      throw makeError("Không thể đọc nội dung văn bản từ file PDF. File có thể là ảnh scan.", 422);
    }

    // Lọc bộ tiêu chuẩn động
    const activeStandards = await getActiveStandardsForScan(userId, categoryId);
    if (activeStandards.length === 0) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - jobStartedAt;
      await prisma.$transaction([
        prisma.documents.update({
          where: { id: documentId },
          data: {
            status: "Analyzed",
            last_analyzed_at: completedAt,
            analysis_completed_at: completedAt,
            last_error_code: null,
            last_error_message: null,
            updated_at: completedAt,
          },
        }),
        prisma.aI_Analysis_Logs.update({
          where: { id: logId },
          data: {
            status: "Success",
            model_name: appliedModelName,
            completed_at: completedAt,
            duration_ms: durationMs,
          },
        }),
      ]);
      console.info(`[AI Background] Document #${documentId}: không có tiêu chuẩn → Analyzed.`);
      return;
    }

    // BƯỚC 2: RAG Retrieval
    const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    const ragStartedAt = Date.now();
    const relevantChunks = await retrieveRelevantChunksViaRag(allChunks, activeStandards, apiKey);
    console.info(`[AI Background] RAG: ${relevantChunks.length}/${allChunks.length} đoạn trong ${Date.now() - ragStartedAt} ms.`);

    // BƯỚC 3 & 4: Gọi Gemini LLM
    const geminiResult = await callGeminiWithRagChunks(
      relevantChunks,
      activeStandards,
      appliedModelName,
      strictMode
    );

    const findings = geminiResult.findings;
    const usageMetadata = geminiResult.usageMetadata;
    appliedModelName = geminiResult.modelName || appliedModelName;

    // BƯỚC 5: Lưu kết quả vào DB
    const validStandardIds = new Set(activeStandards.map((s) => s.id));
    const violationsToCreate = findings
      .filter(
        (f) =>
          validStandardIds.has(f.standard_id) &&
          ["High", "Medium", "Low"].includes(f.risk_level) &&
          f.violation_desc &&
          f.evidence_quote
      )
      .map((f) => ({
        ...f,
        violation_desc: normalizeVietnameseSyllablesBasic(f.violation_desc),
        evidence_quote: normalizeVietnameseSyllablesBasic(f.evidence_quote),
        recommendation: f.recommendation
          ? normalizeVietnameseSyllablesBasic(f.recommendation)
          : f.recommendation,
      }));

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - jobStartedAt;

    await prisma.$transaction([
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
      prisma.documents.update({
        where: { id: documentId },
        data: {
          status: "Analyzed",
          last_analyzed_at: completedAt,
          analysis_completed_at: completedAt,
          last_error_code: null,
          last_error_message: null,
          updated_at: completedAt,
        },
      }),
      prisma.aI_Analysis_Logs.update({
        where: { id: logId },
        data: {
          status: "Success",
          model_name: appliedModelName,
          completed_at: completedAt,
          duration_ms: durationMs,
          input_tokens: usageMetadata?.promptTokenCount ?? null,
          output_tokens: usageMetadata?.candidatesTokenCount ?? null,
          total_tokens: usageMetadata?.totalTokenCount ?? null,
        },
      }),
    ]);

    const elapsed = (durationMs / 1000).toFixed(1);
    console.info(`[AI Background] Document #${documentId} → Analyzed. ${violationsToCreate.length} vi phạm lưu thành công (${elapsed}s).`);
  } catch (error) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - jobStartedAt;
    const msg = error instanceof Error ? error.message : String(error);
    const elapsed = (durationMs / 1000).toFixed(1);
    console.error(`[AI Background] Document #${documentId} → Error sau ${elapsed}s: ${msg}`);

    // Phân loại mã lỗi chuẩn xác theo SQA Diagnostic Rules
    let errorCode = "UNKNOWN_ERROR";
    const status = getGeminiHttpStatus(error);
    if (msg.includes("PDF") || msg.includes("ảnh scan") || msg.includes("storagePath") || msg.includes("Trích xuất PDF")) {
      errorCode = "PDF_EXTRACTION_ERROR";
    } else if (msg.includes("Chroma") || msg.includes("RAG") || msg.includes("Embedding") || msg.includes("retrieve")) {
      errorCode = "RAG_RETRIEVAL_ERROR";
    } else if (status === 401 || status === 403 || /api.?key|permission_denied/i.test(msg)) {
      errorCode = "GEMINI_AUTH_ERROR";
    } else if (status === 429 || /resource_exhausted|quota|rate.?limit/i.test(msg)) {
      errorCode = "GEMINI_QUOTA_ERROR";
    } else if (/timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(msg)) {
      errorCode = "GEMINI_TIMEOUT";
    } else if (msg.includes("JSON") || msg.includes("parse") || msg.includes("format")) {
      errorCode = "GEMINI_RESPONSE_ERROR";
    } else if (msg.includes("prisma") || msg.includes("database") || msg.includes("SQL")) {
      errorCode = "DATABASE_ERROR";
    }

    // Ghi nhận log thất bại vào AI_Analysis_Logs & cập nhật Documents
    await prisma.aI_Analysis_Logs
      .update({
        where: { id: logId },
        data: {
          status: "Failed",
          model_name: appliedModelName,
          completed_at: completedAt,
          duration_ms: durationMs,
          error_code: errorCode,
          error_message: msg.slice(0, 1000),
        },
      })
      .catch((logErr: unknown) => {
        console.error(`[AI Background] Không thể cập nhật AI_Analysis_Logs #${logId}:`, logErr);
      });

    await prisma.documents
      .update({
        where: { id: documentId },
        data: {
          status: "Error",
          analysis_completed_at: completedAt,
          last_error_code: errorCode,
          last_error_message: msg.slice(0, 1000),
          updated_at: completedAt,
        },
      })
      .catch((dbErr: unknown) => {
        const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.error(`[AI Background] Không thể ghi trạng thái Error cho document #${documentId}: ${dbMsg}`);
      });
  }
};

// ─── Service chính (exported): Validate → Set "Analyzing" → Fire-and-Forget ──
export const runAiScanService = async (
  documentId: number,
  userId: number
): Promise<{ status: "Analyzing"; message: string; documentId: number }> => {
  // ── Validate trước khi fire-and-forget ────────────────────────────────────
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

  const now = new Date();

  // ── Đánh dấu "Analyzing" vào DB & Tạo bản ghi AI_Analysis_Logs ───────────
  await prisma.documents.update({
    where: { id: documentId },
    data: {
      status: "Analyzing",
      analysis_started_at: now,
      last_error_code: null,
      last_error_message: null,
      updated_at: now,
    },
  });

  const analysisLog = await prisma.aI_Analysis_Logs.create({
    data: {
      document_id: documentId,
      model_name: "gemini-2.5-flash",
      status: "Started",
      started_at: now,
    },
  });

  // ── Fire-and-forget: khởi chạy pipeline nền, KHÔNG await ─────────────────
  void _runAiScanBackground(
    documentId,
    userId,
    document.storage_url,
    document.category_id,
    analysisLog.id,
    now
  );

  return {
    status: "Analyzing",
    message: "Hệ thống AI đã bắt đầu rà soát hợp đồng. Vui lòng theo dõi trạng thái cập nhật.",
    documentId,
  };
};

// ─── Lấy danh sách vi phạm theo document ─────────────────────────────────────

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
