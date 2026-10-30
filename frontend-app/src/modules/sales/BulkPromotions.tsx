import { useMemo, useState } from "react";
import { BadgePercent, Plus, Trash2 } from "lucide-react";
import { staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, EmptyState, Field, Kpi, Modal, RecordList, errMsg, fmtDateTime, formatVnd, type Tone } from "../../components/erp";
import { useResource } from "../shared";

type Tier = {
  minQty: number; minAmount: number; percentOff: number; maxDiscount: number; amountOff: number;
  freeShipping: boolean; buyQty: number; getQty: number; giftProductId: number | null; giftQty: number;
};
type Promo = {
  id: number; name: string; description: string | null; isActive: boolean; startAt: string; endAt: string;
  daysOfWeek: string | null; startMin: number | null; endMin: number | null;
  dineIn: boolean; takeaway: boolean; delivery: boolean; allStores: boolean; scope: "ALL" | "DRINKS" | "CATEGORIES" | "PRODUCTS"; allowVoucher: boolean;
  tiers: (Tier & { id: number })[];
  stores: { storeId: number }[]; categories: { categoryId: number }[]; products: { productId: number }[];
};
type Stat = { id: number; orders: number; cups: number; revenue: number; discount: number; shippingDiscount: number; giftValue: number; cupsPerOrder: number };
type Stats = { rows: Stat[]; baseline: { orders: number; cupsPerOrder: number } };
type Opt = { id: number; name: string };

const DAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const SCOPE_LABEL: Record<Promo["scope"], string> = { ALL: "Mọi món", DRINKS: "Đồ uống (món có size)", CATEGORIES: "Theo danh mục", PRODUCTS: "Món chỉ định" };
const hhmm = (m: number | null) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
const toMin = (s: string) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);
const localInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function statusOf(p: Promo): { label: string; tone: Tone } {
  const now = Date.now();
  if (!p.isActive) return { label: "Đã tắt", tone: "neutral" };
  if (new Date(p.startAt).getTime() > now) return { label: "Sắp diễn ra", tone: "info" };
  if (new Date(p.endAt).getTime() < now) return { label: "Đã kết thúc", tone: "neutral" };
  return { label: "Đang chạy", tone: "success" };
}

/** Mô tả phần thưởng 1 bậc (giống máy chủ) */
function tierText(t: Tier, products: Opt[]) {
  const parts: string[] = [];
  if (t.buyQty > 0 && t.getQty > 0) parts.push(`mua ${t.buyQty} tặng ${t.getQty}`);
  if (t.percentOff > 0) parts.push(`giảm ${t.percentOff}%${t.maxDiscount > 0 ? ` (tối đa ${formatVnd(t.maxDiscount)})` : ""}`);
  if (t.amountOff > 0) parts.push(`giảm ${formatVnd(t.amountOff)}`);
  if (t.freeShipping) parts.push("miễn ship");
  if (t.giftProductId) parts.push(`tặng ${t.giftQty} ${products.find((p) => p.id === t.giftProductId)?.name ?? "món"}`);
  return `Từ ${t.minQty} ly${t.minAmount > 0 ? ` & ${formatVnd(t.minAmount)}` : ""}: ${parts.join(" + ")}`;
}

