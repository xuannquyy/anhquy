import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";

/**
 * Payload được mã hóa bên trong JWT access token.
 */
export interface JwtPayload {
  userId: number;
  roleId: number;
  email: string;
}

/**
 * Mở rộng kiểu Request của Express để gắn thông tin user sau khi xác thực.
 */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware xác thực: giải mã JWT từ header Authorization và đối chiếu trạng thái thực tế trong DB.
 * - Trả 401 nếu không có token, token sai định dạng hoặc đã hết hạn.
 * - Trả 403 nếu tài khoản vừa bị Admin vô hiệu hóa (is_active = false).
 * - Luôn cập nhật req.user.roleId theo role_id mới nhất trong DB để khi Admin đổi role
 *   thì quyền hạn mới của tài khoản có hiệu lực NGAY LẬP TỨC.
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Không có token xác thực. Vui lòng đăng nhập." });
    return;
  }

  const token = authHeader.split(" ")[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({ message: "Cấu hình máy chủ bị lỗi: thiếu JWT_SECRET." });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Đối chiếu trực tiếp với bảng Users để lấy role_id và trạng thái is_active mới nhất
    const currentUser = await prisma.users.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role_id: true, email: true, is_active: true },
    });

    if (!currentUser) {
      res.status(401).json({ message: "Tài khoản không tồn tại trong hệ thống." });
      return;
    }

    if (!currentUser.is_active) {
      res.status(403).json({ message: "Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên." });
      return;
    }

    // Gắn thông tin mới nhất từ DB vào req.user (đảm bảo đổi Role có hiệu lực tức thì)
    req.user = {
      userId: currentUser.id,
      roleId: currentUser.role_id,
      email: currentUser.email,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: "Token đã hết hạn. Vui lòng đăng nhập lại." });
      return;
    }
    res.status(401).json({ message: "Token không hợp lệ." });
  }
};

/**
 * Middleware phân quyền: kiểm tra permission_code trong bảng Role_Permissions.
 * MUST: Đối chiếu trực tiếp với DB — không tin tưởng dữ liệu từ client.
 * - Phải đặt SAU `requireAuth` trong chuỗi middleware.
 * - Trả 403 nếu role của user không có permission được yêu cầu.
 *
 * @param permissionCode - Mã quyền cần kiểm tra (ví dụ: 'MANAGE_USERS')
 */
export const requirePermission = (permissionCode: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: "Chưa xác thực người dùng." });
      return;
    }

    const { roleId } = req.user;

    try {
      // Tìm permission_id tương ứng với permission_code
      const permission = await prisma.permissions.findUnique({
        where: { permission_code: permissionCode },
        select: { id: true },
      });

      if (!permission) {
        res.status(403).json({ message: `Quyền '${permissionCode}' không tồn tại trong hệ thống.` });
        return;
      }

      // Kiểm tra trong bảng Role_Permissions (khóa chính phức hợp)
      const rolePermission = await prisma.role_Permissions.findUnique({
        where: {
          role_id_permission_id: {
            role_id: roleId,
            permission_id: permission.id,
          },
        },
      });

      if (!rolePermission) {
        res.status(403).json({ message: "Bạn không có quyền thực hiện hành động này." });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({ message: "Lỗi máy chủ khi kiểm tra phân quyền." });
    }
  };
};