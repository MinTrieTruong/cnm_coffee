/**
 * Thực đơn › AI phác thảo món mới — từ từ khóa khách tìm mà quán chưa có, hoặc ý tưởng nhân viên gõ.
 * AI đưa 2–3 phương án (định mức chọn từ kho thật); giá vốn / giá gợi ý / lãi gộp / cảnh báo do HỆ THỐNG tính.
 * Chọn một phương án → sửa định mức, tên, giá (mỗi lần sửa gọi /evaluate) → "Gửi đề xuất" vào luồng duyệt có sẵn.
 * API: POST /api/menu-proposals/ai-draft · /evaluate · /menu-proposals (backend routes/menuProposals.ts).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, Field, Modal, errMsg, formatVnd, type Tone } from "../../components/erp";
import "../../styles/menu-draft.css";

type Temps = "BOTH" | "ICED" | "HOT" | "NONE";
type Size = "S" | "M" | "L";
type Sizes<T> = Record<Size, T>;
type NewIngredient = { name: string; recipeUnit: string; estCostPerRecipeUnit: number; note: string | null };
export type DraftLine = { itemId: number | null; newIngredient: NewIngredient | null; qtyS: number | null; qtyM: number; qtyL: number | null; recipeUnit: string; role: string };
type EvalLine = DraftLine & { name: string; inStock: boolean | null; estimated: boolean; cost: Sizes<number> };
type Warning = { level: "warn" | "danger"; text: string };
type ToBuy = { name: string; kind: "OUT_OF_STOCK" | "NEW"; recipeUnit: string; estCostPerRecipeUnit: number | null; note: string | null };
export type Evaluated = {
  name: string; description: string; categoryId: number; temps: Temps; hasSizes: boolean; steps: string[]; whyFits: string; risk: string | null;
  lines: EvalLine[]; categoryName: string | null; costs: Sizes<number>; estimated: boolean;
  suggestedPrice: Sizes<number | null>; margin: Sizes<number | null>;
  categoryPriceRange: { min: number; max: number; count: number; costRatio: number; scope: "CATEGORY" | "ALL" } | null;
  volumeMl: Sizes<number> | null; toBuy: ToBuy[]; warnings: Warning[];
  nutrition: { kcal: number; caffeineMg: number; sugarG: number; complete: boolean } | null;
};
type Ingredient = { id: number; name: string; category: string | null; recipeUnit: string; costPerRecipeUnit: number; inStockAtStore: boolean };
type DraftResp = {
  understood: string; storeId: number; options: Evaluated[]; samples: string[];
  demand: { display: string; searchers: number; searches: number; days: number } | null;
  ingredients: Ingredient[]; categories: { id: number; name: string; parentId: number | null }[];
  model: string; tokensIn: number; tokensOut: number; latencyMs: number;
};

export const TEMP_TEXT: Record<Temps, string> = { BOTH: "Nóng & đá", ICED: "Chỉ đá", HOT: "Chỉ nóng", NONE: "Không áp dụng" };
const MIN_MARGIN = 0.6;
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const marginTone = (m: number | null): Tone => (m == null ? "neutral" : m >= 0.65 ? "success" : m >= MIN_MARGIN ? "warning" : "danger");
const qtyText = (n: number | null) => (n == null ? "" : String(Math.round(n * 100) / 100));
/** "Nước Cốt Dừa (Lon 400ml)" → "Nước Cốt Dừa": bỏ quy cách đóng gói cuối tên cho bảng gọn */
export const shortName = (n: string) => n.replace(/\s*\([^()]*\d[^()]*\)\s*$|\s*\((Cái|Kg|Hộp|Lon|Chai|Hũ|Bịch|Bao)\)\s*$/i, "") || n;
const sizesOf = (o: { hasSizes: boolean }) => (o.hasSizes ? (["S", "M", "L"] as const) : (["M"] as const));

