/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './templates/**/*.html',
    './static/js/**/*.js',
    './static/css/**/*.css',
  ],
  theme: {
    extend: {
      colors: {
        // GitHub-style sidebar & border colours used throughout the app
        sidebar: {
          DEFAULT: 'rgb(246 248 250)',
          dark: 'rgb(13 17 23)',
        },
        border: {
          DEFAULT: 'rgb(208 215 222)',
          dark: 'rgb(48 54 61)',
        },
      },
    },
  },
  plugins: [],
}

