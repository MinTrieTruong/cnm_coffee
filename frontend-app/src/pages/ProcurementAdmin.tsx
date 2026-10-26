import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, FilePlus, Package, FolderOpen, FileText, Download, X, Search, ArrowLeft } from "lucide-react";
import { getStaffInfo, isAdminRole, staffApi } from "../lib/staffApi";
import { fmtQty } from "../components/erp";

/** Trạng thái đơn mua (PO) */
const PO_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: "Chờ Giao Hàng", bg: "rgba(245,158,11,0.2)", color: "#b45309" },
  PARTIAL: { label: "Đã nhận một phần", bg: "rgba(59,130,246,0.2)", color: "#1d4ed8" },
  DELIVERED: { label: "Đã Giao & Nhập Kho", bg: "rgba(16,185,129,0.2)", color: "#047857" },
  CLOSED: { label: "Đã đóng (giao thiếu)", bg: "rgba(107,114,128,0.2)", color: "#4b5563" },
};

export function ProcurementAdmin({ embedded = false }: { embedded?: boolean } = {}) {
  // Thủ kho lập đề xuất & nhận hàng; Quản lý chi nhánh duyệt đề xuất & chọn báo giá
  const role = getStaffInfo()?.role;
  const keeper = role === "Warehouse";
  const approver = isAdminRole(role);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"pr" | "rfq" | "po" | "drive">("pr");

  const [prs, setPrs] = useState<any[]>([]);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);

  const [showCreatePr, setShowCreatePr] = useState(false);
  const [newPrItems, setNewPrItems] = useState<{itemId: number, qty: number, note: string}[]>([]);

  const [selectedRfq, setSelectedRfq] = useState<any>(null);

  const [receivingPo, setReceivingPo] = useState<any>(null);
  /** Nhận hàng theo PO: số thực nhận / hỏng-trả lại / hạn dùng / ghi chú từng mặt hàng (itemId → giá trị) */
  const [recv, setRecv] = useState<Record<number, { qty: string; rejected: string; expiry: string; note: string }>>({});
  const [recvNote, setRecvNote] = useState("");

  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Filters for Drive
  const [docFilterType, setDocFilterType] = useState("ALL");
  const [docSearch, setDocSearch] = useState("");

  useEffect(() => {
    loadData();
    if (tab === "pr") loadInventory();
  }, [tab]);

  async function loadData() {
    try {
      if (tab === "pr") {
        setPrs(await staffApi<any[]>("/api/purchasing/requisitions"));
      } else if (tab === "rfq") {
        setRfqs(await staffApi<any[]>("/api/purchasing/rfqs"));
      } else if (tab === "po") {
        setPos(await staffApi<any[]>("/api/purchasing/orders"));
      } else if (tab === "drive") {
        setDocs(await staffApi<any[]>("/api/purchasing/documents"));
      }
    } catch (e) {
      console.error("[ProcurementAdmin] loadData error:", e);
    }
  }

  async function loadInventory() {
    try {
      setInventory(await staffApi<any[]>("/api/admin/inventory"));
    } catch(e) {}
  }

  async function createPR() {
    try {
      await staffApi("/api/purchasing/requisitions", {
        method: "POST",
        body: JSON.stringify({ items: newPrItems })
      });
      setShowCreatePr(false);
      setNewPrItems([]);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function approvePR(id: number) {
    if (!window.confirm("Duyệt PR này và tự động phát hành Yêu Cầu Báo Giá (RFQ)?")) return;
    try {
      await staffApi(`/api/purchasing/requisitions/${id}/approve`, { method: "POST" });
      loadData();
    } catch (e: any) { alert(e.message); }
  }

  async function selectQuote(rfq: any, quote: any) {
    // Báo giá thiếu mặt hàng → hỏi rõ; phần thiếu được tách sang đề xuất mua mới
    const missing = rfq.requisition.items.filter((i: any) => !quote.items.some((qi: any) => qi.itemId === i.itemId && qi.unitPrice > 0));
    const ask = missing.length
      ? `Báo giá của ${quote.supplier.name} THIẾU: ${missing.map((m: any) => m.item.name).join(", ")}.\n\nVẫn chốt báo giá này? Các mặt hàng thiếu sẽ được tạo thành một đề xuất mua mới để lấy báo giá khác.`
      : "Chốt báo giá này và tự động tạo Đơn Đặt Hàng (PO)?";
    if (!window.confirm(ask)) return;
    try {
      const r = await staffApi<{ poCode: string; followUp: string | null }>(`/api/purchasing/rfqs/${rfq.id}/select-quote`, {
        method: "POST",
        body: JSON.stringify({ quoteId: quote.id, allowPartial: missing.length > 0 })
      });
      if (r.followUp) alert(`Đã tạo ${r.poCode}. Các mặt hàng thiếu đã chuyển sang đề xuất ${r.followUp} (chờ duyệt).`);
      setSelectedRfq(null);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function openReceive(po: any) {
    setRecv(Object.fromEntries(po.lines.filter((l: any) => l.remaining > 0).map((l: any) => [l.itemId, { qty: String(l.remaining), rejected: "", expiry: "", note: "" }])));
    setRecvNote("");
    setReceivingPo(po);
  }

  async function closeOrder(po: any) {
    const note = window.prompt(`Đóng ${po.code}, không nhận thêm hàng? Ghi lý do (VD: NCC hết hàng, không giao bù):`);
    if (!note?.trim()) return;
    try {
      await staffApi(`/api/purchasing/orders/${po.id}/close`, { method: "POST", body: JSON.stringify({ note }) });
      loadData();
    } catch (e: any) { alert(e.message); }
  }

  async function receiveOrder() {
    if (!receivingPo) return;
    const toInt = (v: string) => (v.trim() === "" ? 0 : Number(v));
    const lines = receivingPo.lines
      .filter((l: any) => recv[l.itemId])
      .map((l: any) => {
        const r = recv[l.itemId];
        return { itemId: l.itemId, name: l.name, remaining: l.remaining, receivedQty: toInt(r.qty), rejectedQty: toInt(r.rejected), expiryDate: r.expiry || null, note: r.note };
      });
    const bad = lines.find((l: any) => !Number.isInteger(l.receivedQty) || l.receivedQty < 0 || !Number.isInteger(l.rejectedQty) || l.rejectedQty < 0 || l.receivedQty > l.remaining);
    if (bad) return alert(`Số lượng của ${bad.name} không hợp lệ (nhận tối đa ${bad.remaining}).`);
    if (!lines.some((l: any) => l.receivedQty > 0 || l.rejectedQty > 0)) return alert("Nhập số thực nhận cho ít nhất 1 mặt hàng.");
    const noExpiry = lines.filter((l: any) => l.receivedQty > 0 && !l.expiryDate).map((l: any) => l.name);
    const short = lines.filter((l: any) => l.receivedQty < l.remaining);
    const msg = [
      "Xác nhận nhập kho (tạo phiếu nhập GRN)? Tồn kho và công nợ NCC tính theo số thực nhận.",
      short.length ? `\nGiao thiếu: ${short.map((l: any) => `${l.name} (${l.receivedQty}/${l.remaining})`).join(", ")} — đơn chuyển sang "Đã nhận một phần", nhận tiếp đợt sau.` : "",
      noExpiry.length ? `\nChưa nhập hạn sử dụng: ${noExpiry.join(", ")} — sẽ không có cảnh báo hết hạn cho lô này.` : "",
    ].join("");
    if (!window.confirm(msg)) return;
    try {
      await staffApi(`/api/purchasing/orders/${receivingPo.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ note: recvNote, lines: lines.map(({ itemId, receivedQty, rejectedQty, expiryDate, note }: any) => ({ itemId, receivedQty, rejectedQty, expiryDate, note })) })
      });
      setReceivingPo(null);
      setRecv({});
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function downloadPDF() {
    if (!printRef.current || !previewDoc) return;
    const html2pdf = (await import("html2pdf.js")).default;
    const element = printRef.current;
    const opt = {
      margin:       1,
      filename:     `${previewDoc.code}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    } as const;
    html2pdf().set(opt).from(element).save();
  }

  const filteredDocs = docs.filter(d => {
    if (docFilterType !== "ALL" && d.type !== docFilterType) return false;
    if (docSearch && !d.code.toLowerCase().includes(docSearch.toLowerCase()) && !d.title.toLowerCase().includes(docSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="procurement-page" style={embedded ? undefined : { padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: embedded ? "flex-end" : "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: embedded ? "1rem" : "2rem" }}>
        {!embedded && (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <button
              className="secondary-btn"
              onClick={() => navigate(-1)}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.9rem" }}
            >
              <ArrowLeft size={16} /> Quay lại
            </button>
            <h1 className="page-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ShoppingCart /> Mua Hàng & Kho Chứng Từ (P2P)
            </h1>
          </div>
        )}
        {tab === "pr" && keeper && (
          <button className="primary-btn" onClick={() => setShowCreatePr(true)}>
            <FilePlus size={18} /> Tạo Phiếu Đề Xuất (PR)
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: embedded ? "1.25rem" : "2rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
        <button className={tab === "pr" ? "primary-btn" : "secondary-btn"} onClick={() => { setTab("pr"); setSelectedRfq(null); }}>
          Đề Xuất (PR)
        </button>
        <button className={tab === "rfq" ? "primary-btn" : "secondary-btn"} onClick={() => { setTab("rfq"); setSelectedRfq(null); }}>
          Báo Giá (RFQ)
        </button>
        <button className={tab === "po" ? "primary-btn" : "secondary-btn"} onClick={() => setTab("po")}>
          Đơn Đặt Hàng (PO)
        </button>
        <button className={tab === "drive" ? "primary-btn" : "secondary-btn"} onClick={() => setTab("drive")} style={{ background: tab === "drive" ? "#3b82f6" : undefined, borderColor: tab === "drive" ? "#3b82f6" : undefined }}>
          <FolderOpen size={18} /> Kho Chứng Từ
        </button>
      </div>

      {/* CREATE PR MODAL */}
      {showCreatePr && (
        <div style={{ background: "var(--surface2)", padding: "1.5rem", borderRadius: 8, marginBottom: "2rem" }}>
          <h3>Tạo Đề Xuất Mua Hàng Mới</h3>
          {newPrItems.map((item, idx) => (
            <div key={idx} style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
              <select 
                className="input-field" 
                value={item.itemId || ""}
                onChange={e => {
                  const arr = [...newPrItems];
                  arr[idx].itemId = Number(e.target.value);
                  setNewPrItems(arr);
                }}
                style={{ flex: 1, minWidth: 200 }}
              >
                <option value="">-- Chọn Nguyên Liệu --</option>
                {inventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit}) - Tồn: {fmtQty(i.stockQty)}</option>)}
              </select>
              <input 
                type="number" className="input-field" placeholder="Số lượng" value={item.qty || ""}
                onChange={e => { const arr = [...newPrItems]; arr[idx].qty = Number(e.target.value); setNewPrItems(arr); }}
                style={{ width: 120 }}
              />
              <input 
                type="text" className="input-field" placeholder="Ghi chú (tùy chọn)" value={item.note || ""}
                onChange={e => { const arr = [...newPrItems]; arr[idx].note = e.target.value; setNewPrItems(arr); }}
                style={{ flex: 1, minWidth: 200 }}
              />
              <button className="secondary-btn" onClick={() => setNewPrItems(newPrItems.filter((_, i) => i !== idx))}>Xóa</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "1rem" }}>
            <button className="secondary-btn" onClick={() => setNewPrItems([...newPrItems, { itemId: 0, qty: 0, note: "" }])}>+ Thêm món</button>
            <button className="primary-btn" onClick={createPR} disabled={newPrItems.length === 0}>Gửi Đề Xuất</button>
            <button className="secondary-btn" onClick={() => setShowCreatePr(false)}>Hủy</button>
          </div>
        </div>
      )}

      {/* PR TAB */}
      {tab === "pr" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {prs.length === 0 ? <p style={{ color: "var(--muted)" }}>Chưa có đề xuất nào.</p> : prs.map(pr => (
            <div key={pr.id} style={{ background: "var(--surface2)", padding: "1.5rem", borderRadius: 8, border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--accent)" }}>{pr.code}</h3>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>
                  Người tạo: <strong style={{ color: "var(--text)" }}>{pr.staff.fullName}</strong> - {new Date(pr.createdAt).toLocaleString("vi-VN")}
                </p>
                <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.95rem" }}>
                  Gồm: {pr.items.map((i:any) => `${i.qty} ${i.item.unit} ${i.item.name}`).join(", ")}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
                <span style={{ padding: "0.25rem 0.75rem", borderRadius: 999, fontSize: "0.85rem", background: pr.status === "APPROVED" ? "rgba(59,130,246,0.2)" : pr.status === "COMPLETED" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)", color: pr.status === "APPROVED" ? "#3b82f6" : pr.status === "COMPLETED" ? "#047857" : "#b45309" }}>
                  {pr.status === "PENDING" ? "Chờ Duyệt" : pr.status === "APPROVED" ? "Đã Duyệt (Đang lấy báo giá)" : "Hoàn Tất"}
                </span>
                {pr.status === "PENDING" && approver && (
                  <button className="primary-btn" style={{ padding: "0.4rem 1rem", fontSize: "0.9rem" }} onClick={() => approvePR(pr.id)}>
                    Duyệt & Tạo RFQ
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RFQ TAB */}
      {tab === "rfq" && !selectedRfq && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {rfqs.length === 0 ? <p style={{ color: "var(--muted)" }}>Chưa có RFQ nào.</p> : rfqs.map(rfq => (
            <div key={rfq.id} style={{ background: "var(--surface2)", padding: "1.5rem", borderRadius: 8, border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h3 style={{ margin: "0 0 0.5rem 0", color: "#3b82f6" }}>{rfq.code}</h3>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>Từ Phiếu Đề Xuất: <strong style={{ color: "var(--text)" }}>{rfq.requisition.code}</strong></p>
                <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.95rem" }}>
                  Đã nhận <strong style={{ color: "var(--accent)" }}>{rfq.quotes.length}</strong> báo giá từ các NCC.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
                <span style={{ padding: "0.25rem 0.75rem", borderRadius: 999, fontSize: "0.85rem", background: rfq.status === "CLOSED" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)", color: rfq.status === "CLOSED" ? "#047857" : "#b45309" }}>
                  {rfq.status === "CLOSED" ? "Đã Chốt PO" : "Đang Mở"}
                </span>
                {rfq.status === "OPEN" && (
                  <button className="primary-btn" style={{ padding: "0.4rem 1rem", fontSize: "0.9rem" }} onClick={() => setSelectedRfq(rfq)}>
                    So sánh Báo giá
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* COMPARE QUOTES (RFQ DETAILS) */}
      {selectedRfq && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <button className="secondary-btn" onClick={() => setSelectedRfq(null)} style={{ marginBottom: "1rem" }}>Quay lại</button>
          <h2>So sánh báo giá cho: {selectedRfq.code}</h2>

          {selectedRfq.quotes.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>Chưa có nhà cung cấp nào gửi báo giá.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--surface2)", borderRadius: 8, overflow: "hidden", minWidth: 600 }}>
                <thead>
                  <tr style={{ background: "var(--surface2)" }}>
                    <th style={{ padding: "1rem", textAlign: "left" }}>Mặt hàng</th>
                    <th style={{ padding: "1rem", textAlign: "center" }}>Số lượng</th>
                    {selectedRfq.quotes.map((q:any) => (
                      <th key={q.id} style={{ padding: "1rem", textAlign: "right" }}>
                        <div style={{ color: "var(--accent)" }}>{q.supplier.name}</div>
                        {approver && (
                          <button className="primary-btn" style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", marginTop: "0.5rem" }} onClick={() => selectQuote(selectedRfq, q)}>
                            Chốt Báo giá & Tạo PO
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedRfq.requisition.items.map((i:any) => (
                    <tr key={i.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "1rem" }}>{i.item.name}</td>
                      <td style={{ padding: "1rem", textAlign: "center" }}>{i.qty} {i.item.unit}</td>
                      {selectedRfq.quotes.map((q:any) => {
                        const qItem = q.items.find((qi:any) => qi.itemId === i.itemId);
                        return (
                          <td key={q.id} style={{ padding: "1rem", textAlign: "right" }}>
                            {qItem ? `${qItem.unitPrice.toLocaleString()} đ/đv` : "---"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr style={{ borderTop: "1px solid var(--border)", fontWeight: "bold" }}>
                    <td style={{ padding: "1rem" }}>Tổng Tiền (Ước tính)</td>
                    <td></td>
                    {selectedRfq.quotes.map((q:any) => {
                      let total = 0;
                      selectedRfq.requisition.items.forEach((i:any) => {
                        const qItem = q.items.find((qi:any) => qi.itemId === i.itemId);
                        if (qItem) total += qItem.unitPrice * i.qty;
                      });
                      return <td key={q.id} style={{ padding: "1rem", textAlign: "right", color: "var(--accent)" }}>{total.toLocaleString()} đ</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* PO TAB */}
      {tab === "po" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {pos.length === 0 ? <p style={{ color: "var(--muted)" }}>Chưa có đơn đặt hàng nào.</p> : pos.map(po => (
            <div key={po.id} style={{ background: "var(--surface2)", padding: "1.5rem", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <h3 style={{ margin: "0 0 0.5rem 0", color: "#047857" }}>{po.code}</h3>
                  <p style={{ margin: 0, color: "var(--muted)" }}>Nhà cung cấp: <strong style={{ color: "var(--text)" }}>{po.supplier.name}</strong></p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ padding: "0.25rem 0.75rem", borderRadius: 999, fontSize: "0.85rem", background: PO_STATUS[po.status]?.bg ?? "rgba(245,158,11,0.2)", color: PO_STATUS[po.status]?.color ?? "#b45309", display: "inline-block", marginBottom: "0.5rem" }}>
                    {PO_STATUS[po.status]?.label ?? po.status}
                  </span>
                  <div style={{ fontWeight: "bold" }}>Tổng: {po.totalAmount.toLocaleString()} đ</div>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", minWidth: 400 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: "0.5rem" }}>Mặt hàng</th>
                      <th style={{ padding: "0.5rem" }}>Đặt</th>
                      <th style={{ padding: "0.5rem" }}>Đã nhận</th>
                      <th style={{ padding: "0.5rem" }}>Còn phải giao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((l: any) => (
                      <tr key={l.itemId} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem" }}>{l.name}</td>
                        <td style={{ padding: "0.5rem" }}>{l.ordered} {l.unit}</td>
                        <td style={{ padding: "0.5rem" }}>{l.received} {l.unit}</td>
                        <td style={{ padding: "0.5rem", color: l.remaining > 0 && po.status !== "CLOSED" ? "#b45309" : undefined }}>{po.status === "CLOSED" && l.remaining > 0 ? `Thiếu ${l.remaining} (đã đóng)` : l.remaining || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {po.receipts.length > 0 && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>
                  {po.receipts.map((g: any) => `${g.code} · ${new Date(g.createdAt).toLocaleDateString("vi-VN")} · ${g.receivedBy?.fullName ?? ""}${g.items.some((x: any) => x.rejectedQty > 0) ? ` · trả lại ${g.items.reduce((s: number, x: any) => s + x.rejectedQty, 0)}` : ""}${g.note ? ` · ${g.note}` : ""}`).join(" | ")}
                </div>
              )}
              {po.status === "CLOSED" && po.closeNote && <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>Đã đóng: {po.closeNote}</div>}
              {(po.status === "PENDING" || po.status === "PARTIAL") && (keeper || approver) && (
                <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                  {approver && po.status === "PARTIAL" && (
                    <button className="secondary-btn" onClick={() => closeOrder(po)}>Đóng đơn (không nhận thêm)</button>
                  )}
                  {keeper && (
                    <button className="primary-btn" onClick={() => openReceive(po)}>
                      <Package size={16} /> {po.status === "PARTIAL" ? "Nhận tiếp đợt sau" : "Nhận Hàng (Tạo Phiếu Nhập)"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* RECEIVE PO MODAL */}
      <AnimatePresence>
        {receivingPo && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ background: "var(--bg)", width: "100%", maxWidth: 600, padding: "2rem", borderRadius: 12, border: "1px solid var(--border)", maxHeight: "90vh", overflowY: "auto" }}>
              <h2 style={{ margin: "0 0 1rem 0", color: "var(--accent)" }}>Nhập Kho - {receivingPo.code}</h2>
              <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>Đếm hàng thực nhận. Hàng hỏng / sai quy cách ghi vào "Trả lại" (không nhập kho, không tính tiền). Giao thiếu thì đơn chờ nhận tiếp đợt sau.</p>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {receivingPo.lines.filter((l: any) => recv[l.itemId]).map((l: any) => {
                  const r = recv[l.itemId];
                  const set = (k: "qty" | "rejected" | "expiry" | "note", v: string) => setRecv((prev) => ({ ...prev, [l.itemId]: { ...prev[l.itemId], [k]: v } }));
                  return (
                    <div key={l.itemId} style={{ background: "var(--surface2)", padding: "1rem", borderRadius: 8, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <div>
                        <div style={{ fontWeight: "bold" }}>{l.name}</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Đặt {l.ordered} {l.unit}{l.received ? ` · đã nhận ${l.received}` : ""} · còn phải giao {l.remaining}</div>
                      </div>
                      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                        <label style={{ fontSize: "0.85rem" }}>Thực nhận<br /><input className="input-field" style={{ padding: "0.4rem", width: 90 }} inputMode="numeric" value={r.qty} onChange={(e) => set("qty", e.target.value.replace(/\D/g, ""))} /></label>
                        <label style={{ fontSize: "0.85rem" }}>Trả lại (hỏng)<br /><input className="input-field" style={{ padding: "0.4rem", width: 90 }} inputMode="numeric" value={r.rejected} onChange={(e) => set("rejected", e.target.value.replace(/\D/g, ""))} /></label>
                        <label style={{ fontSize: "0.85rem" }}>Hạn sử dụng<br /><input type="date" className="input-field" style={{ padding: "0.4rem" }} value={r.expiry} onChange={(e) => set("expiry", e.target.value)} /></label>
                        <label style={{ fontSize: "0.85rem", flex: 1, minWidth: 140 }}>Ghi chú<br /><input className="input-field" style={{ padding: "0.4rem", width: "100%" }} value={r.note} onChange={(e) => set("note", e.target.value)} placeholder="VD: 2 hộp móp" /></label>
                      </div>
                    </div>
                  );
                })}
                <label style={{ fontSize: "0.85rem" }}>Ghi chú đợt nhận<br /><input className="input-field" style={{ padding: "0.4rem", width: "100%" }} value={recvNote} onChange={(e) => setRecvNote(e.target.value)} placeholder="VD: NCC hẹn giao bù thứ 6" /></label>
              </div>

              <div style={{ display: "flex", gap: "1rem", marginTop: "2rem", justifyContent: "flex-end" }}>
                <button className="secondary-btn" onClick={() => setReceivingPo(null)}>Hủy</button>
                <button className="primary-btn" onClick={receiveOrder}>Xác nhận Nhập Kho (Tạo GRN)</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DOCUMENT DRIVE TAB */}
      {tab === "drive" && (
        <div>
          {/* Drive Toolbar */}
          <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 250 }}>
              <Search style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} size={18} />
              <input 
                type="text" 
                className="input-field" 
                style={{ paddingLeft: "3rem", width: "100%" }} 
                placeholder="Tìm kiếm chứng từ theo mã..." 
                value={docSearch}
                onChange={e => setDocSearch(e.target.value)}
              />
            </div>
            <select className="input-field" value={docFilterType} onChange={e => setDocFilterType(e.target.value)} style={{ width: 150 }}>
              <option value="ALL">Tất cả chứng từ</option>
              <option value="PR">Phiếu Đề Xuất (PR)</option>
              <option value="RFQ">Yêu Cầu Báo Giá (RFQ)</option>
              <option value="PO">Đơn Đặt Hàng (PO)</option>
              <option value="GRN">Phiếu Nhập Kho (GRN)</option>
            </select>
          </div>

          {/* Drive Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1.5rem" }}>
            {filteredDocs.length === 0 ? <p style={{ color: "var(--muted)", gridColumn: "1/-1" }}>Không tìm thấy tài liệu nào.</p> : filteredDocs.map(d => (
              <div 
                key={`${d.type}-${d.id}`} 
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", cursor: "pointer", transition: "all 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f5f5f4"}
                onMouseLeave={e => e.currentTarget.style.background = "#f5f5f4"}
                onClick={() => setPreviewDoc(d)}
              >
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem", color: d.type === 'PR' ? '#3b82f6' : d.type === 'RFQ' ? '#b45309' : d.type === 'PO' ? '#047857' : '#a855f7' }}>
                  <FileText size={48} strokeWidth={1.5} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: "bold", fontSize: "0.95rem", marginBottom: "0.25rem" }}>{d.code}.pdf</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{new Date(d.date).toLocaleDateString("vi-VN")}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--accent)", marginTop: "0.5rem" }}>{d.type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      <AnimatePresence>
        {previewDoc && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", flexDirection: "column", padding: "2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", color: "#fff" }}>
              <div style={{ display: "flex", gap: "1rem" }}>
                <button className="primary-btn" onClick={downloadPDF}><Download size={18} /> Tải xuống bản PDF</button>
              </div>
              <button className="icon-btn" style={{ color: "#fff" }} onClick={() => setPreviewDoc(null)}><X size={24}/></button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", paddingBottom: "2rem" }}>
              {/* Vùng Render HTML để in PDF */}
              <div ref={printRef} style={{ background: "#fff", color: "#000", width: "210mm", minHeight: "297mm", padding: "20mm", fontFamily: "serif", boxShadow: "var(--shadow-lg)" }}>
                <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: "10px", marginBottom: "20px" }}>
                  <h1 style={{ margin: 0, fontSize: "24px", textTransform: "uppercase" }}>Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam</h1>
                  <h2 style={{ margin: "5px 0 0 0", fontSize: "16px" }}>Độc lập - Tự do - Hạnh phúc</h2>
                </div>

                <h1 style={{ textAlign: "center", fontSize: "28px", marginTop: "30px", marginBottom: "10px" }}>
                  {previewDoc.type === "PR" ? "PHIẾU YÊU CẦU MUA HÀNG" : previewDoc.type === "RFQ" ? "PHIẾU YÊU CẦU BÁO GIÁ" : previewDoc.type === "PO" ? "ĐƠN ĐẶT HÀNG" : "PHIẾU NHẬP KHO"}
                </h1>
                <div style={{ textAlign: "center", fontStyle: "italic", marginBottom: "40px" }}>Số: {previewDoc.code}</div>

                <div style={{ marginBottom: "20px", fontSize: "16px", lineHeight: "1.5" }}>
                  <p><strong>Ngày lập chứng từ:</strong> {new Date(previewDoc.date).toLocaleDateString("vi-VN")}</p>
                  <p><strong>Loại chứng từ:</strong> {previewDoc.type}</p>
                  <p><strong>Nội dung:</strong> {previewDoc.title}</p>
                  <p><strong>Trạng thái:</strong> {previewDoc.status}</p>
                </div>

                {/* Giả lập thông tin bảng */}
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "30px" }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1px solid #000", padding: "8px" }}>STT</th>
                      <th style={{ border: "1px solid #000", padding: "8px" }}>Mục / Thông tin liên quan</th>
                      <th style={{ border: "1px solid #000", padding: "8px" }}>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>1</td>
                      <td style={{ border: "1px solid #000", padding: "8px" }}>Chi tiết chứng từ đính kèm theo mã {previewDoc.code}</td>
                      <td style={{ border: "1px solid #000", padding: "8px" }}>Lưu trữ trên hệ thống điện tử</td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "80px", textAlign: "center" }}>
                  <div>
                    <strong>Người lập phiếu</strong>
                    <div style={{ marginTop: "60px" }}>(Ký và ghi rõ họ tên)</div>
                  </div>
                  <div>
                    <strong>Giám đốc / Quản lý</strong>
                    <div style={{ marginTop: "60px" }}>(Ký và đóng dấu)</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
