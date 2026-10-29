// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseModule = require("pdf-parse");
import { GoogleGenAI } from "@google/genai";

export interface ContractChunk {
  chunkId: string;
  documentId: number;
  pageNumber: number;
  lineStart: number;
  clauseTitle: string;
  content: string;
  embedding?: number[];
}

export interface StandardForRag {
  id: number;
  standard_code: string;
  name: string;
  content_i18n: string | null;
  jurisdiction: string | null;
  priority_level: number | null;
}

/**
 * Bộ chuẩn hóa khoảng trắng tiếng Việt dành riêng cho lỗi font PDF.
 *
 * NGUYÊN TẮC THIẾT KẾ (quan trọng):
 *  - CHỈ ghép (merge) các ký tự bị tách rời do lỗi encoding/font của file PDF.
 *  - TUYỆT ĐỐI KHÔNG tách (split) bất kỳ chuỗi nào — tách nguyên âm/phụ âm
 *    bằng regex âm vị học sẽ phá vỡ từ tiếng Việt đúng chính tả.
 *
 * Ba trường hợp lỗi PDF phổ biến được xử lý:
 *  1. Phụ âm đầu bị tách khỏi nguyên âm:   "Đ ể"   → "Để"
 *  2. Nguyên âm đôi bị tách ở giữa:         "tiế t" → "tiết"   (font cắt đôi nguyên âm đôi)
 *  3. Phụ âm cuối bị tách khỏi nguyên âm:   "Ngườ i" → "Người"
 */
export function normalizeVietnameseSyllablesBasic(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

  const allVowels =
    "aăâeêioôơuưyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ";

  // 1. Ghép phụ âm đầu bị tách rời khỏi nguyên âm
  //    Ví dụ: "Đ ể" → "Để", "th ực" → "thực", "ch í" → "chí"
  //    Điều kiện: phụ âm đứng đầu từ (sau khoảng trắng/bắt đầu dòng/dấu mở ngoặc)
  //    + khoảng trắng 1+ + nguyên âm có dấu hoặc nguyên âm tiếng Việt.
  text = text.replace(
    new RegExp(
      `(?<=^|\\s|[(""\\'\\u201C\\u201D])(Ngh|Ng|Nh|Ch|Gh|Kh|Ph|Th|Tr|Qu|ngh|ng|nh|ch|gh|kh|ph|th|tr|qu|[bcdfghklmnpqrstvxzđĐ])\\s+([${allVowels}])`,
      "g"
    ),
    "$1$2"
  );

  // 2. Ghép nguyên âm đôi bị tách ở giữa âm tiết
  //    Ví dụ: "tiế t" → "tiết", "nướ c" → "nước"
  //    Nhận diện: phần đầu nguyên âm (có thể có phụ âm trước) + khoảng trắng + nguyên âm mang dấu thanh
  text = text.replace(
    /([bcdđghklmnpqrstvx]*(?:i|y|u|ư|o|ô|ơ))\s+([ếệờớợềểổạấậắặ])/gi,
    "$1$2"
  );

  // 3. Ghép phụ âm cuối bị tách khỏi nguyên âm trước khoảng trắng/dấu câu
  //    Ví dụ: "Ngườ i" → "Người", "quố c" → "quốc"
  //    Chỉ ghép khi ngay sau phụ âm là khoảng trắng, dấu câu, hoặc hết chuỗi
  text = text.replace(
    new RegExp(
      `([${allVowels}])\\s+(ng|nh|ch|[cmnpt])(?=$|\\s|[.,;:!"'\\u201C\\u201D\\u2018\\u2019)?])`,
      "gi"
    ),
    "$1$2"
  );

  // Dọn khoảng trắng trước dấu câu
  text = text.replace(/\s+([.,;!?])/g, "$1");

  return text.replace(/\s+/g, " ").trim();
}

/**
 * Bộ đọc PDF đa tương thích có kiểm soát tọa độ X/Y để tránh chèn khoảng trắng sai lệch vào giữa chữ.
 */
