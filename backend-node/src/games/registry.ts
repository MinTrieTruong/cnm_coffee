import type { GameType } from "@prisma/client";
import { wheelHandler } from "./handlers/wheel.js";
import type { GameHandler } from "./types.js";

/** Game chưa cài: tạo chiến dịch / chơi đều báo lỗi rõ ràng */
const comingSoon = (label: string): GameHandler => {
  const fail = () => {
    throw new Error(`${label} sắp ra mắt.`);
  };
  return { validateConfig: fail, play: async () => fail(), publicView: fail };
};

/**
 * Đăng ký handler cho từng loại mini game — thêm game mới: viết handlers/<game>.ts rồi thay `comingSoon(...)` ở đây.
 * Xem docs/minigame-architecture.md.
 */
export const GAME_HANDLERS: Record<GameType, GameHandler> = {
  WHEEL: wheelHandler,
  SCRATCH: comingSoon("Thẻ cào"),
  MYSTERY_BOX: comingSoon("Hộp quà bí mật"),
  STAMP: comingSoon("Thẻ tích ly"),
  MISSION: comingSoon("Nhiệm vụ tuần"),
  QUIZ: comingSoon("Đố vui"),
  SEASONAL: comingSoon("Lì xì theo mùa"),
};

/** Loại game đã chơi được */
export const READY_GAMES: GameType[] = ["WHEEL"];

export const GAME_LABELS: Record<GameType, string> = {
  WHEEL: "Vòng quay may mắn",
  SCRATCH: "Thẻ cào",
  MYSTERY_BOX: "Hộp quà bí mật",
  STAMP: "Thẻ tích ly",
  MISSION: "Nhiệm vụ tuần",
  QUIZ: "Đố vui",
  SEASONAL: "Lì xì theo mùa",
};
