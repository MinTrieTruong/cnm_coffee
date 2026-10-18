import { Coffee } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { staffApi } from "../../lib/staffApi";
import { Badge, EmptyState, RecordList, errMsg, formatVnd, type Column } from "../../components/erp";
import { useRecordNav, useResource } from "../shared";

export type ProductRow = {
  id: number;
  name: string;
  sku: string | null;
  sellPrice: number;
  priceSizeS?: number | null;
  priceSizeL?: number | null;
  costPrice: number;
  categoryId: number;
  isActive: boolean;
  outOfStock: boolean;
  imageUrl: string | null;
  tags?: unknown;
  category?: { name: string };
  discountPercent?: number | null;
};

export const PRODUCTS_BASE = "/app/sales/products";

export function ProductList() {
  const { data: rows, loading, error, setError, reload } = useResource<ProductRow[]>("/api/admin/products", []);
  const go = useRecordNav(PRODUCTS_BASE);

  async function setActive(list: ProductRow[], isActive: boolean) {
    try {
      for (const p of list) {
        await staffApi(`/api/admin/products/${p.id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
      }
      await reload();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const columns: Column<ProductRow>[] = [
    {
      key: "img",
      label: "",
      width: 40,
      sortable: false,
      render: (p) => {
        const img = mediaUrl(p.imageUrl);
        return img ? <img className="o-thumb" src={img} alt="" /> : <span className="o-thumb" />;
      },
    },
    { key: "name", label: "Tên món", value: (p) => p.name, render: (p) => <strong style={{ fontWeight: 500 }}>{p.name}</strong> },
    { key: "category", label: "Danh mục", value: (p) => p.category?.name ?? "" },
    { key: "sku", label: "SKU", value: (p) => p.sku ?? "", optional: true },
    { key: "cost", label: "Giá vốn", value: (p) => p.costPrice, numeric: true, optional: true, render: (p) => formatVnd(p.costPrice) },
    { key: "price", label: "Giá bán (M)", value: (p) => p.sellPrice, numeric: true, render: (p) => formatVnd(p.sellPrice) },
    { key: "priceS", label: "Giá S", value: (p) => p.priceSizeS ?? null, numeric: true, optional: true, defaultHidden: true, render: (p) => (p.priceSizeS != null ? formatVnd(p.priceSizeS) : "") },
    { key: "priceL", label: "Giá L", value: (p) => p.priceSizeL ?? null, numeric: true, optional: true, defaultHidden: true, render: (p) => (p.priceSizeL != null ? formatVnd(p.priceSizeL) : "") },
    {
      key: "discount",
      label: "Giảm giá",
      value: (p) => p.discountPercent ?? 0,
      numeric: true,
      render: (p) => (p.discountPercent ? <Badge tone="danger">-{p.discountPercent}%</Badge> : ""),
    },
    {
      key: "active",
      label: "Đang bán",
      value: (p) => (p.isActive ? 1 : 0),
      render: (p) => (
        <input
          type="checkbox"
          checked={p.isActive}
          aria-label={`Đang bán ${p.name}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void setActive([p], e.target.checked)}
        />
      ),
    },
    { key: "stock", label: "Tình trạng", value: (p) => (p.outOfStock ? "Hết hàng" : "Còn hàng"), render: (p) => (p.outOfStock ? <Badge tone="warning">Hết hàng</Badge> : <Badge tone="success">Còn hàng</Badge>) },
  ];

  return (
    <RecordList
      crumbs={[{ label: "Món & giá" }]}
      rows={rows}
      columns={columns}
      rowKey={(p) => p.id}
      loading={loading}
      error={error}
      onOpen={(p) => go.open(p.id)}
      onCreate={go.create}
      searchText={(p) => `${p.name} ${p.sku ?? ""} ${p.category?.name ?? ""}`}
      filters={[
        { id: "active", label: "Đang bán", test: (p) => p.isActive },
        { id: "inactive", label: "Ngưng bán", test: (p) => !p.isActive },
        { id: "oos", label: "Hết hàng", test: (p) => p.outOfStock },
        { id: "discount", label: "Đang giảm giá", test: (p) => !!p.discountPercent },
      ]}
      groupBys={[{ id: "category", label: "Danh mục", key: (p) => p.category?.name ?? "" }]}
      kanban={{
        columns: [
          { id: "on", label: "Đang bán" },
          { id: "oos", label: "Hết hàng" },
          { id: "off", label: "Ngưng bán" },
        ],
        columnOf: (p) => (!p.isActive ? "off" : p.outOfStock ? "oos" : "on"),
        card: (p) => {
          const img = mediaUrl(p.imageUrl);
          return (
            <div className="o-row" style={{ flexWrap: "nowrap" }}>
              {img ? <img className="o-thumb" src={img} alt="" style={{ width: 40, height: 40 }} /> : <span className="o-thumb" style={{ width: 40, height: 40 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div className="o-muted">{p.category?.name} · {formatVnd(p.sellPrice)}</div>
              </div>
            </div>
          );
        },
      }}
      bulkActions={[
        { label: "Mở bán", onClick: (list) => setActive(list, true) },
        { label: "Ngưng bán", onClick: (list) => setActive(list, false) },
      ]}
      exportName="mon-va-gia"
      emptyState={<EmptyState icon={Coffee} title="Chưa có món nào" hint="Bấm Tạo mới để thêm món đầu tiên." />}
    />
  );
}
