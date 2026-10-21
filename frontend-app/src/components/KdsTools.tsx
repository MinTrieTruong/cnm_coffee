import { useCallback, useEffect, useMemo, useState } from "react";
import { mediaUrl } from "../lib/api";
import { staffApi } from "../lib/staffApi";
import { Alert, Badge, Button, Field, Modal, Tabs, errMsg, fmtQty } from "./erp";

export type KitchenProduct = {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string;
  hasSizes: boolean;
  outOfStock: boolean;
  isAvailable: boolean;
  itemIds: number[];
};
type KitchenItem = {
  id: number;
  name: string;
  unit: string | null;
  category: string | null;
  stockQty: number;
  minLevel: number;
  products: { id: number; name: string }[];
};
type WasteRow = {
  id: number;
  qty: number;
  size: string | null;
  reason: string;
  note: string | null;
  createdAt: string;
  staff: { fullName: string };
  product: { name: string } | null;
  item: { name: string; unit: string | null } | null;
};
export type LowStock = { id: number; name: string; unit: string | null; stockQty: number; products: { id: number; name: string }[] };

export const WASTE_REASON: Record<string, string> = {
  SPILL: "Đổ",
  BROKEN: "Bể / vỡ",
  EXPIRED: "Hư / hết hạn",
  REMAKE: "Làm lại món",
  OTHER: "Khác",
};

