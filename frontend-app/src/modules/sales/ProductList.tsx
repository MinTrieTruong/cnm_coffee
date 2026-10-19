import { Coffee } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { activeStoreId, getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
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
  /** Đang bán (toàn chuỗi) */
  isActive: boolean;
  /** Có chi nhánh đang chọn: hết món tại chi nhánh đó */
  outOfStock: boolean;
  /** Có chi nhánh đang chọn: chi nhánh có bán món này không */
  storeAvailable?: boolean;
  imageUrl: string | null;
  tags?: unknown;
  category?: { name: string };
  discountPercent?: number | null;
};

export const PRODUCTS_BASE = "/app/sales/products";

export function ProductList() {
  const { data: rows, loading, error, setError, reload } = useResource<ProductRow[]>("/api/admin/products", []);
  const go = useRecordNav(PRODUCTS_BASE);
  const storeId = activeStoreId();
  // Món & giá dùng chung cả chuỗi: chỉ Chủ chuỗi tạo/sửa; Quản lý chi nhánh bật/tắt tại chi nhánh
  const owner = isOwnerRole(getStaffInfo()?.role);

  /** Bật/tắt bán hoặc báo hết tại chi nhánh đang chọn */
  async function setAtStore(list: ProductRow[], patch: { isAvailable?: boolean; outOfStock?: boolean }) {
    try {
      for (const p of list) {
        await staffApi(`/api/admin/products/${p.id}/availability`, { method: "PATCH", body: JSON.stringify(patch) });
      }
      await reload();
    } catch (e) {
      setError(errMsg(e));
    }
  }

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
      label: "Đang bán (chuỗi)",
      value: (p) => (p.isActive ? 1 : 0),
      render: (p) =>
        owner ? (
          <input
            type="checkbox"
            checked={p.isActive}
            aria-label={`Đang bán ${p.name}`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => void setActive([p], e.target.checked)}
          />
        ) : (
          <Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Có" : "Ngưng"}</Badge>
        ),
    },
    ...(storeId == null
      ? []
      : [
          {
            key: "store",
            label: "Bán tại chi nhánh",
            value: (p: ProductRow) => (p.storeAvailable === false ? 0 : 1),
            render: (p: ProductRow) => (
              <input
                type="checkbox"
                checked={p.storeAvailable !== false}
                aria-label={`Bán ${p.name} tại chi nhánh`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => void setAtStore([p], { isAvailable: e.target.checked })}
              />
            ),
          },
        ]),
    {
      key: "stock",
      label: "Tình trạng",
      value: (p) => (p.outOfStock ? "Hết hàng" : "Còn hàng"),
      render: (p) => {
        const badge = p.outOfStock ? <Badge tone="warning">Hết hàng</Badge> : <Badge tone="success">Còn hàng</Badge>;
        if (storeId == null) return badge;
        // Bấm để báo hết / có hàng lại tại chi nhánh
        return (
          <button
            type="button"
            className="o-btn-link"
            style={{ border: 0, background: "none", padding: 0, cursor: "pointer" }}
            title={p.outOfStock ? "Báo có hàng lại" : "Báo hết món"}
            onClick={(e) => {
              e.stopPropagation();
              void setAtStore([p], { outOfStock: !p.outOfStock });
            }}
          >
            {badge}
          </button>
        );
      },
    },
  ];

  return (
    <RecordList
      crumbs={[{ label: owner ? "Món & giá" : "Thực đơn chi nhánh" }]}
      rows={rows}
      columns={columns}
      rowKey={(p) => p.id}
      loading={loading}
      error={error}
      onOpen={(p) => go.open(p.id)}
      onCreate={owner ? go.create : undefined}
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
        ...(owner
          ? [
              { label: "Mở bán (chuỗi)", onClick: (list: ProductRow[]) => setActive(list, true) },
              { label: "Ngưng bán (chuỗi)", onClick: (list: ProductRow[]) => setActive(list, false) },
            ]
          : []),
        ...(storeId == null
          ? []
          : [
              { label: "Báo hết tại chi nhánh", onClick: (list: ProductRow[]) => setAtStore(list, { outOfStock: true }) },
              { label: "Có hàng lại tại chi nhánh", onClick: (list: ProductRow[]) => setAtStore(list, { outOfStock: false }) },
              { label: "Không bán tại chi nhánh", onClick: (list: ProductRow[]) => setAtStore(list, { isAvailable: false }) },
            ]),
      ]}
      exportName="mon-va-gia"
      emptyState={<EmptyState icon={Coffee} title="Chưa có món nào" hint="Bấm Tạo mới để thêm món đầu tiên." />}
    />
  );
}
