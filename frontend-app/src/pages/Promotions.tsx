import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { getUser, isGuestMode } from "../lib/session";
import { formatVnd } from "../lib/site";
import { Crumbs, SectionHead, VoucherTicket } from "../components/site/parts";
import { useLang } from "../lib/i18n";

type Voucher = {
  id: number;
  code: string;
  description: string | null;
  discountValue: number;
  minBillValue: number;
  startDate: string;
  endDate: string;
  quantity: number;
  usedCount: number;
  isActive: boolean;
  voucherType: string;
  goldHourStart: number | null;
  goldHourEnd: number | null;
};
/** Một dòng của GET /api/vouchers/public — server đã lọc còn hiệu lực, công khai; stores rỗng = toàn chuỗi */
type PublicVoucher = Pick<Voucher, "id" | "code" | "description" | "discountValue" | "minBillValue" | "endDate" | "quantity" | "usedCount" | "goldHourStart" | "goldHourEnd"> & {
  stores: { store: { id: number; name: string } }[];
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getRemainingDays(endDate: string): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000);
}

/** Dòng phụ trên vé: chi nhánh áp dụng, giờ vàng, số lượt còn, sắp hết hạn */
function ticketNote(v: PublicVoucher, t: (s: string, vars?: Record<string, string | number>) => string) {
  const parts: string[] = [];
  if (v.stores?.length) parts.push(t("Chỉ tại {s}", { s: v.stores.map((x) => x.store.name).join(", ") }));
  if (v.goldHourStart != null && v.goldHourEnd != null) parts.push(t("Giờ vàng {a}:00–{b}:00", { a: v.goldHourStart, b: v.goldHourEnd }));
  parts.push(t("Còn {n} lượt", { n: Math.max(0, v.quantity - v.usedCount) }));
  const d = getRemainingDays(v.endDate);
  if (d > 0 && d <= 7) parts.push(t("hết hạn sau {n} ngày", { n: d }));
  return parts.join(" · ");
}

