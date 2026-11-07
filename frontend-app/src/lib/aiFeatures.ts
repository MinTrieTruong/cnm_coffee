/**
 * Tính năng AI đang dùng được (bật trong cài đặt AI + có khóa Gemini) — để ẩn mục menu khi tắt.
 * Chỉ Chủ chuỗi / Quản lý chi nhánh đọc được GET /api/ai/settings; vai trò khác coi như không có tính năng nào.
 */
import { useEffect, useState } from "react";
import { isAdminRole, staffApi } from "./staffApi";

export type AiFeatureRow = { feature: string; label: string; enabled: boolean; available: boolean; dailyLimit: number | null; hourlyPerUser: number | null };

/** Cùng một Set rỗng để useMemo phía sau không tính lại mỗi lần render */
const EMPTY: ReadonlySet<string> = new Set();
let cache: Promise<Set<string>> | null = null;
const listeners = new Set<(s: Set<string>) => void>();

function load(): Promise<Set<string>> {
  cache ??= staffApi<{ features: AiFeatureRow[] }>("/api/ai/settings")
    .then((r) => new Set(r.features.filter((f) => f.available).map((f) => f.feature)))
    .catch(() => {
      cache = null;
      return new Set<string>();
    });
  return cache;
}

/** Đọc lại (sau khi đổi cài đặt, hoặc API báo tính năng đã tắt) */
export function refreshAiFeatures() {
  cache = null;
  void load().then((s) => listeners.forEach((f) => f(s)));
}

export function useAiFeatures(role: string | undefined): ReadonlySet<string> {
  const [features, setFeatures] = useState<ReadonlySet<string>>(EMPTY);
  const allowed = isAdminRole(role);
  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    void load().then((s) => alive && setFeatures(s));
    listeners.add(setFeatures);
    return () => {
      alive = false;
      listeners.delete(setFeatures);
    };
  }, [allowed]);
  return allowed ? features : EMPTY;
}
