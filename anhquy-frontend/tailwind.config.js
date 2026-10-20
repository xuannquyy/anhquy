/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Hệ màu Winter (60-30-10)
        Snowflake:    '#DCE0E8', // Nền chính toàn trang (60%)
        Frostysilver: '#BEB3AC', // Nền phụ, hover bảng, highlight PDF (30%)
        Pine:         '#27363F', // Sidebar, tiêu đề, Primary Button (10%)
        Branch:       '#685652', // Văn bản nội dung, Secondary elements
        Mist:         '#8EA1AE', // Viền, text phụ, disabled
        Berry:        '#6B212C', // Cảnh báo High risk, nút nguy hiểm
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
