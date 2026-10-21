import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Button, Field, FormGroup, FormGroups, FormView, StatusBar, Tabs, errMsg, formatVnd } from "../../components/erp";
import { ImageField, TagsInput, digits, parseTags, useRecordNav, useResource } from "../shared";
import { PRODUCTS_BASE, type ProductRow } from "./ProductList";

type Category = { id: number; name: string; sortOrder: number };
/** Giá vốn S/M/L tính từ công thức × giá nhập nguyên liệu (/api/admin/product-costs) */
type CostRow = { id: number; hasFormula: boolean; cost: { S: number; M: number; L: number } | null };
/** Đề xuất món của pha chế (tạo món từ đề xuất đã duyệt) */
type Proposal = {
  id: number; name: string; description: string | null; recipe: string | null; suggestedPrice: number | null;
  categoryId: number | null; imageUrl: string | null; status: string; staff: { fullName: string }; store: { name: string };
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
  discountPercent: string;
  isActive: boolean;
  outOfStock: boolean;
};

const EMPTY: Draft = {
  name: "", sku: "", costPrice: "", sellPrice: "", priceSizeS: "", priceSizeL: "",
  categoryId: "", imageUrl: "", tags: [], discountPercent: "", isActive: true, outOfStock: false,
};

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
    discountPercent: p.discountPercent != null ? String(p.discountPercent) : "",
    isActive: p.isActive,
    outOfStock: p.outOfStock,
  };
}

export function ProductForm({ recordId }: { recordId?: string }) {
  const isNew = recordId === "new";
  const go = useRecordNav(PRODUCTS_BASE);
  const products = useResource<ProductRow[]>(isNew ? null : "/api/admin/products", []);
  const cats = useResource<Category[]>("/api/admin/categories", []);
  const record = isNew ? null : products.data.find((p) => String(p.id) === recordId) ?? null;

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
            priceSizeS: draft.priceSizeS ? digits(draft.priceSizeS) : undefined,
            priceSizeL: draft.priceSizeL ? digits(draft.priceSizeL) : undefined,
            categoryId: draft.categoryId,
            sku: draft.sku.trim() || undefined,
            imageUrl: draft.imageUrl.trim() || undefined,
            tags: draft.tags.length > 0 ? draft.tags : undefined,
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
          priceSizeS: draft.priceSizeS ? digits(draft.priceSizeS) : null,
          priceSizeL: draft.priceSizeL ? digits(draft.priceSizeL) : null,
          categoryId: draft.categoryId,
          imageUrl: draft.imageUrl.trim() || null,
          tags: draft.tags.length > 0 ? draft.tags : null,
          discountPercent: draft.discountPercent ? Number(draft.discountPercent) : null,
          isActive: draft.isActive,
          outOfStock: draft.outOfStock,
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
          <div className="o-muted" style={{ marginTop: 4 }}>Kiểm tra giá vốn, size, rồi thêm định mức nguyên liệu ở "Định mức NL" sau khi lưu.</div>
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
              <select className="o-input" value={draft.categoryId === "" ? "" : String(draft.categoryId)} onChange={(e) => set("categoryId", e.target.value ? Number(e.target.value) : "")}>
                <option value="">—</option>
                {cats.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="SKU">
            <input className="o-input" value={draft.sku} disabled={ro} onChange={(e) => set("sku", e.target.value)} placeholder={ro ? "" : "Tùy chọn"} />
          </Field>
          <Field label="Nhãn">
            <TagsInput tags={draft.tags} onChange={(t) => set("tags", t)} disabled={ro} />
          </Field>
        </FormGroup>
        <FormGroup>
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
          <Field label="Giá vốn (COST)">
            {isNew ? (
              <span className="o-muted">Tính từ công thức sau khi tạo món</span>
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
                    <label className="o-check">
                      <input type="checkbox" checked={draft.outOfStock} disabled={ro} onChange={(e) => set("outOfStock", e.target.checked)} />
                      <span className="o-muted">Hiển thị "Hết hàng" trên menu</span>
                    </label>
                  </Field>
                </>
              )}
            </FormGroup>
          </FormGroups>
        )}
      </div>
    </FormView>
  );
}
