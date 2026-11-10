import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Send, X } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { acquireSocket } from "../../lib/sharedSocket";
import { refreshBadges } from "../../lib/navBadges";
import { compressImage } from "../../lib/tasks";
import { ROLE_LABEL } from "../../lib/roles";
import { Alert, Badge, Button, EmptyState, Field, Modal, RecordList, errMsg, fmtDateTime, formatVnd, type Tone } from "../../components/erp";
import { useResource } from "../shared";

type Status = "PENDING" | "NEED_INFO" | "APPROVED" | "REJECTED" | "DONE" | "CANCELLED";
type Category = "STAFFING" | "FACILITY" | "SUPPLY" | "OTHER";

export type BranchProposal = {
  id: number;
  category: Category;
  title: string;
  description: string;
  priority: "NORMAL" | "URGENT";
  quantity: number | null;
  staffRole: string | null;
  estimatedCost: number | null;
  imageUrl: string | null;
  status: Status;
  ownerNote: string | null;
  reviewedAt: string | null;
  doneNote: string | null;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
  staff: { id: number; fullName: string };
  store: { id: number; name: string };
  reviewer: { fullName: string } | null;
};

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  NEED_INFO: { label: "Cần bổ sung", tone: "info" },
  APPROVED: { label: "Đã duyệt — đang xử lý", tone: "primary" },
  DONE: { label: "Đã xử lý xong", tone: "success" },
  REJECTED: { label: "Không duyệt", tone: "danger" },
  CANCELLED: { label: "Đã huỷ", tone: "neutral" },
};
export const CATEGORY: Record<Category, string> = { STAFFING: "Thiếu nhân sự", FACILITY: "Hư hỏng / sửa chữa", SUPPLY: "Cần cấp thêm", OTHER: "Khác" };
const CATEGORY_HINT: Record<Category, string> = {
  STAFFING: "VD: Thiếu 2 phục vụ ca tối cuối tuần, cần tuyển thêm",
  FACILITY: "VD: 3 ghế gỗ khu ngoài trời gãy chân, máy xay đá kêu to",
  SUPPLY: "VD: Cần thêm 50 ly sứ, 2 kệ để đồ, đồng phục cho nhân viên mới",
  OTHER: "Vấn đề khác cần Chủ chuỗi quyết định",
};
const SHIFT_ROLES = ["Cashier", "Waiter", "Kitchen", "Shipper", "Warehouse"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const monthOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };

