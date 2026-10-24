import fs from "fs";
import crypto from "crypto";
import path from "path";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";

/** Kiểu lỗi service kèm HTTP status */
interface ServiceError extends Error {
  httpStatus: number;
}

const makeError = (message: string, httpStatus: number): ServiceError => {
  const err = new Error(message) as ServiceError;
  err.httpStatus = httpStatus;
  return err;
};

/**
 * Hàm đồng bộ lại điểm tín nhiệm (risk_score) của Nhà cung ứng dựa trên
 * các lỗi ĐÃ PHÊ DUYỆT (Approved) của những hợp đồng đang tồn tại thực tế.
 */
const syncSupplierRiskScore = async (supplierId: number): Promise<number> => {
  const configs = await prisma.system_Configs.findMany({
    where: {
      config_key: { in: ["PENALTY_HIGH_RISK", "PENALTY_MEDIUM_RISK", "PENALTY_LOW_RISK"] },
    },
    select: { config_key: true, config_value: true },
  });

  const deductions: Record<string, number> = { High: 10, Medium: 5, Low: 2 };
  for (const c of configs) {
    const val = parseFloat(c.config_value);
    if (!isNaN(val)) {
      if (c.config_key === "PENALTY_HIGH_RISK") deductions["High"] = val;
      if (c.config_key === "PENALTY_MEDIUM_RISK") deductions["Medium"] = val;
      if (c.config_key === "PENALTY_LOW_RISK") deductions["Low"] = val;
    }
  }

  const approvedViolations = await prisma.violations.findMany({
    where: {
      status: "Approved",
      Documents: { supplier_id: supplierId },
    },
    select: { risk_level: true },
  });

  let score = 100;
  for (const v of approvedViolations) {
    score -= deductions[v.risk_level] ?? 0;
  }
  const finalScore = Math.max(0, score);

  await prisma.suppliers.update({
    where: { id: supplierId },
    data: { risk_score: finalScore, updated_at: new Date() },
  });

  return finalScore;
};

