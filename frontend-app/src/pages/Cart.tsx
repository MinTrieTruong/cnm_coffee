import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { backupCart, cartTotal, clearCart, getCart, lineKey, removeLines, updateQty, type CartItem } from "../lib/cart";
import { getTableId, getTakeawaySessionId, getUser, newSessionId, setTakeawaySessionId } from "../lib/session";
import { Trash2, Plus, Minus } from "lucide-react";
import { Crumbs, ProductImage, SectionHead } from "../components/site/parts";
import { LocationPicker } from "../components/LocationPicker";
import { formatKm, haversineKm, MAX_DELIVERY_KM, shippingFeeForDistance, type LatLng } from "../lib/delivery";
import { useCustomerStore, withStore } from "../lib/customerStore";
import { StorePicker } from "../components/StorePicker";
import { formatVnd } from "../lib/site";
import { useLang } from "../lib/i18n";
import { PhoneReminder } from "./SocialComplete";

const SWIPE_OPEN = 88; // độ rộng nút Xoá lộ ra khi vuốt

/** Dòng giỏ hàng vuốt sang trái để xoá (chỉ cảm ứng): vuốt ngắn lộ nút Xoá, vuốt quá nửa dòng thì xoá luôn */
function SwipeRow({ open, onOpen, onDelete, label, children }: { open: boolean; onOpen: (v: boolean) => void; onDelete: () => void; label: string; children: ReactNode }) {
  const [dx, setDx] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const rowRef = useRef<HTMLLIElement>(null);
  const base = open ? -SWIPE_OPEN : 0;
  const x = dx ?? base;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, axis: null };
  }
  function onTouchMove(e: React.TouchEvent) {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0];
    const mx = t.clientX - s.x, my = t.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      s.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
    }
    if (s.axis === "x") setDx(Math.min(0, base + mx));
  }
  function onTouchEnd() {
    const s = start.current;
    start.current = null;
    if (!s || s.axis !== "x" || dx == null) return setDx(null);
    const width = rowRef.current?.offsetWidth ?? 320;
    setDx(null);
    if (-dx > width / 2) onDelete();
    else onOpen(-dx > SWIPE_OPEN / 2);
  }

  return (
    <li ref={rowRef} className="c-cart-row">
      {x < 0 && <button type="button" className="c-cart-swipe-del" style={{ width: Math.max(SWIPE_OPEN, -x) }} onClick={onDelete}>{label}</button>}
      <div
        className="c-cart-item"
        style={{ transform: x ? `translateX(${x}px)` : undefined, transition: dx == null ? "transform .2s ease" : "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={(e) => { if (open) { e.stopPropagation(); e.preventDefault(); onOpen(false); } }}
      >
        {children}
      </div>
    </li>
  );
}


export function Cart() {
  const loc = useLocation();
  const [items, setItems] = useState(() => getCart());
  const nav = useNavigate();
  const { t } = useLang();
  const user = getUser();
  const { storeId, tableName } = useCustomerStore();
  const [payOpen, setPayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  
  // Delivery State
  const [orderTypeSelection, setOrderTypeSelection] = useState<"dine-in" | "takeaway" | "delivery">(
    getTakeawaySessionId() ? "takeaway" : "dine-in"
  );
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerLocation, setCustomerLocation] = useState<{lat: number, lng: number} | null>(null);
  const [shippingFee, setShippingFee] = useState(0);
  const [storeLoc, setStoreLoc] = useState<LatLng | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "new">("new");

  useEffect(() => {
    if (user) {
      api("/api/customer-addresses").then((res: any) => {
        setSavedAddresses(res);
        if (res.length > 0) {
          setSelectedAddressId(res[0].id);
          setDeliveryAddress(res[0].address);
          if (res[0].lat && res[0].lng) {
            setCustomerLocation({ lat: res[0].lat, lng: res[0].lng });
          }
        }
      }).catch(console.error);
    }
  }, [user]);

  useEffect(() => {
    setItems(getCart());
  }, [loc.key, loc.pathname]);

  useEffect(() => {
    // Phí ship tính từ chi nhánh khách chọn
    api<{ storeLat: number | null; storeLng: number | null }>(withStore("/api/store-config", storeId))
      .then((c) => c.storeLat != null && c.storeLng != null && setStoreLoc({ lat: c.storeLat, lng: c.storeLng }))
      .catch(() => undefined);
  }, [storeId]);

  // Phí ship theo khoảng cách từ quán (cùng công thức với backend)
  const distanceKm = storeLoc && customerLocation ? haversineKm(storeLoc, customerLocation) : null;
  const tooFar = orderTypeSelection === "delivery" && distanceKm != null && distanceKm > MAX_DELIVERY_KM;
  useEffect(() => {
    setShippingFee(distanceKm != null ? shippingFeeForDistance(distanceKm) : 0);
  }, [distanceKm]);

  const total = cartTotal(items);
  const currentTable = getTableId();

  // Ưu đãi số lượng: máy chủ tính ưu đãi đang đạt + gợi ý bậc kế tiếp theo giỏ hàng hiện tại
  type PromoPreview = {
    applied: { name: string; qty: number; discount: number; freeShipping: boolean; text: string } | null;
    next: { name: string; needQty: number; text: string } | null;
  };
  const [promo, setPromo] = useState<PromoPreview>({ applied: null, next: null });
  useEffect(() => {
    if (!storeId || !items.length) {
      setPromo({ applied: null, next: null });
      return;
    }
    const orderType = orderTypeSelection === "delivery" ? "Delivery" : orderTypeSelection === "takeaway" ? "Takeaway" : "Dine-in";
    const t = window.setTimeout(() => {
      api<PromoPreview>("/api/promotions/preview", {
        method: "POST",
        body: JSON.stringify({
          store: storeId,
          orderType,
          lines: items.map((i) => ({ productId: i.productId, quantity: i.quantity, size: i.size, comboId: i.comboId ?? null })),
        }),
      })
        .then(setPromo)
        .catch(() => setPromo({ applied: null, next: null }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [items, orderTypeSelection, storeId]);
  const promoShip = promo.applied?.freeShipping && orderTypeSelection === "delivery" ? shippingFee : 0;

  function refresh() {
    setItems(getCart());
  }

  // Chọn nhiều dòng để xoá; khoá theo nội dung dòng để +/- số lượng không làm mất lựa chọn
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [swipeOpen, setSwipeOpen] = useState<string | null>(null);
  const keys = items.map(lineKey);
  const pickedCount = keys.filter((k) => selected.has(k)).length;
  const allPicked = items.length > 0 && pickedCount === items.length;
  function toggle(key: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }
  function removeIdx(idxs: number[]) {
    removeLines(idxs);
    setSwipeOpen(null);
    refresh();
  }
  function removeSelected() {
    if (!pickedCount) return;
    if (!window.confirm(t("Xoá {n} món đã chọn khỏi giỏ?", { n: pickedCount }))) return;
    removeIdx(keys.flatMap((k, i) => (selected.has(k) ? [i] : [])));
    setSelected(new Set());
  }

  async function submitOrder(mode: "now" | "later") {
    setSubmitting(true);
    setMsg(null);
    try {
      backupCart();
      const takeawaySessionId = getTakeawaySessionId();
      const tableId = getTableId();
      
      let finalOrderType = "Dine-in";
      let sessionId = null;
      
      if (orderTypeSelection === "takeaway") {
        // Khách vãng lai đặt mang về: phiên mang về là "chìa khoá" để xem bill và yêu cầu thanh toán
        finalOrderType = "Takeaway";
        sessionId = takeawaySessionId ?? newSessionId();
        setTakeawaySessionId(sessionId);
      } else if (orderTypeSelection === "delivery") {
        if (!user) {
          setMsg(t("Vui lòng đăng nhập để đặt giao hàng."));
          setSubmitting(false); return;
        }
        if (!deliveryAddress.trim()) {
           setMsg(t("Vui lòng nhập địa chỉ giao hàng."));
           setSubmitting(false); return;
        }
        if (!customerLocation) {
           setMsg(t("Vui lòng ghim vị trí giao hàng trên bản đồ để tài xế tìm đúng nhà bạn."));
           setSubmitting(false); return;
        }
        finalOrderType = "Delivery";
        sessionId = `del-${Date.now()}`;
        
        // Save new address if "new" is selected
        if (selectedAddressId === "new" && deliveryAddress.trim()) {
          try {
            await api("/api/customer-addresses", {
              method: "POST",
              body: JSON.stringify({
                address: deliveryAddress.trim(),
                lat: customerLocation?.lat,
                lng: customerLocation?.lng,
                isDefault: savedAddresses.length === 0
              })
            });
          } catch(e) { console.error("Lỗi lưu địa chỉ mới", e); }
        }
      } else {
        if (!tableId) {
          setMsg(t("Không xác định được bàn. Hãy quét mã QR trên bàn hoặc chọn Mang về."));
          setSubmitting(false); return;
        }
      }

      const created = await api<{ id: number; status: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          tableId: finalOrderType === "Dine-in" ? tableId : null,
          storeId,
          customerId: user?.customerId ?? null,
          orderType: finalOrderType,
          sessionId,
          payMode: mode,
          deliveryAddress: finalOrderType === "Delivery" ? deliveryAddress : undefined,
          customerLat: customerLocation?.lat,
          customerLng: customerLocation?.lng,
          shippingFee: finalOrderType === "Delivery" ? shippingFee : 0,
          lines: items.map((i: CartItem) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            size: i.size,
            temp: i.temp ?? null,
            customNotes: i.notes,
            comboId: i.comboId ?? null,
          })),
        }),
      });
      clearCart();
      setPayOpen(false);
      refresh();
      if (finalOrderType === "Takeaway" || finalOrderType === "Delivery") {
        nav(`/order/${created.id}/checkout`, { replace: true });
        return;
      }
      if (mode === "later") {
        nav(`/order/${created.id}/grace`, { replace: true });
      } else {
        nav(`/order/${created.id}/checkout`, { replace: true });
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("Không gửi được đơn"));
    } finally {
      setSubmitting(false);
    }
  }

  const grand = Math.max(0, total - (promo.applied?.discount ?? 0)) + (orderTypeSelection === "delivery" ? shippingFee - promoShip : 0);
  const TYPES = [
    { id: "dine-in" as const, label: "Tại quán", pick: () => { setOrderTypeSelection("dine-in"); setTakeawaySessionId(null); } },
    { id: "takeaway" as const, label: "Mang về", pick: () => { setOrderTypeSelection("takeaway"); setTakeawaySessionId(getTakeawaySessionId() ?? newSessionId()); } },
    { id: "delivery" as const, label: "Giao hàng", pick: () => setOrderTypeSelection("delivery") },
  ];

  return (
    <div className="c-wrap c-cartpage">
      <Crumbs items={[{ label: "Giỏ hàng" }]} />
      <SectionHead as="h1" title="Giỏ hàng" sub={t("{n} món đang chọn", { n: items.reduce((a, it) => a + it.quantity, 0) })} more={{ to: "/menu", label: "Chọn thêm món" }} />

      <div className="c-seg c-cart-types" role="group" aria-label={t("Hình thức nhận món")}>
        {TYPES.map((ty) => (
          <button key={ty.id} type="button" className={orderTypeSelection === ty.id ? "is-on" : undefined} aria-pressed={orderTypeSelection === ty.id} onClick={ty.pick}>{t(ty.label)}</button>
        ))}
      </div>
      {orderTypeSelection !== "dine-in" && <div className="c-cart-store"><StorePicker /></div>}
      <p className="c-muted-txt c-cart-type-note">
        {orderTypeSelection === "takeaway" ? t("Đơn mang về — ghé quầy nhận khi quán báo xong.") : orderTypeSelection === "delivery" ? t("Giao tận nơi — phí giao tính theo khoảng cách từ chi nhánh.") : t("Bàn hiện tại: {table}", { table: currentTable ? tableName ?? `#${currentTable}` : t("chưa xác định") })}
      </p>
      <PhoneReminder next="/cart" />

      {orderTypeSelection === "delivery" && (
        <div className="c-box">
          {!user ? (
            <div className="c-box-row">
              <p>{t("Đăng nhập để dùng giao hàng tận nơi.")}</p>
              <Link to="/login" className="c-btn">{t("Đăng nhập")}</Link>
            </div>
          ) : (
            <>
              <label className="c-field">
                <span className="c-field-label">{t("Địa chỉ giao hàng")}</span>
                {savedAddresses.length > 0 && (
                  <select
                    className="c-input"
                    value={selectedAddressId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "new") {
                        setSelectedAddressId("new");
                        setDeliveryAddress("");
                        setCustomerLocation(null);
                      } else {
                        const id = Number(val);
                        setSelectedAddressId(id);
                        const addr = savedAddresses.find(a => a.id === id);
                        if (addr) {
                          setDeliveryAddress(addr.address);
                          if (addr.lat && addr.lng) {
                            setCustomerLocation({ lat: addr.lat, lng: addr.lng });
                          } else {
                            setCustomerLocation(null);
                          }
                        }
                      }
                    }}
                  >
                    {savedAddresses.map(a => (
                      <option key={a.id} value={a.id}>{a.address}</option>
                    ))}
                    <option value="new">{t("Thêm địa chỉ mới")}</option>
                  </select>
                )}
                {selectedAddressId === "new" && (
                  <input className="c-input" placeholder={t("Số nhà, đường, phường, quận")} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                )}
              </label>
              <span className="c-field-label">{t("Ghim vị trí giao hàng")}</span>
              <LocationPicker
                value={customerLocation}
                onChange={setCustomerLocation}
                store={storeLoc}
                address={deliveryAddress}
                onAddressFound={(addr) => selectedAddressId === "new" && setDeliveryAddress(addr)}
              />
              {distanceKm != null && (
                tooFar ? (
                  <p className="c-muted-txt" role="alert" style={{ color: "var(--c-danger)" }}>
                    {t("Cách quán {km} — ngoài phạm vi giao hàng (tối đa {max} km)", { km: formatKm(distanceKm), max: MAX_DELIVERY_KM })}
                  </p>
                ) : (
                  <p className="c-muted-txt">
                    {t("Cách quán {km}", { km: formatKm(distanceKm) })} · {shippingFee === 0 ? t("Miễn phí giao hàng (≤ 3 km)") : t("Phí giao {n}", { n: formatVnd(shippingFee) })}
                  </p>
                )
              )}
            </>
          )}
        </div>
      )}

      {orderTypeSelection === "takeaway" && !user && (
        <div className="c-box c-box-row">
          <p>{t("Đặt mang về không cần tài khoản. Đăng nhập để tích điểm và xem lại đơn.")}</p>
          <Link to="/login" className="c-btn is-outline">{t("Đăng nhập")}</Link>
        </div>
      )}

      {orderTypeSelection === "dine-in" && !currentTable && (
        <div className="c-box">
          <p>{t("Quét mã QR trên bàn để gọi món tại quán, hoặc chọn Mang về.")}</p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="c-empty">
          <p className="c-empty-title">{t("Giỏ hàng đang trống")}</p>
          <p className="c-muted-txt">{t("Chọn vài món rồi quay lại đây thanh toán.")}</p>
          <Link to="/menu" className="c-btn">{t("Xem thực đơn")}</Link>
        </div>
      ) : (
        <div className="c-cart-grid">
          <div>
          <div className="c-cart-bar">
            <label className="c-cart-check">
              <input
                type="checkbox"
                checked={allPicked}
                ref={(el) => { if (el) el.indeterminate = pickedCount > 0 && !allPicked; }}
                onChange={() => setSelected(allPicked ? new Set() : new Set(keys))}
              />
              {t("Chọn tất cả ({n})", { n: items.length })}
            </label>
            <button type="button" className="c-linkbtn is-danger" disabled={!pickedCount} onClick={removeSelected}>
              <Trash2 size={15} aria-hidden /> {t("Xoá đã chọn ({n})", { n: pickedCount })}
            </button>
          </div>
          <ul className="c-cart-list">
            {items.map((item, idx) => (
              <SwipeRow
                key={keys[idx]}
                open={swipeOpen === keys[idx]}
                onOpen={(v) => setSwipeOpen(v ? keys[idx] : null)}
                onDelete={() => removeIdx([idx])}
                label={t("Xoá")}
              >
                <input type="checkbox" className="c-cart-pick" checked={selected.has(keys[idx])} onChange={() => toggle(keys[idx])} aria-label={t("Chọn {name}", { name: item.name })} />
                <span className="c-cart-img"><ProductImage p={{ name: item.name, imageUrl: item.imageUrl }} /></span>
                <div className="c-cart-txt">
                  <span className="c-cart-name">{item.name}</span>
                  {item.notes && <span className="c-cart-notes">{item.notes}</span>}
                  <span className="c-price">{formatVnd(item.unitPrice * item.quantity)}</span>
                </div>
                <div className="c-qty">
                  <button type="button" aria-label={item.quantity <= 1 ? t("Bỏ {name}", { name: item.name }) : t("Bớt 1")} onClick={() => { updateQty(idx, item.quantity - 1); refresh(); }}>
                    {item.quantity <= 1 ? <Trash2 size={16} aria-hidden /> : <Minus size={16} aria-hidden />}
                  </button>
                  <output>{item.quantity}</output>
                  <button type="button" aria-label={t("Thêm 1")} onClick={() => { updateQty(idx, item.quantity + 1); refresh(); }}><Plus size={16} aria-hidden /></button>
                </div>
              </SwipeRow>
            ))}
          </ul>
          <p className="c-muted-txt c-cart-swipe-hint">{t("Vuốt sang trái trên một món để xoá nhanh.")}</p>
          </div>

          <aside className="c-bill">
            <h2 className="c-pd-h">{t("Hoá đơn tạm")}</h2>
            <dl className="c-bill-rows">
              <div><dt>{t("Tổng món")}</dt><dd>{items.reduce((acc, it) => acc + it.quantity, 0)}</dd></div>
              <div><dt>{t("Tạm tính")}</dt><dd>{formatVnd(total)}</dd></div>
              {promo.applied && promo.applied.discount > 0 && (
                <div className="is-good"><dt>{t("Ưu đãi")} {promo.applied.name} ({promo.applied.text})</dt><dd>−{formatVnd(promo.applied.discount)}</dd></div>
              )}
              {orderTypeSelection === "delivery" && (
                <div>
                  <dt>{t("Phí giao hàng")}</dt>
                  <dd>
                    {promoShip > 0 && <s className="c-price-old">{formatVnd(shippingFee)}</s>}{" "}
                    {shippingFee - promoShip > 0 ? formatVnd(shippingFee - promoShip) : t("Miễn phí")}
                  </dd>
                </div>
              )}
            </dl>
            {promo.applied && promo.applied.discount === 0 && <p className="c-bill-good">{t("Ưu đãi")} {promo.applied.name}: {promo.applied.text}</p>}
            {promo.next && <p className="c-bill-next">{t("Thêm {n} ly nữa để được {gift}", { n: promo.next.needQty, gift: promo.next.text })} ({promo.next.name})</p>}
            <div className="c-bill-total"><span>{t("Tổng cộng")}</span><span className="c-price">{formatVnd(grand)}</span></div>
            <button type="button" className="c-btn c-btn-block" onClick={() => setPayOpen(true)}>{t("Thanh toán")}</button>
          </aside>
        </div>
      )}

      {payOpen && (
        <div className="c-modal-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setPayOpen(false)}>
          <div className="c-modal" role="dialog" aria-modal="true" aria-labelledby="pay-title">
            <h2 id="pay-title" className="c-pd-h">{t("Xác nhận đặt đơn")}</h2>
            <p>
              {orderTypeSelection === "delivery"
                ? t("Đơn giao hàng cần thanh toán online (gồm cả phí giao) ở bước tiếp theo. Quán chỉ nhận đơn sau khi bạn thanh toán.")
                : orderTypeSelection === "takeaway"
                  ? t("Đơn sẽ được gửi đi, bạn có thể thanh toán trực tuyến hoặc chờ quán xác nhận.")
                  : t("Thanh toán ngay → trang hoá đơn chờ thu ngân. Thanh toán sau → có ít phút chỉnh sửa rồi mới xuống bếp.")}
            </p>
            <div className="c-modal-actions">
              <button type="button" className="c-btn" disabled={submitting || tooFar} onClick={() => void submitOrder("now")}>
                {orderTypeSelection !== "dine-in" ? t("Gửi đơn & xem hoá đơn") : t("Thanh toán ngay")}
              </button>
              {orderTypeSelection === "dine-in" && (
                <button type="button" className="c-btn is-outline" disabled={submitting} onClick={() => void submitOrder("later")}>{t("Thanh toán sau")}</button>
              )}
              <button type="button" className="c-linkish" onClick={() => setPayOpen(false)}>{t("Huỷ")}</button>
            </div>
          </div>
        </div>
      )}

      {msg && <p className="c-err" role="alert">{msg}</p>}
    </div>
  );
}
