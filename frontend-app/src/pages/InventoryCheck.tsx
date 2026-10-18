import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStaffInfo, staffApi } from "../lib/staffApi";

type InvItem = {
  id: number;
  name: string;
  category: string | null;
  skuCode: string | null;
  unit: string | null;
  stockQty: number;
  minLevel: number;
  imageUrl: string | null;
};

// Purchase Requisition
type MyPR = {
  id: number;
  code: string;
  status: string;
  note: string | null;
  createdAt: string;
  items: { item: { name: string; unit: string | null }; qty: number }[];
};

export function InventoryCheck() {
  const [info] = useState(() => getStaffInfo());
  const [items, setItems] = useState<InvItem[]>([]);
  const [myPrs, setMyPrs] = useState<MyPR[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Filters
  const [activeCategory, setActiveCategory] = useState<string>("ALL");

  // Selection for Procurement
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  
  // Paper Form Modal State
  const [showPaperForm, setShowPaperForm] = useState(false);
  const [formQtys, setFormQtys] = useState<Record<number, string>>({});
  const [formNote, setFormNote] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      setErr(null);
      const [itemsData, prsData] = await Promise.all([
        staffApi<InvItem[]>("/api/shifts/inventory"),
        staffApi<MyPR[]>("/api/purchasing/my-requisitions")
      ]);
      setItems(itemsData);
      setMyPrs(prsData);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi tải dữ liệu kho");
    }
  }, []);

  useEffect(() => {
    if (info) {
      loadData();
    }
  }, [info, loadData]);

  if (!info) {
    return (
      <div className="staff-page-inner">
        <p style={{ color: "#5c534c" }}>Cần đăng nhập nhân sự.</p>
        <Link to="/staff/login" className="btn btn-primary">Đăng nhập</Link>
      </div>
    );
  }

  // Derive categories
  const PREDEFINED_CATEGORIES = ["Cà Phê", "Trà", "Sữa", "Syrup", "Topping", "Bao Bì", "Khác"];
  const dynamicCategories = Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[];
  const categories = ["ALL", ...new Set([...PREDEFINED_CATEGORIES, ...dynamicCategories])];

  const filteredItems = items.filter(it => {
    if (activeCategory !== "ALL" && it.category !== activeCategory) return false;
    return true;
  });

  const toggleSelection = (id: number) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openPaperForm = () => {
    if (selectedItemIds.size === 0) {
      setErr("Vui lòng chọn ít nhất 1 nguyên liệu cần mua.");
      return;
    }
    // Init qtys
    const qtys: Record<number, string> = {};
    selectedItemIds.forEach(id => qtys[id] = "1");
    setFormQtys(qtys);
    setFormNote("");
    setShowPaperForm(true);
    setErr(null);
  };

  const submitRequisition = async () => {
    const payloadItems = Array.from(selectedItemIds).map(id => ({
      itemId: id,
      qty: Number(formQtys[id]) || 1,
    }));
    
    setBusy(true);
    try {
      await staffApi("/api/purchasing/requisitions", {
        method: "POST",
        body: JSON.stringify({
          note: formNote.trim() || undefined,
          items: payloadItems,
        }),
      });
      setShowPaperForm(false);
      setSelectedItemIds(new Set());
      showToast("Đã gửi phiếu đề xuất mua hàng thành công!");
      void loadData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi gửi phiếu");
    } finally {
      setBusy(false);
    }
  };

  const selectedItemsDetails = items.filter(it => selectedItemIds.has(it.id));

  return (
    <div className="staff-page-inner staff-page-wide" style={{ position: "relative" }}>
      {/* Header */}
      <div className="staff-page-head" style={{ marginBottom: "1.5rem" }}>
        <h1 className="page-title" style={{ margin: 0 }}>Kho & Mua hàng</h1>
        <Link to={info.role === "Kitchen" ? "/kds" : "/admin"} className="btn btn-ghost staff-btn-light">
          {info.role === "Kitchen" ? "← Pha chế" : "← Quản trị"}
        </Link>
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: "1.5rem", right: "1.5rem",
          background: "#047857", color: "#fff",
          padding: "0.75rem 1.25rem", borderRadius: "8px",
          boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)", zIndex: 100,
          fontWeight: 500, display: "flex", alignItems: "center", gap: "0.5rem"
        }}>
          <span>✓</span> {toast}
        </div>
      )}

      {err && <p style={{ color: "var(--danger)", marginBottom: "1rem", fontWeight: 500 }}>{err}</p>}

      {/* Main View */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        
        {/* Controls Row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          
          {/* Category Filter - Pill style */}
          <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: "0.4rem 1rem",
                  borderRadius: "99px",
                  border: "none",
                  background: activeCategory === cat ? "var(--accent)" : "#fff",
                  color: activeCategory === cat ? "#fff" : "var(--text-strong)",
                  fontWeight: activeCategory === cat ? 600 : 500,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  boxShadow: activeCategory === cat ? "0 2px 8px rgba(0,0,0,0.15)" : "inset 0 0 0 1px var(--border)",
                  transition: "all 0.2s ease"
                }}
              >
                {cat === "ALL" ? "Tất cả" : cat}
              </button>
            ))}
          </div>

          <button 
            className="btn btn-primary" 
            onClick={openPaperForm}
            disabled={selectedItemIds.size === 0}
            style={{ 
              display: "flex", alignItems: "center", gap: "0.5rem", 
              padding: "0.6rem 1.25rem", borderRadius: "8px",
              opacity: selectedItemIds.size === 0 ? 0.6 : 1
            }}
          >
            <span>✍️</span> Tạo phiếu đề xuất ({selectedItemIds.size})
          </button>
        </div>

        {/* Inventory Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1.25rem"
        }}>
          {filteredItems.map(item => {
            const isOutOfStock = item.stockQty <= item.minLevel;
            const isSelected = selectedItemIds.has(item.id);
            
            return (
              <div 
                key={item.id} 
                onClick={() => toggleSelection(item.id)}
                style={{
                  background: "#fff",
                  borderRadius: "12px",
                  padding: "1.25rem",
                  border: `2px solid ${isSelected ? "var(--primary)" : isOutOfStock ? "#fecaca" : "transparent"}`,
                  boxShadow: isSelected ? "0 4px 12px rgba(0,0,0,0.1)" : "0 2px 8px rgba(0,0,0,0.05)",
                  cursor: "pointer",
                  position: "relative",
                  transition: "all 0.2s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem"
                }}
              >
                {/* Selection Checkbox */}
                <div style={{
                  position: "absolute", top: "1rem", right: "1rem",
                  width: "20px", height: "20px",
                  borderRadius: "4px",
                  border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                  background: isSelected ? "var(--primary)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {isSelected && <span style={{ color: "#fff", fontSize: "12px", fontWeight: "bold" }}>✓</span>}
                </div>

                <div style={{ paddingRight: "2rem" }}>
                  <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1.05rem", fontWeight: 700, color: "var(--text-strong)" }}>
                    {item.name}
                  </h3>
                  {item.category && (
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                      {item.category}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" }}>
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.2rem" }}>Tồn kho</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: isOutOfStock ? "#b91c1c" : "var(--text-strong)", lineHeight: 1 }}>
                      {item.stockQty.toLocaleString("vi-VN")} <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--muted)" }}>{item.unit}</span>
                    </div>
                  </div>
                  
                  {isOutOfStock && (
                    <div style={{ 
                      background: "#fef2f2", color: "#b91c1c", 
                      padding: "0.25rem 0.6rem", borderRadius: "99px", 
                      fontSize: "0.75rem", fontWeight: 700,
                      display: "flex", alignItems: "center", gap: "0.25rem"
                    }}>
                      ⚠️ Sắp hết
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Lịch sử đề xuất của tôi */}
        {myPrs.length > 0 && (
          <div style={{ marginTop: "3rem" }}>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "1.5rem", color: "var(--text-strong)", borderBottom: "2px solid var(--border)", paddingBottom: "0.5rem" }}>
              Lịch sử đề xuất mua hàng của bạn
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {myPrs.map(pr => (
                <div key={pr.id} style={{ 
                  background: "#fff", padding: "1.5rem", borderRadius: "12px", 
                  border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                  display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" 
                }}>
                  <div>
                    <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--primary)" }}>{pr.code}</h3>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.85rem" }}>
                      Ngày gửi: {new Date(pr.createdAt).toLocaleString("vi-VN")}
                    </p>
                    <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.95rem", color: "var(--text-strong)" }}>
                      Gồm: {pr.items.map(i => `${i.qty} ${i.item.unit} ${i.item.name}`).join(", ")}
                    </p>
                    {pr.note && <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--muted)", fontStyle: "italic" }}>Ghi chú: {pr.note}</p>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ 
                      padding: "0.4rem 1rem", borderRadius: "99px", fontSize: "0.85rem", fontWeight: 600,
                      background: pr.status === "APPROVED" ? "#dbeafe" : pr.status === "COMPLETED" ? "#d1fae5" : "#fef3c7", 
                      color: pr.status === "APPROVED" ? "#1d4ed8" : pr.status === "COMPLETED" ? "#047857" : "#b45309" 
                    }}>
                      {pr.status === "PENDING" ? "⏳ Chờ duyệt" : pr.status === "APPROVED" ? "📦 Đã duyệt & Đang chờ báo giá" : "✅ Hoàn tất"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* PAPER FORM MODAL */}
      {showPaperForm && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "var(--surface)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: "1rem"
        }}>
          <div style={{
            background: "#fdfbf7",
            width: "95%", maxWidth: "700px",
            maxHeight: "90vh", overflowY: "auto",
            borderRadius: "4px",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)",
            padding: "clamp(1.5rem, 5vw, 3rem)",
            position: "relative",
            fontFamily: "'Times New Roman', Times, serif",
            color: "#1f2937"
          }}>
            {/* Close Button */}
            <button 
              onClick={() => setShowPaperForm(false)}
              style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#6b7280" }}
            >
              ×
            </button>

            {/* Form Header */}
            <div style={{ textAlign: "center", marginBottom: "2rem", borderBottom: "2px solid #1f2937", paddingBottom: "1rem" }}>
              <h2 style={{ margin: "0 0 0.5rem 0", fontSize: "1.5rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }}>
                Công ty / Cửa hàng Cafe
              </h2>
              <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 900, textTransform: "uppercase" }}>
                Phiếu Đề Xuất Mua Hàng
              </h1>
            </div>

            {/* Form Info */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", marginBottom: "2rem", fontSize: "clamp(0.95rem, 2.5vw, 1.1rem)" }}>
              <div>
                <span style={{ fontWeight: 700 }}>Người đề xuất:</span> 
                <span style={{ marginLeft: "0.5rem", borderBottom: "1px dashed #6b7280", paddingBottom: "2px", display: "inline-block", minWidth: "150px" }}>
                  {info.fullName}
                </span>
              </div>
              <div>
                <span style={{ fontWeight: 700 }}>Ngày lập:</span> 
                <span style={{ marginLeft: "0.5rem", borderBottom: "1px dashed #6b7280", paddingBottom: "2px", display: "inline-block", minWidth: "150px" }}>
                  {new Date().toLocaleDateString("vi-VN")}
                </span>
              </div>
              <div style={{ gridColumn: "1 / -1", display: "flex" }}>
                <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>Lý do / Ghi chú:</span> 
                <input 
                  type="text" 
                  value={formNote}
                  onChange={e => setFormNote(e.target.value)}
                  placeholder="Ghi chú cho bộ phận thu mua..."
                  style={{ 
                    flex: 1, marginLeft: "0.5rem", border: "none", borderBottom: "1px dashed #6b7280", 
                    background: "transparent", outline: "none", fontSize: "1.1rem", fontFamily: "inherit"
                  }} 
                />
              </div>
            </div>

            {/* Form Table */}
            <div style={{ overflowX: "auto", marginBottom: "2.5rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "450px", fontFamily: "sans-serif" }}>
                <thead>
                <tr>
                  <th style={{ border: "1px solid #1f2937", padding: "0.75rem", background: "#f3f4f6", width: "50px", textAlign: "center" }}>STT</th>
                  <th style={{ border: "1px solid #1f2937", padding: "0.75rem", background: "#f3f4f6", textAlign: "left" }}>Tên Vật Tư / Hàng Hóa</th>
                  <th style={{ border: "1px solid #1f2937", padding: "0.75rem", background: "#f3f4f6", width: "100px", textAlign: "center" }}>ĐVT</th>
                  <th style={{ border: "1px solid #1f2937", padding: "0.75rem", background: "#f3f4f6", width: "120px", textAlign: "center" }}>SL Đề Xuất</th>
                </tr>
              </thead>
              <tbody>
                {selectedItemsDetails.map((it, idx) => (
                  <tr key={it.id}>
                    <td style={{ border: "1px solid #1f2937", padding: "0.75rem", textAlign: "center" }}>{idx + 1}</td>
                    <td style={{ border: "1px solid #1f2937", padding: "0.75rem", fontWeight: 600 }}>{it.name}</td>
                    <td style={{ border: "1px solid #1f2937", padding: "0.75rem", textAlign: "center", color: "#4b5563" }}>{it.unit ?? "-"}</td>
                    <td style={{ border: "1px solid #1f2937", padding: "0.5rem", textAlign: "center" }}>
                      <input 
                        type="number" 
                        min="1"
                        value={formQtys[it.id]}
                        onChange={(e) => setFormQtys(prev => ({ ...prev, [it.id]: e.target.value }))}
                        style={{ width: "80%", textAlign: "center", padding: "0.25rem", border: "1px solid #d1d5db", borderRadius: "4px" }}
                      />
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>

            {/* Signatures */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3rem", padding: "0 clamp(0.5rem, 3vw, 2rem)", textAlign: "center", fontSize: "clamp(0.9rem, 2.5vw, 1rem)" }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: "4rem" }}>Người lập phiếu</div>
                <div style={{ fontStyle: "italic", color: "#6b7280" }}>(Ký, ghi rõ họ tên)</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: "4rem" }}>Người duyệt</div>
                <div style={{ fontStyle: "italic", color: "#6b7280" }}>(Ký, ghi rõ họ tên)</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", fontFamily: "sans-serif" }}>
              <button 
                type="button" 
                className="btn btn-ghost" 
                onClick={() => setShowPaperForm(false)}
                style={{ padding: "0.75rem 1.5rem" }}
              >
                Hủy bỏ
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={() => void submitRequisition()}
                disabled={busy}
                style={{ padding: "0.75rem 2rem", fontWeight: 700, boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}
              >
                {busy ? "Đang gửi..." : "GỬI YÊU CẦU"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
