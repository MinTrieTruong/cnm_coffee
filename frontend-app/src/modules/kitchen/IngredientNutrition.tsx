/**
 * Thực đơn › Dinh dưỡng nguyên liệu — dinh dưỡng từng nguyên liệu (trên 100 g/ml hoặc 1 cái) để tính dinh dưỡng món từ công thức.
 * "AI gợi ý cho các dòng trống" điền sẵn (tô tím, kèm giả định + độ tin; có cảnh báo thì tô vàng) — Chủ chuỗi kiểm tra rồi "Duyệt".
 * Chưa duyệt thì không dùng cho khách. Sửa tay một ô → thành giá trị người nhập, cần duyệt lại.
 * API: /api/nutrition/ingredients (backend routes/nutrition.ts).
 */
import { useMemo, useState } from "react";
import { CheckCheck, Sparkles } from "lucide-react";
import { Alert, Badge, Button, errMsg } from "../../components/erp";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { useResource } from "../shared";
import "../../styles/nutrition-admin.css";

type Allergen = "milk" | "nuts" | "peanut" | "gluten" | "egg" | "soy";
type Nutrition = {
  basis: "PER_100" | "PER_UNIT"; kcal: number | null; fatG: number | null; satFatG: number | null; sugarG: number | null; proteinG: number | null; carbG: number | null;
  caffeineMg: number | null; allergens: Allergen[] | null; isVegan: boolean; isSugarSource: boolean; source: "AI" | "MANUAL"; confidence: number | null;
  note: string | null; warnings: string[] | null; approved: boolean; approvedAt: string | null;
};
type Item = { id: number; name: string; category: string | null; unit: string | null; recipeUnit: string | null; usedBy: number; nutrition: Nutrition | null };
type Resp = { aiEnabled: boolean; completeProductSizes: number; items: Item[] };

const ALLERGENS: { id: Allergen; label: string }[] = [
  { id: "milk", label: "Sữa" }, { id: "nuts", label: "Hạt" }, { id: "peanut", label: "Đậu phộng" },
  { id: "gluten", label: "Gluten" }, { id: "egg", label: "Trứng" }, { id: "soy", label: "Đậu nành" },
];
const NUMS: { k: "kcal" | "fatG" | "sugarG" | "proteinG" | "caffeineMg"; label: string }[] = [
  { k: "kcal", label: "kcal" }, { k: "fatG", label: "Béo (g)" }, { k: "sugarG", label: "Đường (g)" }, { k: "proteinG", label: "Đạm (g)" }, { k: "caffeineMg", label: "Caffeine (mg)" },
];
type Filter = "all" | "pending" | "approved" | "empty";

