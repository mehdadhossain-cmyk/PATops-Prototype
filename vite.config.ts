import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The prototype ships as a single bundle (it is also published as one self-contained page).
  build: { chunkSizeWarningLimit: 1500 },
})
