import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, Lock, ScanFace, ShieldCheck } from "lucide-react";
import { getStaffInfo, staffApi, staffBlobUrl } from "../lib/staffApi";
import { roleLabel } from "../lib/roles";
import { Alert, Badge, Button, Field, FormGroup, FormGroups, PageHeader, errMsg, fmtDate, fmtDateTime } from "../components/erp";
import { PasswordInput } from "../components/PasswordInput";
import { CustomerAvatar } from "../components/CustomerAvatar";
import { readFileAsDataUrl } from "../modules/shared";

type Profile = {
  id: number;
  username: string | null;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  address: string | null;
  dob: string | null;
  cccd: string | null;
  role: string;
  hireDate: string;
  store: { name: string } | null;
  faceRegistered: boolean;
  faceRegisteredAt: string | null;
  hasFacePhoto: boolean;
};

type Msg = { ok: boolean; text: string } | null;

/** Cập nhật thông tin đăng nhập lưu ở máy (tên / ảnh hiện trên menu, chat) */
function syncLocalInfo(p: Pick<Profile, "avatarUrl" | "fullName">) {
  const cur = getStaffInfo();
  if (!cur) return;
  localStorage.setItem("cmn_staff_info", JSON.stringify({ ...cur, avatarUrl: p.avatarUrl, fullName: p.fullName }));
}

const toDateInput = (s: string | null) => (s ? s.slice(0, 10) : "");

/**
 * Tài khoản của tôi (mọi vai trò nhân viên): ảnh đại diện, thông tin liên hệ tự cập nhật, đổi mật khẩu, trạng thái FaceID.
 * Họ tên / vai trò / chi nhánh / lương do quản lý sửa; CCCD tự nhập 1 lần; FaceID đăng ký 1 lần, chỉ quản lý xoá.
 */
export function StaffAccount() {
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    staffApi<Profile>("/api/staff/me/profile").then(setP).catch((e) => setErr(errMsg(e)));
  }, []);
  function updated(next: Profile) {
    setP(next);
    syncLocalInfo(next);
  }

  return (
    <div className="o-myacc">
      <PageHeader title="Tài khoản của tôi" description="Ảnh đại diện, thông tin liên hệ, mật khẩu và FaceID của bạn." />
      {err && <Alert>{err}</Alert>}
      {!p ? (
        !err && <p className="o-muted">Đang tải…</p>
      ) : (
        <div className="o-myacc-grid">
          <ProfileCard p={p} onSaved={updated} />
          <ContactCard p={p} onSaved={updated} />
          <PasswordCard />
          <FaceCard p={p} />
        </div>
      )}
    </div>
  );
}

/* ── Hồ sơ: ảnh đại diện (tự đổi) + thông tin do quản lý quản lý ── */
function ProfileCard({ p, onSaved }: { p: Profile; onSaved: (p: Profile) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      onSaved(await staffApi<Profile>("/api/staff/me", { method: "PATCH", body: JSON.stringify(body) }));
    } catch (e) {
      setErr(errMsg(e, "Lỗi lưu ảnh"));
    } finally {
      setBusy(false);
    }
  }
  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setErr("Ảnh tối đa 2MB.");
    await save({ avatarDataUrl: await readFileAsDataUrl(file) });
  }
  return (
    <section className="o-card">
      <div className="o-card-head"><h3>Hồ sơ</h3></div>
      <div className="o-myacc-hero">
        <CustomerAvatar src={p.avatarUrl} name={p.fullName} size={64} />
        <div className="o-stack" style={{ gap: 6, minWidth: 0 }}>
          <strong className="o-myacc-name">{p.fullName}</strong>
          <span className="o-muted">{roleLabel(p.role)}{p.store ? ` · ${p.store.name}` : ""}</span>
          <div className="o-row">
            <Button size="sm" icon={ImagePlus} onClick={() => input.current?.click()} disabled={busy}>{busy ? "Đang lưu…" : "Đổi ảnh"}</Button>
            {p.avatarUrl && <Button size="sm" variant="link" onClick={() => void save({ removeAvatar: true })} disabled={busy}>Xoá ảnh</Button>}
          </div>
          {err && <span className="o-error" style={{ marginTop: 0 }}>{err}</span>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <FormGroups>
        <FormGroup>
          <Field label="Tên đăng nhập">{p.username ?? <span className="o-muted">—</span>}</Field>
          <Field label="Mã nhân viên">#{p.id}</Field>
        </FormGroup>
        <FormGroup>
          <Field label="Ngày vào làm">{fmtDate(p.hireDate)}</Field>
        </FormGroup>
      </FormGroups>
      <p className="o-card-note o-muted"><Lock size={12} aria-hidden /> Họ tên, vai trò, chi nhánh và lương do quản lý cập nhật. Ảnh đại diện hiện cạnh tin nhắn của bạn khi chat với khách.</p>
    </section>
  );
}

