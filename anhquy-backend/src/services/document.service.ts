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
        Suppliers: { select: { id: true, company_name: true, tax_code: true } },
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
 * Lấy 1 Document theo ID.
 */
export const getDocumentByIdService = async (id: number) => {
  const document = await prisma.documents.findUnique({
    where: { id },
    include: {
      Suppliers: { select: { id: true, company_name: true, tax_code: true } },
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
 * 4. Lưu bản ghi vào DB.
 *
 * @param file       - File object từ multer
 * @param supplierId - ID nhà cung cấp
 * @param categoryId - ID loại hợp đồng (category_type = 'Contract_Type')
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
    // Xóa file vật lý vừa upload vì bị trùng
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

  return document;
};