/** Danh sách món của chi nhánh (dùng cho đếm "đang hết" ở thanh công cụ KDS) */
export function useKitchenProducts() {
  const [products, setProducts] = useState<KitchenProduct[]>([]);
  const reload = useCallback(async () => {
    try {
      setProducts(await staffApi<KitchenProduct[]>("/api/kitchen/products"));
    } catch {
      /* KDS vẫn chạy được khi lỗi tải danh sách món */
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { products, setProducts, reload };
}

async function setAvailability(id: number, body: { outOfStock?: boolean; isAvailable?: boolean }) {
  return staffApi<{ productId: number; outOfStock: boolean; isAvailable: boolean }>(`/api/kitchen/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Báo hết nhiều món cùng lúc (sau khi báo hao hụt / thiếu nguyên liệu) */
async function markSoldOut(ids: number[]) {
  await Promise.all(ids.map((id) => setAvailability(id, { outOfStock: true })));
}

/* ───────────── Món & hết món ───────────── */
export function MenuPanel({ products, onChange, onClose }: {
  products: KitchenProduct[];
  onChange: (p: KitchenProduct) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products
      .filter((p) => (!only || p.outOfStock || !p.isAvailable) && (!needle || p.name.toLowerCase().includes(needle)))
      // Món đang hết / đang ẩn lên đầu để mở bán lại nhanh
      .sort((a, b) => Number(b.outOfStock || !b.isAvailable) - Number(a.outOfStock || !a.isAvailable));
  }, [products, q, only]);

  async function toggle(p: KitchenProduct, body: { outOfStock?: boolean; isAvailable?: boolean }) {
    setBusy(p.id);
    setErr(null);
    try {
      const r = await setAvailability(p.id, body);
      onChange({ ...p, outOfStock: r.outOfStock, isAvailable: r.isAvailable });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const off = products.filter((p) => p.outOfStock || !p.isAvailable).length;
  return (
    <Modal title="Món & hết món" onClose={onClose} size="lg">
      <p className="o-muted" style={{ marginTop: 0 }}>
        <strong>Hết món</strong>: tạm hết, khách và phục vụ không gọi được. <strong>Ẩn</strong>: chi nhánh không bán món này. Chỉ áp dụng cho chi nhánh hiện tại.
      </p>
      {err && <Alert>{err}</Alert>}
      <div className="o-inline" style={{ marginBottom: 10, width: "100%" }}>
        <input className="o-input" style={{ flex: 1, minWidth: 180 }} placeholder="Tìm món…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <label className="o-inline"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Chỉ món đang hết / ẩn ({off})</label>
      </div>
      <div className="kds-menu-list">
        {list.map((p) => (
          <div key={p.id} className={`kds-menu-row ${p.outOfStock || !p.isAvailable ? "off" : ""}`}>
            <span className="kds-menu-thumb" style={mediaUrl(p.imageUrl) ? { backgroundImage: `url(${mediaUrl(p.imageUrl)})` } : undefined} />
            <span className="kds-menu-name">
              <strong>{p.name}</strong>
              <span className="o-muted">{p.category}</span>
            </span>
            {p.outOfStock && <Badge tone="danger">Đang hết</Badge>}
            {!p.isAvailable && <Badge>Đang ẩn</Badge>}
            <span className="o-inline">
              <Button size="sm" variant={p.outOfStock ? "primary" : "danger"} disabled={busy === p.id} onClick={() => void toggle(p, { outOfStock: !p.outOfStock })}>
                {p.outOfStock ? "Mở bán lại" : "Hết món"}
              </Button>
              <Button size="sm" disabled={busy === p.id} onClick={() => void toggle(p, { isAvailable: !p.isAvailable })}>
                {p.isAvailable ? "Ẩn" : "Hiện"}
              </Button>
            </span>
          </div>
        ))}
        {list.length === 0 && <p className="o-muted">Không có món nào.</p>}
      </div>
    </Modal>
  );
}

/** Gợi ý báo hết các món dùng nguyên liệu vừa hết / đang thiếu */
function SoldOutSuggest({ candidates, products, onDone }: {
  candidates: { id: number; name: string }[];
  products: KitchenProduct[];
  onDone: (ids: number[]) => void;
}) {
  const open = candidates.filter((c) => !products.find((p) => p.id === c.id)?.outOfStock);
  const [pick, setPick] = useState<Set<number>>(() => new Set(open.map((c) => c.id)));
  const [busy, setBusy] = useState(false);
  if (open.length === 0) return null;
  return (
    <div className="kds-suggest">
      <div><strong>Báo hết các món dùng nguyên liệu này?</strong></div>
      <div className="o-inline">
        {open.map((c) => (
          <label key={c.id} className="o-inline">
            <input type="checkbox" checked={pick.has(c.id)} onChange={(e) => setPick((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
            {c.name}
          </label>
        ))}
      </div>
      <Button size="sm" variant="danger" disabled={busy || pick.size === 0} onClick={async () => { setBusy(true); await markSoldOut([...pick]); onDone([...pick]); }}>
        Báo hết {pick.size} món
      </Button>
    </div>
  );
}

/** Bán hàng tự trừ kho → nguyên liệu vừa xuống dưới mức tối thiểu / không đủ làm món */
export function LowStockBanner({ items, products, onSoldOut, onDismiss }: {
  items: LowStock[];
  products: KitchenProduct[];
  onSoldOut: (ids: number[]) => void;
  onDismiss: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="o-stack" style={{ marginBottom: 12 }}>
      {items.map((l) => (
        <div key={l.id} className="kds-low">
          <div className="kds-low-head">
            <strong>Sắp hết: {l.name}</strong> — còn {fmtQty(l.stockQty)}{l.unit ? ` ${l.unit}` : ""}
            <Button size="sm" variant="link" onClick={() => onDismiss(l.id)}>Đã biết</Button>
          </div>
          <SoldOutSuggest candidates={l.products} products={products} onDone={(ids) => { onSoldOut(ids); onDismiss(l.id); }} />
        </div>
      ))}
    </div>
  );
}

function useItems() {
  const [items, setItems] = useState<KitchenItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    staffApi<KitchenItem[]>("/api/kitchen/items").then(setItems).catch((e) => setErr(errMsg(e)));
  }, []);
  return { items, err };
}

const stockText = (i: KitchenItem) => `${i.name} — còn ${fmtQty(i.stockQty)}${i.unit ? ` ${i.unit}` : ""}`;

/* ───────────── Báo hao hụt ───────────── */
export function WastePanel({ products, onSoldOut, onClose }: {
  products: KitchenProduct[];
  onSoldOut: (ids: number[]) => void;
  onClose: () => void;
}) {
  const { items, err: loadErr } = useItems();
  const [mode, setMode] = useState<"product" | "item">("product");
  const [v, setV] = useState({ productId: "", size: "M", itemId: "", qty: "1", reason: "SPILL", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [low, setLow] = useState<LowStock[]>([]);
  const [today, setToday] = useState<WasteRow[]>([]);
  const [sending, setSending] = useState(false);
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));
  const product = products.find((p) => String(p.id) === v.productId);

  const loadToday = useCallback(() => {
    staffApi<WasteRow[]>("/api/kitchen/waste").then(setToday).catch(() => {});
  }, []);
  useEffect(() => { loadToday(); }, [loadToday]);

  async function send() {
    setSending(true);
    setErr(null);
    setMsg(null);
    try {
      const body = mode === "product"
        ? { productId: Number(v.productId), size: product?.hasSizes ? v.size : undefined, qty: Number(v.qty), reason: v.reason, note: v.note }
        : { itemId: Number(v.itemId), qty: Number(v.qty), reason: v.reason, note: v.note };
      const r = await staffApi<{ deducted: number; lowStock: LowStock[] }>("/api/kitchen/waste", { method: "POST", body: JSON.stringify(body) });
      setMsg(
        mode === "product" && r.deducted === 0
          ? "Đã ghi sổ hao hụt. Món này chưa có định mức nguyên liệu nên kho chưa bị trừ — nhờ quản lý thêm định mức."
          : `Đã ghi sổ hao hụt và trừ kho ${r.deducted} nguyên liệu.`,
      );
      setLow(r.lowStock);
      setV((x) => ({ ...x, qty: "1", note: "" }));
      loadToday();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  const label = (w: WasteRow) => (w.product ? `${w.qty} ly ${w.product.name}${w.size ? ` (${w.size})` : ""}` : `${w.qty} ${w.item?.unit ?? ""} ${w.item?.name ?? ""}`);
  return (
    <Modal
      title="Báo hao hụt"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Đóng</Button><Button variant="primary" disabled={sending || !(mode === "product" ? v.productId : v.itemId)} onClick={() => void send()}>{sending ? "Đang lưu…" : "Ghi & trừ kho"}</Button></>}
    >
      <div className="o-stack">
        <Tabs tabs={[{ id: "product", label: "Hỏng cả ly / món" }, { id: "item", label: "Hao hụt nguyên liệu" }]} active={mode} onChange={(m) => setMode(m as "product" | "item")} />
        {(err || loadErr) && <Alert>{err ?? loadErr}</Alert>}
        {msg && <Alert tone="info">{msg}</Alert>}
        {low.map((l) => (
          <div key={l.id} className="o-stack">
            <Alert tone="warning">{l.name} chỉ còn {fmtQty(l.stockQty)}{l.unit ? ` ${l.unit}` : ""} trong kho.</Alert>
            <SoldOutSuggest candidates={l.products} products={products} onDone={(ids) => { onSoldOut(ids); setLow((x) => x.filter((y) => y.id !== l.id)); }} />
          </div>
        ))}

        {mode === "product" ? (
          <>
            <Field label="Món" required>
              <select className="o-input" value={v.productId} onChange={(e) => set("productId", e.target.value)}>
                <option value="">Chọn món…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            {product?.hasSizes && (
              <Field label="Size">
                <span className="o-inline">
                  {["S", "M", "L"].map((s) => (
                    <Button key={s} size="sm" variant={v.size === s ? "primary" : "secondary"} onClick={() => set("size", s)}>{s}</Button>
                  ))}
                </span>
              </Field>
            )}
          </>
        ) : (
          <Field label="Nguyên liệu" required>
            <select className="o-input" value={v.itemId} onChange={(e) => set("itemId", e.target.value)}>
              <option value="">Chọn nguyên liệu…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{stockText(i)}</option>)}
            </select>
          </Field>
        )}
        <Field label={mode === "product" ? "Số ly" : `Số lượng${items.find((i) => String(i.id) === v.itemId)?.unit ? ` (${items.find((i) => String(i.id) === v.itemId)!.unit})` : ""}`} required>
          <input className="o-input o-input-num" type="number" min={mode === "product" ? 1 : 0.1} step={mode === "product" ? 1 : 0.1} value={v.qty} onChange={(e) => set("qty", e.target.value)} />
        </Field>
        {mode === "item" && <p className="o-muted" style={{ margin: 0 }}>Theo đơn vị kho, được nhập số lẻ — VD đổ nửa hộp sữa: 0.5</p>}
        <Field label="Lý do" required>
          <span className="o-inline">
            {Object.entries(WASTE_REASON).map(([k, l]) => (
              <Button key={k} size="sm" variant={v.reason === k ? "primary" : "secondary"} onClick={() => set("reason", k)}>{l}</Button>
            ))}
          </span>
        </Field>
        <Field label={v.reason === "OTHER" ? "Ghi chú (bắt buộc)" : "Ghi chú"}>
          <input className="o-input" value={v.note} onChange={(e) => set("note", e.target.value)} placeholder="VD: làm rơi ly khi bưng, khách đổi ý…" />
        </Field>

        {today.length > 0 && (
          <div>
            <div className="o-muted" style={{ marginBottom: 4 }}>Hôm nay đã báo ({today.length})</div>
            <table className="o-list">
              <tbody>
                {today.slice(0, 8).map((w) => (
                  <tr key={w.id}>
                    <td>{new Date(w.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{label(w)}</td>
                    <td>{WASTE_REASON[w.reason] ?? w.reason}</td>
                    <td className="o-muted">{w.staff.fullName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ───────────── Đề xuất món mới ───────────── */
type MyProposal = {
  id: number;
  name: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CREATED";
  ownerNote: string | null;
  createdAt: string;
  product: { name: string } | null;
};
const MY_PROPOSAL_STATUS: Record<MyProposal["status"], { label: string; tone: "warning" | "info" | "success" | "danger" }> = {
  PENDING: { label: "Chờ chủ chuỗi duyệt", tone: "warning" },
  APPROVED: { label: "Đã duyệt", tone: "info" },
  CREATED: { label: "Đã lên thực đơn", tone: "success" },
  REJECTED: { label: "Chưa được duyệt", tone: "danger" },
};

export function ProposalPanel({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState({ name: "", description: "", recipe: "", suggestedPrice: "", categoryId: "", imageUrl: "" });
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [mine, setMine] = useState<MyProposal[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));

  const loadMine = useCallback(() => {
    staffApi<MyProposal[]>("/api/menu-proposals").then(setMine).catch(() => {});
  }, []);
  useEffect(() => {
    loadMine();
    staffApi<{ categories: { id: number; name: string }[] }>("/api/menu").then((r) => setCats(r.categories)).catch(() => {});
  }, [loadMine]);

  async function send() {
    setSending(true);
    setErr(null);
    setMsg(null);
    try {
      const price = Number(v.suggestedPrice.replace(/\D/g, ""));
      await staffApi("/api/menu-proposals", {
        method: "POST",
        body: JSON.stringify({
          name: v.name,
          description: v.description,
          recipe: v.recipe,
          suggestedPrice: v.suggestedPrice ? price : undefined,
          categoryId: v.categoryId ? Number(v.categoryId) : undefined,
          imageUrl: v.imageUrl || undefined,
        }),
      });
      setMsg(`Đã gửi đề xuất "${v.name}" cho chủ chuỗi.`);
      setV({ name: "", description: "", recipe: "", suggestedPrice: "", categoryId: "", imageUrl: "" });
      loadMine();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      title="Đề xuất món mới"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Đóng</Button><Button variant="primary" disabled={sending || !v.name.trim() || !v.recipe.trim()} onClick={() => void send()}>{sending ? "Đang gửi…" : "Gửi đề xuất"}</Button></>}
    >
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        {msg && <Alert tone="info">{msg}</Alert>}
        <p className="o-muted" style={{ margin: 0 }}>Nghĩ ra món mới? Gửi chủ chuỗi xem — được duyệt sẽ lên thực đơn.</p>
        <Field label="Tên món" required><input className="o-input" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Cà phê muối kem cheese" /></Field>
        <Field label="Ý tưởng / hương vị"><textarea className="o-input" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="Vị gì, hợp với khách nào, điểm khác biệt…" /></Field>
        <Field label="Nguyên liệu & cách làm" required>
          <textarea className="o-input" rows={4} value={v.recipe} onChange={(e) => set("recipe", e.target.value)} placeholder={"VD:\n- 20g cà phê phin\n- 30ml kem muối\n- Đá viên\nPha phin, rót kem muối lên trên"} />
        </Field>
        <div className="o-inline" style={{ alignItems: "flex-end" }}>
          <Field label="Giá đề xuất (đ)"><input className="o-input" inputMode="numeric" value={v.suggestedPrice} onChange={(e) => set("suggestedPrice", e.target.value)} placeholder="45000" /></Field>
          <Field label="Danh mục">
            <select className="o-input" value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Chưa chọn</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Link ảnh minh hoạ"><input className="o-input" value={v.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" /></Field>

        {mine.length > 0 && (
          <div>
            <div className="o-muted" style={{ marginBottom: 4 }}>Đề xuất của bạn</div>
            <table className="o-list">
              <tbody>
                {mine.slice(0, 10).map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}{p.ownerNote && <div className="o-muted">Chủ chuỗi: {p.ownerNote}</div>}</td>
                    <td><Badge tone={MY_PROPOSAL_STATUS[p.status].tone}>{MY_PROPOSAL_STATUS[p.status].label}</Badge></td>
                    <td className="o-muted">{new Date(p.createdAt).toLocaleDateString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