async function extractPagesFromPdfBuffer(fileBuffer: Buffer): Promise<string[]> {
  const pagesText: string[] = [];

  const parseFn =
    typeof pdfParseModule === "function"
      ? pdfParseModule
      : typeof pdfParseModule?.default === "function"
      ? pdfParseModule.default
      : null;

  if (parseFn) {
    const options = {
      pagerender: async (pageData: {
        getTextContent: () => Promise<{
          items: Array<{ str: string; transform: number[]; width?: number }>;
        }>;
      }) => {
        const textContent = await pageData.getTextContent();
        let lastY: number | null = null;
        let lastEndX: number | null = null;
        let pageStr = "";

        for (const item of textContent.items) {
          if (!item.str) continue;
          const currentX = item.transform ? item.transform[4] : null;
          const currentY = item.transform ? item.transform[5] : null;
          const itemWidth = item.width ?? item.str.length * 4.5;

          if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 4) {
            pageStr += "\n";
            lastEndX = null;
          } else if (lastEndX !== null && currentX !== null) {
            const gapX = currentX - lastEndX;
            if (gapX > 1.2 && !pageStr.endsWith(" ") && !item.str.startsWith(" ")) {
              pageStr += " ";
            }
          }

          pageStr += item.str;
          lastY = currentY;
          if (currentX !== null) {
            lastEndX = currentX + itemWidth;
          }
        }

        pagesText.push(pageStr.trim());
        return pageStr;
      },
    };

    const result = await parseFn(fileBuffer, options);
    if (pagesText.length === 0 && result?.text) {
      pagesText.push(String(result.text).trim());
    }
    return pagesText;
  }

  const PDFParseClass = pdfParseModule?.PDFParse || pdfParseModule?.default?.PDFParse;
  if (typeof PDFParseClass === "function") {
    const parser = new PDFParseClass({ data: fileBuffer });
    const result = await parser.getText();

    if (Array.isArray(result?.pages) && result.pages.length > 0) {
      for (const p of result.pages) {
        pagesText.push(String(p.text || "").trim());
      }
    } else if (result?.text) {
      pagesText.push(String(result.text).trim());
    }

    if (typeof parser.destroy === "function") {
      await parser.destroy().catch(() => {});
    }
    return pagesText;
  }

  throw new Error("Không thể khởi tạo thư viện đọc PDF (pdf-parse).");
}

export const extractAndSmartChunkPdf = async (
  fileBuffer: Buffer,
  documentId: number,
  maskFn: (raw: string) => string
): Promise<ContractChunk[]> => {
  const pagesText = await extractPagesFromPdfBuffer(fileBuffer);

  const chunks: ContractChunk[] = [];
  let chunkIndex = 0;

  pagesText.forEach((rawPage, idx) => {
    const pageNumber = idx + 1;
    const maskedPage = maskFn(rawPage);
    if (!maskedPage) return;

    const lines = maskedPage
      .split("\n")
      .map((l) => normalizeVietnameseSyllablesBasic(l))
      .filter(Boolean);

    let currentTitle = `Trang ${pageNumber} - Đoạn mở đầu`;
    let currentLines: string[] = [];
    let currentLineStart = 1;

    const flushChunk = () => {
      const text = normalizeVietnameseSyllablesBasic(currentLines.join(" "));
      if (text.length >= 20) {
        chunkIndex++;
        chunks.push({
          chunkId: `DOC${documentId}_P${pageNumber}_C${chunkIndex}`,
          documentId,
          pageNumber,
          lineStart: currentLineStart,
          clauseTitle: currentTitle,
          content: text,
        });
      }
      currentLines = [];
    };

    lines.forEach((line, lineIdx) => {
      const isClauseHeader = /^(Điều\s+\d+|ĐIỀU\s+\d+|Article\s+\d+|Khoản\s+\d+|Mục\s+[A-Z0-9]+)/i.test(line);

      if (isClauseHeader && currentLines.length > 0) {
        flushChunk();
        currentTitle = line.substring(0, 80);
        currentLineStart = lineIdx + 1;
      } else if (currentLines.join(" ").length > 800) {
        flushChunk();
        currentTitle = `Trang ${pageNumber} (Tiếp theo)`;
        currentLineStart = lineIdx + 1;
      }

      currentLines.push(line);
    });

    flushChunk();
  });

  return chunks;
};

