import { defineConfig } from 'vite'
export default defineConfig({
  root: 'frontend',
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rolldownOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        defaultHandler(warning)
      },
    },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:8790' } },
})
