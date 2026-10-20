import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../config/prisma";
import { JwtPayload } from "../middlewares/auth.middleware";

/** Số lần sai mật khẩu tối đa trước khi khóa tài khoản */
const MAX_LOGIN_ATTEMPTS = 5;

/** Thời gian khóa tài khoản (phút) */
const ACCOUNT_LOCK_MINUTES = 15;

/** Thời hạn sống của Refresh Token (7 ngày) */
const REFRESH_TOKEN_DAYS = 7;

/**
 * Hàm phụ trợ sinh chuỗi Refresh Token ngẫu nhiên (80 ký tự hex) và ngày hết hạn.
 */
const generateRefreshTokenData = () => {
  const refreshToken = crypto.randomBytes(40).toString("hex");
  const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  return { refreshToken, refreshTokenExpiry };
};

/**
 * Thực hiện đăng nhập.
 * - Kiểm tra tài khoản tồn tại, active và không bị khóa.
 * - So sánh mật khẩu với bcrypt.
 * - Áp dụng logic chống Brute-force: sai → tăng failed_login_attempts;
 *   chạm ngưỡng 5 → khóa locked_until 15 phút.
 * - Đăng nhập đúng → reset failed_login_attempts = 0, locked_until = null.
 * - Phát hành JWT access token và lưu refresh_token + refresh_token_expiry vào DB.
 *
 * @returns { token, refresh_token, user } hoặc ném lỗi với message và httpStatus
 */
export const loginService = async (
  email: string,
  password: string
): Promise<{ token: string; refresh_token: string; user: object }> => {
  // 1. Tìm user theo email, kèm thông tin role và danh sách permission_code
  const user = await prisma.users.findUnique({
    where: { email },
    include: {
      Roles: {
        select: {
          id: true,
          role_name: true,
          Role_Permissions: {
            select: { Permissions: { select: { permission_code: true } } },
          },
        },
      },
    },
  });

  if (!user) {
    // Không tiết lộ email có tồn tại hay không để chống enumeration
    const err = new Error("Email hoặc mật khẩu không đúng.") as Error & { httpStatus: number };
    err.httpStatus = 401;
    throw err;
  }

  // 2. Kiểm tra tài khoản active
  if (!user.is_active) {
    const err = new Error("Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.") as Error & { httpStatus: number };
    err.httpStatus = 403;
    throw err;
  }

  // 3. Kiểm tra khóa tài khoản do brute-force
  const now = new Date();
  if (user.locked_until && user.locked_until > now) {
    const remainingMs = user.locked_until.getTime() - now.getTime();
    const remainingMin = Math.ceil(remainingMs / 60000);
    const err = new Error(
      `Tài khoản tạm thời bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${remainingMin} phút.`
    ) as Error & { httpStatus: number };
    err.httpStatus = 429;
    throw err;
  }

  // 4. Kiểm tra mật khẩu
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    // Tăng số lần sai
    const newAttempts = (user.failed_login_attempts ?? 0) + 1;

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      // Khóa tài khoản 15 phút
      const lockUntil = new Date(now.getTime() + ACCOUNT_LOCK_MINUTES * 60 * 1000);
      await prisma.users.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: newAttempts,
          locked_until: lockUntil,
        },
      });
      const err = new Error(
        `Tài khoản bị khóa ${ACCOUNT_LOCK_MINUTES} phút do đăng nhập sai ${MAX_LOGIN_ATTEMPTS} lần liên tiếp.`
      ) as Error & { httpStatus: number };
      err.httpStatus = 429;
      throw err;
    } else {
      await prisma.users.update({
        where: { id: user.id },
        data: { failed_login_attempts: newAttempts },
      });
      const err = new Error(
        `Email hoặc mật khẩu không đúng. Còn ${MAX_LOGIN_ATTEMPTS - newAttempts} lần thử.`
      ) as Error & { httpStatus: number };
      err.httpStatus = 401;
      throw err;
    }
  }

  // 5. Phát hành JWT & tạo Refresh Token
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error("Lỗi cấu hình máy chủ: thiếu JWT_SECRET.") as Error & { httpStatus: number };
    err.httpStatus = 500;
    throw err;
  }

  const { refreshToken, refreshTokenExpiry } = generateRefreshTokenData();

  // 6. Đăng nhập thành công → reset trạng thái brute-force & lưu refresh_token vào DB
  await prisma.users.update({
    where: { id: user.id },
    data: {
      failed_login_attempts: 0,
      locked_until: null,
      refresh_token: refreshToken,
      refresh_token_expiry: refreshTokenExpiry,
      updated_at: now,
    },
  });

  const payload: JwtPayload = {
    userId: user.id,
    roleId: user.role_id,
    email: user.email,
  };

  const token = jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) ?? "8h",
  });

  // 7. Trả thông tin user (loại bỏ các trường nhạy cảm)
  const safeUser = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.Roles.role_name,
    is_active: user.is_active,
  };

  return { token, refresh_token: refreshToken, user: safeUser };
};

/**
 * Cấp lại JWT access token mới từ refresh_token hợp lệ (Refresh Token Rotation).
 * - Kiểm tra refresh_token tồn tại trong DB và chưa quá hạn refresh_token_expiry.
 * - Kiểm tra tài khoản còn is_active = true.
 * - Phát hành access token mới và xoay vòng (cập nhật) refresh_token mới vào DB.
 *
 * @param incomingRefreshToken - Chuỗi refresh_token do client gửi lên
 */