export interface DocumentFilter {
  supplier_id?: number;
  category_id?: number;
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * Lấy danh sách Documents với lọc và phân trang.
 */
export const getDocumentsService = async (filter: DocumentFilter) => {
  const { supplier_id, category_id, status, page = 1, limit = 20 } = filter;
  const skip = (page - 1) * limit;

  const where: Prisma.DocumentsWhereInput = {};
  if (supplier_id !== undefined) where.supplier_id = supplier_id;
  if (category_id !== undefined) where.category_id = category_id;
  if (status) where.status = status;

  const [items, total] = await prisma.$transaction([
    prisma.documents.findMany({
      where,
      include: {
        Suppliers: { select: { id: true, company_name: true, tax_code: true, risk_score: true } },
        Categories: { select: { id: true, name: true, category_type: true } },
      },
      orderBy: { uploaded_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.documents.count({ where }),
  ]);

  return { items, total, page, limit };
};

/**
 * Lấy 1 Document theo ID (Đồng bộ lại điểm tín nhiệm thực tế của Supplier trước khi trả về).
 */
export const getDocumentByIdService = async (id: number) => {
  const existing = await prisma.documents.findUnique({
    where: { id },
    select: { supplier_id: true },
  });
  if (!existing) throw makeError("Hợp đồng không tồn tại.", 404);

  // Tự động làm sạch điểm rác nếu hợp đồng cũ đã xóa trước đó
  await syncSupplierRiskScore(existing.supplier_id).catch(() => {});

  const document = await prisma.documents.findUnique({
    where: { id },
    include: {
      Suppliers: { select: { id: true, company_name: true, tax_code: true, risk_score: true } },
      Categories: { select: { id: true, name: true, category_type: true } },
      Violations: {
        select: {
          id: true,
          risk_level: true,
          violation_desc: true,
          status: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      },
    },
  });
  if (!document) throw makeError("Hợp đồng không tồn tại.", 404);
  return document;
};

/**
 * Upload hợp đồng PDF:
 * 1. Tính SHA-256 hash của file đã upload.
 * 2. Kiểm tra trùng hash trong bảng Documents — nếu trùng, xóa file tạm và báo lỗi.
 * 3. Kiểm tra supplier và category tồn tại và hợp lệ.
 * 4. Lưu bản ghi vào DB & đồng bộ lại điểm tín nhiệm của nhà cung cấp.
 */
export const uploadDocumentService = async (
  file: Express.Multer.File,
  supplierId: number,
  categoryId: number
) => {
  const filePath = file.path;

  // 1. Tính SHA-256 hash từ nội dung file
  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  // 2. Kiểm tra trùng hash — nếu trùng xóa file vật lý và từ chối
  const existingDoc = await prisma.documents.findFirst({
    where: { file_hash: fileHash },
    select: { id: true, file_name: true, Suppliers: { select: { company_name: true } } },
  });

  if (existingDoc) {
    fs.unlinkSync(filePath);
    throw makeError(
      `File này đã tồn tại trong hệ thống (hợp đồng #${existingDoc.id} của nhà cung cấp "${existingDoc.Suppliers?.company_name ?? "không xác định"}"). Vui lòng kiểm tra lại.`,
      409
    );
  }

  // 3. Kiểm tra Supplier tồn tại và không bị xóa
  const supplier = await prisma.suppliers.findUnique({ where: { id: supplierId } });
  if (!supplier || supplier.is_deleted) {
    fs.unlinkSync(filePath);
    throw makeError("Nhà cung cấp không tồn tại hoặc đã bị xóa.", 404);
  }

  // 4. Kiểm tra Category hợp lệ (phải là Contract_Type)
  const category = await prisma.categories.findUnique({ where: { id: categoryId } });
  if (!category || !category.is_active) {
    fs.unlinkSync(filePath);
    throw makeError("Loại hợp đồng không tồn tại hoặc đã bị vô hiệu hóa.", 404);
  }
  if (category.category_type !== "Contract_Type") {
    fs.unlinkSync(filePath);
    throw makeError("category_id phải thuộc loại 'Contract_Type'.", 400);
  }

  // 5. Đường dẫn lưu trữ tương đối (storage_url)
  const storageUrl = path.join("uploads", path.basename(filePath)).replace(/\\/g, "/");

  // 6. Lưu bản ghi Document vào DB
  const document = await prisma.documents.create({
    data: {
      supplier_id: supplierId,
      category_id: categoryId,
      file_name: file.originalname,
      file_size: file.size,
      file_type: "pdf",
      file_hash: fileHash,
      storage_url: storageUrl,
      status: "Uploaded",
    },
  });

  // 7. Đồng bộ lại điểm tín nhiệm của Supplier dựa trên các lỗi Approved thực tế đang tồn tại
  await syncSupplierRiskScore(supplierId).catch(() => {});

  return document;
};

/**
 * Xóa hợp đồng tải nhầm (DELETE /api/documents/:id) & Tính toán lại điểm tín nhiệm cho Nhà cung cấp
 */
export const deleteDocumentService = async (id: number) => {
  const doc = await prisma.documents.findUnique({ where: { id } });
  if (!doc) throw makeError("Hợp đồng không tồn tại.", 404);

  if (doc.status === "Analyzing") {
    throw makeError("Không thể xóa hợp đồng đang trong quá trình AI phân tích.", 400);
  }

  const supplierId = doc.supplier_id;

  // Xóa file vật lý trong thư mục /uploads nếu tồn tại
  const fullPath = path.join(process.cwd(), doc.storage_url);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (e) {
      console.warn("[Warning] Không thể xóa file vật lý:", e);
    }
  }

  // Xóa bản ghi trong CSDL (Cascade sẽ tự động xóa các Violations liên quan)
  await prisma.documents.delete({ where: { id } });

  // QUAN TRỌNG: Tính lại điểm tín nhiệm cho Nhà cung cấp sau khi đã xóa hợp đồng
  const updatedScore = await syncSupplierRiskScore(supplierId).catch(() => 100);

  return { id: id, file_name: doc.file_name, new_supplier_risk_score: updatedScore };
};