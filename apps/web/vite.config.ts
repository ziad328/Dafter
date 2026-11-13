import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '../..',
  server: {
    port: 5173,
    proxy: { '/api': API, '/health': API },
  },
});
