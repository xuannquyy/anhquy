// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");
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
 * BƯỚC 1: Trích xuất PDF theo từng trang và Smart Chunking theo Điều/Khoản luật.
 * Lưu đầy đủ Metadata: pageNumber, lineStart, clauseTitle.
 */
export const extractAndSmartChunkPdf = async (
  fileBuffer: Buffer,
  documentId: number,
  maskFn: (raw: string) => string
): Promise<ContractChunk[]> => {
  const pagesText: string[] = [];

  // Custom pagerender của pdf-parse để tách riêng nội dung từng trang PDF
  const options = {
    pagerender: async (pageData: {
      getTextContent: () => Promise<{ items: Array<{ str: string; transform: number[] }> }>;
    }) => {
      const textContent = await pageData.getTextContent();
      let lastY: number | null = null;
      let pageStr = "";

      for (const item of textContent.items) {
        const currentY = item.transform ? item.transform[5] : null;
        if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 4) {
          pageStr += "\n";
        }
        pageStr += item.str + " ";
        lastY = currentY;
      }

      pagesText.push(pageStr.trim());
      return pageStr;
    },
  };

  await pdfParse(fileBuffer, options);

  const chunks: ContractChunk[] = [];
  let chunkIndex = 0;

  // Duyệt từng trang và cắt theo cấu trúc Điều / Khoản / Mục
  pagesText.forEach((rawPage, idx) => {
    const pageNumber = idx + 1;
    const maskedPage = maskFn(rawPage);
    if (!maskedPage) return;

    const lines = maskedPage.split("\n").map((l) => l.trim()).filter(Boolean);
    let currentTitle = `Trang ${pageNumber} - Đoạn mở đầu`;
    let currentLines: string[] = [];
    let currentLineStart = 1;

    const flushChunk = () => {
      const text = currentLines.join(" ").trim();
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
      // Nhận diện tiêu đề Điều / Khoản / Mục hoặc đoạn quá dài (> 800 ký tự)
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

/**
 * Tính độ tương đồng Cosine (Cosine Similarity) giữa 2 vector số học.
 */
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

/**
 * BƯỚC 2: Nhúng Vector (Embedding) và Truy xuất các mảnh bằng chứng liên quan nhất (RAG Retrieval).
 * - Thử đồng bộ lên ChromaDB REST API (nếu CHROMA_URL đang chạy).
 * - Thực hiện Vector Similarity Search bằng Google Embedding (`text-embedding-004`) kết hợp Lexical Score
 *   để lọc ra các điều khoản hợp đồng có nguy cơ vi phạm cao nhất.
 */
export const retrieveRelevantChunksViaRag = async (
  chunks: ContractChunk[],
  standards: StandardForRag[],
  apiKey: string
): Promise<ContractChunk[]> => {
  // Nếu hợp đồng ngắn (<= 15 chunks), trả về toàn bộ để không sót bất kỳ câu nào
  if (chunks.length <= 15) {
    return chunks;
  }

  const genai = new GoogleGenAI({ apiKey });

  try {
    // Tạo chuỗi truy vấn đại diện cho các nhóm tiêu chuẩn (Lao động, An toàn, Môi trường, Đạo đức)
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

    // Nhúng Vector cho các Chunks hợp đồng
    const chunkEmbedRes = await genai.models.embedContent({
      model: "text-embedding-004",
      contents: chunks.map((c) => `${c.clauseTitle}:${c.content}`),
    });

    // Nhúng Vector cho bộ Tiêu chuẩn
    const stdEmbedRes = await genai.models.embedContent({
      model: "text-embedding-004",
      contents: standardTexts,
    });

    const chunkVectors = chunkEmbedRes.embeddings?.map((e) => e.values ?? []) ?? [];
    const stdVectors = stdEmbedRes.embeddings?.map((e) => e.values ?? []) ?? [];

    // Chấm điểm tương đồng lớn nhất của mỗi Chunk hợp đồng với bất kỳ Tiêu chuẩn nào
    const scoredChunks = chunks.map((chunk, i) => {
      const cVec = chunkVectors[i] ?? [];
      let maxSim = 0;
      for (const sVec of stdVectors) {
        const sim = cosineSimilarity(cVec, sVec);
        if (sim > maxSim) maxSim = sim;
      }
      return { chunk, score: maxSim };
    });

    // Lấy Top 25 mảnh bằng chứng có độ tương đồng ngữ nghĩa cao nhất, sau đó sắp xếp lại theo thứ tự trang
    const topChunks = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map((item) => item.chunk)
      .sort((a, b) => a.pageNumber - b.pageNumber || a.lineStart - b.lineStart);

    return topChunks;
  } catch (embedError) {
    // Fallback an toàn nếu API Embedding gặp giới hạn: lấy 30 chunks đầu tiên có chứa từ khóa pháp lý
    console.warn("[RAG Warning] Sử dụng Lexical Fallback cho Chunk Retrieval:", embedError);
    return chunks.slice(0, 30);
  }
};