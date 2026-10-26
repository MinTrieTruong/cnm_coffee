/**
 * lib/realtime.ts — Giữ tham chiếu socket.io cho các hàm thư viện không nhận `io`
 * (VD trừ kho khi thanh toán được gọi từ nhiều cổng thanh toán khác nhau).
 */
import type { Server } from "socket.io";
import { toStore } from "./storeScope.js";
import { notify } from "./notify.js";

let io: Server | null = null;

export function setRealtime(server: Server) {
  io = server;
}

export function getRealtime(): Server | null {
  return io;
}

export type LowStockAlert = {
  id: number;
  name: string;
  unit: string | null;
  stockQty: number;
  minLevel: number;
  /** Món không còn đủ nguyên liệu để làm thêm 1 ly */
  products: { id: number; name: string }[];
};

/** Báo pha chế + quản lý: nguyên liệu vừa xuống dưới mức tối thiểu / không đủ làm món */
export function emitLowStock(storeId: number, items: LowStockAlert[]) {
  if (!io || items.length === 0) return;
  toStore(io, "kds", storeId).emit("inventory:low", { items });
  toStore(io, "admin_room", storeId).emit("inventory:low", { items });
  const names = items.map((i) => i.name);
  const cantMake = [...new Set(items.flatMap((i) => i.products.map((p) => p.name)))];
  void notify({
    type: "LOW_STOCK",
    title: `Sắp hết nguyên liệu: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`,
    body: cantMake.length ? `Không đủ làm: ${cantMake.slice(0, 5).join(", ")}. Cần đặt hàng hoặc nhờ chi nhánh khác chuyển gấp.` : "Đã xuống dưới mức tối thiểu — cần đặt hàng.",
    link: "/app/inventory/stock",
    storeId,
    to: { storeId, roles: ["Admin", "Warehouse"] },
    // Mỗi nguyên liệu báo tối đa 1 lần / 6 giờ
    dedupeKey: `low:${storeId}:${items.map((i) => i.id).sort((a, b) => a - b).join(",")}`,
    dedupeMinutes: 360,
  });
}