/** Voucher được mở sẵn từ pop up / liên kết: /promotions?voucher=<id> — có nút "Lưu vào ví" */
function VoucherSpotlight({ id }: { id: string }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { t } = useLang();
  const [v, setV] = useState<Voucher | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (v) box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [v]);
  useEffect(() => {
    api<Voucher>(`/api/popups/voucher/${id}`).then(setV).catch((e) => setErr(e instanceof Error ? e.message : t("Voucher không còn hiệu lực.")));
  }, [id]);
  if (err) return <p className="c-spot c-muted-txt">{err}</p>;
  if (!v) return null;
  const personal = v.voucherType === "personal";
  async function save() {
    if (isGuestMode() || !getUser()) {
      nav(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`);
      return;
    }
    setState("saving");
    try {
      await api("/api/vouchers/claim", { method: "POST", body: JSON.stringify({ voucherId: v!.id }) });
      setState("saved");
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("Không lưu được voucher.");
      if (/đã lưu/i.test(msg)) setState("saved");
      else {
        setErr(msg);
        setState("idle");
      }
    }
  }
  return (
    <section ref={box} className="c-spot">
      <div>
        <span className="c-stamp">{t("Dành cho bạn")}</span>
        <p className="c-spot-val">{t("Giảm {n}", { n: formatVnd(v.discountValue) })}</p>
        <p className="c-muted-txt">{v.description ?? t("Mã {code}", { code: v.code })} · {t("đơn từ {n}", { n: formatVnd(v.minBillValue) })} · {t("đến {d}", { d: formatDate(v.endDate) })}</p>
        <p className="c-spot-code">{v.code}</p>
      </div>
      {personal ? (
        <button type="button" className="c-btn" disabled={state !== "idle"} onClick={() => void save()}>
          {state === "saved" ? t("Đã lưu vào ví") : state === "saving" ? t("Đang lưu…") : t("Lưu vào ví")}
        </button>
      ) : (
        <span className="c-muted-txt">{t("Nhập mã khi thanh toán")}</span>
      )}
    </section>
  );
}

/** Ưu đãi số lượng đang chạy — GET /api/promotions/active (tự áp khi đặt đủ số ly, không cần mã) */
type BulkPromo = {
  id: number; name: string; description: string | null; endAt: string;
  dineIn: boolean; takeaway: boolean; delivery: boolean; allowVoucher: boolean;
  startMin: number | null; endMin: number | null;
  tiers: { minQty: number; text: string }[];
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function Promotions() {
  const [params] = useSearchParams();
  const spotlight = params.get("voucher");
  const { t, date } = useLang();
  const [vouchers, setVouchers] = useState<PublicVoucher[]>([]);
  const [bulk, setBulk] = useState<BulkPromo[]>([]);
  useEffect(() => {
    api<BulkPromo[]>("/api/promotions/active").then(setBulk).catch(() => setBulk([]));
  }, []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // API không trả isActive (đã lọc sẵn phía server) — chỉ bỏ mã vừa hết hạn trong lúc trang đang mở
    api<PublicVoucher[]>("/api/vouchers/public")
      .then((data) => setVouchers(data.filter((v) => new Date(v.endDate) > new Date())))
      .catch((e) => setErr(e instanceof Error ? e.message : t("Không tải được khuyến mãi")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="c-wrap c-promo">
      <Crumbs items={[{ label: "Khuyến mãi" }]} />
      <SectionHead as="h1" title="Khuyến mãi" sub="ưu đãi đang chạy ở quán" />
      {spotlight && /^\d+$/.test(spotlight) && <VoucherSpotlight id={spotlight} />}

      {bulk.length > 0 && (
        <section className="c-sec c-sec-tight">
          <SectionHead title="Mua càng nhiều càng rẻ" sub="tự áp khi đặt đủ số ly, không cần mã" />
          <div className="c-bulk-grid">
            {bulk.map((p) => (
              <article key={p.id} className="c-bulk">
                <h3 className="c-bulk-name">{p.name}</h3>
                {p.description && <p className="c-muted-txt">{p.description}</p>}
                <table className="c-bulk-tiers">
                  <tbody>
                    {p.tiers.map((tier) => (
                      <tr key={tier.minQty}>
                        <th scope="row">{t("Từ {n} ly", { n: tier.minQty })}</th>
                        <td className="c-leader" aria-hidden />
                        <td>{tier.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="c-bulk-meta">
                  {t("Đến {d}", { d: date(p.endAt) })}
                  {p.startMin != null && p.endMin != null && <> · {hhmm(p.startMin)}–{hhmm(p.endMin)}</>}
                  {" · "}{[p.dineIn && t("Tại quán"), p.takeaway && t("Mang về"), p.delivery && t("Giao hàng")].filter(Boolean).join(", ")}
                  {!p.allowVoucher && ` · ${t("không dùng chung voucher")}`}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="c-sec c-sec-tight">
        <SectionHead title="Mã giảm giá" sub={vouchers.length ? t("{n} mã đang dùng được", { n: vouchers.length }) : "chép mã, dán khi thanh toán"} />
        {loading && <p className="c-muted-txt">{t("Đang tải khuyến mãi…")}</p>}
        {err && <p className="c-err">{err}</p>}
        {!loading && !err && vouchers.length === 0 && (
          <p className="c-muted-txt">{t("Hiện chưa có mã giảm giá nào.")} <Link to="/menu" className="c-sec-more">{t("Xem thực đơn →")}</Link></p>
        )}
        {vouchers.length > 0 && <div className="c-tickets c-tickets-wrap">{vouchers.map((v) => <VoucherTicket key={v.id} v={v} note={ticketNote(v, t)} />)}</div>}
      </section>

      <p className="c-promo-foot">
        <span>{t("Nhập mã ở bước xác nhận đơn hàng. Mỗi tài khoản dùng 1 lần cho mỗi mã.")}</span>
        <Link to="/menu" className="c-btn">{t("Đặt món")}</Link>
      </p>
    </div>
  );
}
