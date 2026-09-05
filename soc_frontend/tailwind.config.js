/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        soc: {
          bg: '#090D16',         // Deepest background
          card: '#0F172A',       // Panel/card background
          cardHover: '#131D36',  // Panel hover
          border: '#1E293B',     // Subtle structural border
          borderLight: '#334155',// Active/focused border
          muted: '#64748B',      // Inactive/secondary text
          text: '#F1F5F9',       // Primary high-contrast text
          textSecondary: '#94A3B8', // Regular body text
          accent: '#38BDF8',     // Technical cyan/sky accent
          accentHover: '#0EA5E9',
        },
        severity: {
          critical: '#EF4444',
          criticalBg: '#450A0A',
          criticalBorder: '#991B1B',
          high: '#F97316',
          highBg: '#431407',
          highBorder: '#9A3412',
          medium: '#F59E0B',
          mediumBg: '#451A03',
          mediumBorder: '#92400E',
          low: '#3B82F6',
          lowBg: '#172554',
          lowBorder: '#1E40AF',
          safe: '#10B981',
          safeBg: '#022C22',
          safeBorder: '#065F46',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.65rem',
      }
    },
  },
  plugins: [],
}
