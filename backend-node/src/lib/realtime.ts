/**
 * lib/realtime.ts — Giữ tham chiếu socket.io cho các hàm thư viện không nhận `io`
 * (VD trừ kho khi thanh toán được gọi từ nhiều cổng thanh toán khác nhau).
 */
import type { Server } from "socket.io";
import { toStore } from "./storeScope.js";

let io: Server | null = null;

export function setRealtime(server: Server) {
  io = server;
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
}
