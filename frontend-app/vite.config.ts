import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:4000", changeOrigin: true },
      "/socket.io": { target: "http://127.0.0.1:4000", ws: true, changeOrigin: true },
    },
  },
});
