import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lightbulb, Sparkles } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { getStaffInfo, isOwnerRole, staffApi } from "../../lib/staffApi";
import { Alert, Badge, Button, EmptyState, Field, Modal, RecordList, errMsg, fmtDateTime, formatVnd, type Tone } from "../../components/erp";
import { useResource } from "../shared";
import { PRODUCTS_BASE } from "./ProductList";
import { SearchSuggestions } from "./SearchInsights";
import { MenuDraftModal, TEMP_TEXT, shortName, useMenuDraftEnabled, type DraftLine, type Evaluated } from "./MenuDraft";

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
  /** STAFF = pha chế / quản lý gửi · SEARCH = từ từ khóa khách tìm mà quán chưa có */
  source: "STAFF" | "SEARCH";
  categoryId: number | null;
  /** Từ AI phác thảo / sửa định mức: định mức nháp + giá vốn lúc gửi + giá S/L */
  aiGenerated: boolean;
  formulaDraft: DraftLine[] | null;
  estCostS: number | null; estCostM: number | null; estCostL: number | null;
  temps: string | null; hasSizes: boolean | null; priceS: number | null; priceL: number | null;
  /** Giá vốn tính lại theo giá nhập hiện tại (server) */
  costNow: Pick<Evaluated, "costs" | "estimated" | "lines" | "toBuy" | "categoryPriceRange"> | null;
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
  const [drafting, setDrafting] = useState(false);
  const aiOn = useMenuDraftEnabled();
  return (
    <>
      <SearchSuggestions onChanged={() => void reload()} />
      <RecordList
        crumbs={[{ label: "Đề xuất món" }]}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        error={error}
        onOpen={setOpen}
        actions={aiOn ? <Button icon={Sparkles} onClick={() => setDrafting(true)}>Nhờ AI phác thảo món</Button> : undefined}
        columns={[
          { key: "date", label: "Ngày gửi", value: (p) => p.createdAt, render: (p) => fmtDateTime(p.createdAt) },
          { key: "name", label: "Tên món", value: (p) => p.name, render: (p) => <><strong style={{ fontWeight: 500 }}>{p.name}</strong>{p.aiGenerated && <> <Badge tone="info">AI</Badge></>}</> },
          { key: "by", label: "Người đề xuất", value: (p) => p.staff.fullName, render: (p) => <>{p.staff.fullName}{p.source === "SEARCH" && <> <Badge tone="info">Từ tìm kiếm</Badge></>}</> },
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
      {drafting && <MenuDraftModal seed={{}} onClose={() => setDrafting(false)} onDone={() => { setDrafting(false); void reload(); }} />}
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
        {p.costNow ? (
          <DraftReview p={p} />
        ) : (
          <Field label="Nguyên liệu & cách làm"><div style={{ whiteSpace: "pre-line" }}>{p.recipe || <span className="o-muted">Chưa có — pha chế bổ sung sau khi duyệt ý tưởng</span>}</div></Field>
        )}
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

/** Đề xuất có định mức (AI phác thảo): bảng định mức, giá vốn TÍNH LẠI theo giá nhập hiện tại, giá đề xuất, lãi gộp */
function DraftReview({ p }: { p: ProposalRow }) {
  const c = p.costNow!;
  const sizes = p.hasSizes === false ? (["M"] as const) : (["S", "M", "L"] as const);
  const price = { S: p.priceS, M: p.suggestedPrice, L: p.priceL };
  const est = { S: p.estCostS, M: p.estCostM, L: p.estCostL };
  const steps = p.recipe?.split(/\n\s*Cách pha:\s*\n/)[1];
  return (
    <div className="md-review">
      <div className="o-inline">
        {p.aiGenerated && <span className="md-ai-tag"><Sparkles size={13} aria-hidden /> AI phác thảo · giá vốn do hệ thống tính</span>}
        {p.temps && <Badge tone="info">{TEMP_TEXT[p.temps as keyof typeof TEMP_TEXT] ?? p.temps}</Badge>}
      </div>
      <div className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              <th>Nguyên liệu</th>
              {sizes.map((s) => <th key={s} className="num">{sizes.length > 1 ? s : "Lượng"}</th>)}
              <th className="num">đ / {sizes.length > 1 ? "ly M" : "phần"}</th>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((l, i) => (
              <tr key={i}>
                <td title={l.name}>{shortName(l.name)}{l.newIngredient && <span className="md-new">mới</span>}</td>
                {sizes.map((s) => <td key={s} className="num">{(s === "S" ? l.qtyS : s === "L" ? l.qtyL : l.qtyM) ?? ""}{s === "M" ? ` ${l.recipeUnit}` : ""}</td>)}
                <td className="num">{formatVnd(l.cost.M)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <table className="md-table">
        <thead>
          <tr><th />{sizes.map((s) => <th key={s} className="num">{sizes.length > 1 ? `Size ${s}` : ""}</th>)}</tr>
        </thead>
        <tbody>
          <tr>
            <td>Giá vốn hiện tại{c.estimated && <span className="md-est">ước tính</span>}</td>
            {sizes.map((s) => <td key={s} className="num"><b>{formatVnd(c.costs[s])}</b>{est[s] != null && est[s] !== c.costs[s] && <div className="o-muted" style={{ fontSize: 11 }}>lúc gửi {formatVnd(est[s]!)}</div>}</td>)}
          </tr>
          <tr>
            <td>Giá bán đề xuất</td>
            {sizes.map((s) => <td key={s} className="num">{price[s] != null ? formatVnd(price[s]!) : "—"}</td>)}
          </tr>
          <tr>
            <td>Lãi gộp</td>
            {sizes.map((s) => {
              const m = price[s] ? 1 - c.costs[s] / price[s]! : null;
              return <td key={s} className="num">{m == null ? "—" : <Badge tone={m >= 0.65 ? "success" : m >= 0.6 ? "warning" : "danger"}>{Math.round(m * 100)}%</Badge>}</td>;
            })}
          </tr>
        </tbody>
      </table>
      {c.categoryPriceRange && <p className="o-muted md-range">Cùng danh mục: {formatVnd(c.categoryPriceRange.min)} – {formatVnd(c.categoryPriceRange.max)}</p>}
      {c.toBuy.length > 0 && <div className="md-buy"><b>Cần mua thêm:</b> {c.toBuy.map((t) => `${t.name}${t.kind === "NEW" ? " (nguyên liệu mới)" : " (hết ở chi nhánh)"}`).join(", ")}</div>}
      {steps && (
        <details className="md-steps">
          <summary>Cách pha</summary>
          <div style={{ whiteSpace: "pre-line", marginTop: 6, fontSize: "var(--o-fs-sm)" }}>{steps}</div>
        </details>
      )}
    </div>
  );
}
