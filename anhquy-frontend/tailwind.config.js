/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 8 Mã màu gốc bắt buộc theo thiết kế Logo (GIỮ NGUYÊN 100%)
        Snowflake:    '#DCE0E8', // Nền chính toàn trang
        Frostysilver: '#BEB3AC', // Nền phụ, highlight PDF
        Pine:         '#014BAA', // Xanh dương cho Tiêu đề, chữ đậm chủ đạo
        Branch:       '#0A1020', // Xanh đen đậm cho Văn bản nội dung
        Mist:         '#8EA1AE', // Viền, text phụ
        Berry:        '#6B212C', // Cảnh báo High risk (Đỏ lỗi vi phạm)
        Sunny:        '#EBBC62', // Vàng cam (Sidebar, điểm nhấn cảnh báo)
        Merlot:       '#51121A', // Đỏ rượu vang đậm (Điểm nhấn Active)

        // Các mã màu phụ trợ ngữ nghĩa giúp giao diện hài hòa, tách biệt Đỏ (Lỗi) vs Xanh (Khuyến nghị)
        DangerBg:     '#FFF1F2', // Nền hồng phấn dịu cho khung Bằng chứng lỗi
        DangerBorder: '#FECDD3', // Viền đỏ nhạt cho khung Bằng chứng lỗi
        SafeGreen:    '#047857', // Xanh lục bảo đậm cho chữ Khuyến nghị khắc phục
        SafeBg:       '#ECFDF5', // Nền xanh lá pastel dịu mắt cho khung Khuyến nghị
        SafeBorder:   '#A7F3D0', // Viền xanh lá cho khung Khuyến nghị
        WarnBg:       '#FFFBEB', // Nền vàng kem sáng cho trạng thái Chờ duyệt
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        sm:  '0 1px 3px 0 rgba(10,16,32,0.06)',
        md:  '0 4px 12px 0 rgba(10,16,32,0.10)',
        lg:  '0 8px 24px 0 rgba(10,16,32,0.14)',
      },
      borderRadius: {
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
}