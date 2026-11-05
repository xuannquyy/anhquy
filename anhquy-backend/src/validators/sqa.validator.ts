/**
 * SQA Date Range & Query Validator
 * Đảm bảo parsing khoảng thời gian an toàn, thống nhất múi giờ Việt Nam (UTC+7) và giới hạn truy vấn.
 */

export interface DateRange {
  startDate: Date;
  endDate: Date;
  fromStr: string;
  toStr: string;
}

export const parseDateRange = (from?: unknown, to?: unknown, period?: unknown): DateRange => {
  const now = new Date();

  // Lấy ngày hiện tại theo giờ Việt Nam (UTC+7) định dạng YYYY-MM-DD
  const todayVNStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // ví dụ: "2026-11-06"

  let end: Date;
  let start: Date;

  const periodStr = typeof period === "string" ? period.trim().toLowerCase() : "";
  const toParam = typeof to === "string" ? to.trim() : "";
  const fromParam = typeof from === "string" ? from.trim() : "";

  // 1. Xác định Ngày kết thúc (endDate)
  if (/^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
    // Nếu truyền chuỗi ngày YYYY-MM-DD cụ thể
    const parsedEnd = new Date(`${toParam}T23:59:59.999+07:00`);
    if (!isNaN(parsedEnd.getTime())) {
      end = parsedEnd;
    } else {
      end = new Date(`${todayVNStr}T23:59:59.999+07:00`);
    }
  } else {
    // Mặc định kết thúc vào cuối ngày hôm nay theo giờ VN
    end = new Date(`${todayVNStr}T23:59:59.999+07:00`);
  }

  // 2. Xác định Ngày bắt đầu (startDate)
  let daysToSubtract = 30; // Mặc định 30 ngày
  if (periodStr === "7d") daysToSubtract = 7;
  else if (periodStr === "90d") daysToSubtract = 90;
  else if (periodStr === "30d") daysToSubtract = 30;

  if (/^\d{4}-\d{2}-\d{2}$/.test(fromParam)) {
    const parsedStart = new Date(`${fromParam}T00:00:00.000+07:00`);
    if (!isNaN(parsedStart.getTime())) {
      start = parsedStart;
    } else {
      start = new Date(end);
      start.setDate(start.getDate() - daysToSubtract);
      start.setHours(0, 0, 0, 0);
    }
  } else {
    // Tính start theo số ngày lùi lại từ ngày kết thúc
    const baseDate = new Date(`${todayVNStr}T00:00:00.000+07:00`);
    baseDate.setDate(baseDate.getDate() - daysToSubtract);
    start = baseDate;
  }

  // Đảm bảo start <= end
  if (start > end) {
    const temp = start;
    start = end;
    end = temp;
  }

  // Giới hạn khoảng truy vấn tối đa 366 ngày (1 năm)
  const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxRangeMs) {
    start = new Date(end.getTime() - maxRangeMs);
  }

  const formatYMD = (d: Date): string => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };

  return {
    startDate: start,
    endDate: end,
    fromStr: formatYMD(start),
    toStr: formatYMD(end),
  };
};
