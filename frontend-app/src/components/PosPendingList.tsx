import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ymd } from "./PosBillHistory";

export type PendingOrderLite = {
  id: number;
  createdAt: string;
  subTotal: number;
  orderType?: string;
  table: { id: number; name: string } | null;
  customer: { fullName: string; phone: string | null; points: number } | null;
  details: { quantity: number; product: { name: string } }[];
  status?: string;
  payments?: { method: string; shiftId: number | null }[];
};

type Day = "all" | "today" | "yesterday" | "older";
type Kind = "all" | "dinein" | "takeaway" | "online";
type Sort = "wait" | "new" | "high";

/** Số đơn hiện trước khi bấm "Xem thêm" */
const PAGE = 6;

/** Đơn khách đã trả online, quầy chỉ cần xác nhận & in bill */
const isPrepaid = (o: PendingOrderLite) => o.status === "Paid" && !!o.payments?.length && o.payments[0].shiftId === null;

function kindOf(o: PendingOrderLite): Exclude<Kind, "all" | "online"> {
  return o.table && !(o.orderType ?? "").toLowerCase().includes("take") ? "dinein" : "takeaway";
}

function dayOf(o: PendingOrderLite, today: string, yesterday: string): Exclude<Day, "all"> {
  const d = ymd(new Date(o.createdAt));
  return d === today ? "today" : d === yesterday ? "yesterday" : "older";
}

