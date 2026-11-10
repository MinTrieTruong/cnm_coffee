import { useState } from "react";
import { CheckCircle2, Gift, Search } from "lucide-react";
import { mediaUrl } from "../lib/api";
import { staffApi } from "../lib/staffApi";
import { Alert, Badge, Button, Modal, errMsg } from "./erp";
import { CLAIM_STATUS } from "../modules/games/types";
import "../styles/games.css";

type Claim = {
  id: number;
  code: string;
  status: string;
  expiresAt: string;
  expired: boolean;
  stockHere: number | null;
  deliveredAt: string | null;
  customer: { id: number; fullName: string; phone: string | null };
  product: { id: number; name: string; imageUrl: string | null } | null;
  giftItem: { id: number; name: string; imageUrl: string | null } | null;
  store: { id: number; name: string } | null;
  play: { campaign: { id: number; name: string } };
};

/** POS › Nhận quà mini game: nhập / quét mã → kiểm tra → "Đã trao" (trừ tồn quà, ghi nhân viên & thời gian) */
export function PosGiftClaim({ onClose, onDone }: { onClose: () => void; onDone?: (msg: string) => void }) {
  const [code, setCode] = useState("");
  const [claim, setClaim] = useState<Claim | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setErr(null);
    setClaim(null);
    setBusy(true);
    try {
      setClaim(await staffApi<Claim>(`/api/pos/gift-claims/${encodeURIComponent(c)}`));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function deliver() {
    if (!claim) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await staffApi<Claim>(`/api/pos/gift-claims/${claim.code}/deliver`, { method: "POST" });
      setClaim({ ...claim, ...r, expired: false });
      onDone?.(`Đã trao "${r.product?.name ?? r.giftItem?.name}" cho ${r.customer.fullName}.`);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const gift = claim?.product ?? claim?.giftItem;
  const st = claim ? (claim.expired ? CLAIM_STATUS.EXPIRED : CLAIM_STATUS[claim.status]) : null;
  const canDeliver = !!claim && claim.status === "WAITING" && !claim.expired && (claim.stockHere == null || claim.stockHere > 0);

  return (
    <Modal
      title="Nhận quà mini game"
      onClose={onClose}
      footer={
        <>
          {claim && claim.status === "WAITING" && !claim.expired && (
            <Button variant="primary" icon={CheckCircle2} disabled={busy || !canDeliver} onClick={() => void deliver()}>Đã trao</Button>
          )}
          <Button onClick={onClose}>Đóng</Button>
        </>
      }
    >
      <form className="o-row" style={{ flexWrap: "nowrap", marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); void lookup(); }}>
        <input
          className="o-input"
          style={{ height: 40, fontFamily: "ui-monospace, monospace", fontSize: 18, letterSpacing: "0.12em", textTransform: "uppercase" }}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Nhập hoặc quét mã nhận quà"
          autoFocus
          maxLength={12}
          aria-label="Mã nhận quà"
        />
        <Button type="submit" variant="primary" icon={Search} disabled={busy || !code.trim()}>Tra cứu</Button>
      </form>

      {err && <Alert>{err}</Alert>}

      {claim && (
        <div className="gm-claim-card">
          {gift?.imageUrl ? <img src={mediaUrl(gift.imageUrl)} alt="" /> : <span className="gm-claim-ph"><Gift size={24} aria-hidden /></span>}
          <dl className="gm-claim-rows">
            <dt>Quà</dt><dd>{gift?.name ?? "—"}</dd>
            <dt>Khách</dt><dd>{claim.customer.fullName}</dd>
            <dt>SĐT</dt><dd>{claim.customer.phone ?? "—"}</dd>
            <dt>Chương trình</dt><dd>{claim.play.campaign.name}</dd>
            <dt>Hạn nhận</dt><dd>{new Date(claim.expiresAt).toLocaleDateString("vi-VN")}</dd>
            <dt>Giữ quà tại</dt><dd>{claim.store?.name ?? "Bất kỳ chi nhánh"}</dd>
            {claim.stockHere != null && <><dt>Tồn tại quầy</dt><dd>{claim.stockHere}</dd></>}
            <dt>Trạng thái</dt><dd>{st && <Badge tone={st.tone}>{st.label}</Badge>}</dd>
          </dl>
        </div>
      )}
      {claim && claim.stockHere === 0 && claim.status === "WAITING" && <Alert tone="warning">Chi nhánh này đã hết quà — hướng dẫn khách nhận tại {claim.store?.name ?? "chi nhánh khác"}.</Alert>}
    </Modal>
  );
}
