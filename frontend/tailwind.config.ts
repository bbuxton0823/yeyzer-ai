/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');

module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2C2C54',           // Main dark purple / blue
          light: '#4E4E8A',
          dark: '#202046',
        },
        accent: {
          DEFAULT: '#6A5ACD',           // Lavender accent
          light: '#8E7FF1',
          dark: '#5746A4',
        },
        highlight: {
          DEFAULT: '#FF007F',            // Bright magenta CTA / highlight
          light: '#FF4FA3',
          dark: '#C50065',
        },
        success: {
          DEFAULT: '#28a745',
          light: '#d4edda', // Lighter shade for success backgrounds
          dark: '#155724', // Darker shade for success text
        },
        error: {
          DEFAULT: '#dc3545',
          light: '#e4606d',
          dark: '#a71d2a',
        },
        background: '#1A1A2E',         // Very dark background
        surface: '#1F1F38',            // Card / surface colour
        'text-primary': '#F0F0F0',     // Light text on dark bg
        'text-secondary': '#A0A0A0',   // Muted light grey
        chat: { // Accent colors for different chat users
          bubble1: '#30345F', // Darker cyan‐ish bubble
          bubble2: '#3F3955', // Dark lavender
          bubble3: '#32434D', // Dark teal
          bubble4: '#453A4A', // Muted plum
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          'Fira Sans',
          'Droid Sans',
          'Helvetica Neue',
          'sans-serif',
        ],
      },
      backgroundImage: {
        'yeyzer-gradient': 'linear-gradient(135deg, #2C2C54 0%, #6A5ACD 100%)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        pulse: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [
    plugin(function ({ addBase, addComponents, addUtilities, theme }) {
      addBase({
        // Base styles for the app, matching the HTML file's body
        body: {
          fontFamily: theme('fontFamily.sans'),
          backgroundColor: theme('colors.background'),
          color: theme('colors.text-primary'),
        },
      });

      addComponents({
        // Custom button styles
        '.btn': {
          background: theme('backgroundImage.yeyzer-gradient'),
          color: theme('colors.white'),
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'transform 0.2s ease',
          width: '100%',
          '&:hover': {
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
        '.btn-sm': {
          padding: '8px 16px',
          fontSize: '12px',
          width: 'auto',
        },
        '.btn-outline': {
          background: 'transparent',
          border: `2px solid ${theme('colors.primary.DEFAULT')}`,
          color: theme('colors.primary.DEFAULT'),
        },
        // Form control styles
        '.form-control': {
          width: '100%',
          padding: '12px',
          border: `2px solid ${theme('colors.surface')}`,
          borderRadius: '8px',
          fontSize: '14px',
          transition: 'border-color 0.3s ease',
          '&:focus': {
            outline: 'none',
            borderColor: theme('colors.primary.DEFAULT'),
          },
        },
        // Match card styles
        '.match-card': {
          background: theme('colors.background'),
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: `1px solid ${theme('colors.surface')}`,
        },
        '.match-score': {
          background: theme('colors.success.light'),
          color: theme('colors.success.dark'),
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '600',
        },
        '.tag': {
          background: theme('colors.surface'),
          color: theme('colors.text-primary'),
          padding: '4px 8px',
          borderRadius: '6px',
          fontSize: '12px',
        },
        // Connection button styles
        '.connection-btn': {
          padding: '15px',
          background: theme('colors.background'),
          border: `2px solid ${theme('colors.surface')}`,
          borderRadius: '8px',
          cursor: 'pointer',
          textAlign: 'center',
          transition: 'all 0.3s ease',
          '&:hover': {
            borderColor: theme('colors.primary.DEFAULT'),
            background: '#f8f9ff', // A very light primary shade
          },
          '&.connected': {
            borderColor: theme('colors.success.DEFAULT'),
            background: theme('colors.success.light'),
            color: theme('colors.success.dark'),
          },
        },
        // Message styles for chat
        '.message': {
          marginBottom: '15px',
          padding: '10px',
          borderRadius: '8px',
          maxWidth: '80%',
        },
        '.message.sent': {
          background: theme('colors.primary.DEFAULT'),
          color: theme('colors.white'),
          marginLeft: 'auto',
        },
        '.message.received': {
          background: theme('colors.background'),
          border: `1px solid ${theme('colors.surface')}`,
        },
        // Chat bubble styles for different users
        '.chat-bubble-1': {
          background: theme('colors.chat.bubble1'),
        },
        '.chat-bubble-2': {
          background: theme('colors.chat.bubble2'),
        },
        '.chat-bubble-3': {
          background: theme('colors.chat.bubble3'),
        },
        '.chat-bubble-4': {
          background: theme('colors.chat.bubble4'),
        },
        // Empty state styles
        '.empty-state': {
          textAlign: 'center',
          padding: '60px 20px',
          color: theme('colors.text-secondary'),
        },
        '.empty-state h3': {
          marginBottom: '10px',
          fontSize: '18px',
        },
        '.empty-state p': {
          fontSize: '14px',
          lineHeight: '1.5',
        },
      });

      addUtilities({
        // Utility for the main container
        '.container-mobile': {
          maxWidth: '400px',
          margin: '0 auto',
          background: theme('colors.background'),
          minHeight: '100vh',
          position: 'relative',
          overflow: 'hidden',
        },
        // Utility for the header
        '.header-gradient': {
          background: theme('backgroundImage.yeyzer-gradient'),
          color: theme('colors.white'),
          padding: '20px',
          textAlign: 'center',
          position: 'relative',
        },
      });
    }),
  ],
};
