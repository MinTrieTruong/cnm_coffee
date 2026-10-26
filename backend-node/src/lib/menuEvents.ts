/**
 * lib/menuEvents.ts — Báo thay đổi trạng thái bán của món (hết món / ẩn / mở bán lại)
 *
 * Dùng chung cho: pha chế (KDS), quản lý chi nhánh (Thực đơn chi nhánh), Chủ chuỗi (bật/tắt món cả chuỗi).
 *  - Socket "menu:availability" → POS / Sơ đồ bàn / KDS tải lại thực đơn
 *  - Trung tâm thông báo → thu ngân, phục vụ, quản lý chi nhánh (trừ người thao tác)
 */
import { getRealtime } from "./realtime.js";
import { toStore } from "./storeScope.js";
import { notify } from "./notify.js";

export type MenuChange = {
  /** Chi nhánh; mảng nhiều chi nhánh khi Chủ chuỗi bật/tắt món cả chuỗi */
  storeIds: number[];
  productId: number;
  name: string;
  /** Trạng thái sau thay đổi */
  outOfStock: boolean;
  isAvailable: boolean;
  actor: { id: number; fullName: string; role: string };
  /** Tắt cả chuỗi (Product.isActive) — khác với ẩn ở một chi nhánh */
  chainWide?: boolean;
};

export function announceMenuChange(c: MenuChange) {
  const io = getRealtime();
  const soldOut = c.outOfStock || !c.isAvailable;
  const what = !soldOut ? "Có lại món" : c.outOfStock ? "Tạm hết món" : c.chainWide ? "Ngừng bán toàn chuỗi" : "Ngưng bán";
  const roleText = c.actor.role === "Kitchen" ? "Pha chế" : c.actor.role === "Owner" ? "Chủ chuỗi" : "Quản lý";
  // "Nguyễn An (Pha chế)" — tài khoản tên trùng vai trò ("Quản lý") thì không lặp
  const by = c.actor.fullName.toLowerCase().includes(roleText.toLowerCase()) ? c.actor.fullName : `${c.actor.fullName} (${roleText})`;
  for (const storeId of c.storeIds) {
    if (io) {
      const payload = { productId: c.productId, name: c.name, outOfStock: c.outOfStock, isAvailable: c.isAvailable };
      for (const room of ["staff", "pos", "kds"] as const) toStore(io, room, storeId).emit("menu:availability", payload);
    }
    void notify({
      type: soldOut ? "MENU_SOLDOUT" : "MENU_BACK",
      title: `${what}: ${c.name}`,
      body: soldOut
        ? `${by} vừa cập nhật — đừng nhận order món này cho tới khi mở bán lại.`
        : `${by} vừa mở bán lại.`,
      storeId,
      to: { storeId, roles: ["Cashier", "Waiter", "Admin", ...(c.actor.role === "Kitchen" ? [] : ["Kitchen"])], exceptStaffId: c.actor.id },
      // Bấm qua lại liên tục → chỉ báo 1 lần mỗi trạng thái trong 2 phút
      dedupeKey: `menu:${storeId}:${c.productId}:${soldOut ? "off" : "on"}`,
      dedupeMinutes: 2,
    });
  }
}
