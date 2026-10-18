import { useEffect, useRef, useState } from "react";
import { api, mediaUrl, type Combo, type Product } from "../lib/api";
import { staffApi } from "../lib/staffApi";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  Flame,
  FlameKindling,
  Package,
  X,
  Check,
  ImagePlus,
  Search,
} from "lucide-react";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

type SelectedProduct = {
  productId: number;
  name: string;
  sellPrice: number;
  quantity: number;
};

const EMPTY_FORM = {
  name: "",
  description: "",
  imageUrl: "",
  comboPrice: "",
  isHot: false,
  isActive: true,
};

export function AdminCombos() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Computed: originalPrice
  const originalPrice = selectedProducts.reduce(
    (sum, p) => sum + p.sellPrice * p.quantity,
    0
  );

  const comboPrice = Number(form.comboPrice) || 0;
  const savings = originalPrice - comboPrice;
  const savingsPct = originalPrice > 0 && comboPrice > 0
    ? Math.round((savings / originalPrice) * 100)
    : 0;

  // Product search results
  const filteredProducts = products.filter(
    (p) =>
      p.isActive &&
      p.name.toLowerCase().includes(productSearch.toLowerCase()) &&
      !selectedProducts.find((sp) => sp.productId === p.id)
  );

  /* ── Data fetch ─────────────────────────────────────────────── */
  async function loadData() {
    setLoading(true);
    try {
      const [combosData, productsData] = await Promise.all([
        staffApi<Combo[]>("/api/admin/combos"),
        api<{ products: Product[] }>("/api/menu").then((r) => r.products),
      ]);
      setCombos(combosData);
      setProducts(productsData);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Lỗi tải dữ liệu", ok: false });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  /* ── Form helpers ───────────────────────────────────────────── */
  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setSelectedProducts([]);
    setProductSearch("");
    setImgPreview(null);
    setMsg(null);
    setShowForm(true);
  }

  function openEdit(combo: Combo) {
    setEditingId(combo.id);
    setForm({
      name: combo.name,
      description: combo.description ?? "",
      imageUrl: combo.imageUrl ?? "",
      comboPrice: String(combo.comboPrice),
      isHot: combo.isHot,
      isActive: combo.isActive,
    });
    setSelectedProducts(
      combo.items.map((ci) => ({
        productId: ci.product.id,
        name: ci.product.name,
        sellPrice: ci.product.sellPrice,
        quantity: ci.quantity,
      }))
    );
    setProductSearch("");
    setImgPreview(combo.imageUrl ? mediaUrl(combo.imageUrl) ?? null : null);
    setMsg(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setMsg(null);
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setForm((f) => ({ ...f, imageUrl: result }));
      setImgPreview(result);
    };
    reader.readAsDataURL(file);
  }

  function addProduct(product: Product) {
    setSelectedProducts((prev) => [
      ...prev,
      { productId: product.id, name: product.name, sellPrice: product.sellPrice, quantity: 1 },
    ]);
    setProductSearch("");
  }

  function removeProduct(productId: number) {
    setSelectedProducts((prev) => prev.filter((p) => p.productId !== productId));
  }

  function updateQtyInForm(productId: number, qty: number) {
    setSelectedProducts((prev) =>
      prev.map((p) => (p.productId === productId ? { ...p, quantity: Math.max(1, qty) } : p))
    );
  }

  /* ── Save combo ─────────────────────────────────────────────── */
  async function handleSave() {
    if (!form.name.trim()) { setMsg({ text: "Tên combo không được để trống", ok: false }); return; }
    if (!comboPrice || comboPrice <= 0) { setMsg({ text: "Giá combo không hợp lệ", ok: false }); return; }
    if (selectedProducts.length === 0) { setMsg({ text: "Combo phải có ít nhất 1 sản phẩm", ok: false }); return; }
    if (comboPrice >= originalPrice) { setMsg({ text: "Giá combo phải nhỏ hơn giá gốc", ok: false }); return; }

    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        comboPrice,
        isHot: form.isHot,
        isActive: form.isActive,
        products: selectedProducts.map((p) => ({ productId: p.productId, quantity: p.quantity })),
      };

      if (editingId !== null) {
        await staffApi(`/api/admin/combos/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        setMsg({ text: "Đã cập nhật combo!", ok: true });
      } else {
        await staffApi("/api/admin/combos", { method: "POST", body: JSON.stringify(payload) });
        setMsg({ text: "Đã tạo combo mới!", ok: true });
      }
      await loadData();
      setTimeout(() => { setShowForm(false); setMsg(null); }, 1200);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Lỗi lưu combo", ok: false });
    } finally {
      setSaving(false);
    }
  }

  /* ── Toggle hot / active ────────────────────────────────────── */
  async function toggleHot(id: number) {
    try {
      await staffApi(`/api/admin/combos/${id}/toggle-hot`, { method: "PATCH" });
      setCombos((prev) => prev.map((c) => c.id === id ? { ...c, isHot: !c.isHot } : c));
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Lỗi", ok: false });
    }
  }

  async function toggleActive(id: number) {
    try {
      await staffApi(`/api/admin/combos/${id}/toggle-active`, { method: "PATCH" });
      setCombos((prev) => prev.map((c) => c.id === id ? { ...c, isActive: !c.isActive } : c));
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Lỗi", ok: false });
    }
  }

  async function deleteCombo(id: number) {
    if (!confirm("Bạn có chắc muốn xóa combo này?")) return;
    try {
      await staffApi(`/api/admin/combos/${id}`, { method: "DELETE" });
      setCombos((prev) => prev.filter((c) => c.id !== id));
      setMsg({ text: "Đã xóa combo", ok: true });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Lỗi xóa", ok: false });
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="admin-combo-root">
      {/* Header */}
      <div className="admin-combo-header" style={{ justifyContent: "flex-end" }}>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          className="admin-combo-new-btn"
          onClick={openCreate}
        >
          <Plus size={18} /> Tạo Combo Mới
        </motion.button>
      </div>

      {/* Global message */}
      <AnimatePresence>
        {msg && !showForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`admin-combo-msg ${msg.ok ? "admin-combo-msg--ok" : "admin-combo-msg--err"}`}
          >
            {msg.ok ? <Check size={16} /> : <X size={16} />} {msg.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Combo Grid */}
      {loading ? (
        <div className="admin-combo-loading">Đang tải...</div>
      ) : combos.length === 0 ? (
        <div className="admin-combo-empty">
          <Package size={56} style={{ opacity: 0.2 }} />
          <p>Chưa có combo nào. Tạo combo đầu tiên!</p>
        </div>
      ) : (
        <div className="admin-combo-grid">
          {combos.map((combo) => (
            <motion.div
              key={combo.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`admin-combo-card ${!combo.isActive ? "admin-combo-card--inactive" : ""}`}
            >
              {/* Image */}
              <div className="admin-combo-card-img">
                {combo.imageUrl ? (
                  <img src={mediaUrl(combo.imageUrl)} alt={combo.name} />
                ) : (
                  <Package size={32} style={{ opacity: 0.2 }} />
                )}
                {combo.isHot && (
                  <span className="admin-combo-hot-chip">
                    <Flame size={12} /> HOT
                  </span>
                )}
                {!combo.isActive && (
                  <span className="admin-combo-inactive-chip">Ẩn</span>
                )}
              </div>

              {/* Info */}
              <div className="admin-combo-card-body">
                <div className="admin-combo-card-name">{combo.name}</div>
                {combo.description && (
                  <div className="admin-combo-card-desc">{combo.description}</div>
                )}
                <ul className="admin-combo-card-items">
                  {combo.items.map((ci) => (
                    <li key={ci.id}>
                      {ci.quantity > 1 && <strong>{ci.quantity}x </strong>}
                      {ci.product.name}
                    </li>
                  ))}
                </ul>
                <div className="admin-combo-card-pricing">
                  <span className="admin-combo-orig">{formatVnd(combo.originalPrice)}</span>
                  <span className="admin-combo-price">{formatVnd(combo.comboPrice)}</span>
                  <span className="admin-combo-save-tag">
                    -{Math.round(((combo.originalPrice - combo.comboPrice) / combo.originalPrice) * 100)}%
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="admin-combo-card-actions">
                <button
                  type="button"
                  title={combo.isHot ? "Bỏ HOT" : "Đánh dấu HOT"}
                  className={`admin-combo-action-btn ${combo.isHot ? "admin-combo-action-btn--hot" : ""}`}
                  onClick={() => void toggleHot(combo.id)}
                >
                  {combo.isHot ? <Flame size={16} /> : <FlameKindling size={16} />}
                </button>
                <button
                  type="button"
                  title={combo.isActive ? "Ẩn combo" : "Hiện combo"}
                  className={`admin-combo-action-btn ${combo.isActive ? "admin-combo-action-btn--active" : ""}`}
                  onClick={() => void toggleActive(combo.id)}
                >
                  {combo.isActive ? <Check size={16} /> : <X size={16} />}
                </button>
                <button
                  type="button"
                  title="Chỉnh sửa"
                  className="admin-combo-action-btn"
                  onClick={() => openEdit(combo)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  title="Xóa"
                  className="admin-combo-action-btn admin-combo-action-btn--danger"
                  onClick={() => void deleteCombo(combo.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Form Modal ───────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="admin-combo-overlay"
            onClick={(e) => e.target === e.currentTarget && closeForm()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="admin-combo-form-panel"
            >
              <div className="admin-combo-form-header">
                <h2>{editingId ? "Chỉnh sửa Combo" : "Tạo Combo Mới"}</h2>
                <button type="button" className="admin-combo-close-btn" onClick={closeForm}>
                  <X size={20} />
                </button>
              </div>

              <div className="admin-combo-form-body">
                {/* Left: Basic info */}
                <div className="admin-combo-form-left">
                  {/* Image upload */}
                  <div className="admin-combo-img-upload" onClick={() => fileRef.current?.click()}>
                    {imgPreview ? (
                      <img src={imgPreview} alt="preview" className="admin-combo-img-preview" />
                    ) : (
                      <>
                        <ImagePlus size={32} style={{ opacity: 0.4 }} />
                        <span>Click để chọn ảnh</span>
                      </>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={handleImageFile}
                    />
                  </div>

                  {/* Or URL */}
                  <div className="field" style={{ marginTop: "0.75rem" }}>
                    <label className="label">URL ảnh (nếu không upload)</label>
                    <input
                      className="input"
                      placeholder="https://..."
                      value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, imageUrl: e.target.value }));
                        setImgPreview(e.target.value || null);
                      }}
                    />
                  </div>

                  {/* Name */}
                  <div className="field">
                    <label className="label">Tên Combo *</label>
                    <input
                      id="combo-name"
                      className="input"
                      placeholder="Ví dụ: Combo Sáng Năng Lượng"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>

                  {/* Description */}
                  <div className="field">
                    <label className="label">Mô tả</label>
                    <textarea
                      className="input"
                      rows={3}
                      placeholder="Mô tả ngắn về combo..."
                      value={form.description}
                      style={{ resize: "vertical", minHeight: 80 }}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>

                  {/* Pricing */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div className="field">
                      <label className="label">Giá gốc (tự tính)</label>
                      <div className="admin-combo-readonly-price">
                        {formatVnd(originalPrice)}
                      </div>
                    </div>
                    <div className="field">
                      <label className="label">Giá Combo * (VND)</label>
                      <input
                        id="combo-price"
                        className={`input ${comboPrice > 0 && comboPrice >= originalPrice ? "input--error" : ""}`}
                        type="number"
                        min={0}
                        placeholder="0"
                        value={form.comboPrice}
                        onChange={(e) => setForm((f) => ({ ...f, comboPrice: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Savings preview */}
                  {comboPrice > 0 && originalPrice > 0 && (
                    <div className={`admin-combo-savings-preview ${comboPrice >= originalPrice ? "admin-combo-savings-preview--error" : ""}`}>
                      {comboPrice >= originalPrice
                        ? "Giá combo phải nhỏ hơn giá gốc!"
                        : `Khách tiết kiệm ${formatVnd(savings)} (−${savingsPct}%)`}
                    </div>
                  )}

                  {/* Toggles */}
                  <div className="admin-combo-toggles">
                    <label className="admin-combo-toggle-label">
                      <input
                        type="checkbox"
                        checked={form.isHot}
                        onChange={(e) => setForm((f) => ({ ...f, isHot: e.target.checked }))}
                      />
                      <Flame size={16} style={{ color: form.isHot ? "#c2410c" : undefined }} />
                      Combo Hot (hiện trên trang chủ)
                    </label>
                    <label className="admin-combo-toggle-label">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                      />
                      <Check size={16} />
                      Đang hoạt động
                    </label>
                  </div>
                </div>

                {/* Right: Product selector */}
                <div className="admin-combo-form-right">
                  <h3 className="admin-combo-products-title">
                    <Package size={18} /> Chọn sản phẩm trong combo
                  </h3>

                  {/* Search box */}
                  <div className="admin-combo-search-wrap">
                    <Search size={16} className="admin-combo-search-icon" />
                    <input
                      className="input admin-combo-search-input"
                      placeholder="Tìm sản phẩm..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </div>

                  {/* Dropdown results */}
                  {productSearch.length > 0 && filteredProducts.length > 0 && (
                    <div className="admin-combo-dropdown">
                      {filteredProducts.slice(0, 8).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="admin-combo-dropdown-item"
                          onClick={() => addProduct(p)}
                        >
                          <span className="admin-combo-dropdown-name">{p.name}</span>
                          <span className="admin-combo-dropdown-price">{formatVnd(p.sellPrice)}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selected products */}
                  <div className="admin-combo-selected-list">
                    {selectedProducts.length === 0 ? (
                      <div className="admin-combo-selected-empty">
                        Chưa chọn sản phẩm nào. Tìm và thêm bên trên.
                      </div>
                    ) : (
                      selectedProducts.map((sp) => (
                        <div key={sp.productId} className="admin-combo-selected-item">
                          <div className="admin-combo-selected-name">{sp.name}</div>
                          <div className="admin-combo-selected-price">{formatVnd(sp.sellPrice)}</div>
                          <div className="admin-combo-selected-qty-wrap">
                            <button
                              type="button"
                              className="admin-combo-qty-btn"
                              onClick={() => updateQtyInForm(sp.productId, sp.quantity - 1)}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              className="admin-combo-qty-input"
                              value={sp.quantity}
                              onChange={(e) => updateQtyInForm(sp.productId, Number(e.target.value))}
                            />
                            <button
                              type="button"
                              className="admin-combo-qty-btn"
                              onClick={() => updateQtyInForm(sp.productId, sp.quantity + 1)}
                            >
                              +
                            </button>
                          </div>
                          <div className="admin-combo-selected-subtotal">
                            = {formatVnd(sp.sellPrice * sp.quantity)}
                          </div>
                          <button
                            type="button"
                            className="admin-combo-remove-btn"
                            onClick={() => removeProduct(sp.productId)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Total preview */}
                  {selectedProducts.length > 0 && (
                    <div className="admin-combo-total-preview">
                      <span>Tổng giá gốc:</span>
                      <strong>{formatVnd(originalPrice)}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Form footer */}
              <div className="admin-combo-form-footer">
                {msg && showForm && (
                  <div className={`admin-combo-msg ${msg.ok ? "admin-combo-msg--ok" : "admin-combo-msg--err"}`}>
                    {msg.ok ? <Check size={14} /> : <X size={14} />} {msg.text}
                  </div>
                )}
                <div style={{ display: "flex", gap: "0.75rem", marginLeft: "auto" }}>
                  <button type="button" className="btn btn-ghost" onClick={closeForm}>
                    Hủy
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: "0.6rem 1.75rem", borderRadius: 999 }}
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    {saving ? "Đang lưu..." : editingId ? "Cập nhật Combo" : "Tạo Combo"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
