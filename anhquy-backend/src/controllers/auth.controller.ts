import { Request, Response } from "express";
import {
  loginService,
  refreshTokenService,
  logoutService,
  getMeService,
  updateProfileService,
  changePasswordService,
} from "../services/auth.service";
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
 * Xác thực thông tin đăng nhập, trả JWT access token, refresh token và thông tin user.
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
      refresh_token: result.refresh_token,
      user: result.user,
    });
  } catch (error) {
    const err = error as ServiceError;
    const status = err.httpStatus ?? 500;
    res.status(status).json({ message: err.message ?? "Lỗi máy chủ." });
  }
};

/**
 * POST /api/auth/refresh-token
 * Body: { refresh_token: string }
 *
 * Đổi refresh_token hợp lệ lấy JWT access token mới và refresh_token mới.
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const { refresh_token } = req.body;

  if (!refresh_token || typeof refresh_token !== "string" || !refresh_token.trim()) {
    res.status(400).json({ message: "refresh_token là bắt buộc." });
    return;
  }

  try {
    const result = await refreshTokenService(refresh_token.trim());
    res.status(200).json({
      message: "Làm mới token thành công.",
      token: result.token,
      refresh_token: result.refresh_token,
    });
  } catch (error) {
    const err = error as ServiceError;
    const status = err.httpStatus ?? 500;
    res.status(status).json({ message: err.message ?? "Lỗi máy chủ." });
  }
};

/**
 * POST /api/auth/logout
 * Header: Authorization: Bearer <token>
 *
 * Đăng xuất người dùng và xóa refresh_token trong cơ sở dữ liệu.
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "Chưa xác thực." });
    return;
  }

  try {
    await logoutService(req.user.userId);
    res.status(200).json({ message: "Đăng xuất thành công." });
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

/**
 * PUT /api/auth/profile
 * Header: Authorization: Bearer <token>
 * Body: { full_name: string }
 *
 * Cập nhật họ tên cá nhân của user đang đăng nhập và ghi Audit_Log.
 */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "Chưa xác thực." });
    return;
  }

  const { full_name } = req.body;

  try {
    const user = await updateProfileService(req.user.userId, full_name);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user.userId,
        action_type: "UPDATE_PROFILE",
        target_table: "Users",
        target_id: req.user.userId,
        old_value: null,
        new_value: JSON.stringify({ full_name }),
      },
    });

    res.status(200).json({ message: "Cập nhật hồ sơ thành công.", user });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};