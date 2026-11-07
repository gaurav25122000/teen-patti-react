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
    // Lists every built file; public/sw.js caches them for offline use.
    manifest: 'asset-manifest.json',
    // ... other build options
  },
})