const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const selectLexicallyRelevantChunks = (
  chunks: ContractChunk[],
  standards: StandardForRag[],
  limit = 25
): ContractChunk[] => {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const stopWords = new Set([
    "va", "cua", "cho", "trong", "cac", "mot", "nhung", "theo",
    "duoc", "phai", "shall", "with", "from", "that", "this", "contract", "standard",
  ]);
  const terms = new Set<string>();
  for (const standard of standards) {
    let text = standard.name;
    if (standard.content_i18n) {
      try {
        const parsed = JSON.parse(standard.content_i18n) as { vi?: string; en?: string };
        text += ` ${parsed.vi ?? ""} ${parsed.en ?? ""}`;
      } catch {
        text += ` ${standard.content_i18n}`;
      }
    }
    for (const term of normalize(text).match(/[a-z0-9]{3,}/g) ?? []) {
      if (!stopWords.has(term)) terms.add(term);
    }
  }

  if (terms.size === 0) return chunks.slice(0, limit);
  const scored = chunks.map((chunk, index) => {
    const content = normalize(`${chunk.clauseTitle} ${chunk.content}`);
    let score = 0;
    for (const term of terms) {
      if (content.includes(term)) score += term.length >= 7 ? 2 : 1;
    }
    return { chunk, score, index };
  });
  const matched = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
  return (matched.length > 0 ? matched : scored.slice(0, limit))
    .sort((a, b) => a.chunk.pageNumber - b.chunk.pageNumber || a.chunk.lineStart - b.chunk.lineStart)
    .map((item) => item.chunk);
};

export const retrieveRelevantChunksViaRag = async (
  chunks: ContractChunk[],
  standards: StandardForRag[],
  apiKey: string
): Promise<ContractChunk[]> => {
  if (chunks.length <= 15) {
    return chunks;
  }

  const genai = new GoogleGenAI({ apiKey });

  try {
    const standardTexts = standards.map((s) => {
      let viText = s.name;
      if (s.content_i18n) {
        try {
          const parsed = JSON.parse(s.content_i18n) as { vi?: string };
          if (parsed.vi) viText += ": " + parsed.vi;
        } catch {
          viText += ": " + s.content_i18n;
        }
      }
      return viText;
    });

    let embeddings: number[][];

    try {
      const embeddingRes = await genai.models.embedContent({
        model: "gemini-embedding-001",
        contents: [
          ...chunks.map((c) => `${c.clauseTitle}:${c.content}`),
          ...standardTexts,
        ],
      });
      embeddings = embeddingRes?.embeddings?.map((item) => item.values ?? []) ?? [];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const statusMatch = message.match(/\b(400|401|403|404|429|500|502|503)\b/);
      console.warn(
        `[RAG] Embedding không khả dụng (status=${statusMatch?.[1] ?? "unknown"}); dùng truy xuất từ khóa dự phòng.`
      );
      return selectLexicallyRelevantChunks(chunks, standards);
    }

    const chunkVectors = embeddings.slice(0, chunks.length);
    const stdVectors = embeddings.slice(chunks.length, chunks.length + standardTexts.length);

    if (
      chunkVectors.length !== chunks.length ||
      stdVectors.length === 0 ||
      chunkVectors.every((vector) => vector.length === 0)
    ) {
      return selectLexicallyRelevantChunks(chunks, standards);
    }

    const scoredChunks = chunks.map((chunk, i) => {
      const cVec = chunkVectors[i] ?? [];
      let maxSim = 0;
      for (const sVec of stdVectors) {
        const sim = cosineSimilarity(cVec, sVec);
        if (sim > maxSim) maxSim = sim;
      }
      return { chunk, score: maxSim };
    });

    const topChunks = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map((item) => item.chunk)
      .sort((a, b) => a.pageNumber - b.pageNumber || a.lineStart - b.lineStart);

    return topChunks;
  } catch {
    return selectLexicallyRelevantChunks(chunks, standards);
  }
};
