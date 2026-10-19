import { Request, Response } from "express";
import { getDashboardStatsService } from "../services/dashboard.service";

interface ServiceError extends Error {
  httpStatus?: number;
}

export const getDashboardStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getDashboardStatsService();
    res.status(200).json({ stats });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message ?? "Lỗi máy chủ." });
  }
};