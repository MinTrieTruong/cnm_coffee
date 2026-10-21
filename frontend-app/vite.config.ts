import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import type { ProxyOptions } from "vite";

// Trình duyệt đóng tab / reload / điện thoại mất mạng làm socket bị cắt ngang khi proxy
// đang ghi -> Vite in "ws proxy socket error" dù không có gì hỏng. Bỏ qua các lỗi đó.
const BENIGN_SOCKET_ERRORS = new Set(["ECONNABORTED", "ECONNRESET", "EPIPE"]);

const silenceClientDisconnects: ProxyOptions["configure"] = (proxy) => {
  proxy.on("proxyReqWs", (_proxyReq, _req, socket) => {
    const emit = socket.emit.bind(socket);
    socket.emit = ((event: string, ...args: unknown[]) => {
      const code = (args[0] as NodeJS.ErrnoException | undefined)?.code;
      if (event === "error" && code && BENIGN_SOCKET_ERRORS.has(code)) {
        socket.destroy();
        return true;
      }
      return emit(event, ...args);
    }) as typeof socket.emit;
  });
};

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
      "/socket.io": {
        target: "http://127.0.0.1:4000",
        ws: true,
        changeOrigin: true,
        configure: silenceClientDisconnects,
      },
    },
  },
});
