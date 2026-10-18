import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true, // Cho phép các host bên ngoài như Ngrok
    cors: true, // Cho phép CORS
    proxy: {
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:4000", changeOrigin: true },
      "/socket.io": { target: "http://127.0.0.1:4000", ws: true, changeOrigin: true },
    },
  },
});
