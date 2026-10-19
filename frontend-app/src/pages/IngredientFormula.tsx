import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStaffInfo, staffApi, isAdminRole } from "../lib/staffApi";

type Product = { id: number; name: string };
type InvItem = { id: number; name: string; unit: string | null; stockQty: number; unitCostPrice?: number };
type FormulaRow = {
  id: number; productId: number; itemId: number;
  qtyPerUnit: number;
  qtySizeS: number | null; qtySizeM: number | null; qtySizeL: number | null;
  recipeUnit: string | null; conversionFactor: number; note: string | null;
  product: { id: number; name: string };
  item: { id: number; name: string; unit: string | null };
};
type ReportRow = {
  itemId: number; itemName: string; unit: string | null; stockQty: number;
  lyThuyet: number; lyThuyetStock: number;
  openQty: number | null; closeQty: number | null; thucTe: number | null; chenhLech: number | null;
  recipeUnit: string | null; conversionFactor: number;
  lines: { productName: string; qtyPerUnit: number; recipeUnit: string | null; soldQty: number; consumed: number }[];
};
// Draft dòng chưa lưu
type DraftLine = { itemId: string; qtyPerUnit: string; recipeUnit: string; conversionFactor: string; note: string };
const emptyDraft = (): DraftLine => ({ itemId: "", qtyPerUnit: "", recipeUnit: "", conversionFactor: "1", note: "" });

// Bảng quy đổi mặc định theo itemId (admin có thể override)
const ITEM_DEFAULTS: Record<number, { recipeUnit: string; conversionFactor: number }> = {
  1:  { recipeUnit: "g",   conversionFactor: 1000 }, // Cà Phê Phin Robusta
  2:  { recipeUnit: "g",   conversionFactor: 1000 }, // Cà Phê Máy Arabica
  3:  { recipeUnit: "g",   conversionFactor: 380  }, // Sữa Đặc Ngôi Sao (1 lon = 380g)
  4:  { recipeUnit: "ml",  conversionFactor: 1000 }, // Sữa Tươi Thanh Trùng (1 hộp = 1000ml)
  5:  { recipeUnit: "g",   conversionFactor: 1000 }, // Trà Đen
  6:  { recipeUnit: "g",   conversionFactor: 1000 }, // Trà Oolong
  7:  { recipeUnit: "g",   conversionFactor: 500  }, // Bột Matcha Nhật (bịch 500g!)
  8:  { recipeUnit: "g",   conversionFactor: 1000 }, // Bột Sữa Béo Indo
  9:  { recipeUnit: "g",   conversionFactor: 2500 }, // Syrup Đường Đen (chai 2.5kg)
  10: { recipeUnit: "g",   conversionFactor: 1000 }, // Trân Châu Đen
  11: { recipeUnit: "g",   conversionFactor: 1000 }, // Thạch Trái Cây
  12: { recipeUnit: "Cái", conversionFactor: 1    }, // Ly Nhựa Kèm Nắp (cũ)
  13: { recipeUnit: "g",   conversionFactor: 1000 }, // Đường Trắng (1 Kg = 1000g)
  14: { recipeUnit: "Cái", conversionFactor: 1    }, // Ly Nhựa Size S
  15: { recipeUnit: "Cái", conversionFactor: 1    }, // Ly Nhựa Size M
  16: { recipeUnit: "Cái", conversionFactor: 1    }, // Ly Nhựa Size L
};

function fmt(n: number | null, unit?: string | null) {
  if (n === null) return "—";
  const s = n % 1 === 0 ? String(n) : n.toFixed(2);
  return unit ? `${s} ${unit}` : s;
}

