import type { GameCampaign, GamePrize, GameType, Prisma } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

export type CampaignWithPrizes = GameCampaign & { prizes: GamePrize[] };

/** Ngữ cảnh một lượt chơi — tầng chung dựng sẵn, handler chỉ việc chọn kết quả */
export type PlayContext = {
  campaign: CampaignWithPrizes;
  customerId: number;
  /** Chi nhánh khách đang chơi (QR tại quầy / đơn tạo lượt); null = chơi online không rõ chi nhánh */
  storeId: number | null;
};

/** Kết quả handler trả về: giải trúng + dữ liệu riêng của game (lưu GamePlay.data, gửi cho giao diện chơi) */
export type PlayResult = {
  prize: GamePrize | null;
  data: Record<string, unknown>;
};

/**
 * Phần riêng của từng mini game. Tầng chung (route, lượt, phát thưởng, báo cáo) không biết gì về luật chơi —
 * chỉ gọi 3 hàm này. Xem docs/minigame-architecture.md.
 */
export interface GameHandler {
  /** Chuẩn hoá + kiểm tra `GameCampaign.config`; ném Error(message tiếng Việt) nếu sai */
  validateConfig(config: unknown): Record<string, unknown>;
  /** Chọn kết quả cho 1 lượt (chạy trong transaction, đã khoá vé) */
  play(tx: Tx, ctx: PlayContext): Promise<PlayResult>;
  /** Dữ liệu công khai cho trang chơi của khách (không lộ tỉ lệ / số lượng) */
  publicView(campaign: CampaignWithPrizes): Record<string, unknown>;
}

export type { GameType };
