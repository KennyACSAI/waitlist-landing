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
          'Inclusive Sans',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        serif: [
          'Inclusive Sans',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        glow: '0 0 60px -10px rgba(40, 170, 151, 0.55)',
        'glow-sm': '0 0 30px -8px rgba(40, 170, 151, 0.45)',
      },
      animation: {
        'fade-up': 'fadeUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fadeIn 0.9s ease-out both',
        'draw-check': 'drawCheck 0.45s cubic-bezier(0.25, 1, 0.5, 1) both',
        'message-in': 'messageIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'glow-pulse': 'glowPulse 1.2s cubic-bezier(0.16, 1, 0.3, 1) both',
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
        drawCheck: {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
        messageIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        glowPulse: {
          '0%': { boxShadow: '0 0 0 0 rgba(40, 170, 151, 0)' },
          '30%': { boxShadow: '0 0 0 6px rgba(40, 170, 151, 0.35)' },
          '100%': { boxShadow: '0 0 0 18px rgba(40, 170, 151, 0)' },
        },
      },
    },
  },
  plugins: [],
}
