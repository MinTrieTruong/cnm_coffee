import { useRef, useState } from "react";
import { Coins, Gift, ImagePlus, Plus, Ticket, Trash2, Smile } from "lucide-react";
import { mediaUrl } from "../../lib/api";
import { staffApi, staffUploadImage } from "../../lib/staffApi";
import { Alert, Badge, Button, Dropdown, Field, Modal, Tabs, errMsg, formatVnd } from "../../components/erp";
import { readFileAsDataUrl } from "../shared";
import { PRIZE_KIND_LABEL, PRIZE_KIND_TONE, type GameOptions, type GiftItemOpt, type PrizeDraft } from "./types";

let seq = 0;
export const newKey = () => `n${Date.now()}-${seq++}`;

export function emptyPrize(patch: Partial<PrizeDraft>): PrizeDraft {
  return {
    key: newKey(), kind: "NONE", productId: null, giftItemId: null, voucherId: null, points: null, label: "", imageUrl: null,
    weight: "0", quantity: "", dailyLimit: "", color: null, ...patch,
  };
}

export const weightNum = (p: PrizeDraft) => Number(String(p.weight).replace(",", ".")) || 0;
export const totalWeight = (list: PrizeDraft[]) => Math.round(list.reduce((s, p) => s + weightNum(p), 0) * 100) / 100;

/** Giá trị ước tính 1 lần trúng (đ) — dùng ước tính chi phí; 1 điểm = 1đ */
export function prizeValue(p: PrizeDraft, opts: GameOptions | null) {
  if (p.kind === "POINTS") return p.points ?? 0;
  if (p.kind === "VOUCHER") return opts?.vouchers.find((v) => v.id === p.voucherId)?.discountValue ?? 0;
  if (p.kind === "PRODUCT") {
    if (p.productId) return opts?.products.find((x) => x.id === p.productId)?.sellPrice ?? 0;
    if (p.giftItemId) return opts?.giftItems.find((x) => x.id === p.giftItemId)?.value ?? 0;
  }
  return 0;
}

