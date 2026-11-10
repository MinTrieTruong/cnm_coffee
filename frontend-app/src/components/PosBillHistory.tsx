import { RotateCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { staffApi } from "../lib/staffApi";

export type BillItem = { id: number; name: string; quantity: number; unitPrice: number; lineTotal: number; customNotes: string | null };
export type BillRecord = {
  id: number;
  createdAt: string;
  orderType: string;
  tableName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subTotal: number;
  discountAmt: number;
  vatAmount: number;
  totalAmount: number;
  payMethod: string | null;
  paidAt: string | null;
  items: BillItem[];
};

/** Server chỉ cho xem 20 ngày gần nhất */
const MAX_DAYS = 20;

type Range = "today" | "yesterday" | "7d" | "custom";
type Kind = "all" | "dinein" | "takeaway" | "delivery";
type Pay = "all" | "cash" | "transfer" | "other";
type Sort = "new" | "old" | "high" | "low";

const KIND_LABEL: Record<Exclude<Kind, "all">, string> = { dinein: "Tại bàn", takeaway: "Mang về", delivery: "Giao hàng" };

/** YYYY-MM-DD theo giờ máy (toISOString lệch ngày vì UTC) */
export function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

function billKind(b: BillRecord): Exclude<Kind, "all"> {
  if (b.orderType === "Delivery") return "delivery";
  if (b.orderType.toLowerCase().includes("take") || !b.tableName) return "takeaway";
  return "dinein";
}
function billPay(b: BillRecord): Exclude<Pay, "all"> {
  if (b.payMethod === "Cash") return "cash";
  if (["Transfer_QR", "VNPay", "SePay"].includes(b.payMethod || "")) return "transfer";
  return "other";
}

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + " đ";

export function PosBillHistory({
  onClose,
  onSelect,
  payMethodLabel,
}: {
  onClose: () => void;
  onSelect: (b: BillRecord) => void;
  payMethodLabel: (m: string | null) => string;
}) {
  const today = ymd(new Date());
  const oldest = daysAgo(MAX_DAYS - 1);

  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [bills, setBills] = useState<BillRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [pay, setPay] = useState<Pay>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      setBills(await staffApi<BillRecord[]>(`/api/pos/bills?from=${from}&to=${to}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tải lịch sử");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (from && to) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // Đóng bằng phím Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pickRange(r: Range) {
    setRange(r);
    if (r === "today") { setFrom(today); setTo(today); }
    if (r === "yesterday") { setFrom(daysAgo(1)); setTo(daysAgo(1)); }
    if (r === "7d") { setFrom(daysAgo(6)); setTo(today); }
  }

  // Lọc theo thanh toán + tìm kiếm trước, rồi đếm theo loại để hiển thị trên chip
  const base = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^#/, "");
    return bills.filter((b) => {
      if (pay !== "all" && billPay(b) !== pay) return false;
      if (!s) return true;
      return (
        String(b.id).includes(s) ||
        (b.tableName ?? "").toLowerCase().includes(s) ||
        (b.customerName ?? "").toLowerCase().includes(s) ||
        (b.customerPhone ?? "").includes(s) ||
        b.items.some((i) => i.name.toLowerCase().includes(s))
      );
    });
  }, [bills, pay, q]);

  const kindCount = useMemo(() => {
    const c = { all: base.length, dinein: 0, takeaway: 0, delivery: 0 };
    for (const b of base) c[billKind(b)]++;
    return c;
  }, [base]);

  const shown = useMemo(() => {
    const list = kind === "all" ? base.slice() : base.filter((b) => billKind(b) === kind);
    const t = (b: BillRecord) => new Date(b.paidAt ?? b.createdAt).getTime();
    list.sort((a, b) =>
      sort === "new" ? t(b) - t(a) : sort === "old" ? t(a) - t(b) : sort === "high" ? b.totalAmount - a.totalAmount : a.totalAmount - b.totalAmount,
    );
    return list;
  }, [base, kind, sort]);

  const sum = useMemo(() => {
    let total = 0, cash = 0, transfer = 0;
    for (const b of shown) {
      total += b.totalAmount;
      const p = billPay(b);
      if (p === "cash") cash += b.totalAmount;
      else if (p === "transfer") transfer += b.totalAmount;
    }
    return { total, cash, transfer, other: total - cash - transfer };
  }, [shown]);

  // Nhiều ngày + sắp theo thời gian → chia nhóm theo ngày cho dễ dò
  const multiDay = from !== to;
  const grouped = multiDay && (sort === "new" || sort === "old");

  const filtered = kind !== "all" || pay !== "all" || q.trim() !== "";
  function resetFilters() {
    setKind("all");
    setPay("all");
    setQ("");
  }

  return (
    <div className="bh-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="bh-sheet" role="dialog" aria-modal="true" aria-label="Lịch sử bill">
        <header className="bh-head">
          <h2>Lịch sử bill</h2>
          <button type="button" className="bh-icon-btn" onClick={() => void load()} aria-label="Tải lại" disabled={loading}>
            <RotateCw size={18} className={loading ? "bh-spin" : undefined} />
          </button>
          <button type="button" className="bh-icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </header>

        <div className="bh-filters">
          {/* Ngày */}
          <div className="bh-chips" role="tablist" aria-label="Khoảng ngày">
            {([
              ["today", "Hôm nay"],
              ["yesterday", "Hôm qua"],
              ["7d", "7 ngày"],
              ["custom", "Chọn ngày"],
            ] as [Range, string][]).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={range === k}
                className={`bh-chip${range === k ? " is-on" : ""}`} onClick={() => pickRange(k)}>
                {label}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className="bh-dates">
              <label>
                <span>Từ</span>
                <input type="date" className="input" value={from} min={oldest} max={today}
                  onChange={(e) => { const v = e.target.value; if (!v) return; setFrom(v); if (v > to) setTo(v); }} />
              </label>
              <label>
                <span>Đến</span>
                <input type="date" className="input" value={to} min={oldest} max={today}
                  onChange={(e) => { const v = e.target.value; if (!v) return; setTo(v); if (v < from) setFrom(v); }} />
              </label>
            </div>
          )}

          {/* Tìm + sắp xếp */}
          <div className="bh-row">
            <div className="bh-search">
              <Search size={16} aria-hidden />
              <input type="search" inputMode="search" placeholder="Số bill, bàn, khách, SĐT, món…" value={q}
                onChange={(e) => setQ(e.target.value)} aria-label="Tìm bill" />
            </div>
            <select className="input bh-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sắp xếp">
              <option value="new">Mới nhất</option>
              <option value="old">Cũ nhất</option>
              <option value="high">Tiền cao → thấp</option>
              <option value="low">Tiền thấp → cao</option>
            </select>
          </div>

          {/* Loại đơn */}
          <div className="bh-chips" aria-label="Loại đơn">
            {(["all", "dinein", "takeaway", "delivery"] as Kind[]).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k}
                className={`bh-chip${kind === k ? " is-on" : ""}`} onClick={() => setKind(k)}>
                {k === "all" ? "Tất cả" : KIND_LABEL[k]}
                <span className="bh-count">{kindCount[k]}</span>
              </button>
            ))}
          </div>

          {/* Thanh toán */}
          <div className="bh-chips bh-chips-sm" aria-label="Hình thức thanh toán">
            {([
              ["all", "Mọi hình thức"],
              ["cash", "Tiền mặt"],
              ["transfer", "Chuyển khoản"],
              ["other", "Khác"],
            ] as [Pay, string][]).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={pay === k}
                className={`bh-chip${pay === k ? " is-on" : ""}`} onClick={() => setPay(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="bh-body">
          {err && <p className="bh-err">{err}</p>}

          {bills.length > 0 && (
            <div className="bh-stats">
              <div><span>Số bill</span><strong>{shown.length}</strong></div>
              <div><span>Doanh thu</span><strong className="bh-accent">{fmt(sum.total)}</strong></div>
              <div><span>Tiền mặt</span><strong>{fmt(sum.cash)}</strong></div>
              <div><span>Chuyển khoản</span><strong>{fmt(sum.transfer)}</strong></div>
            </div>
          )}

          {loading && bills.length === 0 && <p className="subtle">Đang tải…</p>}

          {!loading && !err && bills.length === 0 && (
            <p className="bh-empty">Không có bill nào trong khoảng ngày này.</p>
          )}
          {bills.length > 0 && shown.length === 0 && (
            <div className="bh-empty">
              Không có bill khớp bộ lọc.
              <button type="button" className="btn btn-ghost" onClick={resetFilters}>Bỏ lọc</button>
            </div>
          )}

          <ul className="bh-list">
            {shown.map((b, i) => {
              const day = ymd(new Date(b.paidAt ?? b.createdAt));
              const prevDay = i > 0 ? ymd(new Date(shown[i - 1].paidAt ?? shown[i - 1].createdAt)) : null;
              const k = billKind(b);
              return (
                <li key={b.id}>
                  {grouped && day !== prevDay && (
                    <div className="bh-day">
                      {day === today ? "Hôm nay" : day === daysAgo(1) ? "Hôm qua" : new Date(`${day}T00:00:00`).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    </div>
                  )}
                  <button type="button" className="bh-item" onClick={() => onSelect(b)}>
                    <div className="bh-item-main">
                      <div className="bh-item-title">
                        <strong>#{b.id}</strong>
                        <span className={`bh-tag bh-tag-${k}`}>{KIND_LABEL[k]}</span>
                        {b.tableName && <span className="bh-muted">{b.tableName}</span>}
                      </div>
                      <div className="bh-item-meta">
                        {new Date(b.paidAt ?? b.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                        {multiDay && !grouped && ` · ${new Date(b.paidAt ?? b.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`}
                        {b.customerName && ` · ${b.customerName}`}
                        {` · ${b.items.reduce((s, it) => s + it.quantity, 0)} món`}
                      </div>
                      <div className="bh-item-items">
                        {b.items.map((it) => `${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ""}`).join(", ")}
                      </div>
                    </div>
                    <div className="bh-item-side">
                      <strong>{fmt(b.totalAmount)}</strong>
                      <span>{payMethodLabel(b.payMethod)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {filtered && shown.length > 0 && (
            <div className="bh-foot">
              Đang lọc {shown.length}/{bills.length} bill ·{" "}
              <button type="button" className="bh-link" onClick={resetFilters}>Bỏ lọc</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
