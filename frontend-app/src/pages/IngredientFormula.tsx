import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Scaling, Trash2, Undo2 } from "lucide-react";
import { mediaUrl } from "../lib/api";
import { getStaffInfo, isOwnerRole, staffApi } from "../lib/staffApi";
import { Alert, Badge, Button, ControlPanel, EmptyState, errMsg, formatVnd, type Tone } from "../components/erp";

type Size = "S" | "M" | "L";
const SIZES: Size[] = ["S", "M", "L"];
type SizeCost = Record<Size, number>;

type ProductCost = {
  id: number;
  name: string;
  imageUrl: string | null;
  sellPrice: number;
  priceSizeS: number | null;
  priceSizeL: number | null;
  isActive: boolean;
  hasFormula: boolean;
  cost: SizeCost | null;
  category: { name: string };
};
type InvItem = { id: number; name: string; unit: string | null; unitCostPrice: number; recipeUnit: string | null; recipePerUnit: number };
type FormulaRow = {
  id: number;
  productId: number;
  itemId: number;
  qtyPerUnit: number;
  qtySizeS: number | null;
  qtySizeM: number | null;
  qtySizeL: number | null;
  note: string | null;
};
/** Dòng đang soạn: lượng theo đơn vị công thức (chuỗi để gõ dở được) */
type Line = { itemId: number | ""; S: string; M: string; L: string; note: string };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
/** Giá bán theo size — S/L để trống thì S = M − 3.000đ, L = M + 5.000đ (cùng quy tắc màn đặt món) */
const priceOf = (p: ProductCost, size: Size) =>
  size === "M" ? p.sellPrice : size === "S" ? p.priceSizeS ?? Math.max(0, p.sellPrice - 3000) : p.priceSizeL ?? p.sellPrice + 5000;
/** % giá vốn trên giá bán: ≤ 30% tốt, ≤ 38% chấp nhận, cao hơn cần xem lại giá */
const ratioTone = (r: number): Tone => (r <= 0.3 ? "success" : r <= 0.38 ? "warning" : "danger");
const pct = (r: number) => `${Math.round(r * 100)}%`;

const toLines = (rows: FormulaRow[]): Line[] =>
  rows.map((f) => ({
    itemId: f.itemId,
    S: f.qtySizeS != null ? String(f.qtySizeS) : "",
    M: String(f.qtySizeM ?? f.qtyPerUnit),
    L: f.qtySizeL != null ? String(f.qtySizeL) : "",
    note: f.note ?? "",
  }));

