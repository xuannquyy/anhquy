import { Request, Response } from "express";
import { MulterError } from "multer";
import {
  getDocumentsService,
  getDocumentByIdService,
  uploadDocumentService,
  deleteDocumentService,
} from "../services/document.service";
import prisma from "../config/prisma";

interface ServiceError extends Error {
  httpStatus?: number;
}

// ─── GET /api/documents ───────────────────────────────────────────────────────

/**
 * Lấy danh sách Documents với lọc và phân trang.
 * Query: supplier_id, category_id, status, page, limit
 */
export const getDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, page, limit } = req.query;
    const supplier_id = req.query.supplier_id ? parseInt(req.query.supplier_id as string, 10) : undefined;
    const category_id = req.query.category_id ? parseInt(req.query.category_id as string, 10) : undefined;

    const result = await getDocumentsService({
      supplier_id,
      category_id,
      status: status as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.status(200).json(result);
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── GET /api/documents/:id ───────────────────────────────────────────────────

export const getDocumentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }
    const document = await getDocumentByIdService(id);
    res.status(200).json({ document });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── POST /api/documents/upload ───────────────────────────────────────────────

/**
 * Upload hợp đồng PDF.
 * - Multer xử lý multipart/form-data, file field là "contract".
 * - Body cần: supplier_id (number), category_id (number).
 * - Service tính SHA-256 và kiểm tra trùng trước khi lưu DB.
 * - Ghi Audit_Log sau khi upload thành công.
 *
 * Lưu ý: middleware multer đã được gắn trực tiếp tại Route để xử lý lỗi file
 * trước khi vào controller này.
 */
export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
  // Multer đã xử lý và gắn req.file nếu upload thành công
  if (!req.file) {
    res.status(400).json({ message: "Vui lòng chọn file PDF để upload." });
    return;
  }

  const { supplier_id, category_id } = req.body;

  if (!supplier_id || !category_id) {
    res.status(400).json({ message: "supplier_id và category_id là bắt buộc." });
    return;
  }

  const supplierId = parseInt(supplier_id, 10);
  const categoryId = parseInt(category_id, 10);

  if (isNaN(supplierId) || isNaN(categoryId)) {
    res.status(400).json({ message: "supplier_id và category_id phải là số nguyên hợp lệ." });
    return;
  }

  try {
    const document = await uploadDocumentService(req.file, supplierId, categoryId);

    // Ghi Audit_Log cho hành động upload hợp đồng
    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "UPLOAD",
        target_table: "Documents",
        target_id: document.id,
        old_value: null,
        new_value: JSON.stringify({
          file_name: document.file_name,
          file_size: document.file_size,
          file_hash: document.file_hash,
          supplier_id: document.supplier_id,
          category_id: document.category_id,
          status: document.status,
        }),
      },
    });

    res.status(201).json({
      message: "Upload hợp đồng thành công.",
      document,
    });
  } catch (error) {
    const err = error as ServiceError;
    // Nếu service ném lỗi (ví dụ trùng hash), file vật lý đã bị xóa trong service
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * Xử lý lỗi từ Multer (file quá lớn, sai định dạng).
 * Được gọi khi route dùng multer errorHandler.
 */
export const handleMulterError = (error: unknown, _req: Request, res: Response): void => {
  if (error instanceof MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ message: "File quá lớn. Giới hạn tối đa là 50 MB." });
      return;
    }
    res.status(400).json({ message: `Lỗi upload file: ${error.message}` });
    return;
  }
  if (error instanceof Error) {
    res.status(400).json({ message: error.message });
    return;
  }
  res.status(500).json({ message: "Lỗi máy chủ khi upload file." });
};


export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  try {
    const deletedInfo = await deleteDocumentService(id);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "DELETE",
        target_table: "Documents",
        target_id: id,
        old_value: JSON.stringify(deletedInfo),
        new_value: null,
      },
    });

    res.status(200).json({ message: "Xóa hợp đồng thành công." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};