/** Thực đơn & khuyến mãi › Ưu đãi số lượng — chỉ Chủ chuỗi. Máy chủ tự áp cho đơn đạt bậc. */
export function BulkPromotions() {
  const { data: rows, loading, error, reload } = useResource<Promo[]>("/api/admin/promotions", []);
  const { data: stats, reload: reloadStats } = useResource<Stats | null>("/api/admin/promotions/stats", null);
  const { data: products } = useResource<Opt[]>("/api/admin/products", []);
  const [open, setOpen] = useState<Promo | "new" | null>(null);
  const statOf = (id: number) => stats?.rows.find((s) => s.id === id);
  const totals = (stats?.rows ?? []).reduce((a, s) => ({ orders: a.orders + s.orders, discount: a.discount + s.discount + s.shippingDiscount + s.giftValue, cups: a.cups + s.cups }), { orders: 0, discount: 0, cups: 0 });
  return (
    <>
      <RecordList
        crumbs={[{ label: "Ưu đãi số lượng" }]}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        error={error}
        onOpen={setOpen}
        onCreate={() => setOpen("new")}
        createLabel="Tạo chương trình"
        top={stats && (
          <div className="o-kpis">
            <Kpi label="Đơn được áp ưu đãi (30 ngày)" value={totals.orders} />
            <Kpi label="Ly / đơn khi có ưu đãi" value={totals.orders ? Math.round((totals.cups / totals.orders) * 10) / 10 : "—"} tone="success" />
            <Kpi label="Ly / đơn thường" value={stats.baseline.cupsPerOrder || "—"} />
            <Kpi label="Tổng ưu đãi đã tặng khách" value={formatVnd(totals.discount)} tone="warning" />
          </div>
        )}
        columns={[
          { key: "name", label: "Chương trình", value: (p) => p.name, render: (p) => <strong style={{ fontWeight: 500 }}>{p.name}</strong> },
          { key: "time", label: "Thời gian", value: (p) => p.startAt, render: (p) => `${fmtDateTime(p.startAt)} → ${fmtDateTime(p.endAt)}` },
          { key: "tiers", label: "Bậc ưu đãi", value: (p) => p.tiers.length, render: (p) => <span style={{ whiteSpace: "normal" }}>{p.tiers.map((t) => tierText(t, products)).join(" · ")}</span> },
          { key: "orders", label: "Đơn", value: (p) => statOf(p.id)?.orders ?? 0, numeric: true },
          { key: "cpo", label: "Ly / đơn", value: (p) => statOf(p.id)?.cupsPerOrder ?? 0, numeric: true, optional: true },
          { key: "disc", label: "Đã giảm", value: (p) => statOf(p.id)?.discount ?? 0, numeric: true, render: (p) => formatVnd(statOf(p.id)?.discount ?? 0) },
          { key: "ship", label: "Ship quán chịu", value: (p) => statOf(p.id)?.shippingDiscount ?? 0, numeric: true, optional: true, render: (p) => formatVnd(statOf(p.id)?.shippingDiscount ?? 0) },
          { key: "gift", label: "Quà tặng", value: (p) => statOf(p.id)?.giftValue ?? 0, numeric: true, optional: true, render: (p) => formatVnd(statOf(p.id)?.giftValue ?? 0) },
          { key: "status", label: "Trạng thái", value: (p) => statusOf(p).label, render: (p) => <Badge tone={statusOf(p).tone}>{statusOf(p).label}</Badge> },
        ]}
        searchText={(p) => `${p.name} ${p.description ?? ""}`}
        filters={[
          { id: "running", label: "Đang chạy", test: (p) => statusOf(p).label === "Đang chạy" },
          { id: "upcoming", label: "Sắp diễn ra", test: (p) => statusOf(p).label === "Sắp diễn ra" },
          { id: "ended", label: "Đã kết thúc / tắt", test: (p) => ["Đã kết thúc", "Đã tắt"].includes(statusOf(p).label) },
        ]}
        emptyState={<EmptyState icon={BadgePercent} title="Chưa có chương trình nào" hint="VD: từ 5 ly giảm 10%, từ 10 ly giảm 15% + miễn ship, mua 5 tặng 1." />}
      />
      {open && (
        <PromoForm
          promo={open === "new" ? null : open}
          products={products}
          onClose={() => setOpen(null)}
          onSaved={() => { setOpen(null); void reload(); void reloadStats(); }}
        />
      )}
    </>
  );
}

const EMPTY_TIER: Tier = { minQty: 5, minAmount: 0, percentOff: 10, maxDiscount: 0, amountOff: 0, freeShipping: false, buyQty: 0, getQty: 0, giftProductId: null, giftQty: 1 };