export const refreshTokenService = async (
  incomingRefreshToken: string
): Promise<{ token: string; refresh_token: string }> => {
  const user = await prisma.users.findFirst({
    where: { refresh_token: incomingRefreshToken },
  });

  if (!user || !user.refresh_token_expiry) {
    const err = new Error("Refresh token không hợp lệ hoặc không tồn tại.") as Error & { httpStatus: number };
    err.httpStatus = 401;
    throw err;
  }

  if (!user.is_active) {
    const err = new Error("Tài khoản đã bị vô hiệu hóa.") as Error & { httpStatus: number };
    err.httpStatus = 403;
    throw err;
  }

  if (user.refresh_token_expiry < new Date()) {
    await prisma.users.update({
      where: { id: user.id },
      data: { refresh_token: null, refresh_token_expiry: null },
    });
    const err = new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.") as Error & { httpStatus: number };
    err.httpStatus = 401;
    throw err;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error("Lỗi cấu hình máy chủ: thiếu JWT_SECRET.") as Error & { httpStatus: number };
    err.httpStatus = 500;
    throw err;
  }

  const { refreshToken: newRefreshToken, refreshTokenExpiry } = generateRefreshTokenData();

  await prisma.users.update({
    where: { id: user.id },
    data: {
      refresh_token: newRefreshToken,
      refresh_token_expiry: refreshTokenExpiry,
      updated_at: new Date(),
    },
  });

  const payload: JwtPayload = {
    userId: user.id,
    roleId: user.role_id,
    email: user.email,
  };

  const token = jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) ?? "8h",
  });

  return { token, refresh_token: newRefreshToken };
};

/**
 * Đăng xuất người dùng hiện tại.
 * - Xóa refresh_token và refresh_token_expiry trong DB về null để vô hiệu hóa phiên.
 *
 * @param userId - ID lấy từ req.user (JWT đã xác thực)
 */
export const logoutService = async (userId: number): Promise<void> => {
  await prisma.users.update({
    where: { id: userId },
    data: {
      refresh_token: null,
      refresh_token_expiry: null,
      updated_at: new Date(),
    },
  });
};

/**
 * Lấy thông tin cá nhân của user hiện tại (dùng userId từ JWT payload).
 * - Không trả về password_hash, refresh_token.
 *
 * @param userId - ID lấy từ req.user (JWT đã xác thực)
 */
export const getMeService = async (userId: number): Promise<object> => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      full_name: true,
      role_id: true,
      is_active: true,
      created_at: true,
      updated_at: true,
      Roles: {
        select: {
          id: true,
          role_name: true,
          description: true,
          Role_Permissions: {
            select: { Permissions: { select: { permission_code: true } } },
          },
        },
      },
    },
  });

  if (!user) {
    const err = new Error("Không tìm thấy thông tin người dùng.") as Error & { httpStatus: number };
    err.httpStatus = 404;
    throw err;
  }

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.Roles.role_name,
    role_id: user.role_id,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
    Roles: {
      id: user.Roles.id,
      role_name: user.Roles.role_name,
      description: user.Roles.description,
    },
    permissions: user.Roles.Role_Permissions.map((rp) => rp.Permissions.permission_code),
  };
};

/**
 * Cập nhật họ tên cá nhân của người dùng đang đăng nhập.
 *
 * @param userId    - ID lấy từ JWT payload
 * @param full_name - Họ và tên mới muốn cập nhật
 */
export const updateProfileService = async (userId: number, full_name: string) => {
  if (!full_name || !full_name.trim()) {
    const err = new Error("Họ tên không được để trống.") as Error & { httpStatus: number };
    err.httpStatus = 400;
    throw err;
  }

  const updated = await prisma.users.update({
    where: { id: userId },
    data: {
      full_name: full_name.trim(),
      updated_at: new Date(),
    },
    select: {
      id: true,
      email: true,
      full_name: true,
      role_id: true,
      is_active: true,
      Roles: { select: { role_name: true } },
    },
  });

  return updated;
};

/**
 * Đổi mật khẩu cho user hiện tại.
 * - Xác minh mật khẩu cũ trước.
 * - Hash mật khẩu mới bằng bcrypt (saltRounds = 10).
 * - Reset failed_login_attempts, locked_until và thu hồi refresh_token cũ sau khi đổi thành công.
 *
 * @param userId      - ID lấy từ JWT payload
 * @param oldPassword - Mật khẩu hiện tại của user
 * @param newPassword - Mật khẩu mới muốn đặt
 */
export const changePasswordService = async (
  userId: number,
  oldPassword: string,
  newPassword: string
): Promise<void> => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, password_hash: true, is_active: true },
  });

  if (!user || !user.is_active) {
    const err = new Error("Không tìm thấy tài khoản hợp lệ.") as Error & { httpStatus: number };
    err.httpStatus = 404;
    throw err;
  }

  // Xác minh mật khẩu cũ
  const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!isOldPasswordValid) {
    const err = new Error("Mật khẩu hiện tại không đúng.") as Error & { httpStatus: number };
    err.httpStatus = 401;
    throw err;
  }

  // Kiểm tra mật khẩu mới không được trùng mật khẩu cũ
  const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
  if (isSamePassword) {
    const err = new Error("Mật khẩu mới không được trùng với mật khẩu cũ.") as Error & { httpStatus: number };
    err.httpStatus = 400;
    throw err;
  }

  // Hash mật khẩu mới
  const newHashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.users.update({
    where: { id: userId },
    data: {
      password_hash: newHashedPassword,
      failed_login_attempts: 0,
      locked_until: null,
      refresh_token: null,
      refresh_token_expiry: null,
      updated_at: new Date(),
    },
  });
};