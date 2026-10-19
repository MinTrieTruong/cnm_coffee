import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  Combine,
  Minus,
  NotebookPen,
  Plus,
  Receipt,
  Scissors,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { apiOrigin } from "../lib/api";

export type PanelProduct = { id: number; name: string; sellPrice: number; imageUrl: string | null; categoryId: number };
export type PanelCategory = { id: number; name: string };
export type PanelTable = { id: number; name: string; status: string; location: string | null };
export type PanelDetail = {
  id: number;
  quantity: number;
  unitPrice: number;
  customNotes: string | null;
  kdsStatus: string;
  product: { id: number; name: string };
};
export type PanelOrder = {
  id: number;
  createdAt: string;
  subTotal: number;
  status?: string;
  customer: { id: number; fullName: string; phone: string | null; points: number } | null;
  details: PanelDetail[];
};
export type OrderLine = { productId: number; quantity: number; customNotes?: string };

type Mode = "items" | "order" | "move" | "merge" | "split";

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + " đ";

const STATUS: Record<string, { label: string; tone: string }> = {
  Empty: { label: "Trống", tone: "neutral" },
  Occupied: { label: "Có khách", tone: "info" },
  Waiting_Pay: { label: "Gọi tính tiền", tone: "warning" },
  Cleaning: { label: "Đã thanh toán", tone: "success" },
};

const KDS: Record<string, { label: string; tone: string }> = {
  Hold: { label: "Chờ xác nhận", tone: "neutral" },
  Waiting: { label: "Chờ pha", tone: "neutral" },
  Cooking: { label: "Đang pha", tone: "warning" },
  Ready: { label: "Chờ bưng", tone: "danger" },
  Served: { label: "Đã phục vụ", tone: "success" },
  Cancelled: { label: "Đã huỷ", tone: "neutral" },
};

/**
 * Khung thông tin bàn (ngăn bên phải trên máy tính, toàn màn hình trên điện thoại):
 * món hiện có, gọi món, yêu cầu thanh toán, chuyển / gộp bàn, tách bill, báo trống.
 */
