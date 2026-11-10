/**
 * Thẻ thói quen khách cho thu ngân (TablePanel): nhập đủ SĐT tích điểm → "Hay gọi: Bạc xỉu M · Đá 50% · Đường 50%"
 * với nút "+" thêm thẳng vào đơn, kèm ghi chú mặc định / ăn kiêng (tô nổi nếu có dị ứng, không sữa…).
 * API: GET /api/pos/customer-habits?phone= (Cashier / Admin; món quen tính theo đơn tại chi nhánh).
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { staffApi } from "../lib/staffApi";
import { PREF_TEXT, type Diet } from "../lib/nutrition";
import type { Usual } from "../lib/api";

export type HabitItem = { productId: number; name: string; timesOrdered: number; usual: Usual; usualNote: string | null; label: string; soldOut: boolean };
type Habits = {
  customer: { id: number; fullName: string; phone: string | null; points: number; rankTier: string; rankLabel: string; defaultNote: string | null; dietPrefs: string[] } | null;
  items?: HabitItem[];
};

/** Ăn kiêng cần báo pha chế (dị ứng / không dùng được) */
const ALERT_DIETS = new Set(["no_milk", "no_nuts", "vegan"]);
/** Ghi chú có từ khoá cần chú ý */
const ALERT_WORDS = /dị ứng|di ung|không sữa|khong sua|lactose|không đường|hạt|đậu phộng|gluten|thuần chay|chay/i;

const validPhone = (s: string) => /^(\+?84|0)\d{9,10}$/.test(s.replace(/[\s.\-()]/g, ""));

export function CustomerHabitCard({ phone, onAdd }: { phone: string; onAdd?: (item: HabitItem) => void }) {
  const [data, setData] = useState<Habits | null>(null);
  const p = phone.trim();
  useEffect(() => {
    setData(null);
    if (!validPhone(p)) return;
    let alive = true;
    // Chờ ngừng gõ rồi mới tra (không gọi theo từng phím)
    const tm = window.setTimeout(() => {
      staffApi<Habits>(`/api/pos/customer-habits?phone=${encodeURIComponent(p)}`)
        .then((d) => alive && setData(d))
        .catch(() => alive && setData(null));
    }, 450);
    return () => {
      alive = false;
      window.clearTimeout(tm);
    };
  }, [p]);

  if (!data) return null;
  const c = data.customer;
  if (!c) return <div className="tp-habit tp-muted">Chưa có khách với số này — đơn vẫn gửi bình thường.</div>;
  const items = data.items ?? [];
  const diets = c.dietPrefs.filter((d): d is Diet => d in PREF_TEXT);
  const alert = diets.some((d) => ALERT_DIETS.has(d)) || ALERT_WORDS.test(c.defaultNote ?? "");
  return (
    <div className="tp-habit" aria-live="polite">
      <div className="tp-habit-head">
        <strong>{c.fullName}</strong> · {c.rankLabel} · {c.points.toLocaleString("vi-VN")} điểm
      </div>
      {items.length > 0 ? (
        <ul className="tp-habit-items">
          {items.map((it) => (
            <li key={it.productId}>
              <span>
                Hay gọi: <strong>{it.name}</strong>
                {it.label && <> {it.label}</>}
                {it.usualNote && <em> · {it.usualNote}</em>}
                {it.soldOut && <span className="tp-badge tone-neutral">Hết</span>}
              </span>
              {onAdd && (
                <button type="button" className="tp-step tp-step-add" disabled={it.soldOut} onClick={() => onAdd(it)} aria-label={`Thêm ${it.name} như thường gọi`}>
                  <Plus size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="tp-muted">Chưa có món quen tại chi nhánh này.</div>
      )}
      {(c.defaultNote || diets.length > 0) && (
        <div className={alert ? "tp-habit-note is-alert" : "tp-habit-note"}>
          {alert && <AlertTriangle size={14} aria-hidden />}
          <span>{[c.defaultNote ? `Ghi chú: ${c.defaultNote}` : "", diets.map((d) => PREF_TEXT[d]).join(", ")].filter(Boolean).join(" · ")}</span>
        </div>
      )}
    </div>
  );
}