export function IngredientNutrition() {
  const res = useResource<Resp | null>("/api/nutrition/ingredients", null);
  const canEdit = isOwnerRole(getStaffInfo()?.role);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const items = res.data?.items ?? [];

  const list = useMemo(
    () => items.filter((i) => (filter === "pending" ? i.nutrition && !i.nutrition.approved : filter === "approved" ? i.nutrition?.approved : filter === "empty" ? !i.nutrition : true)),
    [items, filter],
  );
  const empty = items.filter((i) => !i.nutrition);
  const pending = items.filter((i) => i.nutrition && !i.nutrition.approved);

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ tone: "info", text });
      await res.reload();
    } catch (e) {
      setMsg({ tone: "danger", text: errMsg(e, "Lỗi") });
    } finally {
      setBusy(null);
    }
  }

  const suggest = (ids: number[]) =>
    run("suggest", async () => {
      let saved = 0;
      for (let i = 0; i < ids.length; i += 20) {
        const r = await staffApi<{ saved: number }>("/api/nutrition/ingredients/suggest", { method: "POST", body: JSON.stringify({ itemIds: ids.slice(i, i + 20) }) });
        saved += r.saved;
      }
      return `AI đã điền ${saved} nguyên liệu (tô tím). Kiểm tra số liệu và giả định rồi bấm "Duyệt".`;
    });

  const approve = () =>
    run("approve", async () => {
      const r = await staffApi<{ approved: number; productsRecomputed: number }>("/api/nutrition/ingredients/approve", { method: "POST", body: JSON.stringify({ itemIds: [...sel] }) });
      setSel(new Set());
      return `Đã duyệt ${r.approved} nguyên liệu, tính lại dinh dưỡng ${r.productsRecomputed} món.`;
    });

  async function save(item: Item, patch: Partial<Nutrition>) {
    try {
      await staffApi(`/api/nutrition/ingredients/${item.id}`, { method: "PUT", body: JSON.stringify(patch) });
      await res.reload();
    } catch (e) {
      setMsg({ tone: "danger", text: errMsg(e, "Không lưu được") });
    }
  }

  const toggle = (id: number) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="nut-page">
      <div className="nut-toolbar">
        <div className="nut-filters" role="group" aria-label="Lọc">
          {([["all", `Tất cả (${items.length})`], ["empty", `Chưa có (${empty.length})`], ["pending", `Chờ duyệt (${pending.length})`], ["approved", "Đã duyệt"]] as [Filter, string][]).map(([f, label]) => (
            <button key={f} type="button" className={filter === f ? "is-on" : undefined} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
        {canEdit && res.data?.aiEnabled && empty.length > 0 && (
          <Button icon={Sparkles} onClick={() => void suggest(empty.map((i) => i.id))} disabled={!!busy}>{busy === "suggest" ? "AI đang gợi ý…" : `AI gợi ý cho ${empty.length} dòng trống`}</Button>
        )}
        {canEdit && res.data?.aiEnabled && sel.size > 0 && [...sel].some((id) => !items.find((i) => i.id === id)?.nutrition?.approved) && (
          <Button icon={Sparkles} onClick={() => void suggest([...sel])} disabled={!!busy}>AI gợi ý lại dòng đã chọn</Button>
        )}
        {canEdit && (
          <Button variant="primary" icon={CheckCheck} onClick={() => void approve()} disabled={!sel.size || !!busy}>{busy === "approve" ? "Đang duyệt…" : `Duyệt${sel.size ? ` (${sel.size})` : ""}`}</Button>
        )}
      </div>
      <p className="o-muted nut-help">
        Số liệu trên <b>100 g / ml</b> đơn vị công thức (hoặc <b>1 cái</b>). Cà phê bột, lá trà: tính phần tan vào đồ uống. Vật tư (ly, ống hút) và đá: để 0.
        Dinh dưỡng món = công thức × bảng này; {res.data?.completeProductSizes ?? 0} món-size đã đủ dữ liệu. Chỉ nguyên liệu <b>đã duyệt</b> mới dùng cho khách.
      </p>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {res.error && <Alert>{res.error}</Alert>}

      <div className="o-list-wrap">
        <table className="o-list nut-table">
          <thead>
            <tr>
              {canEdit && (
                <th className="nut-sel">
                  <input type="checkbox" aria-label="Chọn tất cả dòng chờ duyệt" checked={pending.length > 0 && pending.every((i) => sel.has(i.id))} onChange={(e) => setSel(e.target.checked ? new Set(pending.map((i) => i.id)) : new Set())} />
                </th>
              )}
              <th>Nguyên liệu</th>
              <th>Tính trên</th>
              {NUMS.map((n) => <th key={n.k} className="num">{n.label}</th>)}
              <th>Dị ứng</th>
              <th>Chay</th>
              <th title="Nguyên liệu tạo ngọt: giảm theo mức đường khách chọn">Tạo ngọt</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => {
              const n = i.nutrition;
              const ai = n?.source === "AI" && !n.approved;
              const warn = !!n?.warnings?.length;
              return (
                <tr key={i.id} className={[ai ? "is-ai" : "", warn && !n?.approved ? "is-warn" : ""].filter(Boolean).join(" ")}>
                  {canEdit && <td className="nut-sel"><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Chọn ${i.name}`} disabled={!n} /></td>}
                  <td className="nut-name">
                    <b>{i.name}</b>
                    <span className="o-muted">{i.category ?? ""} · {i.recipeUnit ?? i.unit ?? ""} · {i.usedBy} món</span>
                    {n?.note && <span className="nut-note">{ai && <Sparkles size={11} aria-hidden />} {n.note}</span>}
                    {warn && !n?.approved && n?.warnings?.map((w, k) => <span key={k} className="nut-warn">⚠ {w}</span>)}
                  </td>
                  <td>
                    <select className="o-input nut-basis" value={n?.basis ?? "PER_100"} disabled={!canEdit} onChange={(e) => void save(i, { basis: e.target.value as Nutrition["basis"] })}>
                      <option value="PER_100">100 g/ml</option>
                      <option value="PER_UNIT">1 cái</option>
                    </select>
                  </td>
                  {NUMS.map((f) => (
                    <td key={f.k} className="num">
                      <NumCell value={n?.[f.k] ?? null} disabled={!canEdit} onSave={(v) => void save(i, { [f.k]: v })} label={`${f.label} ${i.name}`} />
                    </td>
                  ))}
                  <td>
                    <div className="nut-chips">
                      {ALLERGENS.map((a) => {
                        const on = !!n?.allergens?.includes(a.id);
                        return (
                          <button key={a.id} type="button" className={on ? "is-on" : undefined} disabled={!canEdit} aria-pressed={on}
                            onClick={() => void save(i, { allergens: on ? (n?.allergens ?? []).filter((x) => x !== a.id) : [...(n?.allergens ?? []), a.id] })}>
                            {a.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td><input type="checkbox" checked={!!n?.isVegan} disabled={!canEdit} onChange={(e) => void save(i, { isVegan: e.target.checked })} aria-label={`Thuần chay ${i.name}`} /></td>
                  <td><input type="checkbox" checked={!!n?.isSugarSource} disabled={!canEdit} onChange={(e) => void save(i, { isSugarSource: e.target.checked })} aria-label={`Tạo ngọt ${i.name}`} /></td>
                  <td>
                    {!n ? <Badge>Chưa có</Badge> : n.approved ? <Badge tone="success">Đã duyệt</Badge> : n.source === "AI" ? <Badge tone="info">AI {n.confidence != null ? `${Math.round(n.confidence * 100)}%` : ""} · chờ duyệt</Badge> : <Badge tone="warning">Chờ duyệt</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Ô số sửa tại chỗ: lưu khi rời ô / Enter (trống = chưa biết) */
function NumCell({ value, disabled, onSave, label }: { value: number | null; disabled: boolean; onSave: (v: number | null) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));
  const commit = () => {
    if (draft == null) return;
    const v = draft.trim() === "" ? null : Number(draft.replace(",", "."));
    setDraft(null);
    if (v === value || (v != null && (!Number.isFinite(v) || v < 0))) return;
    onSave(v);
  };
  return (
    <input className="o-input nut-num" inputMode="decimal" value={shown} disabled={disabled} aria-label={label} placeholder="?"
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
  );
}