export function TablePanel({
  table,
  order,
  loading,
  tables,
  products,
  categories,
  canSplit,
  initialPhone,
  onClose,
  onSendOrder,
  onCancelItem,
  onRequestPayment,
  onMove,
  onMerge,
  onSplit,
  onClear,
}: {
  table: PanelTable;
  order: PanelOrder | null;
  loading: boolean;
  tables: PanelTable[];
  products: PanelProduct[];
  categories: PanelCategory[];
  /** Phục vụ không tách bill (chỉ thu ngân / quản lý) */
  canSplit: boolean;
  initialPhone: string;
  onClose: () => void;
  onSendOrder: (lines: OrderLine[], customerPhone: string) => Promise<boolean>;
  onCancelItem: (orderId: number, detailId: number) => Promise<void>;
  onRequestPayment: (orderId: number) => Promise<void>;
  onMove: (targetId: number) => Promise<boolean>;
  onMerge: (targetId: number) => Promise<boolean>;
  onSplit: (orderId: number, items: { orderItemId: number; quantity: number }[]) => Promise<boolean>;
  onClear: () => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("items");
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  };

  // Đổi bàn → về màn món hiện có
  useEffect(() => setMode("items"), [table.id]);

  // Esc đóng khung (hoặc quay lại bước trước)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode === "items") onClose();
      else setMode("items");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  const st = STATUS[table.status] ?? STATUS.Empty;
  const unpaid = !!order && order.status !== "Paid";
  const liveItems = order?.details.filter((d) => d.kdsStatus !== "Cancelled") ?? [];

  const title = {
    items: table.name,
    order: `Gọi món · ${table.name}`,
    move: `Chuyển ${table.name} sang…`,
    merge: `Gộp ${table.name} vào…`,
    split: `Tách bill · ${table.name}`,
  }[mode];

  return (
    <div className="tp-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="tp" role="dialog" aria-modal="true" aria-labelledby="tp-title">
        <header className="tp-head">
          {mode !== "items" && (
            <button type="button" className="tp-icon-btn" onClick={() => setMode("items")} aria-label="Quay lại">
              <ArrowLeft size={20} aria-hidden />
            </button>
          )}
          <div className="tp-head-text">
            <h2 id="tp-title" className="tp-title">{title}</h2>
            {mode === "items" && (
              <div className="tp-sub">
                <span className={`tp-badge tone-${st.tone}`}>{st.label}</span>
                {table.location && <span>{table.location}</span>}
                {order && <span>Đơn #{order.id} · vào {new Date(order.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>}
              </div>
            )}
          </div>
          <button type="button" className="tp-icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={20} aria-hidden />
          </button>
        </header>

        {loading ? (
          <div className="tp-body"><p className="tp-muted">Đang tải bàn…</p></div>
        ) : mode === "items" ? (
          <ItemsView
            order={order}
            liveItems={liveItems}
            table={table}
            unpaid={unpaid}
            canSplit={canSplit}
            busy={busy}
            setMode={setMode}
            onCancelItem={(d) => run(() => onCancelItem(order!.id, d))}
            onRequestPayment={() => run(() => onRequestPayment(order!.id))}
            onClear={() => run(onClear)}
          />
        ) : mode === "order" ? (
          <OrderView
            products={products}
            categories={categories}
            initialPhone={initialPhone}
            busy={busy}
            onSend={async (lines, phone) => {
              const ok = await run(() => onSendOrder(lines, phone));
              if (ok) setMode("items");
            }}
          />
        ) : mode === "move" || mode === "merge" ? (
          <PickTableView
            hint={mode === "move" ? "Chọn bàn trống để chuyển khách và đơn sang." : "Chọn bàn đang có đơn. Món của bàn này sẽ gộp vào đơn của bàn đó."}
            tables={tables.filter((t) => t.id !== table.id && (mode === "move" ? t.status === "Empty" : t.status === "Occupied" || t.status === "Waiting_Pay"))}
            busy={busy}
            onPick={async (id) => {
              const ok = await run(() => (mode === "move" ? onMove(id) : onMerge(id)));
              if (ok) onClose();
            }}
          />
        ) : (
          <SplitView
            details={liveItems}
            busy={busy}
            onSplit={async (items) => {
              const ok = await run(() => onSplit(order!.id, items));
              if (ok) setMode("items");
            }}
          />
        )}
      </aside>
    </div>
  );
}

/* ── Món hiện có + thao tác ── */
function ItemsView({
  order,
  liveItems,
  table,
  unpaid,
  canSplit,
  busy,
  setMode,
  onCancelItem,
  onRequestPayment,
  onClear,
}: {
  order: PanelOrder | null;
  liveItems: PanelDetail[];
  table: PanelTable;
  unpaid: boolean;
  canSplit: boolean;
  busy: boolean;
  setMode: (m: Mode) => void;
  onCancelItem: (detailId: number) => Promise<void>;
  onRequestPayment: () => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const hasOrder = !!order && unpaid;
  return (
    <>
      <div className="tp-body">
        {order?.customer && (
          <div className="tp-customer">
            Khách <strong>{order.customer.fullName}</strong>
            {order.customer.phone && <> · {order.customer.phone}</>} · {order.customer.points} điểm
          </div>
        )}

        <div className="tp-actions">
          <ActionBtn icon={ArrowRightLeft} label="Chuyển bàn" disabled={!hasOrder || busy} onClick={() => setMode("move")} />
          <ActionBtn icon={Combine} label="Gộp bàn" disabled={!hasOrder || busy} onClick={() => setMode("merge")} />
          {canSplit && <ActionBtn icon={Scissors} label="Tách bill" disabled={!hasOrder || liveItems.reduce((s, d) => s + d.quantity, 0) < 2 || busy} onClick={() => setMode("split")} />}
          <ActionBtn icon={Receipt} label="Yêu cầu thanh toán" disabled={!hasOrder || table.status === "Waiting_Pay" || busy} onClick={() => void onRequestPayment()} />
          {table.status === "Cleaning" && <ActionBtn icon={Sparkles} label="Báo trống" disabled={busy} onClick={() => void onClear()} />}
        </div>

        <h3 className="tp-section-title">
          Món hiện có
          {order?.status === "Paid" && <span className="tp-badge tone-success">Đã thanh toán</span>}
        </h3>
        {liveItems.length === 0 ? (
          <div className="tp-empty">
            <Utensils size={24} aria-hidden />
            <p>Bàn chưa gọi món.</p>
          </div>
        ) : (
          <ul className="tp-items">
            {liveItems.map((d) => {
              const k = KDS[d.kdsStatus] ?? { label: d.kdsStatus, tone: "neutral" };
              const cancellable = unpaid && ["Hold", "Waiting"].includes(d.kdsStatus);
              return (
                <li key={d.id} className="tp-item">
                  <div className="tp-item-main">
                    <div className="tp-item-name">
                      <span className="tp-qty">{d.quantity}×</span> {d.product.name}
                    </div>
                    {d.customNotes && <div className="tp-item-note">{d.customNotes}</div>}
                    <span className={`tp-badge tone-${k.tone}`}>{k.label}</span>
                  </div>
                  <div className="tp-item-side">
                    <div className="tp-money">{vnd(d.unitPrice * d.quantity)}</div>
                    {cancellable && (
                      <button type="button" className="tp-link-danger" disabled={busy} onClick={() => void onCancelItem(d.id)}>
                        Huỷ
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="tp-foot">
        <div className="tp-total">
          <span>Tạm tính</span>
          <strong>{vnd(order?.subTotal ?? 0)}</strong>
        </div>
        <button type="button" className="o-btn o-btn-primary tp-cta" disabled={busy || order?.status === "Paid"} onClick={() => setMode("order")}>
          <Plus size={18} aria-hidden /> Gọi món
        </button>
      </footer>
    </>
  );
}

function ActionBtn({ icon: Icon, label, disabled, onClick }: { icon: typeof X; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="tp-action" disabled={disabled} onClick={onClick}>
      <Icon size={20} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

/* ── Gọi món ── */
type Line = { qty: number; note: string; showNote: boolean };

function OrderView({
  products,
  categories,
  initialPhone,
  busy,
  onSend,
}: {
  products: PanelProduct[];
  categories: PanelCategory[];
  initialPhone: string;
  busy: boolean;
  onSend: (lines: OrderLine[], phone: string) => Promise<void>;
}) {
  const cats = categories.filter((c) => products.some((p) => p.categoryId === c.id));
  const [cat, setCat] = useState<number | null>(cats[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Record<number, Line>>({});
  const [phone, setPhone] = useState(initialPhone);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => (term ? p.name.toLowerCase().includes(term) : cat == null || p.categoryId === cat));
  }, [products, cat, q]);

  const picked = Object.entries(lines).filter(([, l]) => l.qty > 0);
  const count = picked.reduce((s, [, l]) => s + l.qty, 0);
  const total = picked.reduce((s, [id, l]) => s + (products.find((p) => p.id === Number(id))?.sellPrice ?? 0) * l.qty, 0);

  const change = (id: number, d: number) =>
    setLines((prev) => {
      const cur = prev[id] ?? { qty: 0, note: "", showNote: false };
      const qty = Math.max(0, cur.qty + d);
      return { ...prev, [id]: { ...cur, qty } };
    });

  return (
    <>
      <div className="tp-body tp-body-order">
        <div className="tp-order-tools">
          <input className="o-input" type="search" placeholder="Tìm món…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm món" />
          <input className="o-input" type="tel" placeholder="SĐT khách (tích điểm)" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="SĐT khách" />
        </div>
        {!q && (
          <div className="tp-chips" role="tablist" aria-label="Danh mục">
            {cats.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={cat === c.id ? "tp-chip active" : "tp-chip"} onClick={() => setCat(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        <ul className="tp-menu">
          {list.map((p) => {
            const l = lines[p.id];
            const qty = l?.qty ?? 0;
            const img = p.imageUrl ? (p.imageUrl.startsWith("http") ? p.imageUrl : `${apiOrigin()}${p.imageUrl}`) : null;
            return (
              <li key={p.id} className={qty > 0 ? "tp-menu-item picked" : "tp-menu-item"}>
                {img ? <img src={img} alt="" className="tp-thumb" loading="lazy" /> : <span className="tp-thumb" />}
                <div className="tp-menu-main">
                  <div className="tp-item-name">{p.name}</div>
                  <div className="tp-muted">{vnd(p.sellPrice)}</div>
                  {l?.showNote && (
                    <input
                      className="o-input tp-note-input"
                      placeholder="Ít đá, ít ngọt…"
                      value={l.note}
                      onChange={(e) => setLines((prev) => ({ ...prev, [p.id]: { ...prev[p.id], note: e.target.value } }))}
                      autoFocus
                    />
                  )}
                </div>
                <div className="tp-stepper">
                  {qty > 0 && (
                    <>
                      <button type="button" className="tp-step" aria-label={`Ghi chú ${p.name}`} onClick={() => setLines((prev) => ({ ...prev, [p.id]: { ...prev[p.id], showNote: !prev[p.id].showNote } }))}>
                        <NotebookPen size={16} aria-hidden />
                      </button>
                      <button type="button" className="tp-step" aria-label={`Bớt ${p.name}`} onClick={() => change(p.id, -1)}>
                        <Minus size={16} aria-hidden />
                      </button>
                      <span className="tp-step-qty" aria-live="polite">{qty}</span>
                    </>
                  )}
                  <button type="button" className="tp-step tp-step-add" aria-label={`Thêm ${p.name}`} onClick={() => change(p.id, 1)}>
                    <Plus size={16} aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
          {list.length === 0 && <li className="tp-muted" style={{ padding: 12 }}>Không có món phù hợp.</li>}
        </ul>
      </div>
      <footer className="tp-foot">
        <div className="tp-total">
          <span>{count ? `${count} món mới` : "Chưa chọn món"}</span>
          <strong>{vnd(total)}</strong>
        </div>
        <button
          type="button"
          className="o-btn o-btn-primary tp-cta"
          disabled={!count || busy}
          onClick={() =>
            void onSend(
              picked.map(([id, l]) => ({ productId: Number(id), quantity: l.qty, customNotes: l.note.trim() || undefined })),
              phone.trim(),
            )
          }
        >
          {busy ? "Đang gửi…" : "Gửi bếp"}
        </button>
      </footer>
    </>
  );
}

/* ── Chọn bàn đích (chuyển / gộp) ── */
function PickTableView({ hint, tables, busy, onPick }: { hint: string; tables: PanelTable[]; busy: boolean; onPick: (id: number) => Promise<void> }) {
  return (
    <div className="tp-body">
      <p className="tp-muted" style={{ marginTop: 0 }}>{hint}</p>
      {tables.length === 0 ? (
        <p className="tp-empty-text">Không có bàn phù hợp.</p>
      ) : (
        <div className="tp-pick">
          {tables.map((t) => (
            <button key={t.id} type="button" className="tp-pick-btn" disabled={busy} onClick={() => void onPick(t.id)}>
              <strong>{t.name.replace("Bàn ", "")}</strong>
              <span>{t.location ?? ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tách bill ── */
function SplitView({ details, busy, onSplit }: { details: PanelDetail[]; busy: boolean; onSplit: (items: { orderItemId: number; quantity: number }[]) => Promise<void> }) {
  const [moved, setMoved] = useState<Record<number, number>>({});
  const set = (id: number, d: number, max: number) => setMoved((m) => ({ ...m, [id]: Math.min(max, Math.max(0, (m[id] ?? 0) + d)) }));
  const items = Object.entries(moved).filter(([, q]) => q > 0).map(([id, q]) => ({ orderItemId: Number(id), quantity: q }));
  const total = details.reduce((s, d) => s + (moved[d.id] ?? 0) * d.unitPrice, 0);
  // Không cho tách hết món sang bill mới
  const all = details.every((d) => (moved[d.id] ?? 0) === d.quantity);
  return (
    <>
      <div className="tp-body">
        <p className="tp-muted" style={{ marginTop: 0 }}>Chọn số lượng từng món chuyển sang bill mới.</p>
        <ul className="tp-items">
          {details.map((d) => (
            <li key={d.id} className="tp-item">
              <div className="tp-item-main">
                <div className="tp-item-name">{d.product.name}</div>
                <div className="tp-muted">Còn lại ở bill gốc: {d.quantity - (moved[d.id] ?? 0)}</div>
              </div>
              <div className="tp-stepper">
                <button type="button" className="tp-step" aria-label={`Bớt ${d.product.name}`} onClick={() => set(d.id, -1, d.quantity)}><Minus size={16} aria-hidden /></button>
                <span className="tp-step-qty">{moved[d.id] ?? 0}</span>
                <button type="button" className="tp-step tp-step-add" aria-label={`Thêm ${d.product.name}`} onClick={() => set(d.id, 1, d.quantity)}><Plus size={16} aria-hidden /></button>
              </div>
            </li>
          ))}
        </ul>
        {all && items.length > 0 && <p className="tp-error">Phải giữ lại ít nhất 1 món ở bill gốc.</p>}
      </div>
      <footer className="tp-foot">
        <div className="tp-total">
          <span>Bill mới</span>
          <strong>{vnd(total)}</strong>
        </div>
        <button type="button" className="o-btn o-btn-primary tp-cta" disabled={!items.length || all || busy} onClick={() => void onSplit(items)}>
          Tách bill
        </button>
      </footer>
    </>
  );
}