/** Bếp & pha chế › Công thức & giá vốn — định mức S/M/L, giá vốn tính từ giá nhập nguyên liệu */
export function IngredientFormula() {
  const owner = isOwnerRole(getStaffInfo()?.role);
  const [products, setProducts] = useState<ProductCost[]>([]);
  const [items, setItems] = useState<InvItem[]>([]);
  const [formulas, setFormulas] = useState<FormulaRow[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, i, f] = await Promise.all([
        staffApi<ProductCost[]>("/api/admin/product-costs"),
        staffApi<InvItem[]>("/api/admin/inventory"),
        staffApi<FormulaRow[]>("/api/admin/formulas"),
      ]);
      setProducts(p);
      setItems(i);
      setFormulas(f);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const selected = products.find((p) => p.id === selId) ?? null;
  const saved = useMemo(() => toLines(formulas.filter((f) => f.productId === selId)), [formulas, selId]);
  const dirty = JSON.stringify(lines) !== JSON.stringify(saved);

  const pick = (id: number) => {
    if (dirty && !confirm("Công thức đang sửa chưa lưu. Bỏ thay đổi?")) return;
    setSelId(id);
    setLines(toLines(formulas.filter((f) => f.productId === id)));
    setMsg(null);
  };

  /** Giá vốn 1 dòng theo size = lượng / quy đổi × giá nhập */
  const lineCost = (l: Line, size: Size) => {
    const it = l.itemId === "" ? undefined : itemById.get(l.itemId);
    if (!it) return 0;
    const qty = num(size === "M" ? l.M : l[size] || l.M); // S/L để trống = dùng lượng M
    return (qty / (it.recipePerUnit > 0 ? it.recipePerUnit : 1)) * it.unitCostPrice;
  };
  const total: SizeCost = { S: 0, M: 0, L: 0 };
  for (const l of lines) for (const s of SIZES) total[s] += lineCost(l, s);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  /** S ≈ 75%, L ≈ 130% lượng M; ly, ống hút (đơn vị cái) giữ nguyên */
  const autoSizes = () =>
    setLines((ls) =>
      ls.map((l) => {
        const it = l.itemId === "" ? undefined : itemById.get(l.itemId);
        const m = num(l.M);
        if (!m) return l;
        const perCup = /^cái$/i.test(it?.recipeUnit ?? "");
        return { ...l, S: String(perCup ? m : round1(m * 0.75)), L: String(perCup ? m : round1(m * 1.3)) };
      }),
    );

  async function save() {
    if (!selected) return;
    const bad = lines.find((l) => l.itemId === "" || !num(l.M));
    if (bad) return setErr("Mỗi dòng cần chọn nguyên liệu và nhập lượng size M.");
    setSaving(true);
    setErr(null);
    try {
      const r = await staffApi<{ cost: SizeCost }>(`/api/admin/formulas/product/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          lines: lines.map((l) => ({ itemId: l.itemId, qtyS: l.S ? num(l.S) : null, qtyM: num(l.M), qtyL: l.L ? num(l.L) : null, note: l.note })),
        }),
      });
      await load();
      setMsg(`Đã lưu. Giá vốn ${selected.name}: S ${formatVnd(r.cost.S)} · M ${formatVnd(r.cost.M)} · L ${formatVnd(r.cost.L)}.`);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  // Sau khi tải lại, đồng bộ dòng đang sửa với bản đã lưu
  useEffect(() => {
    if (selId != null) setLines(toLines(formulas.filter((f) => f.productId === selId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulas]);

  const shown = products.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const noPrice = lines.filter((l) => l.itemId !== "" && !itemById.get(l.itemId)?.unitCostPrice);

  return (
    <div>
      <ControlPanel crumbs={[{ label: "Công thức & giá vốn" }]} />
      <div className="o-content">
        {err && <Alert>{err}</Alert>}
        {!owner && <Alert tone="info">Chỉ Chủ chuỗi sửa được công thức. Giá vốn tính từ định mức × giá nhập nguyên liệu.</Alert>}
        <div className="fm-layout">
          {/* ── Danh sách món + giá vốn ── */}
          <aside className="o-card fm-list">
            <div className="fm-list-head">
              <input className="o-input" placeholder="Tìm món…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {shown.map((p) => {
              const r = p.cost ? p.cost.M / p.sellPrice : 0;
              return (
                <button key={p.id} type="button" className={`fm-item ${p.id === selId ? "active" : ""}`} onClick={() => pick(p.id)}>
                  <span className="fm-thumb" style={mediaUrl(p.imageUrl) ? { backgroundImage: `url(${mediaUrl(p.imageUrl)})` } : undefined} />
                  <span className="fm-item-main">
                    <strong>{p.name}</strong>
                    <span className="o-muted">{p.category.name}</span>
                  </span>
                  {p.cost ? (
                    <span className="fm-item-cost">
                      <span>{formatVnd(p.cost.M)}</span>
                      <Badge tone={ratioTone(r)}>{pct(r)}</Badge>
                    </span>
                  ) : (
                    <Badge>Chưa có CT</Badge>
                  )}
                </button>
              );
            })}
          </aside>

          {/* ── Công thức của món đang chọn ── */}
          <section className="o-card fm-editor">
            {!selected ? (
              <EmptyState title="Chọn một món để xem / sửa công thức" hint="Giá vốn (COST) mỗi ly tính sẵn theo size từ giá nhập nguyên liệu." />
            ) : (
              <>
                <div className="o-card-head">
                  <h3>{selected.name}</h3>
                  {owner && (
                    <span className="o-inline">
                      <Button size="sm" icon={Scaling} onClick={autoSizes} disabled={!lines.length} title="S = 75%, L = 130% lượng M; ly & ống hút giữ nguyên">Tự tính S / L từ M</Button>
                      <Button size="sm" icon={Undo2} onClick={() => setLines(saved)} disabled={!dirty || saving}>Huỷ thay đổi</Button>
                      <Button size="sm" variant="primary" icon={Save} onClick={() => void save()} disabled={!dirty || saving}>{saving ? "Đang lưu…" : "Lưu công thức"}</Button>
                    </span>
                  )}
                </div>
                <div className="o-stack" style={{ padding: 12 }}>
                  {msg && <Alert tone="info">{msg}</Alert>}
                  {dirty && <Alert tone="warning">Có thay đổi chưa lưu — COST bên dưới đã tính theo bản đang sửa.</Alert>}
                  {noPrice.length > 0 && (
                    <Alert tone="warning">Chưa có giá nhập: {noPrice.map((l) => itemById.get(l.itemId as number)?.name).join(", ")} — vào Kho › Tồn kho để nhập giá, nếu không COST sẽ thiếu.</Alert>
                  )}
                </div>
                <div className="o-list-wrap">
                  <table className="o-list fm-table">
                    <thead>
                      <tr>
                        <th>Nguyên liệu</th>
                        {SIZES.map((s) => <th key={s} className="num">{s}</th>)}
                        <th>Đơn vị</th>
                        <th className="num">Giá / đv</th>
                        {SIZES.map((s) => <th key={`c${s}`} className="num">COST {s}</th>)}
                        {owner && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => {
                        const it = l.itemId === "" ? undefined : itemById.get(l.itemId);
                        const unit = it?.recipeUnit ?? it?.unit ?? "";
                        const unitPrice = it && it.unitCostPrice ? it.unitCostPrice / (it.recipePerUnit || 1) : 0;
                        return (
                          <tr key={i}>
                            <td>
                              {owner ? (
                                <select className="o-input" value={l.itemId} onChange={(e) => setLine(i, { itemId: e.target.value ? Number(e.target.value) : "" })}>
                                  <option value="">Chọn nguyên liệu…</option>
                                  {items
                                    .filter((x) => x.id === l.itemId || !lines.some((o) => o.itemId === x.id))
                                    .map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                              ) : (
                                it?.name
                              )}
                            </td>
                            {SIZES.map((s) => (
                              <td key={s} className="num">
                                {owner ? (
                                  <input
                                    className="o-input o-input-num"
                                    inputMode="decimal"
                                    value={l[s]}
                                    placeholder={s === "M" ? "" : l.M}
                                    onChange={(e) => setLine(i, { [s]: e.target.value } as Partial<Line>)}
                                    aria-label={`Lượng size ${s}`}
                                  />
                                ) : (
                                  l[s] || l.M
                                )}
                              </td>
                            ))}
                            <td className="o-muted" title={it ? `1 ${it.unit} = ${it.recipePerUnit} ${unit}` : undefined}>{unit}</td>
                            <td className="num o-muted">{unitPrice ? `${formatVnd(Math.round(unitPrice * 100) / 100)}` : "—"}</td>
                            {SIZES.map((s) => <td key={`c${s}`} className="num">{formatVnd(Math.round(lineCost(l, s)))}</td>)}
                            {owner && (
                              <td>
                                <Button size="sm" variant="link" icon={Trash2} aria-label="Bỏ nguyên liệu" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {lines.length === 0 && (
                        <tr><td colSpan={owner ? 10 : 9} className="o-muted">Chưa có nguyên liệu — món này bán ra sẽ không trừ kho.</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="o-total-row">
                        <td colSpan={6}>COST mỗi ly</td>
                        {SIZES.map((s) => <td key={s} className="num fm-cost">{formatVnd(Math.round(total[s]))}</td>)}
                        {owner && <td />}
                      </tr>
                      <tr>
                        <td colSpan={6} className="o-muted">Giá bán</td>
                        {SIZES.map((s) => {
                          const price = priceOf(selected, s);
                          return <td key={s} className="num">{formatVnd(price)}</td>;
                        })}
                        {owner && <td />}
                      </tr>
                      <tr>
                        <td colSpan={6} className="o-muted">% giá vốn · lãi gộp</td>
                        {SIZES.map((s) => {
                          const price = priceOf(selected, s);
                          if (!price || !total[s]) return <td key={s} className="num o-muted">—</td>;
                          const r = total[s] / price;
                          return (
                            <td key={s} className="num">
                              <Badge tone={ratioTone(r)}>{pct(r)}</Badge>
                              <div className="o-muted">lãi {formatVnd(Math.round(price - total[s]))}</div>
                            </td>
                          );
                        })}
                        {owner && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {owner && (
                  <div style={{ padding: 12 }}>
                    <Button size="sm" icon={Plus} onClick={() => setLines((ls) => [...ls, { itemId: "", S: "", M: "", L: "", note: "" }])}>Thêm nguyên liệu</Button>
                    <p className="o-muted" style={{ margin: "8px 0 0" }}>
                      Lượng tính theo đơn vị công thức của nguyên liệu (g, ml, cái). S / L để trống = dùng lượng M. Bán hàng tự trừ kho theo đúng size; giá vốn món (size M) cập nhật khi lưu và khi giá nhập thay đổi.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
