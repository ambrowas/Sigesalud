import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    entry: 'src/main/main.ts',
    vite: {
      build: {
        outDir: 'dist/main',
        lib: {
          entry: 'src/main/main.ts'
        },
        rollupOptions: {
          input: {
            main: 'src/main/main.ts'
          }
        }
      }
    }
  },
  preload: {
    input: {
      preload: 'src/preload/preload.ts'
    },
    vite: {
      build: {
        outDir: 'dist/preload'
      }
    }
  },
  renderer: {
    vite: {
      root: 'src/renderer',
      plugins: [react()],
      build: {
        outDir: 'dist/renderer',
        rollupOptions: {
          input: {
            main: 'index.html'
          }
        }
      }
    }
  }
})
