import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lightbulb } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, EmptyState, Field, Modal, RecordList, errMsg, fmtDateTime, formatVnd, type Tone } from "../../components/erp";
import { useResource } from "../shared";
import { PRODUCTS_BASE } from "./ProductList";

export type ProposalRow = {
  id: number;
  name: string;
  description: string | null;
  recipe: string | null;
  suggestedPrice: number | null;
  imageUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CREATED";
  ownerNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  staff: { id: number; fullName: string };
  store: { id: number; name: string };
  category: { id: number; name: string } | null;
  reviewer: { fullName: string } | null;
  product: { id: number; name: string } | null;
};

export const PROPOSAL_STATUS: Record<ProposalRow["status"], { label: string; tone: Tone }> = {
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  APPROVED: { label: "Đã duyệt — chưa tạo món", tone: "info" },
  CREATED: { label: "Đã thành món", tone: "success" },
  REJECTED: { label: "Không duyệt", tone: "danger" },
};

/** Thực đơn › Đề xuất món — pha chế gửi từ KDS, Chủ chuỗi duyệt rồi tạo món */
export function ProposalList() {
  const { data: rows, loading, error, reload } = useResource<ProposalRow[]>("/api/menu-proposals", []);
  const [open, setOpen] = useState<ProposalRow | null>(null);
  return (
    <>
      <RecordList
        crumbs={[{ label: "Đề xuất món" }]}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        error={error}
        onOpen={setOpen}
        columns={[
          { key: "date", label: "Ngày gửi", value: (p) => p.createdAt, render: (p) => fmtDateTime(p.createdAt) },
          { key: "name", label: "Tên món", value: (p) => p.name, render: (p) => <strong style={{ fontWeight: 500 }}>{p.name}</strong> },
          { key: "by", label: "Pha chế", value: (p) => p.staff.fullName },
          { key: "store", label: "Chi nhánh", value: (p) => p.store.name },
          { key: "price", label: "Giá đề xuất", value: (p) => p.suggestedPrice ?? 0, numeric: true, render: (p) => (p.suggestedPrice ? formatVnd(p.suggestedPrice) : "") },
          { key: "status", label: "Trạng thái", value: (p) => PROPOSAL_STATUS[p.status].label, render: (p) => <Badge tone={PROPOSAL_STATUS[p.status].tone}>{PROPOSAL_STATUS[p.status].label}</Badge> },
        ]}
        searchText={(p) => `${p.name} ${p.staff.fullName} ${p.description ?? ""}`}
        filters={Object.entries(PROPOSAL_STATUS).map(([id, s]) => ({ id, label: s.label, test: (p: ProposalRow) => p.status === id }))}
        defaultFilters={["PENDING"]}
        groupBys={[{ id: "store", label: "Chi nhánh", key: (p) => p.store.name }]}
        emptyState={<EmptyState icon={Lightbulb} title="Chưa có đề xuất món nào" hint="Pha chế gửi đề xuất từ màn hình KDS." />}
      />
      {open && <ProposalModal p={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); void reload(); }} />}
    </>
  );
}

function ProposalModal({ p, onClose, onChanged }: { p: ProposalRow; onClose: () => void; onChanged: () => void }) {
  const nav = useNavigate();
  const owner = isOwnerRole(getStaffInfo()?.role);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const createProduct = () => nav(`${PRODUCTS_BASE}/new?proposal=${p.id}`);

  async function review(status: "APPROVED" | "REJECTED") {
    setBusy(true);
    setErr(null);
    try {
      await staffApi(`/api/menu-proposals/${p.id}/review`, { method: "POST", body: JSON.stringify({ status, note }) });
      // Duyệt xong → sang màn tạo món, điền sẵn từ đề xuất
      if (status === "APPROVED") createProduct();
      else onChanged();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  const footer = !owner ? undefined
    : p.status === "PENDING" ? (
      rejecting ? (
        <>
          <Button onClick={() => setRejecting(false)} disabled={busy}>Quay lại</Button>
          <Button variant="danger" onClick={() => void review("REJECTED")} disabled={busy || !note.trim()}>Xác nhận không duyệt</Button>
        </>
      ) : (
        <>
          <Button variant="danger" onClick={() => setRejecting(true)} disabled={busy}>Không duyệt</Button>
          <Button variant="primary" onClick={() => void review("APPROVED")} disabled={busy}>Duyệt & tạo món</Button>
        </>
      )
    ) : p.status === "APPROVED" ? (
      <Button variant="primary" onClick={createProduct}>Tạo món từ đề xuất</Button>
    ) : p.status === "CREATED" && p.product ? (
      <Button onClick={() => nav(`${PRODUCTS_BASE}/${p.product!.id}`)}>Xem món {p.product.name}</Button>
    ) : undefined;

  return (
    <Modal title={p.name} onClose={onClose} footer={footer}>
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        <div className="o-inline">
          <Badge tone={PROPOSAL_STATUS[p.status].tone}>{PROPOSAL_STATUS[p.status].label}</Badge>
          <span className="o-muted">{p.staff.fullName} · {p.store.name} · {fmtDateTime(p.createdAt)}</span>
        </div>
        {mediaUrl(p.imageUrl) && <img src={mediaUrl(p.imageUrl)} alt={p.name} style={{ maxWidth: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 8 }} />}
        {p.description && <Field label="Ý tưởng / hương vị"><div style={{ whiteSpace: "pre-line" }}>{p.description}</div></Field>}
        <Field label="Nguyên liệu & cách làm"><div style={{ whiteSpace: "pre-line" }}>{p.recipe}</div></Field>
        <div className="o-inline">
          {p.suggestedPrice != null && <span>Giá đề xuất: <strong>{formatVnd(p.suggestedPrice)}</strong></span>}
          {p.category && <span>· Danh mục: {p.category.name}</span>}
        </div>
        {p.ownerNote && <Alert tone="info">Chủ chuỗi: {p.ownerNote}</Alert>}
        {rejecting && (
          <Field label="Lý do không duyệt (pha chế sẽ thấy)" required>
            <textarea className="o-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </Field>
        )}
      </div>
    </Modal>
  );
}