/* ── Thông tin liên hệ: nhân viên tự sửa; CCCD nhập 1 lần ── */
function ContactCard({ p, onSaved }: { p: Profile; onSaved: (p: Profile) => void }) {
  const init = () => ({ phone: p.phone ?? "", address: p.address ?? "", dob: toDateInput(p.dob), cccd: p.cccd ?? "" });
  const [f, setF] = useState(init);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(init()), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const cccdLocked = !!p.cccd;
  const dirty = f.phone !== (p.phone ?? "") || f.address !== (p.address ?? "") || f.dob !== toDateInput(p.dob) || (!cccdLocked && f.cccd !== "");
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setMsg(null);
    const phone = f.phone.replace(/[\s.-]/g, "");
    if (phone && !/^(0|\+84)\d{9,10}$/.test(phone)) return setMsg({ ok: false, text: "Số điện thoại không hợp lệ." });
    if (!cccdLocked && f.cccd && !/^\d{12}$/.test(f.cccd.trim())) return setMsg({ ok: false, text: "CCCD gồm đúng 12 chữ số." });
    if (!cccdLocked && f.cccd && !window.confirm(`Lưu CCCD ${f.cccd.trim()}? Sau khi lưu, chỉ quản lý sửa được.`)) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { phone, address: f.address, dob: f.dob || null };
      if (!cccdLocked && f.cccd.trim()) body.cccd = f.cccd.trim();
      onSaved(await staffApi<Profile>("/api/staff/me", { method: "PATCH", body: JSON.stringify(body) }));
      setMsg({ ok: true, text: "Đã lưu thông tin." });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="o-card">
      <div className="o-card-head"><h3>Thông tin liên hệ</h3></div>
      <FormGroups>
        <FormGroup>
          <Field label="Số điện thoại"><input className="o-input" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="09xx xxx xxx" /></Field>
          <Field label="Ngày sinh"><input className="o-input" type="date" value={f.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
        </FormGroup>
        <FormGroup>
          <Field label="Địa chỉ"><input className="o-input" autoComplete="street-address" value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={255} /></Field>
          <Field label="CCCD">
            {cccdLocked ? (
              <span className="o-inline">****{p.cccd!.slice(-4)} <Badge tone="info">Đã lưu</Badge></span>
            ) : (
              <input className="o-input" inputMode="numeric" maxLength={12} value={f.cccd} onChange={(e) => set("cccd", e.target.value.replace(/\D/g, ""))} placeholder="12 chữ số" />
            )}
          </Field>
        </FormGroup>
      </FormGroups>
      {msg && <div style={{ padding: "0 14px" }}><Alert tone={msg.ok ? "info" : "danger"}>{msg.text}</Alert></div>}
      <div className="o-myacc-actions">
        <span className="o-muted o-field-hint">{cccdLocked ? "CCCD đã lưu — cần sửa thì liên hệ quản lý." : "CCCD chỉ nhập một lần, sau đó quản lý mới sửa được."}</span>
        <Button variant="primary" onClick={() => void save()} disabled={busy || !dirty}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</Button>
      </div>
    </section>
  );
}

/* ── Đổi mật khẩu ── */
function PasswordCard() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (next.length < 6) return setMsg({ ok: false, text: "Mật khẩu mới tối thiểu 6 ký tự." });
    if (next !== again) return setMsg({ ok: false, text: "Nhập lại mật khẩu mới không khớp." });
    setBusy(true);
    try {
      await staffApi("/api/staff/me/change-password", { method: "POST", body: JSON.stringify({ currentPassword: cur, newPassword: next }) });
      setMsg({ ok: true, text: "Đã đổi mật khẩu." });
      setCur("");
      setNext("");
      setAgain("");
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "Lỗi đổi mật khẩu") });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="o-card">
      <div className="o-card-head"><h3>Bảo mật</h3><ShieldCheck size={16} aria-hidden className="o-muted" /></div>
      <FormGroups>
        <FormGroup>
          <Field label="Mật khẩu hiện tại"><PasswordInput className="o-input" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
          <Field label="Mật khẩu mới"><PasswordInput className="o-input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Nhập lại mật khẩu mới"><PasswordInput className="o-input" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></Field>
        </FormGroup>
      </FormGroups>
      {msg && <div style={{ padding: "0 14px" }}><Alert tone={msg.ok ? "info" : "danger"}>{msg.text}</Alert></div>}
      <div className="o-myacc-actions">
        <span />
        <Button variant="primary" onClick={() => void submit()} disabled={busy || !cur || !next}>{busy ? "Đang lưu…" : "Đổi mật khẩu"}</Button>
      </div>
    </section>
  );
}

/* ── FaceID: chỉ xem; đăng ký ở Chấm công (1 lần), xoá do quản lý ── */
function FaceCard({ p }: { p: Profile }) {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!p.hasFacePhoto) return;
    let url: string | null = null;
    void staffBlobUrl("/api/staff/me/face-photo").then((u) => {
      url = u;
      setPhoto(u);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [p.hasFacePhoto]);
  return (
    <section className="o-card">
      <div className="o-card-head"><h3>FaceID chấm công</h3><ScanFace size={16} aria-hidden className="o-muted" /></div>
      <div className="o-myacc-face">
        {p.faceRegistered ? (
          <>
            {photo ? <img src={photo} alt="Ảnh chụp lúc đăng ký FaceID" className="o-myacc-face-img" /> : <span className="o-myacc-face-img is-empty"><ScanFace size={28} aria-hidden /></span>}
            <div className="o-stack" style={{ gap: 6 }}>
              <Badge tone="info">Đã đăng ký</Badge>
              {p.faceRegisteredAt && <span className="o-muted">Ngày đăng ký: {fmtDateTime(p.faceRegisteredAt)}</span>}
              <span className="o-muted">Muốn đăng ký lại (đổi kiểu tóc, kính…), liên hệ quản lý chi nhánh để xoá FaceID cũ.</span>
            </div>
          </>
        ) : (
          <>
            <span className="o-myacc-face-img is-empty"><ScanFace size={28} aria-hidden /></span>
            <div className="o-stack" style={{ gap: 6 }}>
              <Badge tone="warning">Chưa đăng ký</Badge>
              <span className="o-muted">Đăng ký một lần ở màn Chấm công. Hãy tự đăng ký bằng khuôn mặt của bạn — sau khi lưu, chỉ quản lý mới xoá được.</span>
              <div><Link to="/app/hr/attendance" className="o-btn o-btn-primary o-btn-sm">Đến Chấm công</Link></div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