function PromoForm({ promo, products, onClose, onSaved }: { promo: Promo | null; products: Opt[]; onClose: () => void; onSaved: () => void }) {
  const { data: categories } = useResource<Opt[]>("/api/admin/categories", []);
  const { data: stores } = useResource<Opt[]>("/api/admin/stores", []);
  const now = new Date();
  const [f, setF] = useState(() => ({
    name: promo?.name ?? "",
    description: promo?.description ?? "",
    isActive: promo?.isActive ?? true,
    startAt: promo ? localInput(promo.startAt) : localInput(now.toISOString()),
    endAt: promo ? localInput(promo.endAt) : localInput(new Date(now.getTime() + 7 * 86400_000).toISOString()),
    days: promo?.daysOfWeek ? promo.daysOfWeek.split(",").map(Number) : [0, 1, 2, 3, 4, 5, 6],
    from: hhmm(promo?.startMin ?? null),
    to: hhmm(promo?.endMin ?? null),
    dineIn: promo?.dineIn ?? true,
    takeaway: promo?.takeaway ?? true,
    delivery: promo?.delivery ?? true,
    allStores: promo?.allStores ?? true,
    storeIds: promo?.stores.map((s) => s.storeId) ?? [],
    scope: promo?.scope ?? "DRINKS",
    categoryIds: promo?.categories.map((c) => c.categoryId) ?? [],
    productIds: promo?.products.map((x) => x.productId) ?? [],
    allowVoucher: promo?.allowVoucher ?? false,
    tiers: promo?.tiers.map(({ id: _id, ...t }) => t) ?? [{ ...EMPTY_TIER }],
  }));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const setTier = (i: number, patch: Partial<Tier>) => set("tiers", f.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const toggleIn = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const preview = useMemo(() => [...f.tiers].sort((a, b) => a.minQty - b.minQty).map((t) => tierText(t, products)), [f.tiers, products]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        ...f,
        startAt: new Date(f.startAt).toISOString(),
        endAt: new Date(f.endAt).toISOString(),
        daysOfWeek: f.days,
        startMin: f.from && f.to ? toMin(f.from) : null,
        endMin: f.from && f.to ? toMin(f.to) : null,
      };
      await staffApi(promo ? `/api/admin/promotions/${promo.id}` : "/api/admin/promotions", { method: promo ? "PUT" : "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }
  async function toggle() {
    if (!promo) return;
    try {
      await staffApi(`/api/admin/promotions/${promo.id}/toggle`, { method: "PATCH" });
      onSaved();
    } catch (e) { setErr(errMsg(e)); }
  }
  async function remove() {
    if (!promo || !window.confirm(`Xoá chương trình "${promo.name}"?`)) return;
    try {
      await staffApi(`/api/admin/promotions/${promo.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) { setErr(errMsg(e)); }
  }
  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/\D/g, "")) || 0));
  const check = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="o-check" style={{ marginRight: 12 }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
  );

  return (
    <Modal
      title={promo ? `Chương trình: ${promo.name}` : "Tạo chương trình ưu đãi số lượng"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {promo && <Button variant="danger" onClick={() => void remove()}>Xoá</Button>}
          {promo && <Button onClick={() => void toggle()}>{promo.isActive ? "Tắt" : "Bật"} chương trình</Button>}
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu"}</Button>
        </>
      }
    >
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        <Field label="Tên chương trình" required full><input className="o-input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Sale giữa tuần — mua nhiều giảm sâu" /></Field>
        <Field label="Mô tả (khách thấy)" full><input className="o-input" value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>

        <div className="o-section-title" style={{ margin: "4px 0 0" }}>Thời gian</div>
        <div className="bp-grid">
          <Field label="Bắt đầu" required full><input type="datetime-local" className="o-input" value={f.startAt} onChange={(e) => set("startAt", e.target.value)} /></Field>
          <Field label="Kết thúc" required full><input type="datetime-local" className="o-input" value={f.endAt} onChange={(e) => set("endAt", e.target.value)} /></Field>
          <Field label="Khung giờ (tuỳ chọn)" full>
            <span className="bp-pair bp-pair-time">
              <input type="time" className="o-input" value={f.from} onChange={(e) => set("from", e.target.value)} aria-label="Từ giờ" />
              <span>–</span>
              <input type="time" className="o-input" value={f.to} onChange={(e) => set("to", e.target.value)} aria-label="Đến giờ" />
            </span>
          </Field>
        </div>
        <Field label="Ngày trong tuần" full>
          <span className="o-inline">{DAYS.map((d, i) => check(d, f.days.includes(i), () => set("days", toggleIn(f.days, i))))}</span>
        </Field>

        <div className="o-section-title" style={{ margin: "4px 0 0" }}>Áp dụng cho</div>
        <Field label="Kênh bán" full>
          <span className="o-inline">
            {check("Tại bàn", f.dineIn, (v) => set("dineIn", v))}
            {check("Mang về", f.takeaway, (v) => set("takeaway", v))}
            {check("Giao hàng", f.delivery, (v) => set("delivery", v))}
          </span>
        </Field>
        <Field label="Chi nhánh" full>
          <span className="o-inline">
            {check("Toàn chuỗi", f.allStores, (v) => set("allStores", v))}
            {!f.allStores && stores.map((s) => check(s.name, f.storeIds.includes(s.id), () => set("storeIds", toggleIn(f.storeIds, s.id))))}
          </span>
        </Field>
        <Field label="Món được tính" full>
          <select className="o-input" value={f.scope} onChange={(e) => set("scope", e.target.value as Promo["scope"])}>
            {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {f.scope === "CATEGORIES" && (
          <Field label="Danh mục" full><span className="o-inline">{categories.map((c) => check(c.name, f.categoryIds.includes(c.id), () => set("categoryIds", toggleIn(f.categoryIds, c.id))))}</span></Field>
        )}
        {f.scope === "PRODUCTS" && (
          <Field label="Món" full>
            <span className="o-inline" style={{ maxHeight: 160, overflowY: "auto" }}>{products.map((x) => check(x.name, f.productIds.includes(x.id), () => set("productIds", toggleIn(f.productIds, x.id))))}</span>
          </Field>
        )}
        <div className="o-muted" style={{ fontSize: "0.85rem" }}>Món trong combo và món tặng không được đếm.</div>
        {check("Cho dùng chung với voucher", f.allowVoucher, (v) => set("allowVoucher", v))}

        <div className="o-section-title" style={{ margin: "4px 0 0" }}>Bậc ưu đãi (đạt bậc cao nhất thì áp bậc đó)</div>
        {f.tiers.map((t, i) => (
          <div key={i} className="o-card bp-tier">
            <div className="bp-tier-head">
              <strong>Bậc {i + 1}</strong>
              <span className="o-muted bp-tier-sum">{tierText(t, products)}</span>
              {f.tiers.length > 1 && <Button size="sm" variant="link" icon={Trash2} aria-label={`Bỏ bậc ${i + 1}`} onClick={() => set("tiers", f.tiers.filter((_, j) => j !== i))} />}
            </div>

            <div className="bp-group-label">Điều kiện</div>
            <div className="bp-grid">
              <Field label="Từ (ly)" required full><input className="o-input" inputMode="numeric" value={t.minQty} onChange={(e) => setTier(i, { minQty: num(e.target.value) })} /></Field>
              <Field label="Tổng tiền tối thiểu (đ)" full><input className="o-input" inputMode="numeric" value={t.minAmount || ""} placeholder="Không yêu cầu" onChange={(e) => setTier(i, { minAmount: num(e.target.value) })} /></Field>
            </div>

            <div className="bp-group-label">Ưu đãi (kết hợp được)</div>
            <div className="bp-grid">
              <Field label="Giảm %" full><input className="o-input" inputMode="numeric" value={t.percentOff || ""} placeholder="0" onChange={(e) => setTier(i, { percentOff: Math.min(100, num(e.target.value)) })} /></Field>
              <Field label="Giảm tối đa (đ)" full><input className="o-input" inputMode="numeric" value={t.maxDiscount || ""} placeholder="Không giới hạn" onChange={(e) => setTier(i, { maxDiscount: num(e.target.value) })} /></Field>
              <Field label="Giảm tiền (đ)" full><input className="o-input" inputMode="numeric" value={t.amountOff || ""} placeholder="0" onChange={(e) => setTier(i, { amountOff: num(e.target.value) })} /></Field>
              <Field label="Mua X tặng Y (ly rẻ nhất)" full>
                <span className="bp-pair">
                  <span className="o-muted">Mua</span>
                  <input className="o-input" inputMode="numeric" value={t.buyQty || ""} placeholder="X" aria-label="Mua X" onChange={(e) => setTier(i, { buyQty: num(e.target.value) })} />
                  <span className="o-muted">tặng</span>
                  <input className="o-input" inputMode="numeric" value={t.getQty || ""} placeholder="Y" aria-label="Tặng Y" onChange={(e) => setTier(i, { getQty: num(e.target.value) })} />
                </span>
              </Field>
              <Field label="Tặng món" full>
                <span className="bp-gift">
                  <select className="o-input" value={t.giftProductId ?? ""} onChange={(e) => setTier(i, { giftProductId: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">— Không tặng —</option>
                    {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  {t.giftProductId && <input className="o-input" inputMode="numeric" value={t.giftQty} aria-label="Số lượng tặng" onChange={(e) => setTier(i, { giftQty: Math.max(1, num(e.target.value)) })} />}
                </span>
              </Field>
              <Field label="Phí giao hàng" full>{check("Miễn ship", t.freeShipping, (v) => setTier(i, { freeShipping: v }))}</Field>
            </div>
          </div>
        ))}
        <Button size="sm" icon={Plus} onClick={() => set("tiers", [...f.tiers, { ...EMPTY_TIER, minQty: Math.max(...f.tiers.map((t) => t.minQty), 0) + 5 }])}>Thêm bậc</Button>
        <Alert tone="info">{preview.join(" · ") || "Chưa có bậc"}<div className="o-muted" style={{ marginTop: 4 }}>Miễn ship: khách không trả, shipper vẫn nhận đủ — quán chịu. Nhiều chương trình cùng đạt → áp chương trình có lợi nhất cho khách.</div></Alert>
      </div>
    </Modal>
  );
}
