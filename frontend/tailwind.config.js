/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/features/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pine: {
          DEFAULT: '#16382C',
          dark: '#0E241C',
          light: '#224D3E',
        },
        terracotta: {
          DEFAULT: '#D9622B',
          dark: '#BF4F1C',
          light: '#FBECE4',
        },
        warm: {
          base: '#F4F1EA',
          raised: '#EFEBE2',
          surface: '#FFFFFF',
          border: '#D8D2C6',
        },
        ink: {
          DEFAULT: '#1A1A17',
          muted: '#595750',
        },
      },
      fontFamily: {
        sans: ['Space Grotesk', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
};
