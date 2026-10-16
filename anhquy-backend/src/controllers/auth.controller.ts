import { Request, Response } from "express";
import { loginService, getMeService, changePasswordService } from "../services/auth.service";
import prisma from "../config/prisma";

/**
 * Kiểu lỗi nội bộ được ném bởi service layer kèm HTTP status code.
 */
interface ServiceError extends Error {
  httpStatus?: number;
}

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 *
 * Xác thực thông tin đăng nhập, trả JWT access token và thông tin user.
 * Áp dụng chống brute-force ở tầng service.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  // Validate đầu vào cơ bản
  if (!email || typeof email !== "string" || !email.trim()) {
    res.status(400).json({ message: "Email là bắt buộc." });
    return;
  }
  if (!password || typeof password !== "string") {
    res.status(400).json({ message: "Mật khẩu là bắt buộc." });
    return;
  }

  try {
    const result = await loginService(email.trim().toLowerCase(), password);
    res.status(200).json({
      message: "Đăng nhập thành công.",
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    const err = error as ServiceError;
    const status = err.httpStatus ?? 500;
    res.status(status).json({ message: err.message ?? "Lỗi máy chủ." });
  }
};

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 *
 * Trả thông tin cá nhân của user đang đăng nhập.
 * Yêu cầu middleware requireAuth đã xác thực trước.
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "Chưa xác thực." });
    return;
  }

  try {
    const user = await getMeService(req.user.userId);
    res.status(200).json({ user });
  } catch (error) {
    const err = error as ServiceError;
    const status = err.httpStatus ?? 500;
    res.status(status).json({ message: err.message ?? "Lỗi máy chủ." });
  }
};

/**
 * PUT /api/auth/change-password
 * Header: Authorization: Bearer <token>
 * Body: { oldPassword: string, newPassword: string }
 *
 * Đổi mật khẩu cho user hiện tại.
 * Ghi Audit_Log sau khi đổi mật khẩu thành công.
 * Yêu cầu middleware requireAuth đã xác thực trước.
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "Chưa xác thực." });
    return;
  }

  const { oldPassword, newPassword } = req.body;

  // Validate đầu vào
  if (!oldPassword || typeof oldPassword !== "string") {
    res.status(400).json({ message: "Mật khẩu hiện tại là bắt buộc." });
    return;
  }
  if (!newPassword || typeof newPassword !== "string") {
    res.status(400).json({ message: "Mật khẩu mới là bắt buộc." });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ message: "Mật khẩu mới phải có ít nhất 8 ký tự." });
    return;
  }

  try {
    await changePasswordService(req.user.userId, oldPassword, newPassword);

    // Ghi Audit_Log cho hành động đổi mật khẩu (nhạy cảm)
    await prisma.audit_Logs.create({
      data: {
        user_id: req.user.userId,
        action_type: "CHANGE_PASSWORD",
        target_table: "Users",
        target_id: req.user.userId,
        old_value: null,
        new_value: null, // Không lưu giá trị hash mật khẩu vào audit log
      },
    });

    res.status(200).json({ message: "Đổi mật khẩu thành công." });
  } catch (error) {
    const err = error as ServiceError;
    const status = err.httpStatus ?? 500;
    res.status(status).json({ message: err.message ?? "Lỗi máy chủ." });
  }
};