export function IngredientFormula({ embedded = false }: { embedded?: boolean } = {}) {
  const [info] = useState(() => getStaffInfo());
  const [tab, setTab] = useState<"formulas" | "report">("formulas");
  const [formulas, setFormulas] = useState<FormulaRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<InvItem[]>([]);
  const [selProduct, setSelProduct] = useState("");
  const [drafts, setDrafts] = useState<DraftLine[]>([emptyDraft()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportRow[] | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };

  const loadFormulas = useCallback(async () => {
    try { setFormulas(await staffApi<FormulaRow[]>("/api/admin/formulas")); }
    catch (e) { setErr(e instanceof Error ? e.message : "Lỗi"); }
  }, []);

  useEffect(() => {
    if (!info || !isAdminRole(info.role)) return;
    void loadFormulas();
    staffApi<Product[]>("/api/products").then(setProducts).catch(() => {});
    staffApi<InvItem[]>("/api/shifts/inventory").then(setItems).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Định mức của sản phẩm đang chọn
  const curFormulas = selProduct ? formulas.filter(f => f.productId === Number(selProduct)) : [];
  const usedIds = new Set(curFormulas.map(f => f.itemId));

  async function saveDrafts() {
    const valid = drafts.filter(d => d.itemId && d.qtyPerUnit && parseFloat(d.qtyPerUnit) > 0);
    if (valid.length === 0) { setErr("Chưa có dòng hợp lệ."); return; }
    if (!selProduct) { setErr("Chọn sản phẩm trước."); return; }
    setBusy(true);
    try {
      for (const d of valid) {
        await staffApi("/api/admin/formulas", {
          method: "POST",
          body: JSON.stringify({
            productId: Number(selProduct),
            itemId: Number(d.itemId),
            qtyPerUnit: parseFloat(d.qtyPerUnit),
            recipeUnit: d.recipeUnit.trim() || undefined,
            conversionFactor: parseFloat(d.conversionFactor) || 1,
            note: d.note.trim() || undefined,
          }),
        });
      }
      setDrafts([emptyDraft()]); setErr(null);
      showMsg(`Đã lưu ${valid.length} định mức.`);
      await loadFormulas();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); }
    finally { setBusy(false); }
  }

  async function deleteFormula(id: number) {
    if (!confirm("Xóa định mức này?")) return;
    try { await staffApi(`/api/admin/formulas/${id}`, { method: "DELETE" }); await loadFormulas(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Lỗi xóa"); }
  }

  async function loadReport() {
    setReportBusy(true);
    try { setReport(await staffApi<ReportRow[]>(`/api/admin/formula-report?date=${reportDate}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Lỗi báo cáo"); }
    finally { setReportBusy(false); }
  }

  if (!info || !isAdminRole(info.role)) {
    return (
      <div className="staff-page-inner">
        <h1 className="page-title">Định mức nguyên liệu</h1>
        <p style={{ color: "#5c534c" }}>Trang này chỉ dành cho quản lý.</p>
        <Link to="/staff/login" className="btn btn-ghost staff-btn-light">Đăng nhập</Link>
      </div>
    );
  }

  const grouped: Record<number, { name: string; rows: FormulaRow[] }> = {};
  for (const f of formulas) {
    if (!grouped[f.productId]) grouped[f.productId] = { name: f.product.name, rows: [] };
    grouped[f.productId].rows.push(f);
  }

  const colStyle = { padding: "0.45rem 0.6rem", color: "var(--text)" } as React.CSSProperties;
  const thStyle = { padding: "0.4rem 0.6rem", textAlign: "left" as const, color: "#3d3630", fontWeight: 600, whiteSpace: "nowrap" as const };

  return (
    <div className={embedded ? undefined : "admin-main-body"} style={embedded ? undefined : { minHeight: "100dvh", background: "#f0f2f5", padding: 0, flex: "none" }}>
    <div className={embedded ? undefined : "staff-page-inner staff-page-wide"} style={embedded ? undefined : { paddingTop: "1.5rem" }}>
      {!embedded && (
        <div className="staff-page-head">
          <h1 className="page-title" style={{ margin: 0 }}>Định mức nguyên liệu</h1>
          <Link to="/admin?tab=formulas" className="btn btn-ghost staff-btn-light">← Quản trị</Link>
        </div>
      )}
      {err && <p style={{ color: "#c94c4c", marginBottom: "0.5rem" }}>{err}</p>}
      {msg && <p style={{ color: "#2d7a3e", marginBottom: "0.5rem" }}>{msg}</p>}

      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.25rem" }}>
        {(["formulas", "report"] as const).map((id) => (
          <button key={id} type="button"
            className={tab === id ? "btn btn-primary" : "btn btn-ghost staff-btn-light"}
            style={{ padding: "0.4rem 1.2rem" }}
            onClick={() => setTab(id)}>
            {id === "formulas" ? "Quản lý định mức" : "Báo cáo hao hụt"}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Quản lý định mức ── */}
      {tab === "formulas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Recipe editor */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.85rem", color: "var(--text)" }}>Nhập công thức sản phẩm</h2>

            {/* Chọn sản phẩm */}
            <div style={{ marginBottom: "0.85rem" }}>
              <label className="label">Sản phẩm</label>
              <select className="input" value={selProduct} style={{ maxWidth: 360 }}
                onChange={(e) => { setSelProduct(e.target.value); setDrafts([emptyDraft()]); }}>
                <option value="">-- Chọn sản phẩm để chỉnh công thức --</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {selProduct && (
              <>
                {/* Định mức hiện tại */}
                {curFormulas.length > 0 && (
                  <div style={{ marginBottom: "0.85rem" }}>
                    <div style={{ fontSize: "0.83rem", color: "#6b5e55", marginBottom: "0.4rem" }}>Công thức hiện tại:</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e5ddd5" }}>
                          <th style={thStyle}>Nguyên liệu</th>
                          <th style={{ ...thStyle, textAlign: "center" as const, width: 60 }}>Size S</th>
                          <th style={{ ...thStyle, textAlign: "center" as const, width: 60 }}>Size M</th>
                          <th style={{ ...thStyle, textAlign: "center" as const, width: 60 }}>Size L</th>
                          <th style={thStyle}>Đơn vị</th>
                          <th style={thStyle}>Ghi chú</th>
                          <th style={{ ...thStyle, textAlign: "right" as const }}>Giá vốn</th>
                          <th style={thStyle}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {curFormulas.map((f) => {
                          const unit = f.recipeUnit || f.item.unit || "";
                          const hasSize = f.qtySizeS !== null || f.qtySizeM !== null || f.qtySizeL !== null;
                          return (
                            <tr key={f.id} style={{ borderBottom: "1px solid #f0ebe5" }}>
                              <td style={{ ...colStyle, fontWeight: 600 }}>{f.item.name}</td>
                              <td style={{ ...colStyle, textAlign: "center", color: "#2d7a3e" }}>
                                {hasSize ? (f.qtySizeS ?? "—") : "—"}
                              </td>
                              <td style={{ ...colStyle, textAlign: "center", color: "#2d7a3e", fontWeight: 700 }}>
                                {hasSize ? (f.qtySizeM ?? f.qtyPerUnit) : f.qtyPerUnit}
                              </td>
                              <td style={{ ...colStyle, textAlign: "center", color: "#2d7a3e" }}>
                                {hasSize ? (f.qtySizeL ?? "—") : "—"}
                              </td>
                              <td style={{ ...colStyle, fontSize: "0.78rem", color: "#6b5e55" }}>
                                {unit}{f.conversionFactor !== 1 ? ` (1${f.item.unit}=${f.conversionFactor}${unit})` : ""}
                              </td>
                              <td style={{ ...colStyle, fontSize: "0.78rem", fontStyle: "italic", color: "#6b5e55" }}>
                                {f.note ?? ""}
                              </td>
                              <td style={{ ...colStyle, textAlign: "right", fontWeight: 600, color: "var(--text)" }}>
                                {(() => {
                                  const invItem = items.find(i => i.id === f.itemId);
                                  const costPerUnit = invItem?.unitCostPrice || 0;
                                  const targetQty = hasSize ? (f.qtySizeM ?? f.qtyPerUnit) : f.qtyPerUnit;
                                  const cost = (costPerUnit / f.conversionFactor) * targetQty;
                                  return new Intl.NumberFormat("vi-VN").format(Math.round(cost)) + " đ";
                                })()}
                              </td>
                              <td style={colStyle}>
                                <button type="button" className="btn btn-ghost staff-btn-light"
                                  style={{ padding: "0.15rem 0.55rem", fontSize: "0.78rem", color: "#c94c4c" }}
                                  onClick={() => void deleteFormula(f.id)}>Xóa</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "rgba(45,122,62,0.05)" }}>
                          <td colSpan={6} style={{ ...colStyle, textAlign: "right", fontWeight: 700, color: "var(--text)" }}>
                            TỔNG GIÁ VỐN (Tạm tính Size M/Mặc định):
                          </td>
                          <td style={{ ...colStyle, textAlign: "right", fontWeight: 700, color: "#c94c4c", fontSize: "1.05rem" }}>
                            {(() => {
                              let totalCost = 0;
                              curFormulas.forEach(f => {
                                const invItem = items.find(i => i.id === f.itemId);
                                const costPerUnit = invItem?.unitCostPrice || 0;
                                const targetQty = (f.qtySizeM !== null || f.qtySizeL !== null || f.qtySizeS !== null) ? (f.qtySizeM ?? f.qtyPerUnit) : f.qtyPerUnit;
                                totalCost += (costPerUnit / f.conversionFactor) * targetQty;
                              });
                              return new Intl.NumberFormat("vi-VN").format(Math.round(totalCost)) + " đ";
                            })()}
                          </td>
                          <td style={colStyle}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}


                {/* Batch draft input */}
                <div style={{ fontSize: "0.83rem", color: "#6b5e55", marginBottom: "0.4rem" }}>
                  Thêm nguyên liệu mới vào công thức (có thể thêm nhiều dòng):
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", marginBottom: "0.65rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5ddd5" }}>
                      <th style={thStyle}>Nguyên liệu</th>
                      <th style={thStyle}>Lượng / ly</th>
                      <th style={thStyle}>Đơn vị CT</th>
                      <th style={{ ...thStyle, minWidth: 160 }}>Quy đổi (1 đv kho = ? đv CT)</th>
                      <th style={thStyle}>Ghi chú</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d, idx) => {
                      const availItems = items.filter(it => !usedIds.has(it.id) && !drafts.some((dd, i) => i !== idx && Number(dd.itemId) === it.id));
                      const selItem = items.find(it => it.id === Number(d.itemId));
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid #f0ebe5" }}>
                          <td style={{ padding: "0.35rem 0.4rem" }}>
                            <select className="input" value={d.itemId} style={{ fontSize: "0.83rem" }}
                              onChange={(e) => {
                                const newId = e.target.value;
                                const def = ITEM_DEFAULTS[Number(newId)];
                                setDrafts(prev => prev.map((x, i) => i === idx ? {
                                  ...x,
                                  itemId: newId,
                                  recipeUnit: def ? def.recipeUnit : x.recipeUnit,
                                  conversionFactor: def ? String(def.conversionFactor) : x.conversionFactor,
                                } : x));
                              }}>
                              <option value="">-- Chọn --</option>
                              {availItems.map(it => (
                                <option key={it.id} value={it.id}>{it.name} ({it.unit ?? "?"}) tồn:{it.stockQty}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "0.35rem 0.4rem" }}>
                            <input type="number" min={0.01} step={0.01} className="input" placeholder="200"
                              value={d.qtyPerUnit} style={{ width: 80, fontSize: "0.83rem" }}
                              onChange={(e) => setDrafts(prev => prev.map((x, i) => i === idx ? { ...x, qtyPerUnit: e.target.value } : x))} />
                          </td>
                          <td style={{ padding: "0.35rem 0.4rem" }}>
                            <input type="text" className="input" placeholder={selItem?.unit ?? "g"}
                              value={d.recipeUnit} style={{ width: 70, fontSize: "0.83rem" }}
                              onChange={(e) => setDrafts(prev => prev.map((x, i) => i === idx ? { ...x, recipeUnit: e.target.value } : x))} />
                          </td>
                          <td style={{ padding: "0.35rem 0.4rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <span style={{ fontSize: "0.78rem", color: "#6b5e55", whiteSpace: "nowrap" }}>
                                1 {selItem?.unit ?? "bịch"} =
                              </span>
                              <input type="number" min={0.01} step={0.01} className="input" placeholder="1000"
                                value={d.conversionFactor} style={{ width: 75, fontSize: "0.83rem" }}
                                onChange={(e) => setDrafts(prev => prev.map((x, i) => i === idx ? { ...x, conversionFactor: e.target.value } : x))} />
                              <span style={{ fontSize: "0.78rem", color: "#6b5e55" }}>{d.recipeUnit || selItem?.unit || "?"}</span>
                            </div>
                          </td>
                          <td style={{ padding: "0.35rem 0.4rem" }}>
                            <input type="text" className="input" placeholder="Tùy chọn"
                              value={d.note} style={{ fontSize: "0.83rem" }}
                              onChange={(e) => setDrafts(prev => prev.map((x, i) => i === idx ? { ...x, note: e.target.value } : x))} />
                          </td>
                          <td style={{ padding: "0.35rem 0.4rem" }}>
                            {drafts.length > 1 && (
                              <button type="button" className="btn btn-ghost staff-btn-light"
                                style={{ padding: "0.15rem 0.5rem", color: "#c94c4c", fontSize: "0.8rem" }}
                                onClick={() => setDrafts(prev => prev.filter((_, i) => i !== idx))}>X</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ display: "flex", gap: "0.65rem" }}>
                  <button type="button" className="btn btn-ghost staff-btn-light"
                    onClick={() => setDrafts(prev => [...prev, emptyDraft()])}
                    style={{ padding: "0.4rem 1rem", fontSize: "0.85rem" }}>
                    + Thêm dòng
                  </button>
                  <button type="button" className="btn btn-primary" disabled={busy}
                    onClick={() => void saveDrafts()} style={{ padding: "0.4rem 1.25rem" }}>
                    {busy ? "Đang lưu..." : `Lưu công thức (${drafts.filter(d => d.itemId && d.qtyPerUnit).length} dòng)`}
                  </button>
                </div>

                {/* Ví dụ tính toán */}
                {drafts.some(d => d.itemId && d.qtyPerUnit && d.conversionFactor) && (
                  <div style={{ marginTop: "0.75rem", padding: "0.65rem 0.85rem", background: "#fffbea", borderRadius: 8, border: "1px solid #fde68a", fontSize: "0.82rem", color: "#6b5e55" }}>
                    <strong style={{ color: "var(--text)" }}>Ví dụ tính:</strong>{" "}
                    {drafts.filter(d => d.itemId && d.qtyPerUnit).map((d, i) => {
                      const it = items.find(x => x.id === Number(d.itemId));
                      const qty = parseFloat(d.qtyPerUnit) || 0;
                      const cf = parseFloat(d.conversionFactor) || 1;
                      const recUnit = d.recipeUnit || it?.unit || "";
                      const stockUnit = it?.unit || "đv kho";
                      const lySPerStock = cf > 0 ? Math.round((cf / qty) * 100) / 100 : "?";
                      return <span key={i}>{i > 0 ? " · " : ""}1 {stockUnit} {it?.name ?? ""} → {lySPerStock} ly ({recUnit ? recUnit : ""})</span>;
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Tổng hợp tất cả */}
          <div>
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem", color: "var(--text)" }}>
              Tất cả công thức ({Object.keys(grouped).length} sản phẩm)
            </h2>
            {Object.keys(grouped).length === 0 ? (
              <div className="card" style={{ padding: "2rem", textAlign: "center", color: "#6b5e55" }}>
                Chưa có định mức nào.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {Object.entries(grouped).map(([pid, { name, rows }]) => (
                  <div key={pid} className="card" style={{ padding: "0.85rem 1rem" }}>
                    <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: "0.45rem" }}>{name}</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e5ddd5", color: "#6b5e55" }}>
                          <th style={{ padding: "0.2rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Nguyên liệu</th>
                          <th style={{ padding: "0.2rem 0.5rem", textAlign: "center", fontWeight: 600, width: 55 }}>S</th>
                          <th style={{ padding: "0.2rem 0.5rem", textAlign: "center", fontWeight: 600, width: 55 }}>M</th>
                          <th style={{ padding: "0.2rem 0.5rem", textAlign: "center", fontWeight: 600, width: 55 }}>L</th>
                          <th style={{ padding: "0.2rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Đơn vị</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((f) => {
                          const unit = f.recipeUnit || f.item.unit || "";
                          const hasSize = f.qtySizeS !== null || f.qtySizeM !== null || f.qtySizeL !== null;
                          return (
                            <tr key={f.id} style={{ borderBottom: "1px solid #f5f0eb" }}>
                              <td style={{ padding: "0.2rem 0.5rem", color: "var(--text)", fontWeight: 500 }}>{f.item.name}</td>
                              <td style={{ padding: "0.2rem 0.5rem", textAlign: "center", color: hasSize ? "#2d7a3e" : "#aaa" }}>
                                {hasSize ? (f.qtySizeS ?? "—") : "—"}
                              </td>
                              <td style={{ padding: "0.2rem 0.5rem", textAlign: "center", color: "#1a6b3a", fontWeight: 700 }}>
                                {hasSize ? (f.qtySizeM ?? f.qtyPerUnit) : f.qtyPerUnit}
                              </td>
                              <td style={{ padding: "0.2rem 0.5rem", textAlign: "center", color: hasSize ? "#2d7a3e" : "#aaa" }}>
                                {hasSize ? (f.qtySizeL ?? "—") : "—"}
                              </td>
                              <td style={{ padding: "0.2rem 0.5rem", color: "#6b5e55", fontSize: "0.78rem" }}>{unit}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab 2: Báo cáo hao hụt ── */}
      {tab === "report" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="card" style={{ padding: "1rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label className="label" htmlFor="rep-date">Ngày</label>
                <input id="rep-date" type="date" className="input" value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)} style={{ width: 180 }} />
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void loadReport()}
                disabled={reportBusy} style={{ padding: "0.5rem 1.5rem" }}>
                {reportBusy ? "Đang tải..." : "Xem báo cáo"}
              </button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#6b5e55", margin: "0.55rem 0 0" }}>
              Lý thuyết (đv kho) = tổng [số ly × định mức] ÷ hệ số quy đổi. So sánh với thực tế kiểm kho mở/kết ca.
            </p>
          </div>

          {report !== null && (
            report.length === 0
              ? <div className="card" style={{ padding: "2rem", textAlign: "center", color: "#6b5e55" }}>Không có dữ liệu. Hãy thiết lập định mức và kiểm kho trong ngày.</div>
              : (
                <div className="card" style={{ padding: "1rem", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem", minWidth: 780 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e5ddd5" }}>
                        {["Nguyên liệu", "ĐVT kho", "Lý thuyết (đv CT)", "Lý thuyết (đv kho)", "Mở ca", "Kết ca", "Thực tế", "Chênh lệch", "Trạng thái"].map(h => (
                          <th key={h} style={{ ...thStyle, fontSize: "0.82rem" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.map((row) => {
                        const ok = row.chenhLech === 0;
                        const waste = (row.chenhLech ?? 0) > 0;
                        const less = (row.chenhLech ?? 0) < 0;
                        const sc = ok ? "#2d7a3e" : waste ? "#c94c4c" : less ? "#b07000" : "#6b5e55";
                        const sb = ok ? "#f0faf4" : waste ? "#fff0f0" : less ? "#fffbea" : "#f5f0eb";
                        const st = row.chenhLech === null ? "Chưa kết ca"
                          : ok ? "Vừa đủ"
                          : waste ? `Hao hụt ${fmt(row.chenhLech)} ${row.unit ?? ""}`
                          : `Ít hơn ${fmt(Math.abs(row.chenhLech!))} ${row.unit ?? ""}`;
                        const ru = row.recipeUnit || row.unit || "";
                        return (
                          <>
                            <tr key={row.itemId} style={{ borderBottom: "1px solid #f0ebe5", cursor: "pointer" }}
                              onClick={() => setExpanded(p => ({ ...p, [row.itemId]: !p[row.itemId] }))}>
                              <td style={{ ...colStyle, fontWeight: 600 }}>
                                <span style={{ color: "#6b5e55", fontSize: "0.75rem", marginRight: "0.35rem" }}>{expanded[row.itemId] ? "▲" : "▼"}</span>
                                {row.itemName}
                              </td>
                              <td style={colStyle}>{row.unit ?? "—"}</td>
                              <td style={colStyle}>{fmt(row.lyThuyet)} {ru}</td>
                              <td style={{ ...colStyle, fontWeight: 600 }}>{fmt(row.lyThuyetStock)} {row.unit ?? ""}</td>
                              <td style={colStyle}>{fmt(row.openQty)}</td>
                              <td style={colStyle}>{fmt(row.closeQty)}</td>
                              <td style={{ ...colStyle, fontWeight: 600 }}>{fmt(row.thucTe)}</td>
                              <td style={{ ...colStyle, color: waste ? "#c94c4c" : less ? "#b07000" : "var(--text)", fontWeight: row.chenhLech !== null && row.chenhLech !== 0 ? 700 : 400 }}>
                                {row.chenhLech !== null ? (row.chenhLech > 0 ? `+${fmt(row.chenhLech)}` : fmt(row.chenhLech)) : "—"}
                              </td>
                              <td style={colStyle}>
                                <span style={{ padding: "0.2rem 0.6rem", borderRadius: 99, fontSize: "0.78rem", fontWeight: 600, color: sc, background: sb, border: `1px solid ${sc}44`, whiteSpace: "nowrap" }}>
                                  {st}
                                </span>
                              </td>
                            </tr>
                            {expanded[row.itemId] && (
                              <tr key={`${row.itemId}_d`} style={{ background: "#fafaf8" }}>
                                <td colSpan={9} style={{ padding: "0.3rem 0.6rem 0.6rem 2rem" }}>
                                  <table style={{ fontSize: "0.8rem", borderCollapse: "collapse" }}>
                                    <thead><tr>{["Sản phẩm", "Định mức/ly", "Số ly", "Tiêu thụ (đv CT)", "→ đv kho"].map(h =>
                                      <th key={h} style={{ padding: "0.25rem 0.5rem", textAlign: "left", color: "#6b5e55" }}>{h}</th>)}</tr></thead>
                                    <tbody>
                                      {row.lines.map((l) => (
                                        <tr key={l.productName}>
                                          <td style={{ padding: "0.2rem 0.5rem", color: "var(--text)" }}>{l.productName}</td>
                                          <td style={{ padding: "0.2rem 0.5rem", color: "#6b5e55" }}>{l.qtyPerUnit} {l.recipeUnit || row.unit || ""}</td>
                                          <td style={{ padding: "0.2rem 0.5rem" }}>{l.soldQty} ly</td>
                                          <td style={{ padding: "0.2rem 0.5rem", fontWeight: 600, color: "var(--text)" }}>{fmt(l.consumed)} {l.recipeUnit || row.unit || ""}</td>
                                          <td style={{ padding: "0.2rem 0.5rem", color: "#2d7a3e" }}>{fmt(row.conversionFactor > 0 ? l.consumed / row.conversionFactor : 0)} {row.unit ?? ""}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
          )}
          {report === null && (
            <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "#6b5e55" }}>
              Chọn ngày và nhấn "Xem báo cáo".
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
