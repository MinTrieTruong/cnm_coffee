import { useEffect, useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { mediaUrl } from "../lib/api";
import { staffApi } from "../lib/staffApi";
import { fmtQty } from "./erp";
import { PhotoPicker } from "./PhotoPicker";
import { REJECT_REASON, RESOLUTION_LABEL, RETURN_STATUS, SUPPLIER_STATUS } from "../lib/supplierReturns";

type Lot = {
  id: number; itemId: number; remainingQty: number; unitPrice: number | null; receivedAt: string; expiryDate: string | null; note: string | null;
  deadline: string; overdue: boolean; grnId: number | null;
  item: { name: string; unit: string | null }; supplierRel: { id: number; name: string } | null;
};
type Line = { lotId: number; qty: string; reason: string; photo: string | null };

const card = { background: "var(--surface2)", padding: "1.25rem", borderRadius: 8, border: "1px solid var(--border)" } as const;
const vnd = (n: number) => `${n.toLocaleString("vi-VN")} đ`;
const dateVi = (d: string) => new Date(d).toLocaleDateString("vi-VN");

/**
 * Trả hàng nhà cung cấp — hàng lỗi phát hiện sau khi đã nhập kho.
 * Thủ kho lập phiếu theo lô (lý do + ảnh); quản lý duyệt và chọn cách xử lý tiền.
 */
export function SupplierReturnsPanel({ canCreate, canApprove }: { canCreate: boolean; canApprove: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** Form duyệt từng phiếu: returnId → lựa chọn */
  const [decide, setDecide] = useState<Record<number, { resolution: string; fund: string; lateReason: string }>>({});

  async function load() {
    try {
      setRows(await staffApi<any[]>("/api/purchasing/returns"));
    } catch (e) {
      console.error(e);
    }
  }
  useEffect(() => { void load(); }, []);

  async function openCreate() {
    try {
      setLots(await staffApi<Lot[]>("/api/purchasing/returnable-lots"));
      setSupplierId("");
      setLines([]);
      setNote("");
      setCreating(true);
    } catch (e: any) { alert(e.message); }
  }

  const suppliers = useMemo(() => {
    const m = new Map<number, string>();
    for (const l of lots) if (l.supplierRel) m.set(l.supplierRel.id, l.supplierRel.name);
    return [...m.entries()];
  }, [lots]);
  const supplierLots = lots.filter((l) => l.supplierRel?.id === supplierId);
  const lotOf = (id: number) => lots.find((l) => l.id === id);

  async function submit() {
    if (!lines.length) return alert("Thêm ít nhất 1 lô hàng cần trả.");
    for (const l of lines) {
      const lot = lotOf(l.lotId);
      const qty = Number(l.qty.replace(",", "."));
      if (!lot) return alert("Chọn lô hàng cho mọi dòng.");
      if (!(qty > 0) || qty > lot.remainingQty) return alert(`${lot.item.name}: số trả từ 0 đến ${fmtQty(lot.remainingQty)}.`);
      if (!l.reason || !l.photo) return alert(`${lot.item.name}: chọn lý do và chụp ảnh hàng lỗi.`);
    }
    const late = lines.map((l) => lotOf(l.lotId)!).filter((l) => l.overdue);
    if (late.length && !window.confirm(`Đã quá hạn trả hàng: ${late.map((l) => l.item.name).join(", ")}. Vẫn gửi? Quản lý phải ghi lý do khi duyệt.`)) return;
    setBusy(true);
    try {
      await staffApi("/api/purchasing/returns", {
        method: "POST",
        body: JSON.stringify({ note, lines: lines.map((l) => ({ lotId: l.lotId, qty: Number(l.qty.replace(",", ".")), reason: l.reason, photo: l.photo })) }),
      });
      setCreating(false);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function approve(t: any) {
    const d = decide[t.id];
    if (!d?.resolution) return alert("Chọn cách xử lý.");
    if (d.resolution === "REFUND" && !d.fund) return alert("Chọn nhận tiền hoàn vào két hay ngân hàng.");
    if (t.overdue && !d.lateReason.trim()) return alert(`Phiếu có lô quá ${t.returnDays} ngày — ghi lý do duyệt vượt hạn.`);
    if (!window.confirm(`Duyệt ${t.code} (${vnd(t.amount)}) — ${RESOLUTION_LABEL[d.resolution]}? Hàng sẽ được trừ khỏi kho ngay.`)) return;
    try {
      await staffApi(`/api/purchasing/returns/${t.id}/approve`, { method: "POST", body: JSON.stringify(d) });
      await load();
    } catch (e: any) { alert(e.message); }
  }

  async function reject(t: any) {
    const reason = window.prompt(`Từ chối phiếu ${t.code}? Ghi lý do:`);
    if (!reason?.trim()) return;
    try {
      await staffApi(`/api/purchasing/returns/${t.id}/reject`, { method: "POST", body: JSON.stringify({ note: reason }) });
      await load();
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>Hàng lỗi phát hiện sau khi đã nhập kho. Thủ kho lập phiếu theo lô, quản lý chi nhánh duyệt.</p>
        {canCreate && !creating && <button className="primary-btn" onClick={() => void openCreate()}><Undo2 size={16} /> Lập phiếu trả hàng</button>}
      </div>

      {creating && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Phiếu trả hàng mới</h3>
          <label style={{ fontSize: "0.85rem" }}>Nhà cung cấp<br />
            <select className="input-field" value={supplierId} onChange={(e) => { setSupplierId(e.target.value ? Number(e.target.value) : ""); setLines([]); }}>
              <option value="">-- Chọn nhà cung cấp --</option>
              {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          {supplierId !== "" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
              {lines.map((l, idx) => {
                const lot = lotOf(l.lotId);
                const set = (patch: Partial<Line>) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
                return (
                  <div key={idx} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", padding: "0.75rem", border: "1px solid var(--border)", borderRadius: 8 }}>
                    <label style={{ fontSize: "0.85rem", flex: 1, minWidth: 220 }}>Lô hàng<br />
                      <select className="input-field" style={{ width: "100%" }} value={l.lotId || ""} onChange={(e) => set({ lotId: Number(e.target.value) })}>
                        <option value="">-- Chọn lô --</option>
                        {supplierLots.filter((x) => x.id === l.lotId || !lines.some((y) => y.lotId === x.id)).map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.item.name} · nhận {dateVi(x.receivedAt)} · còn {fmtQty(x.remainingQty)} {x.item.unit ?? ""}{x.overdue ? " · QUÁ HẠN TRẢ" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: "0.85rem" }}>Số trả{lot ? ` (≤ ${fmtQty(lot.remainingQty)})` : ""}<br />
                      <input className="input-field" style={{ width: 90 }} inputMode="decimal" value={l.qty} onChange={(e) => set({ qty: e.target.value.replace(/[^\d.,]/g, "") })} />
                    </label>
                    <label style={{ fontSize: "0.85rem" }}>Lý do<br />
                      <select className="input-field" value={l.reason} onChange={(e) => set({ reason: e.target.value })}>
                        <option value="">-- Chọn --</option>
                        {Object.entries(REJECT_REASON).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <PhotoPicker value={l.photo} onChange={(v) => set({ photo: v })} />
                    <button className="secondary-btn" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>Xóa</button>
                    {lot && <div style={{ flexBasis: "100%", fontSize: "0.8rem", color: lot.overdue ? "var(--danger)" : "var(--muted)" }}>Hạn trả: {dateVi(lot.deadline)}{lot.note ? ` · ${lot.note}` : ""}</div>}
                  </div>
                );
              })}
              <button className="secondary-btn" style={{ alignSelf: "flex-start" }} onClick={() => setLines((prev) => [...prev, { lotId: 0, qty: "", reason: "", photo: null }])}>+ Thêm lô</button>
              <label style={{ fontSize: "0.85rem" }}>Ghi chú<br /><input className="input-field" style={{ width: "100%" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: mở thùng phát hiện 3 hộp sữa phồng" /></label>
            </div>
          )}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", justifyContent: "flex-end" }}>
            <button className="secondary-btn" onClick={() => setCreating(false)}>Hủy</button>
            <button className="primary-btn" disabled={busy || !lines.length} onClick={() => void submit()}>{busy ? "Đang gửi…" : "Gửi quản lý duyệt"}</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? <p style={{ color: "var(--muted)" }}>Chưa có phiếu trả hàng nào.</p> : rows.map((t) => {
        const d = decide[t.id] ?? { resolution: "", fund: "", lateReason: "" };
        const setD = (patch: Partial<typeof d>) => setDecide((prev) => ({ ...prev, [t.id]: { ...d, ...patch } }));
        return (
          <div key={t.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: "0 0 0.25rem", color: "var(--accent)" }}>{t.code}</h3>
                <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                  {t.supplier.name}{t.po ? ` · ${t.po.code}` : ""} · lập bởi {t.createdBy.fullName} {dateVi(t.createdAt)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>{vnd(t.amount)}</div>
                <div style={{ fontSize: "0.85rem", color: t.status === "REJECTED" ? "var(--danger)" : t.status === "PENDING" ? "#b45309" : "#047857" }}>
                  {RETURN_STATUS[t.status] ?? t.status}{t.resolution ? ` · ${RESOLUTION_LABEL[t.resolution]}` : ""}
                </div>
                {t.supplierStatus && <div style={{ fontSize: "0.85rem", color: t.supplierStatus === "DISPUTED" ? "var(--danger)" : "#047857" }}>{SUPPLIER_STATUS[t.supplierStatus]}</div>}
                {t.status === "APPROVED" && !t.supplierStatus && <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Chờ NCC xác nhận</div>}
              </div>
            </div>
            <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
              {t.items.map((i: any) => (
                <li key={i.id}>
                  {fmtQty(i.qty)} {i.item.unit ?? ""} {i.item.name} — {REJECT_REASON[i.reason] ?? i.reason}
                  {" · "}lô nhận {dateVi(i.lot.receivedAt)}
                  {i.photoUrl && <> · <a href={mediaUrl(i.photoUrl)} target="_blank" rel="noreferrer">ảnh</a></>}
                </li>
              ))}
            </ul>
            {t.note && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>Ghi chú: {t.note}</div>}
            {t.lateReason && <div style={{ fontSize: "0.85rem", color: "#b45309", marginTop: "0.25rem" }}>Duyệt vượt hạn: {t.lateReason}</div>}
            {t.rejectNote && <div style={{ fontSize: "0.85rem", color: "var(--danger)", marginTop: "0.25rem" }}>Lý do từ chối: {t.rejectNote}</div>}
            {t.supplierNote && <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>NCC: {t.supplierNote}</div>}
            {t.credit && <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>Đã bù trừ {vnd(t.credit.usedAmount)} / {vnd(t.credit.amount)} vào công nợ</div>}

            {canApprove && t.status === "PENDING" && (
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                <label style={{ fontSize: "0.85rem" }}>Cách xử lý<br />
                  <select className="input-field" value={d.resolution} onChange={(e) => setD({ resolution: e.target.value })}>
                    <option value="">-- Chọn --</option>
                    {Object.entries(RESOLUTION_LABEL).filter(([k]) => k !== "REPLACE" || t.po).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                {d.resolution === "REFUND" && (
                  <label style={{ fontSize: "0.85rem" }}>Nhận tiền vào<br />
                    <select className="input-field" value={d.fund} onChange={(e) => setD({ fund: e.target.value })}>
                      <option value="">-- Chọn --</option>
                      <option value="SAFE">Két (tiền mặt)</option>
                      <option value="BANK">Ngân hàng</option>
                    </select>
                  </label>
                )}
                {t.overdue && (
                  <label style={{ fontSize: "0.85rem", flex: 1, minWidth: 200 }}>Lý do duyệt vượt hạn {t.returnDays} ngày<br />
                    <input className="input-field" style={{ width: "100%" }} value={d.lateReason} onChange={(e) => setD({ lateReason: e.target.value })} placeholder="VD: lỗi bên trong, chỉ phát hiện khi mở thùng" />
                  </label>
                )}
                <button className="secondary-btn" onClick={() => void reject(t)}>Từ chối</button>
                <button className="primary-btn" onClick={() => void approve(t)}>Duyệt</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
