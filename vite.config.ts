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
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'effect', test: /node_modules[\\/]effect[\\/]/ },
          ],
        },
      },
    },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:8790' } },
})
