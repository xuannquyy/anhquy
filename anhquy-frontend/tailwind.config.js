/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Hệ màu Winter + Mở rộng Bluelight & Merlot
        Snowflake:    '#DCE0E8', // Nền chính toàn trang
        Frostysilver: '#BEB3AC', // Nền phụ, highlight PDF
        Pine:         '#27363F', // Tiêu đề, chữ đậm chủ đạo
        Branch:       '#685652', // Văn bản nội dung
        Mist:         '#8EA1AE', // Viền, text phụ
        Berry:        '#6B212C', // Cảnh báo High risk
        Bluelight:    '#A4B9CE', // Xanh băng sáng (Sidebar)
        Merlot:       '#51121A', // Đỏ rượu vang đậm (Điểm nhấn Active)
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        sm:  '0 1px 3px 0 rgba(39,54,63,0.08)',
        md:  '0 4px 12px 0 rgba(39,54,63,0.12)',
        lg:  '0 8px 24px 0 rgba(39,54,63,0.16)',
      },
      borderRadius: {
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
}