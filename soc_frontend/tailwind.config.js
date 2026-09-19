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
          bg: '#F8FAFC',            // Crisp light enterprise background
          bgSubtle: '#F0F4F8',      // Very light blue-grey background
          card: '#FFFFFF',          // Pure white frosted cards
          cardHover: '#F8FAFC',     // Card hover state
          border: '#E2E8F0',        // Soft subtle border
          borderLight: '#CBD5E1',   // Focused/hover border
          muted: '#64748B',         // Cool grey secondary text
          text: '#0F172A',          // Dark blue/slate primary text
          textSecondary: '#334155', // Regular body text
          accent: '#2563EB',        // Trustworthy corporate blue
          accentHover: '#1D4ED8',
          accentLight: '#EFF6FF',   // Very light blue tint
        },
        severity: {
          critical: '#DC2626',
          criticalBg: 'rgba(239, 68, 68, 0.08)',
          criticalBorder: '#FCA5A5',
          high: '#EA580C',
          highBg: 'rgba(234, 88, 12, 0.08)',
          highBorder: '#FDBA74',
          medium: '#D97706',
          mediumBg: 'rgba(217, 119, 6, 0.08)',
          mediumBorder: '#FCD34D',
          low: '#2563EB',
          lowBg: 'rgba(37, 99, 235, 0.08)',
          lowBorder: '#BFDBFE',
          safe: '#059669',
          safeBg: 'rgba(16, 185, 129, 0.08)',
          safeBorder: '#A7F3D0',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': '0.65rem',
      },
      boxShadow: {
        'enterprise': '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
        'enterprise-md': '0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
      }
    },
  },
  plugins: [],
}
