/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#28aa97',
          50: '#ecfbf7',
          100: '#d0f5eb',
          200: '#a2ebd8',
          300: '#6bdbc0',
          400: '#3ec3a7',
          500: '#28aa97',
          600: '#1e8878',
          700: '#1b6c61',
          800: '#195650',
          900: '#174843',
        },
        ink: {
          950: '#05080a',
          900: '#0a1012',
          800: '#0f1619',
          700: '#151d21',
        },
      },
      fontFamily: {
        sans: [
          'Poppins',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        display: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 60px -10px rgba(40, 170, 151, 0.55)',
        'glow-sm': '0 0 30px -8px rgba(40, 170, 151, 0.45)',
      },
      animation: {
        'fade-up': 'fadeUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fadeIn 0.9s ease-out both',
        shimmer: 'shimmer 2.4s linear infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
