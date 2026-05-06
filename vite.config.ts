import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router'],
          'element-core': [
            'element-plus/es/components/config-provider/index.mjs',
            'element-plus/es/components/loading/index.mjs',
            'element-plus/es/components/message/index.mjs'
          ],
          'element-form': [
            'element-plus/es/components/checkbox/index.mjs',
            'element-plus/es/components/dialog/index.mjs',
            'element-plus/es/components/form/index.mjs',
            'element-plus/es/components/input/index.mjs',
            'element-plus/es/components/input-number/index.mjs',
            'element-plus/es/components/switch/index.mjs',
            'element-plus/es/components/table/index.mjs'
          ],
          'code-editor': ['@codemirror/autocomplete', '@codemirror/commands', '@codemirror/lang-json', '@codemirror/state', '@codemirror/view']
        }
      }
    }
  }
});