function waitLabel(createdAt: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (min < 60) return `${min} phút`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} giờ ${min % 60 ? `${min % 60}p` : ""}`.trim();
  return `${Math.floor(min / 1440)} ngày`;
}

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + " đ";

export function PosPendingList<T extends PendingOrderLite>({
  orders,
  disabled,
  onOpen,
  onCancel,
}: {
  orders: T[];
  disabled: boolean;
  onOpen: (o: T) => void;
  onCancel: (o: T) => void;
}) {
  const [day, setDay] = useState<Day>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<Sort>("wait");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);

  const today = ymd(new Date());
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); })();

  const searched = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^#/, "");
    if (!s) return orders;
    return orders.filter((o) =>
      String(o.id).includes(s) ||
      (o.table?.name ?? "").toLowerCase().includes(s) ||
      (o.customer?.fullName ?? "").toLowerCase().includes(s) ||
      (o.customer?.phone ?? "").includes(s),
    );
  }, [orders, q]);

  const matchKind = (o: T, k: Kind) => k === "all" || (k === "online" ? isPrepaid(o) : kindOf(o) === k);
  const matchDay = (o: T, d: Day) => d === "all" || dayOf(o, today, yesterday) === d;

  // Đếm chéo: chip ngày đếm theo loại đang chọn và ngược lại
  const dayCount = useMemo(() => {
    const c: Record<Day, number> = { all: 0, today: 0, yesterday: 0, older: 0 };
    for (const o of searched) if (matchKind(o, kind)) { c.all++; c[dayOf(o, today, yesterday)]++; }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, kind, today]);
  const kindCount = useMemo(() => {
    const c: Record<Kind, number> = { all: 0, dinein: 0, takeaway: 0, online: 0 };
    for (const o of searched) if (matchDay(o, day)) { c.all++; c[kindOf(o)]++; if (isPrepaid(o)) c.online++; }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, day, today]);

  const shown = useMemo(() => {
    const list = searched.filter((o) => matchDay(o, day) && matchKind(o, kind));
    const t = (o: T) => new Date(o.createdAt).getTime();
    list.sort((a, b) => {
      // Đơn đã trả online luôn nổi lên đầu để xác nhận cho nhanh
      const p = Number(isPrepaid(b)) - Number(isPrepaid(a));
      if (p) return p;
      return sort === "wait" ? t(a) - t(b) : sort === "new" ? t(b) - t(a) : b.subTotal - a.subTotal;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, day, kind, sort, today]);

  const visible = expanded ? shown : shown.slice(0, PAGE);
  const filtered = day !== "all" || kind !== "all" || q.trim() !== "";

  if (orders.length === 0) return null;

  return (
    <div className="pp">
      <div className="pp-bar">
        <div className="bh-row">
          <div className="bh-search">
            <Search size={16} aria-hidden />
            <input type="search" placeholder="Số đơn, bàn, khách, SĐT…" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="Tìm đơn chờ" />
            {q && (
              <button type="button" className="pp-clear" onClick={() => setQ("")} aria-label="Xóa tìm kiếm"><X size={14} /></button>
            )}
          </div>
          <select className="input bh-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sắp xếp">
            <option value="wait">Chờ lâu nhất</option>
            <option value="new">Mới nhất</option>
            <option value="high">Tiền cao nhất</option>
          </select>
        </div>
        <div className="bh-chips bh-chips-sm" aria-label="Lọc theo loại">
          {([
            ["all", "Tất cả"],
            ["dinein", "Tại bàn"],
            ["takeaway", "Mang về"],
            ["online", "Đã trả online"],
          ] as [Kind, string][]).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={kind === k}
              className={`bh-chip${kind === k ? " is-on" : ""}`} onClick={() => { setKind(k); setExpanded(false); }}>
              {label}<span className="bh-count">{kindCount[k]}</span>
            </button>
          ))}
        </div>
        <div className="bh-chips bh-chips-sm" aria-label="Lọc theo ngày">
          {([
            ["all", "Mọi ngày"],
            ["today", "Hôm nay"],
            ["yesterday", "Hôm qua"],
            ["older", "Cũ hơn"],
          ] as [Day, string][]).map(([k, label]) =>
            k !== "all" && dayCount[k] === 0 && day !== k ? null : (
              <button key={k} type="button" aria-pressed={day === k}
                className={`bh-chip${day === k ? " is-on" : ""}${k === "older" ? " pp-chip-warn" : ""}`}
                onClick={() => { setDay(k); setExpanded(false); }}>
                {label}<span className="bh-count">{dayCount[k]}</span>
              </button>
            ),
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="bh-empty">
          Không có đơn khớp bộ lọc.
          <button type="button" className="btn btn-ghost" onClick={() => { setDay("all"); setKind("all"); setQ(""); }}>Bỏ lọc</button>
        </div>
      ) : (
        <ul className="pp-grid">
          {visible.map((o) => {
            const prepaid = isPrepaid(o);
            const k = kindOf(o);
            const qty = o.details.reduce((s, d) => s + d.quantity, 0);
            const stale = dayOf(o, today, yesterday) !== "today";
            return (
              <li key={o.id} className={`pp-card${prepaid ? " is-prepaid" : ""}`}>
                <div className="pp-top">
                  <strong>#{o.id}</strong>
                  <span className={`bh-tag bh-tag-${k}`}>{k === "dinein" ? o.table!.name : "Mang về"}</span>
                  {prepaid && <span className="bh-tag pp-tag-paid">Đã trả {o.payments![0].method}</span>}
                  <span className="pp-total">{fmt(o.subTotal)}</span>
                </div>
                <div className="pp-meta">
                  <span className={stale ? "pp-stale" : undefined}>
                    {stale
                      ? new Date(o.createdAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
                      : `${new Date(o.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · chờ ${waitLabel(o.createdAt)}`}
                  </span>
                  <span>· {qty} món</span>
                  <span className="pp-cust">· {o.customer ? `${o.customer.fullName} (${o.customer.points} điểm)` : "Vãng lai"}</span>
                </div>
                <div className="pp-items">{o.details.map((d) => `${d.product.name}${d.quantity > 1 ? ` ×${d.quantity}` : ""}`).join(", ")}</div>
                <div className="pp-actions">
                  <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => onOpen(o)}>
                    {prepaid ? "Xác nhận & in bill" : "Xem bill / Thu tiền"}
                  </button>
                  {o.status !== "Paid" && (
                    <button type="button" className="btn btn-ghost pp-cancel" onClick={() => onCancel(o)}>Hủy</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {shown.length > PAGE && (
        <button type="button" className="btn btn-ghost pp-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Thu gọn" : `Xem thêm ${shown.length - PAGE} đơn`}
        </button>
      )}
      {filtered && shown.length > 0 && (
        <div className="bh-foot">Đang lọc {shown.length}/{orders.length} đơn</div>
      )}
    </div>
  );
}
