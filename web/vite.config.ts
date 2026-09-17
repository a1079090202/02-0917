import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5210,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:3210',
    },
  },
});
