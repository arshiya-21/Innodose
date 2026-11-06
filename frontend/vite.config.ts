import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // Relative asset paths so the build can be hosted from any sub-folder.
    base: './',
    server: {
      port: 5173,
      host: true, // listen on the network (not only localhost) so other PCs / the gateway can open it
      // When VITE_USE_MOCK=false, /api is forwarded to the backend (default: the bundled mock API server).
      proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true } },
    },
    build: { assetsInlineLimit: 8192, chunkSizeWarningLimit: 1200 },
  };
});
