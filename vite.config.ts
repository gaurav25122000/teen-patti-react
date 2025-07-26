// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // appType: 'spa' should be at the root level, not inside the 'build' object.
  // This ensures the dev server handles client-side routing correctly on refresh.
  appType: 'spa', 
  build: {
    outDir: 'dist',
    // ... other build options
  },
})