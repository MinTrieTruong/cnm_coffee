/** Kiểu dữ liệu dùng chung cho mọi mini game (khớp backend-node/src/routes/games.ts) */

export type GameType = "WHEEL" | "SCRATCH" | "MYSTERY_BOX" | "STAMP" | "MISSION" | "QUIZ" | "SEASONAL";
export type PrizeKind = "PRODUCT" | "VOUCHER" | "POINTS" | "NONE";

export const PRIZE_KIND_LABEL: Record<PrizeKind, string> = {
  PRODUCT: "Sản phẩm",
  VOUCHER: "Voucher",
  POINTS: "Điểm",
  NONE: "Không trúng",
};
/** Badge: Sản phẩm xanh lá · Voucher xanh dương · Điểm cam · Không trúng xám */
export const PRIZE_KIND_TONE = { PRODUCT: "success", VOUCHER: "info", POINTS: "warning", NONE: "neutral" } as const;

export const CLAIM_STATUS: Record<string, { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  WAITING: { label: "Chờ nhận", tone: "warning" },
  DELIVERED: { label: "Đã trao", tone: "success" },
  EXPIRED: { label: "Quá hạn", tone: "danger" },
  CANCELLED: { label: "Đã hủy", tone: "neutral" },
};

export type ProductOpt = { id: number; name: string; imageUrl: string | null; sellPrice: number };
export type VoucherOpt = {
  id: number; code: string; description: string | null; discountValue: number; minBillValue: number; endDate: string;
  quantity: number; usedCount: number; voucherType: string;
};
export type GiftItemOpt = {
  id: number; name: string; imageUrl: string | null; value: number; note: string | null; isActive: boolean;
  stocks: { storeId: number; qty: number; reserved: number; store?: { id: number; name: string } }[];
};
export type StoreOpt = { id: number; name: string; address?: string | null };

export type GameOptions = {
  products: ProductOpt[];
  vouchers: VoucherOpt[];
  giftItems: GiftItemOpt[];
  stores: StoreOpt[];
  readyGames: GameType[];
  gameLabels: Record<GameType, string>;
};

/** Một ô / giải trong bảng giải (state phía trình duyệt) */
export type PrizeDraft = {
  /** id giải đã lưu; giải mới chưa có */
  id?: number;
  /** khoá React cho giải mới */
  key: string;
  kind: PrizeKind;
  productId: number | null;
  giftItemId: number | null;
  voucherId: number | null;
  points: number | null;
  label: string;
  imageUrl: string | null;
  weight: string;
  quantity: string;
  dailyLimit: string;
  color: string | null;
  /** số đã trúng (chỉ đọc) */
  wonCount?: number;
};

export type CampaignRow = {
  id: number;
  gameType: GameType;
  name: string;
  description: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
  allStores: boolean;
  config: Record<string, unknown> | null;
  minOrderValue: number;
  maxPlaysPerDay: number;
  allowPointExchange: boolean;
  pointsPerTicket: number;
  claimDays: number;
  stores: { storeId: number; store: { id: number; name: string } }[];
  playCount: number;
  wonCount?: number;
  editable: boolean;
  running?: boolean;
};

export type CampaignDetail = CampaignRow & {
  prizes: {
    id: number; kind: PrizeKind; productId: number | null; giftItemId: number | null; voucherId: number | null; points: number | null;
    label: string; imageUrl: string | null; weight: number; quantity: number | null; wonCount: number; dailyLimit: number | null;
    sortOrder: number; color: string | null;
    product: ProductOpt | null;
    giftItem: { id: number; name: string; imageUrl: string | null; value: number } | null;
    voucher: { id: number; code: string; description: string | null; discountValue: number } | null;
  }[];
};

export type WinnerRow = {
  id: number;
  playedAt: string;
  prizeLabel: string;
  prizeKind: PrizeKind;
  prizeImage: string | null;
  prizeWeight: number;
  kindLabel: string;
  remaining: number | null;
  customer: { id: number; fullName: string; phone: string | null; avatarUrl: string | null };
  store: { id: number; name: string } | null;
  campaign: { id: number; name: string };
  giftClaim: { code: string; status: string; expiresAt: string; deliveredAt: string | null } | null;
};

/** Ô hiển thị trên giao diện chơi (không có tỉ lệ / số lượng) */
export type PublicSegment = { id: number; label: string; imageUrl: string | null; color: string | null; kind: PrizeKind };

export type PublicCampaign = {
  id: number;
  gameType: GameType;
  name: string;
  description: string | null;
  startAt: string;
  endAt: string;
  running: boolean;
  storeAllowed: boolean;
  allStores: boolean;
  stores: { id: number; name: string }[];
  minOrderValue: number;
  maxPlaysPerDay: number;
  claimDays: number;
  allowPointExchange: boolean;
  pointsPerTicket: number;
  view: Record<string, unknown>;
  me: { tickets: number; playedToday: number; leftToday: number; points: number } | null;
};

export type PlayResponse = {
  playId: number;
  data: Record<string, unknown>;
  prize: {
    id: number | null;
    kind: PrizeKind;
    label: string;
    imageUrl: string | null;
    points: number | null;
    voucher: { code: string; discountValue: number; minBillValue: number; endDate: string } | null;
  };
  giftClaim: { id: number; code: string; expiresAt: string; storeId: number | null; store: { id: number; name: string; address: string | null } | null } | null;
};
