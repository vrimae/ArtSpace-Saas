import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/ - cache bust: v2
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/fonnte': {
        target: 'https://api.fonnte.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fonnte/, ''),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['lucide-react', 'framer-motion', 'recharts']
        }
      }
    }
  }
})