function PrizeThumb({ p, onChange, disabled }: { p: PrizeDraft; onChange: (url: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const img = mediaUrl(p.imageUrl);
  return (
    <>
      <button type="button" className="gm-thumb" disabled={disabled || busy} onClick={() => ref.current?.click()} title="Bấm để đổi ảnh" aria-label="Đổi ảnh phần thưởng">
        {img ? <img src={img} alt="" /> : <ImagePlus size={16} aria-hidden />}
      </button>
      <input
        ref={ref}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onChange(await staffUploadImage(await readFileAsDataUrl(f)));
          } catch (ex) {
            alert(errMsg(ex, "Lỗi tải ảnh"));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

/** Bảng giải thưởng sửa trực tiếp — dùng chung cho mọi mini game */
export function PrizeTable({
  prizes,
  onChange,
  options,
  onOptionsChanged,
  disabled,
}: {
  prizes: PrizeDraft[];
  onChange: (p: PrizeDraft[]) => void;
  options: GameOptions | null;
  onOptionsChanged: () => void;
  disabled?: boolean;
}) {
  const [modal, setModal] = useState<null | "product" | "voucher" | "points">(null);
  const set = (key: string, patch: Partial<PrizeDraft>) => onChange(prizes.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const add = (p: PrizeDraft) => onChange([...prizes, p]);
  const total = totalWeight(prizes);
  const ok = Math.abs(total - 100) < 0.01;

  return (
    <div className="o-stack" style={{ gap: 10 }}>
      <div className="o-list-wrap">
        <table className="o-list gm-prize-table">
          <thead>
            <tr>
              <th style={{ width: 84 }}>Hình ảnh</th>
              <th>Nội dung phần thưởng <span className="req">*</span></th>
              <th className="num" style={{ width: 96 }}>Tỉ lệ (%)</th>
              <th className="num" style={{ width: 104 }}>Số lượng</th>
              <th className="num" style={{ width: 96 }}>Giới hạn/ngày</th>
              <th style={{ width: 110 }}>Loại khuyến mãi</th>
              <th style={{ width: 80 }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {prizes.length === 0 && (
              <tr><td colSpan={7} className="o-muted" style={{ textAlign: "center", padding: 20 }}>Chưa có phần thưởng — bấm (+) để thêm.</td></tr>
            )}
            {prizes.map((p) => {
              const unlimitedOk = p.kind === "POINTS" || p.kind === "NONE";
              return (
                <tr key={p.key}>
                  <td>
                    <div className="o-row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <PrizeThumb p={p} disabled={disabled} onChange={(url) => set(p.key, { imageUrl: url })} />
                      <input
                        type="color"
                        className="gm-swatch"
                        value={p.color ?? "#ffffff"}
                        disabled={disabled}
                        onChange={(e) => set(p.key, { color: e.target.value.toUpperCase() })}
                        title="Màu ô (tùy chọn)"
                        aria-label="Màu ô"
                      />
                    </div>
                  </td>
                  <td className="wrap">
                    {p.kind === "VOUCHER" ? (
                      <div className="gm-readonly" title="Nội dung lấy từ voucher">{p.label}</div>
                    ) : (
                      <textarea
                        className="o-input gm-textarea"
                        rows={2}
                        value={p.label}
                        disabled={disabled}
                        maxLength={255}
                        onChange={(e) => set(p.key, { label: e.target.value })}
                        placeholder="Nội dung hiển thị trên ô"
                      />
                    )}
                  </td>
                  <td className="num">
                    <input className="o-input num" inputMode="decimal" value={p.weight} disabled={disabled} onChange={(e) => set(p.key, { weight: e.target.value })} aria-label="Tỉ lệ" />
                  </td>
                  <td className="num">
                    <input
                      className="o-input num"
                      inputMode="numeric"
                      value={p.quantity}
                      disabled={disabled}
                      placeholder={unlimitedOk ? "∞" : "Bắt buộc"}
                      onChange={(e) => set(p.key, { quantity: e.target.value.replace(/\D/g, "") })}
                      aria-label="Số lượng"
                    />
                    {p.wonCount ? <div className="o-muted gm-sub">đã trúng {p.wonCount}</div> : null}
                  </td>
                  <td className="num">
                    <input className="o-input num" inputMode="numeric" value={p.dailyLimit} placeholder="—" disabled={disabled || p.kind === "NONE"} onChange={(e) => set(p.key, { dailyLimit: e.target.value.replace(/\D/g, "") })} aria-label="Giới hạn mỗi ngày" />
                  </td>
                  <td><Badge tone={PRIZE_KIND_TONE[p.kind]}>{PRIZE_KIND_LABEL[p.kind]}</Badge></td>
                  <td>
                    <Button size="sm" variant="secondary" icon={Trash2} disabled={disabled} onClick={() => onChange(prizes.filter((x) => x.key !== p.key))}>Xóa</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                {!disabled && (
                  <div className="o-row" style={{ gap: 8 }}>
                    <Dropdown
                      button={({ toggle }) => (
                        <button type="button" className="gm-add-btn" onClick={toggle} aria-label="Thêm phần thưởng"><Plus size={18} aria-hidden /></button>
                      )}
                    >
                      {(close) => (
                        <>
                          <button type="button" className="o-dropdown-item" onClick={() => { close(); setModal("product"); }}><Gift size={14} aria-hidden /> Thêm sản phẩm</button>
                          <button type="button" className="o-dropdown-item" onClick={() => { close(); setModal("voucher"); }}><Ticket size={14} aria-hidden /> Thêm chương trình khuyến mãi</button>
                          <button type="button" className="o-dropdown-item" onClick={() => { close(); setModal("points"); }}><Coins size={14} aria-hidden /> Thêm điểm</button>
                        </>
                      )}
                    </Dropdown>
                    <Button size="sm" variant="link" icon={Smile} onClick={() => add(emptyPrize({ kind: "NONE", label: "Chúc bạn may mắn lần sau", color: "#E7E5E4" }))}>
                      Thêm ô “Chúc may mắn lần sau”
                    </Button>
                  </div>
                )}
              </td>
              <td className="num"><strong style={{ color: ok ? "var(--o-success)" : "var(--o-danger)" }}>{total.toLocaleString("vi-VN")}%</strong></td>
              <td colSpan={4} className="o-muted">Tổng tỉ lệ phải bằng 100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {!ok && prizes.length > 0 && <Alert>Tổng tỉ lệ đang là {total.toLocaleString("vi-VN")}% — phải bằng đúng 100% mới lưu được.</Alert>}

      {modal === "product" && options && (
        <AddProductModal options={options} onClose={() => setModal(null)} onOptionsChanged={onOptionsChanged} onAdd={(p) => { add(p); setModal(null); }} />
      )}
      {modal === "voucher" && options && (
        <AddVoucherModal options={options} used={prizes.map((p) => p.voucherId)} onClose={() => setModal(null)} onAdd={(p) => { add(p); setModal(null); }} />
      )}
      {modal === "points" && <AddPointsModal onClose={() => setModal(null)} onAdd={(p) => { add(p); setModal(null); }} />}
    </div>
  );
}

/* ───────────── Thêm sản phẩm: món thực đơn / quà hiện vật ───────────── */

function AddProductModal({ options, onClose, onAdd, onOptionsChanged }: { options: GameOptions; onClose: () => void; onAdd: (p: PrizeDraft) => void; onOptionsChanged: () => void }) {
  const [tab, setTab] = useState<"menu" | "gift">("menu");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [gift, setGift] = useState({ name: "", value: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
  const products = options.products.filter((p) => !q || norm(p.name).includes(norm(q)));
  const gifts = options.giftItems.filter((g) => !q || norm(g.name).includes(norm(q)));
  const stockOf = (g: GiftItemOpt) => g.stocks.reduce((s, x) => s + x.qty - x.reserved, 0);

  async function createGift() {
    setErr(null);
    try {
      const g = await staffApi<GiftItemOpt>("/api/admin/games/gift-items", {
        method: "POST",
        body: JSON.stringify({ name: gift.name, value: Number(gift.value.replace(/\D/g, "")) || 0, note: gift.note }),
      });
      onOptionsChanged();
      onAdd(emptyPrize({ kind: "PRODUCT", giftItemId: g.id, label: g.name, quantity: "1" }));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <Modal title="Thêm sản phẩm" onClose={onClose} size="lg">
      <Tabs tabs={[{ id: "menu", label: "Thực đơn" }, { id: "gift", label: "Quà tặng" }]} active={tab} onChange={(t) => { setTab(t); setQ(""); }} />
      <div className="o-stack" style={{ gap: 10, marginTop: 12 }}>
        <input className="o-input" placeholder="Tìm…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {tab === "menu" && (
          <div className="gm-pick-grid">
            {products.map((p) => (
              <button key={p.id} type="button" className="gm-pick" onClick={() => onAdd(emptyPrize({ kind: "PRODUCT", productId: p.id, label: `1 ly ${p.name}`, imageUrl: p.imageUrl, quantity: "10" }))}>
                {p.imageUrl ? <img src={mediaUrl(p.imageUrl)} alt="" /> : <span className="gm-pick-ph" />}
                <span className="gm-pick-name">{p.name}</span>
                <span className="o-muted">{formatVnd(p.sellPrice)}</span>
              </button>
            ))}
            {!products.length && <span className="o-muted">Không có món phù hợp.</span>}
          </div>
        )}
        {tab === "gift" && (
          <>
            <div className="gm-pick-grid">
              {gifts.map((g) => (
                <button key={g.id} type="button" className="gm-pick" onClick={() => onAdd(emptyPrize({ kind: "PRODUCT", giftItemId: g.id, label: g.name, imageUrl: g.imageUrl, quantity: String(Math.max(1, stockOf(g))) }))}>
                  {g.imageUrl ? <img src={mediaUrl(g.imageUrl)} alt="" /> : <span className="gm-pick-ph"><Gift size={20} aria-hidden /></span>}
                  <span className="gm-pick-name">{g.name}</span>
                  <span className="o-muted">Tồn {stockOf(g)} · {formatVnd(g.value)}</span>
                </button>
              ))}
              {!gifts.length && <span className="o-muted">Chưa có quà hiện vật.</span>}
            </div>
            {!creating ? (
              <Button icon={Plus} onClick={() => setCreating(true)}>Tạo nhanh quà mới</Button>
            ) : (
              <div className="o-card" style={{ padding: 12 }}>
                {err && <Alert>{err}</Alert>}
                <div className="gm-form-grid">
                  <Field label="Tên quà" required><input className="o-input" value={gift.name} onChange={(e) => setGift({ ...gift, name: e.target.value })} placeholder="VD: Nón bảo hiểm TD Coffee" /></Field>
                  <Field label="Giá trị ước tính (đ)"><input className="o-input" inputMode="numeric" value={gift.value} onChange={(e) => setGift({ ...gift, value: e.target.value })} /></Field>
                  <Field label="Ghi chú" full><input className="o-input" value={gift.note} onChange={(e) => setGift({ ...gift, note: e.target.value })} /></Field>
                </div>
                <div className="o-muted" style={{ margin: "6px 0" }}>Nhập tồn quà theo chi nhánh ở mục CRM › Quà tặng hiện vật.</div>
                <div className="o-row">
                  <Button variant="primary" disabled={!gift.name.trim()} onClick={() => void createGift()}>Tạo và thêm vào vòng</Button>
                  <Button onClick={() => setCreating(false)}>Hủy</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ───────────── Thêm chương trình khuyến mãi (voucher) ───────────── */

function AddVoucherModal({ options, used, onClose, onAdd }: { options: GameOptions; used: (number | null)[]; onClose: () => void; onAdd: (p: PrizeDraft) => void }) {
  const list = options.vouchers.filter((v) => !used.includes(v.id));
  return (
    <Modal title="Thêm chương trình khuyến mãi" onClose={onClose} size="lg">
      {!list.length ? (
        <div className="o-muted">Không còn voucher đang hoạt động. Tạo voucher ở mục Thực đơn & khuyến mãi › Voucher (nên chọn loại Cá nhân để chỉ người trúng dùng được).</div>
      ) : (
        <div className="o-list-wrap">
          <table className="o-list">
            <thead><tr><th>Mã</th><th>Nội dung</th><th className="num">Giảm</th><th className="num">Đơn tối thiểu</th><th>Hạn</th><th>Loại</th><th /></tr></thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id}>
                  <td><code>{v.code}</code></td>
                  <td className="wrap">{v.description ?? "—"}</td>
                  <td className="num">{formatVnd(v.discountValue)}</td>
                  <td className="num">{formatVnd(v.minBillValue)}</td>
                  <td>{new Date(v.endDate).toLocaleDateString("vi-VN")}</td>
                  <td>{v.voucherType === "personal" ? "Cá nhân" : "Công khai"}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        onAdd(emptyPrize({
                          kind: "VOUCHER", voucherId: v.id, quantity: "50",
                          label: v.description?.trim() || `Voucher ${v.code} giảm ${v.discountValue.toLocaleString("vi-VN")}đ`,
                        }))
                      }
                    >
                      Chọn
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="o-muted" style={{ marginTop: 8 }}>Mỗi khách chỉ nhận một voucher cùng loại: khách đã có voucher này thì vòng quay tự chọn giải khác.</div>
    </Modal>
  );
}

/* ───────────── Thêm điểm ───────────── */

function AddPointsModal({ onClose, onAdd }: { onClose: () => void; onAdd: (p: PrizeDraft) => void }) {
  const [pts, setPts] = useState("10000");
  const n = Number(pts.replace(/\D/g, ""));
  return (
    <Modal
      title="Thêm điểm"
      size="sm"
      onClose={onClose}
      footer={<><Button variant="primary" disabled={!(n > 0)} onClick={() => onAdd(emptyPrize({ kind: "POINTS", points: n, label: `${n.toLocaleString("vi-VN")} điểm` }))}>Thêm</Button><Button onClick={onClose}>Hủy</Button></>}
    >
      <Field label="Số điểm" required>
        <input className="o-input" inputMode="numeric" value={pts ? Number(pts.replace(/\D/g, "")).toLocaleString("vi-VN") : ""} onChange={(e) => setPts(e.target.value.replace(/\D/g, ""))} autoFocus />
      </Field>
      <div className="o-muted">Khách trúng được cộng thẳng vào điểm tích lũy (1 điểm = 1đ khi thanh toán).</div>
    </Modal>
  );
}
