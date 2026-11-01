// src/controllers/search.controller.ts
import { Request, Response } from 'express';
import { searchService } from '../services/search.service';

export const globalSearchController = async (req: Request, res: Response): Promise<void> => {
  try {
    const keyword = (req.query['q'] as string | undefined) ?? '';

    // Trả về cấu trúc rỗng ngay nếu query rỗng — không tốn DB
    if (!keyword.trim()) {
      res.status(200).json({
        suppliers: [],
        documents: [],
        standards: [],
        violations: [],
        users: [],
        systemConfigs: [],
        auditLogs: [],
      });
      return;
    }

    // req.user được gắn chính xác bởi requireAuth từ DB (roleId luôn mới nhất)
    // Truyền thẳng roleId số nguyên — không cần query thêm bảng Users/Roles
    const roleId = req.user!.roleId;

    const result = await searchService(keyword, roleId);
    res.status(200).json(result);
  } catch (error) {
    console.error('[Search] Lỗi tìm kiếm toàn cục:', error);
    res.status(500).json({ message: 'Lỗi tìm kiếm hệ thống.' });
  }
};