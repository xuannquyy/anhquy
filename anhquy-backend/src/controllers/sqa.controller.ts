import { Request, Response, NextFunction } from "express";
import {
  getSqaOverviewService,
  getSqaAiQualityService,
  getSqaDocumentHealthService,
  getSqaSupplierRiskService,
  getSqaDiagnosticsService,
  getSqaAnalysisLogsService,
} from "../services/sqa.service";

export const getOverview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await getSqaOverviewService(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getAiQuality = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await getSqaAiQualityService(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getDocumentHealth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await getSqaDocumentHealthService(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getSupplierRisk = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await getSqaSupplierRiskService(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getDiagnostics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await getSqaDiagnosticsService(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getAnalysisLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await getSqaAnalysisLogsService(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

