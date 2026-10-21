import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 3D-сцена вантажиться ліниво — без цього Vite знаходить ці залежності лише при першому відкритті звіту.
  optimizeDeps: {
    include: ['three', '@react-three/fiber', 'camera-controls'],
  },
  server: {
    port: 5174,
    strictPort: true,
    // API працює без префікса /api — клієнт ходить на /api, а проксі його відрізає (у проді так само робить nginx).
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
