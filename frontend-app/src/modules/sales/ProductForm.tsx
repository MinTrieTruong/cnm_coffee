import { useEffect, useState } from "react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Button, Field, FormGroup, FormGroups, FormView, StatusBar, Tabs, errMsg, formatVnd } from "../../components/erp";
import { ImageField, TagsInput, digits, parseTags, useRecordNav, useResource } from "../shared";
import { PRODUCTS_BASE, type ProductRow } from "./ProductList";

type Category = { id: number; name: string; sortOrder: number };

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
  const [tab, setTab] = useState<"price" | "display">("price");

  useEffect(() => {
    if (record) setDraft(toDraft(record));
  }, [record]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const ro = !editing;
  const money = (v: string) => (v ? formatVnd(digits(v)) : <span className="o-muted">—</span>);

  async function save() {
    const price = digits(draft.sellPrice);
    const cost = digits(draft.costPrice);
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
            costPrice: Number.isNaN(cost) ? 0 : cost,
            sku: draft.sku.trim() || undefined,
            imageUrl: draft.imageUrl.trim() || undefined,
            tags: draft.tags.length > 0 ? draft.tags : undefined,
            discountPercent: draft.discountPercent ? Number(draft.discountPercent) : undefined,
          }),
        });
        go.open(created.id);
        return;
      }
      await staffApi(`/api/admin/products/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name.trim(),
          sku: draft.sku.trim() || null,
          sellPrice: price,
          costPrice: Number.isNaN(cost) ? 0 : cost,
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
          <Field label="Giá bán (M)" required>
            {ro ? money(draft.sellPrice) : <input className="o-input" inputMode="numeric" value={draft.sellPrice} onChange={(e) => set("sellPrice", e.target.value)} />}
          </Field>
          <Field label="Giá vốn">
            {ro ? money(draft.costPrice) : <input className="o-input" inputMode="numeric" value={draft.costPrice} onChange={(e) => set("costPrice", e.target.value)} />}
          </Field>
          <Field label="Giảm giá (%)">
            <input className="o-input" type="number" min={0} max={100} value={draft.discountPercent} disabled={ro} onChange={(e) => set("discountPercent", e.target.value)} />
          </Field>
        </FormGroup>
      </FormGroups>

      <Tabs
        tabs={[
          { id: "price", label: "Giá theo size" },
          { id: "display", label: "Hiển thị" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="o-tab-panel">
        {tab === "price" && (
          <FormGroups>
            <FormGroup>
              <Field label="Giá size S">
                {ro ? money(draft.priceSizeS) : <input className="o-input" inputMode="numeric" value={draft.priceSizeS} onChange={(e) => set("priceSizeS", e.target.value)} placeholder={ro ? "" : "Trống = trừ 3.000đ"} />}
              </Field>
              <Field label="Giá size L">
                {ro ? money(draft.priceSizeL) : <input className="o-input" inputMode="numeric" value={draft.priceSizeL} onChange={(e) => set("priceSizeL", e.target.value)} placeholder={ro ? "" : "Trống = cộng 5.000đ"} />}
              </Field>
            </FormGroup>
          </FormGroups>
        )}
        {tab === "display" && (
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