/** Tổng quan › Đề xuất chi nhánh: quản lý gửi lên Chủ chuỗi (thiếu người, hư hỏng, cần cấp thêm…) */
export function BranchProposals() {
  const owner = isOwnerRole(getStaffInfo()?.role);
  const { data: rows, loading, error, reload } = useResource<BranchProposal[]>("/api/branch-proposals", []);
  const [open, setOpen] = useState<BranchProposal | null>(null);
  const [form, setForm] = useState<BranchProposal | "new" | null>(null);
  const [cat, setCat] = useState<Category | "">("");
  const [month, setMonth] = useState("");

  // Có đề xuất mới / được duyệt ở máy khác → tải lại
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    const shared = acquireSocket();
    shared.join("admin_room");
    const h = () => void reloadRef.current();
    shared.socket.on("branch-proposal:update", h);
    return () => {
      shared.socket.off("branch-proposal:update", h);
      shared.release();
    };
  }, []);

  const shown = useMemo(() => rows.filter((p) => (!cat || p.category === cat) && (!month || monthOf(p.createdAt) === month)), [rows, cat, month]);
  const count = (s: Status) => rows.filter((p) => p.status === s).length;
  const changed = () => { setOpen(null); setForm(null); refreshBadges(); void reload(); };

  return (
    <>
      <RecordList
        crumbs={[{ label: "Đề xuất chi nhánh" }]}
        rows={shown}
        rowKey={(p) => p.id}
        loading={loading}
        error={error}
        onOpen={setOpen}
        onCreate={owner ? undefined : () => setForm("new")}
        createLabel="Gửi đề xuất"
        actions={
          <span className="o-row" style={{ gap: 4 }}>
            <select className="o-input" style={{ width: "auto" }} value={cat} onChange={(e) => setCat(e.target.value as Category | "")} aria-label="Loại đề xuất">
              <option value="">Mọi loại</option>
              {Object.entries(CATEGORY).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
            <input type="month" className="o-input" style={{ width: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Tháng gửi" title="Lọc theo tháng gửi" />
          </span>
        }
        top={
          <div className="o-muted">
            {owner
              ? `${count("PENDING")} chờ bạn duyệt · ${count("APPROVED")} đã duyệt, chưa xử lý xong · ${count("NEED_INFO")} đang chờ quản lý bổ sung`
              : `${count("NEED_INFO")} cần bạn bổ sung · ${count("PENDING")} chờ Chủ chuỗi duyệt · ${count("APPROVED")} đã duyệt, đang xử lý`}
          </div>
        }
        columns={[
          { key: "date", label: "Ngày gửi", value: (p) => p.createdAt, render: (p) => fmtDateTime(p.createdAt) },
          {
            key: "title",
            label: "Đề xuất",
            value: (p) => p.title,
            render: (p) => (
              <span>
                {p.priority === "URGENT" && <Badge tone="danger">Gấp</Badge>} <strong style={{ fontWeight: 500 }}>{p.title}</strong>
              </span>
            ),
          },
          { key: "cat", label: "Loại", value: (p) => CATEGORY[p.category] },
          { key: "store", label: "Chi nhánh", value: (p) => p.store.name },
          { key: "by", label: "Người gửi", value: (p) => p.staff.fullName, optional: true },
          { key: "cost", label: "Ước tính", value: (p) => p.estimatedCost ?? 0, numeric: true, optional: true, render: (p) => (p.estimatedCost ? formatVnd(p.estimatedCost) : "") },
          { key: "status", label: "Trạng thái", value: (p) => STATUS[p.status].label, render: (p) => <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge> },
        ]}
        searchText={(p) => `${p.title} ${p.description} ${p.staff.fullName} ${p.store.name}`}
        filters={(Object.keys(STATUS) as Status[]).map((id) => ({ id, label: STATUS[id].label, test: (p: BranchProposal) => p.status === id }))}
        defaultFilters={owner ? ["PENDING", "APPROVED"] : ["PENDING", "NEED_INFO", "APPROVED"]}
        groupBys={[
          { id: "store", label: "Chi nhánh", key: (p) => p.store.name },
          { id: "cat", label: "Loại", key: (p) => CATEGORY[p.category] },
        ]}
        kanban={{
          columns: (["PENDING", "NEED_INFO", "APPROVED", "DONE"] as Status[]).map((id) => ({ id, label: STATUS[id].label })),
          columnOf: (p) => p.status,
          card: (p) => (
            <div>
              <strong>{p.priority === "URGENT" ? "[Gấp] " : ""}{p.title}</strong>
              <div className="o-muted">{CATEGORY[p.category]} · {p.store.name}</div>
            </div>
          ),
        }}
        emptyState={
          <EmptyState
            title="Chưa có đề xuất nào"
            hint={owner ? "Quản lý chi nhánh gửi đề xuất khi thiếu người, hư hỏng cơ sở vật chất hoặc cần cấp thêm đồ dùng." : "Bấm \"Gửi đề xuất\" khi chi nhánh thiếu người, có đồ hư hỏng hoặc cần cấp thêm đồ dùng."}
          />
        }
      />
      {open && <ProposalModal p={open} owner={owner} onClose={() => setOpen(null)} onEdit={() => { setForm(open); setOpen(null); }} onChanged={changed} />}
      {form && <ProposalForm p={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={changed} />}
    </>
  );
}

function ProposalModal({ p, owner, onClose, onEdit, onChanged }: { p: BranchProposal; owner: boolean; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  /** Hành động đang chờ ghi chú */
  const [action, setAction] = useState<"REJECTED" | "NEED_INFO" | "DONE" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function call(path: string, body?: object) {
    setBusy(true);
    setErr(null);
    try {
      await staffApi(`/api/branch-proposals/${p.id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      onChanged();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }
  const submitNote = () => (action === "DONE" ? call("done", { note }) : call("review", { status: action, note }));
  const noteLabel = action === "REJECTED" ? "Lý do không duyệt (quản lý sẽ thấy)" : action === "NEED_INFO" ? "Cần bổ sung thông tin gì?" : "Đã xử lý thế nào? (VD: đã mua 4 ghế, giao thứ 5)";
  const editable = p.status === "PENDING" || p.status === "NEED_INFO";

  const footer = action ? (
    <>
      <Button onClick={() => setAction(null)} disabled={busy}>Quay lại</Button>
      <Button variant={action === "REJECTED" ? "danger" : "primary"} onClick={() => void submitNote()} disabled={busy || (action !== "DONE" && !note.trim())}>
        {action === "REJECTED" ? "Xác nhận không duyệt" : action === "NEED_INFO" ? "Gửi yêu cầu bổ sung" : "Xác nhận đã xử lý"}
      </Button>
    </>
  ) : owner ? (
    p.status === "PENDING" ? (
      <>
        <Button variant="danger" onClick={() => setAction("REJECTED")}>Không duyệt</Button>
        <Button onClick={() => setAction("NEED_INFO")}>Cần bổ sung</Button>
        <Button variant="primary" onClick={() => void call("review", { status: "APPROVED" })} disabled={busy}>Duyệt</Button>
      </>
    ) : p.status === "APPROVED" ? (
      <Button variant="primary" onClick={() => setAction("DONE")}>Đánh dấu đã xử lý</Button>
    ) : undefined
  ) : editable ? (
    <>
      <Button variant="danger" onClick={() => confirm("Huỷ đề xuất này?") && void call("cancel")} disabled={busy}>Huỷ đề xuất</Button>
      <Button variant="primary" onClick={onEdit}>{p.status === "NEED_INFO" ? "Bổ sung & gửi lại" : "Sửa"}</Button>
    </>
  ) : undefined;

  return (
    <Modal title={p.title} onClose={onClose} footer={footer}>
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        <div className="o-inline">
          <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
          {p.priority === "URGENT" && <Badge tone="danger">Gấp</Badge>}
          <span className="o-muted">{CATEGORY[p.category]} · {p.store.name} · {p.staff.fullName} · {fmtDateTime(p.createdAt)}</span>
        </div>
        {p.status === "NEED_INFO" && p.ownerNote && <Alert tone="warning">Chủ chuỗi cần bổ sung: {p.ownerNote}</Alert>}
        <Field label="Mô tả"><div style={{ whiteSpace: "pre-line" }}>{p.description}</div></Field>
        <div className="o-inline">
          {p.staffRole && <span>Vị trí cần tuyển: <strong>{ROLE_LABEL[p.staffRole] ?? p.staffRole}</strong></span>}
          {p.quantity != null && <span>· Số lượng: <strong>{p.quantity}</strong></span>}
          {p.estimatedCost != null && <span>· Chi phí ước tính: <strong>{formatVnd(p.estimatedCost)}</strong></span>}
        </div>
        {mediaUrl(p.imageUrl) && (
          <a href={mediaUrl(p.imageUrl)} target="_blank" rel="noreferrer">
            <img src={mediaUrl(p.imageUrl)} alt="Ảnh đính kèm" style={{ maxWidth: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 8 }} />
          </a>
        )}
        {p.status !== "NEED_INFO" && p.ownerNote && <Alert tone="info">Chủ chuỗi{p.reviewer ? ` (${p.reviewer.fullName})` : ""}: {p.ownerNote}</Alert>}
        {p.status === "DONE" && <Alert tone="info">Đã xử lý {p.doneAt ? fmtDateTime(p.doneAt) : ""}{p.doneNote ? `: ${p.doneNote}` : ""}</Alert>}
        {action && (
          <Field label={noteLabel} required={action !== "DONE"}>
            <textarea className="o-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus maxLength={1000} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function ProposalForm({ p, onClose, onSaved }: { p: BranchProposal | null; onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<Category>(p?.category ?? "FACILITY");
  const [title, setTitle] = useState(p?.title ?? "");
  const [description, setDescription] = useState(p?.description ?? "");
  const [urgent, setUrgent] = useState(p?.priority === "URGENT");
  const [quantity, setQuantity] = useState(p?.quantity != null ? String(p.quantity) : "");
  const [staffRole, setStaffRole] = useState(p?.staffRole ?? "");
  const [cost, setCost] = useState(p?.estimatedCost != null ? String(p.estimatedCost) : "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const oldPhoto = !removePhoto && !photo ? mediaUrl(p?.imageUrl) : null;
  const toInt = (s: string) => (s.trim() === "" ? null : Number(s.replace(/\D/g, "")));

  async function save() {
    setBusy(true);
    setErr(null);
    const body = {
      category, title, description,
      priority: urgent ? "URGENT" : "NORMAL",
      quantity: toInt(quantity),
      staffRole: category === "STAFFING" ? staffRole || null : null,
      estimatedCost: toInt(cost),
      photoDataUrl: photo ?? undefined,
      removePhoto,
    };
    try {
      await staffApi(p ? `/api/branch-proposals/${p.id}` : "/api/branch-proposals", { method: p ? "PUT" : "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={p ? (p.status === "NEED_INFO" ? "Bổ sung & gửi lại đề xuất" : "Sửa đề xuất") : "Gửi đề xuất lên Chủ chuỗi"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button variant="primary" icon={Send} onClick={() => void save()} disabled={busy || !title.trim() || !description.trim()}>
            {p?.status === "NEED_INFO" ? "Gửi lại" : p ? "Lưu" : "Gửi đề xuất"}
          </Button>
        </>
      }
    >
      <div className="o-stack">
        {err && <Alert>{err}</Alert>}
        {p?.status === "NEED_INFO" && p.ownerNote && <Alert tone="warning">Chủ chuỗi cần bổ sung: {p.ownerNote}</Alert>}
        <Field label="Loại đề xuất" required>
          <select className="o-input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {Object.entries(CATEGORY).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </Field>
        <Field label="Tiêu đề" required>
          <input className="o-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={CATEGORY_HINT[category]} />
        </Field>
        <Field label="Mô tả chi tiết" required>
          <textarea className="o-input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} placeholder="Tình trạng hiện tại, ảnh hưởng tới quán, đề xuất cách xử lý…" />
        </Field>
        <div className="o-row">
          {category === "STAFFING" && (
            <Field label="Vị trí cần tuyển" required>
              <select className="o-input" value={staffRole} onChange={(e) => setStaffRole(e.target.value)}>
                <option value="">Chọn vị trí…</option>
                {SHIFT_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
              </select>
            </Field>
          )}
          <Field label={category === "STAFFING" ? "Số người cần tuyển" : "Số lượng"} required={category === "STAFFING"}>
            <input className="o-input" inputMode="numeric" style={{ width: 120 }} value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} />
          </Field>
          {category !== "STAFFING" && (
            <Field label="Chi phí ước tính (đ)">
              <input className="o-input" inputMode="numeric" style={{ width: 160 }} value={cost ? Number(cost).toLocaleString("vi-VN") : ""} onChange={(e) => setCost(e.target.value.replace(/\D/g, ""))} />
            </Field>
          )}
        </div>
        <label className="o-row" style={{ gap: 6 }}>
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Gấp — ảnh hưởng ngay tới hoạt động của quán
        </label>
        <div className="o-row">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setPhoto(await compressImage(f));
              } catch (ex) {
                setErr(errMsg(ex));
              }
            }}
          />
          {photo || oldPhoto ? (
            <span className="o-task-photo is-lg">
              <img src={photo ?? oldPhoto!} alt="Ảnh đính kèm" />
              <button type="button" onClick={() => { setPhoto(null); setRemovePhoto(true); }} aria-label="Bỏ ảnh"><X size={14} /></button>
            </span>
          ) : (
            <Button icon={Camera} onClick={() => fileRef.current?.click()}>Chụp / chọn ảnh</Button>
          )}
          <span className="o-muted">Ảnh hiện trạng giúp Chủ chuỗi duyệt nhanh hơn</span>
        </div>
      </div>
    </Modal>
  );
}
