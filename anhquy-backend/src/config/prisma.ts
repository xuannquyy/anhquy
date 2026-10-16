import { PrismaClient } from "@prisma/client";

/**
 * Singleton PrismaClient instance dùng chung toàn bộ ứng dụng.
 * Việc khai báo 1 instance duy nhất tránh việc tạo nhiều connection pool,
 * đặc biệt quan trọng khi dùng hot-reload (nodemon/tsx).
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});

export default prisma;

