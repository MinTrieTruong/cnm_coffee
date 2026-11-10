/**
 * Vai trò nhân sự (khớp backend middleware/staff.ts):
 * - Owner: Chủ chuỗi — việc dùng chung cả chuỗi; xem vận hành khi chọn 1 chi nhánh.
 * - Admin: Quản lý chi nhánh — nhân sự, duyệt, báo cáo của chi nhánh.
 * - Warehouse: Thủ kho — kho & mua hàng của chi nhánh.
 * - Cashier / Waiter / Kitchen / Shipper: nhân viên ca.
 */
export const ROLE_LABEL: Record<string, string> = {
  Owner: "Chủ chuỗi",
  Admin: "Quản lý chi nhánh",
  Warehouse: "Thủ kho",
  Cashier: "Thu ngân",
  Waiter: "Phục vụ",
  Kitchen: "Pha chế",
  Shipper: "Giao hàng",
};

/** Vai trò nhân viên chi nhánh — Quản lý chi nhánh được tạo/sửa */
export const BRANCH_STAFF_ROLES = ["Cashier", "Waiter", "Kitchen", "Shipper", "Warehouse"];

export const roleLabel = (role: string | undefined) => (role ? ROLE_LABEL[role] ?? role : "");