/** Trạng thái bật / tắt (Pha chế cũng đọc được, khác /api/ai/settings chỉ dành cho quản lý) */
export function useMenuDraftEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    staffApi<{ enabled: boolean }>("/api/menu-proposals/ai-draft/status")
      .then((r) => alive && setOn(r.enabled))
      .catch(() => alive && setOn(false));
    return () => {
      alive = false;
    };
  }, []);
  return on;
}

export type DraftSeed = { term?: string; display?: string; searchers?: number; storeId?: number | null };

export function MenuDraftModal({ seed, onClose, onDone }: { seed: DraftSeed; onClose: () => void; onDone: () => void }) {
  const [idea, setIdea] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resp, setResp] = useState<DraftResp | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const fromTerm = !!seed.term;

  async function draft(withNote = false) {
    setBusy(true);
    setErr(null);
    try {
      const r = await staffApi<DraftResp>("/api/menu-proposals/ai-draft", {
        method: "POST",
        body: JSON.stringify({ term: seed.term, idea: fromTerm ? undefined : idea, note: withNote ? note : undefined, storeId: seed.storeId ?? undefined }),
      });
      setResp(r);
      setChosen(null);
    } catch (e) {
      setErr(errMsg(e, "AI chưa phác thảo được"));
    } finally {
      setBusy(false);
    }
  }

  // Từ khóa khách tìm: phác thảo luôn khi mở
  const started = useRef(false);
  useEffect(() => {
    if (fromTerm && !started.current) {
      started.current = true;
      void draft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = fromTerm ? `AI phác thảo món — "${seed.display ?? seed.term}"` : "AI phác thảo món mới";
  if (resp && chosen != null) {
    return <DraftEditor resp={resp} option={resp.options[chosen]} index={chosen} seed={seed} title={title} onBack={() => setChosen(null)} onClose={onClose} onDone={onDone} />;
  }

  return (
    <Modal
      title={title}
      size="lg"
      onClose={onClose}
      footer={
        resp ? (
          <div className="md-redo">
            <input className="o-input" placeholder='Ghi chú để phác thảo lại, VD "ít ngọt hơn, không dùng kem"' value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
            <Button icon={RefreshCw} onClick={() => void draft(true)} disabled={busy}>{busy ? "Đang phác thảo…" : "Phác thảo lại"}</Button>
          </div>
        ) : !fromTerm ? (
          <>
            <Button onClick={onClose}>Huỷ</Button>
            <Button variant="primary" icon={Sparkles} onClick={() => void draft()} disabled={busy || idea.trim().length < 3}>{busy ? "AI đang phác thảo…" : "Phác thảo"}</Button>
          </>
        ) : undefined
      }
    >
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        {!fromTerm && !resp && (
          <Field label="Ý tưởng món" full>
            <textarea className="o-input" rows={3} autoFocus value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="VD: món đá xay vị sầu riêng cho mùa hè" disabled={busy} />
          </Field>
        )}
        {busy && (
          <div className="md-loading" role="status">
            <Sparkles size={18} aria-hidden /> AI đang chọn nguyên liệu trong kho và định lượng… (khoảng 10–20 giây)
          </div>
        )}
        {resp && (
          <>
            <div className="md-head">
              <span className="md-ai-tag"><Sparkles size={13} aria-hidden /> AI phác thảo · giá vốn do hệ thống tính</span>
              <p className="md-understood"><b>AI hiểu:</b> {resp.understood}</p>
              <p className="o-muted md-meta">
                {resp.demand && resp.demand.searchers > 0 && <>{resp.demand.searchers} khách tìm "{resp.demand.display}" trong {resp.demand.days} ngày · </>}
                Món mẫu định lượng: {resp.samples.join(", ")} · {(resp.latencyMs / 1000).toFixed(1)} s · {resp.tokensIn + resp.tokensOut} token
              </p>
            </div>
            <div className="md-cards">
              {resp.options.map((o, i) => (
                <OptionCard key={i} o={o} action={<Button variant="primary" size="sm" onClick={() => setChosen(i)}>Chọn & sửa</Button>} />
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Thẻ một phương án: định mức, giá vốn, giá gợi ý, lãi gộp, cần mua, cảnh báo, cách pha */
export function OptionCard({ o, action, compact }: { o: Evaluated; action?: React.ReactNode; compact?: boolean }) {
  const sizes = sizesOf(o);
  const est = o.estimated ? <span className="md-est" title="Có nguyên liệu mới — giá do AI ước tính">ước tính</span> : null;
  return (
    <article className={compact ? "md-card is-compact" : "md-card"}>
      {!compact && (
        <header>
          <h3>{o.name}</h3>
          <div className="o-inline md-tags">
            {o.categoryName && <Badge>{o.categoryName}</Badge>}
            <Badge tone="info">{TEMP_TEXT[o.temps]}</Badge>
            {!o.hasSizes && <Badge>1 loại</Badge>}
          </div>
          {o.description && <p className="md-desc">{o.description}</p>}
        </header>
      )}
      {!compact && (
      <>
      <div className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              <th>Nguyên liệu</th>
              {sizes.map((s) => <th key={s} className="num">{o.hasSizes ? s : "Lượng"}</th>)}
              <th className="num">đ / {o.hasSizes ? "ly M" : "phần"}</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l, i) => (
              <tr key={i}>
                <td title={l.name}>
                  {shortName(l.name)}
                  {l.newIngredient && <span className="md-new">mới</span>}
                  {!l.newIngredient && l.inStock === false && <span className="md-out">hết ở CN</span>}
                </td>
                {sizes.map((s) => <td key={s} className="num">{qtyText(s === "S" ? l.qtyS : s === "L" ? l.qtyL : l.qtyM)}{s === "M" || !o.hasSizes ? ` ${l.recipeUnit}` : ""}</td>)}
                <td className="num">{formatVnd(l.cost.M)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="md-money">
        <div><dt>Giá vốn {est}</dt><dd>{sizes.map((s) => <span key={s}>{o.hasSizes && <small>{s}</small>}{formatVnd(o.costs[s])}</span>)}</dd></div>
        <div><dt>Giá gợi ý</dt><dd>{sizes.map((s) => <span key={s}>{o.hasSizes && <small>{s}</small>}{o.suggestedPrice[s] != null ? formatVnd(o.suggestedPrice[s]!) : "—"}</span>)}</dd></div>
        <div><dt>Lãi gộp</dt><dd>{sizes.map((s) => <span key={s}><Badge tone={marginTone(o.margin[s])}>{o.hasSizes ? `${s} ` : ""}{pct(o.margin[s])}</Badge></span>)}</dd></div>
      </dl>
      </>
      )}
      {o.categoryPriceRange && (
        <p className="o-muted md-range">
          {o.categoryPriceRange.scope === "CATEGORY" ? "Cùng danh mục" : "Các món cùng loại"} ({o.categoryPriceRange.count} món): {formatVnd(o.categoryPriceRange.min)} – {formatVnd(o.categoryPriceRange.max)}, giá vốn ≈ {pct(o.categoryPriceRange.costRatio)} giá bán
        </p>
      )}
      {o.nutrition && (
        <p className="o-muted md-range">
          Ước tính {o.hasSizes ? "size M" : "1 phần"}: {o.nutrition.kcal} kcal · {o.nutrition.caffeineMg} mg caffeine · {o.nutrition.sugarG} g đường{!o.nutrition.complete && " (thiếu dữ liệu một số nguyên liệu)"}
        </p>
      )}
      {o.toBuy.length > 0 && (
        <div className="md-buy">
          <b>Cần mua thêm:</b>{" "}
          {o.toBuy.map((t, i) => (
            <span key={i}>
              {i > 0 && ", "}
              {t.name} {t.kind === "NEW" ? <span className="o-muted">(mới{t.estCostPerRecipeUnit ? `, ~${formatVnd(t.estCostPerRecipeUnit)}/${t.recipeUnit}` : ""})</span> : <span className="o-muted">(hết ở chi nhánh)</span>}
            </span>
          ))}
        </div>
      )}
      {o.warnings.length > 0 && (
        <ul className="md-warns">
          {o.warnings.map((w, i) => <li key={i} className={w.level === "danger" ? "is-danger" : undefined}>{w.text}</li>)}
        </ul>
      )}
      {!compact && o.steps.length > 0 && (
        <details className="md-steps">
          <summary><ChevronDown size={14} aria-hidden /> Cách pha ({o.steps.length} bước)</summary>
          <ol>{o.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </details>
      )}
      {!compact && o.whyFits && <p className="md-why"><b>Vì sao hợp:</b> {o.whyFits}</p>}
      {!compact && o.risk && <p className="md-risk"><b>Rủi ro:</b> {o.risk}</p>}
      {action && <div className="md-card-foot">{action}</div>}
    </article>
  );
}

/* ═══════════ Sửa phương án đã chọn ═══════════ */

type EditLine = { key: number; itemId: number | null; newName: string; newUnit: string; newCost: string; qtyS: string; qtyM: string; qtyL: string };
let lineKey = 0;
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function DraftEditor({ resp, option, index, seed, title, onBack, onClose, onDone }: {
  resp: DraftResp; option: Evaluated; index: number; seed: DraftSeed; title: string; onBack: () => void; onClose: () => void; onDone: () => void;
}) {
  const [name, setName] = useState(option.name);
  const [description, setDescription] = useState(option.description);
  const [categoryId, setCategoryId] = useState(option.categoryId);
  const [temps, setTemps] = useState<Temps>(option.temps);
  const [hasSizes, setHasSizes] = useState(option.hasSizes);
  const [lines, setLines] = useState<EditLine[]>(() =>
    option.lines.map((l) => ({
      key: ++lineKey, itemId: l.itemId, newName: l.newIngredient?.name ?? "", newUnit: l.newIngredient?.recipeUnit ?? l.recipeUnit,
      newCost: l.newIngredient ? String(l.newIngredient.estCostPerRecipeUnit) : "", qtyS: qtyText(l.qtyS), qtyM: qtyText(l.qtyM), qtyL: qtyText(l.qtyL),
    })),
  );
  const [prices, setPrices] = useState<Sizes<string>>({
    S: option.suggestedPrice.S != null ? String(option.suggestedPrice.S) : "",
    M: option.suggestedPrice.M != null ? String(option.suggestedPrice.M) : "",
    L: option.suggestedPrice.L != null ? String(option.suggestedPrice.L) : "",
  });
  const [touchedPrice, setTouchedPrice] = useState(false);
  const [ev, setEv] = useState<Evaluated>(option);
  const [evaluating, setEvaluating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const owner = isOwnerRole(getStaffInfo()?.role);
  const ingredients = useMemo(() => [...resp.ingredients].sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name)), [resp.ingredients]);
  const byId = useMemo(() => new Map(resp.ingredients.map((i) => [i.id, i])), [resp.ingredients]);

  const payloadLines = (): DraftLine[] =>
    lines
      .filter((l) => l.itemId != null || l.newName.trim())
      .map((l) => ({
        itemId: l.itemId,
        newIngredient: l.itemId == null ? { name: l.newName.trim(), recipeUnit: l.newUnit || "g", estCostPerRecipeUnit: num(l.newCost) ?? 0, note: null } : null,
        qtyS: hasSizes ? num(l.qtyS) : null,
        qtyM: num(l.qtyM) ?? 0,
        qtyL: hasSizes ? num(l.qtyL) : null,
        recipeUnit: l.itemId != null ? byId.get(l.itemId)?.recipeUnit ?? "" : l.newUnit,
        role: "other",
      }));

  // Mỗi lần sửa → tính lại giá vốn / giá gợi ý / cảnh báo ở server (debounce)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setEvaluating(true);
      try {
        const r = await staffApi<Evaluated>("/api/menu-proposals/evaluate", {
          method: "POST",
          body: JSON.stringify({ storeId: resp.storeId, option: { name, description, categoryId, temps: hasSizes ? temps : "NONE", hasSizes, lines: payloadLines(), steps: option.steps, whyFits: option.whyFits, risk: option.risk } }),
        });
        setEv(r);
        // Chưa sửa giá tay → giá theo gợi ý mới
        if (!touchedPrice) setPrices({ S: r.suggestedPrice.S != null ? String(r.suggestedPrice.S) : "", M: r.suggestedPrice.M != null ? String(r.suggestedPrice.M) : "", L: r.suggestedPrice.L != null ? String(r.suggestedPrice.L) : "" });
        setErr(null);
      } catch (e) {
        setErr(errMsg(e));
      } finally {
        setEvaluating(false);
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, categoryId, temps, hasSizes, lines]);

  const setLine = (key: number, patch: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const priceNum = (s: Size) => {
    const v = Number(prices[s].replace(/\D/g, ""));
    return v > 0 ? v : null;
  };
  const marginAt = (s: Size) => {
    const p = priceNum(s);
    return p ? 1 - ev.costs[s] / p : null;
  };
  const dangers = ev.warnings.filter((w) => w.level === "danger");

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await staffApi("/api/menu-proposals", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(), description: description.trim(), categoryId, temps: hasSizes ? temps : "NONE", hasSizes,
          formulaDraft: payloadLines(), steps: option.steps,
          suggestedPrice: priceNum("M") ?? undefined, priceS: hasSizes ? priceNum("S") ?? undefined : undefined, priceL: hasSizes ? priceNum("L") ?? undefined : undefined,
          searchTerm: seed.term, storeId: owner ? resp.storeId : undefined,
          aiDraft: { understood: resp.understood, demand: resp.demand, chosen: index, options: resp.options, final: ev, model: resp.model, tokensIn: resp.tokensIn, tokensOut: resp.tokensOut },
        }),
      });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  const sizes = hasSizes ? (["S", "M", "L"] as const) : (["M"] as const);
  return (
    <Modal
      title={title}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onBack} disabled={busy}>← Các phương án</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || evaluating || !name.trim() || !lines.length || dangers.some((d) => /trùng món/.test(d.text))}>
            {busy ? "Đang gửi…" : "Gửi đề xuất"}
          </Button>
        </>
      }
    >
      <div className="o-stack md-edit">
        {err && <Alert>{err}</Alert>}
        <span className="md-ai-tag"><Sparkles size={13} aria-hidden /> AI phác thảo · bạn chỉnh trước khi gửi · giá vốn do hệ thống tính</span>
        <div className="md-form">
          <label className="md-fld"><span>Tên món *</span><input className="o-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="md-fld"><span>Danh mục</span>
            <select className="o-input" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
              {!resp.categories.some((c) => c.id === categoryId) && <option value={categoryId}>—</option>}
              {resp.categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "  · " : ""}{c.name}</option>)}
            </select>
          </label>
          <label className="md-fld"><span>Size</span>
            <select className="o-input" value={hasSizes ? "1" : "0"} onChange={(e) => setHasSizes(e.target.value === "1")}>
              <option value="1">S / M / L</option>
              <option value="0">1 loại (bánh, đồ ăn)</option>
            </select>
          </label>
          {hasSizes && (
            <label className="md-fld"><span>Nóng / đá</span>
              <select className="o-input" value={temps} onChange={(e) => setTemps(e.target.value as Temps)}>
                {(["BOTH", "ICED", "HOT"] as const).map((t) => <option key={t} value={t}>{TEMP_TEXT[t]}</option>)}
              </select>
            </label>
          )}
          <label className="md-fld is-full"><span>Mô tả</span><textarea className="o-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        </div>

        <div className="md-table-wrap">
          <table className="md-table md-edit-table">
            <thead>
              <tr>
                <th>Nguyên liệu</th>
                {sizes.map((s) => <th key={s} className="num">{hasSizes ? s : "Lượng"}</th>)}
                <th>Đơn vị</th>
                <th className="num">đ / {hasSizes ? "ly M" : "phần"}</th>
                <th aria-label="Bỏ dòng" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const it = l.itemId != null ? byId.get(l.itemId) : null;
                const evLine = ev.lines.find((x) => (l.itemId != null ? x.itemId === l.itemId : x.newIngredient && x.name === l.newName.trim()));
                return (
                  <tr key={l.key}>
                    <td className="md-ingr">
                      <select className="o-input" value={l.itemId ?? "new"} aria-label="Nguyên liệu" onChange={(e) => setLine(l.key, e.target.value === "new" ? { itemId: null } : { itemId: Number(e.target.value) })}>
                        {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}{i.inStockAtStore ? "" : " (hết ở CN)"}</option>)}
                        <option value="new">+ Nguyên liệu mới (chưa có trong kho)…</option>
                      </select>
                      {l.itemId == null && (
                        <div className="md-new-row">
                          <input className="o-input" placeholder="Tên nguyên liệu mới" value={l.newName} onChange={(e) => setLine(l.key, { newName: e.target.value })} />
                          <input className="o-input md-num" inputMode="decimal" placeholder="đ / đơn vị" title="Giá ước tính trên 1 đơn vị công thức" value={l.newCost} onChange={(e) => setLine(l.key, { newCost: e.target.value })} />
                        </div>
                      )}
                    </td>
                    {sizes.map((s) => {
                      const k = s === "S" ? "qtyS" : s === "L" ? "qtyL" : "qtyM";
                      return (
                        <td key={s} className="num md-qty" data-size={hasSizes ? s : "Lượng"}>
                          <input className="o-input md-num" inputMode="decimal" aria-label={`Lượng size ${s}`} value={l[k]} onChange={(e) => setLine(l.key, { [k]: e.target.value } as Partial<EditLine>)} />
                        </td>
                      );
                    })}
                    <td className="md-unit-cell">
                      {it ? it.recipeUnit : (
                        <select className="o-input md-unit" value={l.newUnit} aria-label="Đơn vị" onChange={(e) => setLine(l.key, { newUnit: e.target.value })}>
                          {["g", "ml", "cái"].map((u) => <option key={u}>{u}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="num md-cost">{evLine ? formatVnd(evLine.cost.M) : "—"}{evLine?.estimated && <span className="md-est">ước tính</span>}</td>
                    <td><button type="button" className="md-del" aria-label="Bỏ dòng" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 size={15} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <Button size="sm" icon={Plus} onClick={() => setLines((ls) => [...ls, { key: ++lineKey, itemId: ingredients[0]?.id ?? null, newName: "", newUnit: "g", newCost: "", qtyS: "", qtyM: "", qtyL: "" }])}>Thêm dòng</Button>
        </div>

        <div className="md-price-grid" aria-busy={evaluating}>
          {sizes.map((s) => (
            <div key={s} className="md-price">
              <div className="o-muted">{hasSizes ? `Size ${s}` : "Giá bán"}</div>
              <div>Giá vốn <b>{formatVnd(ev.costs[s])}</b>{ev.estimated && <span className="md-est">ước tính</span>}</div>
              <label>
                <span>Giá bán</span>
                <input className="o-input" inputMode="numeric" value={prices[s]} onChange={(e) => { setTouchedPrice(true); setPrices((p) => ({ ...p, [s]: e.target.value })); }} />
              </label>
              <div className="md-price-foot">
                <span className="o-muted">gợi ý {ev.suggestedPrice[s] != null ? formatVnd(ev.suggestedPrice[s]!) : "—"}</span>
                <Badge tone={marginTone(marginAt(s))}>lãi {pct(marginAt(s))}</Badge>
              </div>
            </div>
          ))}
        </div>
        {evaluating && <p className="o-muted md-range">Đang tính lại…</p>}
        <OptionCard o={ev} compact />
      </div>
    </Modal>
  );
}
