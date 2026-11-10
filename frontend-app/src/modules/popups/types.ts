/** Kiểu dữ liệu pop up phía quản trị (khớp backend-node/src/routes/popups.ts) */

export type RefKind = "voucher" | "game" | "category" | "product" | "post" | "url";
/** Loại đích lấy từ GET /api/admin/popups/meta — danh sách gốc ở backend-node/src/lib/popupTargets.ts */
export type TargetMeta = { type: string; label: string; tag: string; ref: RefKind | null; refLabel: string | null; path: string | null };
export type PopupMeta = { targets: TargetMeta[]; maxActive: number; stores: { id: number; name: string }[] };
export type RefOption = { value: string; label: string; sub?: string; image?: string | null };

export type Audience = "ALL" | "LOGGED_IN" | "NEW";
export type Frequency = "EVERY_VISIT" | "DAILY" | "ONCE";
export const AUDIENCE_LABEL: Record<Audience, string> = { ALL: "Mọi khách", LOGGED_IN: "Chỉ khách đã đăng nhập", NEW: "Chỉ khách mới (chưa có đơn)" };
export const FREQUENCY_LABEL: Record<Frequency, string> = { EVERY_VISIT: "Mỗi lần vào web", DAILY: "1 lần mỗi ngày", ONCE: "1 lần duy nhất" };

export type PopupRow = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string;
  targetType: string;
  targetRef: string | null;
  targetLabel: string;
  href: string | null;
  buttonText: string;
  sortOrder: number;
  isActive: boolean;
  startAt: string | null;
  endAt: string | null;
  allStores: boolean;
  stores: { storeId: number; store: { id: number; name: string } }[];
  audience: Audience;
  frequency: Frequency;
  viewCount: number;
  clickCount: number;
  editable: boolean;
  updatedAt: string;
};

export const POPUPS_BASE = "/app/crm/popups";
