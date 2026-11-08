import { useEffect, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { mediaUrl, type ProductTemps } from "../../lib/api";
import { activeStoreId, getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, Field, FormGroup, FormGroups, FormView, StatusBar, Tabs, errMsg, formatVnd } from "../../components/erp";
import "../../styles/nutrition-admin.css";
import { ImageField, TagsInput, digits, parseTags, useRecordNav, useResource } from "../shared";
import { PRODUCTS_BASE, type ProductRow } from "./ProductList";

type Category = { id: number; name: string; sortOrder: number };
/** Giá vốn S/M/L tính từ công thức × giá nhập nguyên liệu (/api/admin/product-costs) */
type CostRow = { id: number; hasFormula: boolean; cost: { S: number; M: number; L: number } | null };
/** Đề xuất món của pha chế (tạo món từ đề xuất đã duyệt) */
type Proposal = {
  id: number; name: string; description: string | null; recipe: string | null; suggestedPrice: number | null;
  categoryId: number | null; imageUrl: string | null; status: string; staff: { fullName: string }; store: { name: string };
  /** Từ AI phác thảo: định mức nháp (tạo thành định mức khi lưu món), size, nóng / đá, giá S / L */
  formulaDraft: { itemId: number | null; newIngredient: { name: string } | null }[] | null;
  temps: ProductTemps | null; hasSizes: boolean | null; priceS: number | null; priceL: number | null;
  costNow: { costs: { M: number } } | null;
};

type Draft = {
  name: string;
  sku: string;
  costPrice: string;
  sellPrice: string;
  priceSizeS: string;
  priceSizeL: string;
  categoryId: number | "";
  imageUrl: string;
  tags: string[];
  /** Tên gọi khác / viết tắt cho đặt món bằng giọng nói & tìm kiếm */
  aliases: string[];
  discountPercent: string;
  isActive: boolean;
  outOfStock: boolean;
  /** false = món 1 loại (bánh, đồ ăn): 1 giá, công thức trừ 1 mức */
  hasSizes: boolean;
  /** Nhiệt độ phục vụ: BOTH = khách chọn nóng/đá, ICED = chỉ đá, HOT = chỉ nóng, NONE = không áp dụng */
  temps: ProductTemps;
};

const EMPTY: Draft = {
  name: "", sku: "", costPrice: "", sellPrice: "", priceSizeS: "", priceSizeL: "",
  categoryId: "", imageUrl: "", tags: [], aliases: [], discountPercent: "", isActive: true, outOfStock: false, hasSizes: true, temps: "BOTH",
};

const TEMP_OPTIONS: { value: ProductTemps; label: string }[] = [
  { value: "BOTH", label: "Nóng & đá — khách chọn" },
  { value: "ICED", label: "Chỉ đá" },
  { value: "HOT", label: "Chỉ nóng" },
  { value: "NONE", label: "Không áp dụng" },
];

const MAX_ALIASES = 10;
const MAX_ALIAS_LEN = 40;

/** Tên gọi khác dạng thẻ: Enter hoặc dấu phẩy để thêm (≤ 10 tên, mỗi tên ≤ 40 ký tự) */
function AliasInput({ aliases, onChange, disabled }: { aliases: string[]; onChange: (a: string[]) => void; disabled?: boolean }) {
  const [text, setText] = useState("");
  if (disabled) {
    return aliases.length ? (
      <span className="o-row" style={{ gap: 4, flexWrap: "wrap" }}>
        {aliases.map((a) => <span key={a} className="o-badge">{a}</span>)}
      </span>
    ) : (
      <span className="o-muted">—</span>
    );
  }
  const add = () => {
    const parts = text.split(",").map((t) => t.trim().replace(/\s+/g, " ").slice(0, MAX_ALIAS_LEN)).filter(Boolean);
    const next = [...aliases];
    for (const t of parts) if (!next.some((a) => a.toLowerCase() === t.toLowerCase()) && next.length < MAX_ALIASES) next.push(t);
    onChange(next);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !text && aliases.length) onChange(aliases.slice(0, -1));
  };
  return (
    <div className="o-stack" style={{ gap: 6 }}>
      {aliases.length > 0 && (
        <div className="o-row" style={{ gap: 4, flexWrap: "wrap" }}>
          {aliases.map((a) => (
            <span key={a} className="o-badge">
              {a}
              <button type="button" onClick={() => onChange(aliases.filter((x) => x !== a))} aria-label={`Bỏ ${a}`} style={{ border: 0, background: "none", padding: 0, marginLeft: 2, cursor: "pointer", display: "flex", color: "inherit" }}>
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      {aliases.length < MAX_ALIASES && (
        <input className="o-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={() => text.trim() && add()} maxLength={MAX_ALIAS_LEN * 3} placeholder="VD: bx, bạc xỉu, bac siu — Enter để thêm" />
      )}
      <div className="o-hint">Cách khách hay gọi / viết tắt. Đặt món bằng giọng nói và ô tìm kiếm thực đơn sẽ hiểu các tên này.</div>
    </div>
  );
}

/** Danh mục đồ ăn / bánh → món mới mặc định không size */
const isFoodCategory = (name?: string) => !!name && /đồ ăn|bánh/i.test(name);

/** Ô giá theo size. S/L để trống → S = M − 3.000đ, L = M + 5.000đ (cùng quy tắc màn đặt món của khách) */
const SIZES = [
  { size: "S", key: "priceSizeS", hint: "trống = M − 3.000đ" },
  { size: "M", key: "sellPrice", hint: "" },
  { size: "L", key: "priceSizeL", hint: "trống = M + 5.000đ" },
] as const;

/** Giá khách thực trả theo size (đã áp dụng mặc định khi S/L để trống) */
function sizePrice(d: Draft, size: "S" | "M" | "L") {
  const m = digits(d.sellPrice) || 0;
  if (size === "M") return m;
  if (size === "S") return d.priceSizeS ? digits(d.priceSizeS) : Math.max(0, m - 3000);
  return d.priceSizeL ? digits(d.priceSizeL) : m > 0 ? m + 5000 : 0;
}

function toDraft(p: ProductRow): Draft {
  return {
    name: p.name,
    sku: p.sku ?? "",
    costPrice: String(p.costPrice),
    sellPrice: String(p.sellPrice),
    priceSizeS: p.priceSizeS != null ? String(p.priceSizeS) : "",
    priceSizeL: p.priceSizeL != null ? String(p.priceSizeL) : "",
    categoryId: p.categoryId,
    imageUrl: p.imageUrl ?? "",
    tags: parseTags(p.tags),
    aliases: Array.isArray(p.aliases) ? p.aliases.filter((a): a is string => typeof a === "string") : [],
    discountPercent: p.discountPercent != null ? String(p.discountPercent) : "",
    isActive: p.isActive,
    outOfStock: p.outOfStock,
    hasSizes: p.hasSizes !== false,
    temps: p.hasSizes === false ? "NONE" : p.temps ?? "BOTH",
  };
}

export function ProductForm({ recordId }: { recordId?: string }) {
  const isNew = recordId === "new";
  const go = useRecordNav(PRODUCTS_BASE);
  const products = useResource<ProductRow[]>(isNew ? null : "/api/admin/products", []);
  const cats = useResource<Category[]>("/api/admin/categories", []);
  const record = isNew ? null : products.data.find((p) => String(p.id) === recordId) ?? null;
  // Hết hàng là trạng thái theo chi nhánh — toàn chuỗi (null) thì không gửi/không hiện
  const storeId = activeStoreId();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [params] = useSearchParams();
  const proposalId = isNew ? params.get("proposal") : null;
  const costs = useResource<CostRow[]>(isNew ? null : "/api/admin/product-costs", []);
  const cost = costs.data.find((c) => String(c.id) === recordId)?.cost ?? null;
  const proposal = useResource<Proposal | null>(proposalId ? `/api/menu-proposals/${proposalId}` : null, null);

  useEffect(() => {
    if (record) setDraft(toDraft(record));
  }, [record]);

  // Điền sẵn từ đề xuất của pha chế
  useEffect(() => {
    const p = proposal.data;
    if (!p) return;
    setDraft((d) => ({
      ...d,
      name: p.name,
      sellPrice: p.suggestedPrice != null ? String(p.suggestedPrice) : d.sellPrice,
      categoryId: p.categoryId ?? d.categoryId,
      imageUrl: p.imageUrl ?? d.imageUrl,
      hasSizes: p.hasSizes ?? d.hasSizes,
      temps: p.temps ?? d.temps,
      priceSizeS: p.priceS != null ? String(p.priceS) : d.priceSizeS,
      priceSizeL: p.priceL != null ? String(p.priceL) : d.priceSizeL,
      tags: d.tags.length ? d.tags : ["🆕 Món Mới"],
    }));
  }, [proposal.data]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const ro = !editing;

  async function save() {
    const price = digits(draft.sellPrice);
    if (!draft.name.trim()) return setErr("Nhập tên món.");
    if (draft.categoryId === "") return setErr("Chọn danh mục.");
    if (Number.isNaN(price) || price <= 0) return setErr("Giá bán phải lớn hơn 0.");
    setSaving(true);
    setErr(null);
    try {
      if (isNew) {
        const created = await staffApi<{ id: number }>("/api/admin/products", {
          method: "POST",
          body: JSON.stringify({
            name: draft.name.trim(),
            sellPrice: price,
            hasSizes: draft.hasSizes,
            temps: draft.hasSizes ? draft.temps : "NONE",
            priceSizeS: draft.hasSizes && draft.priceSizeS ? digits(draft.priceSizeS) : undefined,
            priceSizeL: draft.hasSizes && draft.priceSizeL ? digits(draft.priceSizeL) : undefined,
            categoryId: draft.categoryId,
            sku: draft.sku.trim() || undefined,
            imageUrl: draft.imageUrl.trim() || undefined,
            tags: draft.tags.length > 0 ? draft.tags : undefined,
            aliases: draft.aliases,
            discountPercent: draft.discountPercent ? Number(draft.discountPercent) : undefined,
          }),
        });
        // Tạo từ đề xuất → đánh dấu đề xuất đã có món
        if (proposal.data?.status === "APPROVED") {
          await staffApi(`/api/menu-proposals/${proposal.data.id}/created`, { method: "POST", body: JSON.stringify({ productId: created.id }) }).catch(() => {});
        }
        go.open(created.id);
        return;
      }
      await staffApi(`/api/admin/products/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name.trim(),
          sku: draft.sku.trim() || null,
          sellPrice: price,
          hasSizes: draft.hasSizes,
          temps: draft.hasSizes ? draft.temps : "NONE",
          priceSizeS: draft.hasSizes && draft.priceSizeS ? digits(draft.priceSizeS) : null,
          priceSizeL: draft.hasSizes && draft.priceSizeL ? digits(draft.priceSizeL) : null,
          categoryId: draft.categoryId,
          imageUrl: draft.imageUrl.trim() || null,
          tags: draft.tags.length > 0 ? draft.tags : null,
          aliases: draft.aliases,
          discountPercent: draft.discountPercent ? Number(draft.discountPercent) : null,
          // Chỉ gửi cờ khi người dùng thực sự đổi — tránh bắn thông báo thừa
          ...(record && draft.isActive !== record.isActive ? { isActive: draft.isActive } : {}),
          ...(storeId != null && record && draft.outOfStock !== record.outOfStock ? { outOfStock: draft.outOfStock } : {}),
        }),
      });
      await products.reload();
      setEditing(false);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!record) return;
    try {
      await staffApi(`/api/admin/products/${record.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !record.isActive }) });
      await products.reload();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  if (!isNew && !record) {
    return (
      <FormView crumbs={[{ label: "Món & giá", to: PRODUCTS_BASE }, { label: products.loading ? "…" : "Không tìm thấy" }]} editing={false} canEdit={false} error={products.error}>
        <div className="o-muted">{products.loading ? "Đang tải…" : `Không tìm thấy món #${recordId}.`}</div>
      </FormView>
    );
  }

  const catName = cats.data.find((c) => c.id === draft.categoryId)?.name ?? "";

  return (
    <FormView
      crumbs={[{ label: "Món & giá", to: PRODUCTS_BASE }, { label: isNew ? "Mới" : record!.name }]}
      editing={editing}
      // Món dùng chung cả chuỗi — chỉ Chủ chuỗi sửa
      canEdit={isOwnerRole(getStaffInfo()?.role)}
      onEdit={() => setEditing(true)}
      onSave={() => void save()}
      onDiscard={() => {
        if (isNew) return go.list();
        setDraft(toDraft(record!));
        setEditing(false);
        setErr(null);
      }}
      saving={saving}
      error={err ?? cats.error}
      actions={
        record && !editing ? (
          <Button variant={record.isActive ? "secondary" : "primary"} onClick={() => void toggleActive()}>
            {record.isActive ? "Ngưng bán" : "Mở bán"}
          </Button>
        ) : undefined
      }
      statusBar={
        !isNew ? (
          <StatusBar
            steps={[
              { id: "off", label: "Ngưng bán" },
              { id: "on", label: "Đang bán" },
            ]}
            current={record!.isActive ? "on" : "off"}
          />
        ) : undefined
      }
    >
      {proposal.data && (
        <Alert tone="info">
          <strong>Tạo từ đề xuất của {proposal.data.staff.fullName}</strong> ({proposal.data.store.name})
          {proposal.data.description && <div>{proposal.data.description}</div>}
          {proposal.data.recipe && <div style={{ whiteSpace: "pre-line", marginTop: 4 }}><em>Nguyên liệu & cách làm:</em> {proposal.data.recipe}</div>}
          {proposal.data.formulaDraft?.length ? (
            <div style={{ marginTop: 4 }}>
              Lưu món → <b>tự tạo định mức</b> {proposal.data.formulaDraft.filter((l) => l.itemId != null).length} nguyên liệu từ đề xuất
              {proposal.data.costNow && <> (giá vốn ly M hiện tại ≈ {proposal.data.costNow.costs.M.toLocaleString("vi-VN")}đ)</>}.
              {proposal.data.formulaDraft.some((l) => l.itemId == null) && (
                <div style={{ marginTop: 4 }}>
                  Nguyên liệu mới chưa có trong kho: <b>{proposal.data.formulaDraft.filter((l) => l.itemId == null).map((l) => l.newIngredient?.name).join(", ")}</b> — tạo trong{" "}
                  <Link to="/app/inventory/stock">Kho</Link> trước, rồi thêm vào định mức ở <Link to="/app/kitchen/formulas">Công thức & giá vốn</Link>.
                </div>
              )}
            </div>
          ) : (
            <div className="o-muted" style={{ marginTop: 4 }}>Kiểm tra giá vốn, size, rồi thêm định mức nguyên liệu ở "Định mức NL" sau khi lưu.</div>
          )}
        </Alert>
      )}
      <div className="o-sheet-title">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="o-field-label">Tên món</div>
          {ro ? (
            <h1>{draft.name}</h1>
          ) : (
            <input className="o-input" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Vd: Cà phê sữa đá" autoFocus={isNew} />
          )}
        </div>
        {mediaUrl(draft.imageUrl) ? <img className="o-sheet-avatar" src={mediaUrl(draft.imageUrl)} alt="" /> : <div className="o-sheet-avatar" />}
      </div>

      <FormGroups>
        <FormGroup>
          <Field label="Danh mục" required>
            {ro ? (
              catName || <span className="o-muted">—</span>
            ) : (
              <select
                className="o-input"
                value={draft.categoryId === "" ? "" : String(draft.categoryId)}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : "";
                  set("categoryId", id);
                  // Món mới thuộc danh mục bánh / đồ ăn → mặc định món 1 loại
                  if (isNew && id !== "") set("hasSizes", !isFoodCategory(cats.data.find((c) => c.id === id)?.name));
                }}
              >
                <option value="">—</option>
                {cats.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="SKU">
            <input className="o-input" value={draft.sku} disabled={ro} onChange={(e) => set("sku", e.target.value)} placeholder={ro ? "" : "Tùy chọn"} />
          </Field>
          <Field label="Loại món">
            {ro ? (
              draft.hasSizes ? "Có size S / M / L" : "Món 1 loại (không size)"
            ) : (
              <select className="o-input" value={draft.hasSizes ? "1" : "0"} onChange={(e) => set("hasSizes", e.target.value === "1")}>
                <option value="1">Có size S / M / L (đồ uống)</option>
                <option value="0">Món 1 loại — bánh, đồ ăn (không size, công thức trừ 1 mức)</option>
              </select>
            )}
          </Field>
          {draft.hasSizes && (
            <Field label="Nóng / đá">
              {ro ? (
                TEMP_OPTIONS.find((o) => o.value === draft.temps)?.label
              ) : (
                <>
                  <select className="o-input" value={draft.temps} onChange={(e) => set("temps", e.target.value as ProductTemps)}>
                    {TEMP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div className="o-hint">Món chỉ đá hoặc chỉ nóng: khách không chọn được kiểu còn lại trên thực đơn.</div>
                </>
              )}
            </Field>
          )}
          <Field label="Nhãn">
            <TagsInput tags={draft.tags} onChange={(t) => set("tags", t)} disabled={ro} />
          </Field>
          <Field label="Tên gọi khác">
            <AliasInput aliases={draft.aliases} onChange={(a) => set("aliases", a)} disabled={ro} />
          </Field>
        </FormGroup>
        <FormGroup>
          {!draft.hasSizes ? (
            <Field label="Giá bán" required>
              {ro ? formatVnd(digits(draft.sellPrice) || 0) : <input className="o-input" inputMode="numeric" value={draft.sellPrice} onChange={(e) => set("sellPrice", e.target.value)} placeholder="VD: 29000" />}
            </Field>
          ) : (
          <Field label="Giá bán theo size" required>
            <span className="o-inline" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, width: "100%" }}>
              {SIZES.map(({ size, key, hint }) => {
                const own = draft[key];
                const effective = sizePrice(draft, size);
                return (
                  <label key={size} className="o-stack" style={{ gap: 2, minWidth: 0 }}>
                    <span className="o-muted" style={{ fontSize: "0.8rem" }}>Size {size}{size === "M" ? " (chuẩn)" : ""}</span>
                    {ro ? (
                      <span>
                        {effective > 0 ? formatVnd(effective) : "—"}
                        {size !== "M" && !own && effective > 0 && <span className="o-muted" style={{ fontSize: "0.8rem" }}> (mặc định)</span>}
                      </span>
                    ) : (
                      <input
                        className="o-input"
                        inputMode="numeric"
                        value={own}
                        onChange={(e) => set(key, e.target.value)}
                        placeholder={size === "M" ? "VD: 29000" : effective > 0 ? `${formatVnd(effective)} (${hint})` : hint}
                        aria-label={`Giá size ${size}`}
                      />
                    )}
                  </label>
                );
              })}
            </span>
          </Field>
          )}
          <Field label="Giá vốn (COST)">
            {isNew ? (
              <span className="o-muted">Tính từ công thức sau khi tạo món</span>
            ) : cost && !draft.hasSizes ? (
              // Món 1 loại: giá vốn = định mức 1 mức × giá nhập (bánh: 1 cái × giá nhập 1 cái)
              <span className="o-inline">
                <strong>{formatVnd(cost.M)}</strong>
                <span className="o-muted">({digits(draft.sellPrice) > 0 ? Math.round((cost.M / digits(draft.sellPrice)) * 100) : 0}% giá bán) · theo giá nhập</span>
                <Link to="/app/kitchen/formulas">Sửa công thức</Link>
              </span>
            ) : cost ? (
              <span className="o-inline">
                {(["S", "M", "L"] as const).map((sz) => {
                  const price = sizePrice(draft, sz);
                  const r = price > 0 ? cost[sz] / price : 0;
                  return (
                    <span key={sz} title={`Giá bán ${formatVnd(price)}`}>
                      {sz} <strong>{formatVnd(cost[sz])}</strong>
                      <span className="o-muted"> ({Math.round(r * 100)}%)</span>
                    </span>
                  );
                })}
                <Link to="/app/kitchen/formulas">Sửa công thức</Link>
              </span>
            ) : (
              <span className="o-muted">Chưa có công thức — <Link to="/app/kitchen/formulas">nhập công thức</Link> để tính giá vốn</span>
            )}
          </Field>
          <Field label="Giảm giá (%)">
            <input className="o-input" type="number" min={0} max={100} value={draft.discountPercent} disabled={ro} onChange={(e) => set("discountPercent", e.target.value)} />
          </Field>
        </FormGroup>
      </FormGroups>

      <Tabs tabs={[{ id: "display", label: "Hiển thị" }]} active="display" onChange={() => {}} />
      <div className="o-tab-panel">
        {(
          <FormGroups>
            <FormGroup>
              <Field label="Ảnh món">
                <ImageField value={draft.imageUrl} onChange={(u) => set("imageUrl", u)} disabled={ro} onBusy={setSaving} />
              </Field>
            </FormGroup>
            <FormGroup>
              {!isNew && (
                <>
                  <Field label="Đang bán">
                    <input type="checkbox" checked={draft.isActive} disabled={ro} onChange={(e) => set("isActive", e.target.checked)} />
                  </Field>
                  <Field label="Hết hàng">
                    {storeId == null ? (
                      <span className="o-muted">Hết hàng là trạng thái theo chi nhánh — chọn chi nhánh ở thanh trên để báo hết món.</span>
                    ) : (
                      <label className="o-check">
                        <input type="checkbox" checked={draft.outOfStock} disabled={ro} onChange={(e) => set("outOfStock", e.target.checked)} />
                        <span className="o-muted">Báo hết món tại chi nhánh đang chọn</span>
                      </label>
                    )}
                  </Field>
                </>
              )}
            </FormGroup>
          </FormGroups>
        )}
      </div>
      {!isNew && recordId && <NutritionCard productId={Number(recordId)} />}
    </FormView>
  );
}

type NutSize = {
  size: string; kcal: number; caffeineMg: number; sugarG: number; fatG: number; proteinG: number; complete: boolean;
  missing: { itemId: number; name: string }[]; allergens: string[];
  labels: { caffeine: string | null; sugar: string | null; fat: string | null; vegan: boolean; allergens: string[] };
};
const ALLERGEN_VI: Record<string, string> = { milk: "sữa", nuts: "hạt", peanut: "đậu phộng", gluten: "gluten", egg: "trứng", soy: "đậu nành" };

/** Dinh dưỡng ước tính theo size (tính từ công thức × nguyên liệu đã duyệt) + nguyên liệu còn thiếu */
function NutritionCard({ productId }: { productId: number }) {
  const r = useResource<{ sizes: NutSize[] } | null>(`/api/nutrition/products/${productId}`, null);
  const sizes = r.data?.sizes ?? [];
  if (!sizes.length) return null;
  const missing = sizes[0].missing;
  const l = sizes.find((x) => x.size === "M")?.labels ?? sizes[0].labels;
  const tags = [
    l.caffeine === "none" ? "Không caffeine" : l.caffeine === "low" ? "Ít caffeine" : l.caffeine === "high" ? "Caffeine cao" : "",
    l.sugar === "high" ? "Nhiều đường" : l.sugar === "low" ? "Ít đường" : "",
    l.fat === "high" ? "Nhiều béo" : l.fat === "low" ? "Ít béo" : "",
    l.vegan ? "Thuần chay" : "",
    ...l.allergens.map((a) => `Có ${ALLERGEN_VI[a] ?? a}`),
  ].filter(Boolean);
  return (
    <div className="o-card nut-card" style={{ marginTop: 16, padding: 16 }}>
      <strong>Dinh dưỡng ước tính</strong>
      <div className="o-muted" style={{ fontSize: 12, margin: "2px 0 8px" }}>Tính từ công thức × dinh dưỡng nguyên liệu đã duyệt, mức đường 100%. Khách thấy khi Website › Giao diện bật hiện dinh dưỡng.</div>
      {missing.length > 0 ? (
        <Alert tone="warning">
          Chưa đủ dữ liệu — còn thiếu / chưa duyệt: {missing.map((m) => m.name).join(", ")}.{" "}
          <Link to="/app/kitchen/nutrition">Mở Dinh dưỡng nguyên liệu</Link>
        </Alert>
      ) : (
        <>
          <table>
            <thead><tr><th>Size</th><th>kcal</th><th>Caffeine (mg)</th><th>Đường (g)</th><th>Béo (g)</th><th>Đạm (g)</th></tr></thead>
            <tbody>
              {sizes.map((x) => (
                <tr key={x.size}><td>{x.size === "-" ? "1 phần" : x.size}</td><td>{x.kcal}</td><td>{x.caffeineMg}</td><td>{x.sugarG}</td><td>{x.fatG}</td><td>{x.proteinG}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="nut-labels">{tags.length ? tags.map((t) => <Badge key={t}>{t}</Badge>) : <span className="o-muted">Không có nhãn</span>}</div>
        </>
      )}
    </div>
  );
}
