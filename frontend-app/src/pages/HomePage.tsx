import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl, calculateFinalPrice, type HomePageResponse, type Category, type Product, type Combo } from "../lib/api";
import { addToCart, addComboToCart } from "../lib/cart";
import { useCustomerStore, withStore } from "../lib/customerStore";
import { StorePicker } from "../components/StorePicker";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  ChevronDown,
  Flame,
  Star,
  MapPin,
  Phone,
  Clock,
  ArrowRight,
  Zap,
  Coffee,
  Package,
} from "lucide-react";

/* ── helpers ─────────────────────────────────────────────────── */
function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

// using calculateFinalPrice from api.ts instead

// Mặc định khi chưa tải được chi nhánh
const STORE_LAT = 10.8406;
const STORE_LNG = 106.6588;

const STORE_INFO = {
  address: "114 Dương Quảng Hàm, Phường 5, Gò Vấp, TP.HCM",
  phone: "0389730362",
  hours: "7:00 – 22:00 hằng ngày",
};

/* ── Mega Menu ───────────────────────────────────────────────── */
function MegaMenu({ categoryTree }: { categoryTree: Category[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEnter(id: number) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(id);
  }
  function handleLeave() {
    timeoutRef.current = setTimeout(() => setOpen(null), 200);
  }

  return (
    <nav className="hp-megamenu" aria-label="Danh mục">
      <div className="hp-megamenu-inner">
        {categoryTree.map((root) => (
          <div
            key={root.id}
            className="hp-megamenu-item"
            onMouseEnter={() => handleEnter(root.id)}
            onMouseLeave={handleLeave}
          >
            <button type="button" className="hp-megamenu-trigger">
              {root.name}
              {root.children && root.children.length > 0 && <ChevronDown size={14} />}
            </button>
            {root.children && root.children.length > 0 && open === root.id && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="hp-megamenu-dropdown"
                onMouseEnter={() => handleEnter(root.id)}
                onMouseLeave={handleLeave}
              >
                {root.children.map((child) => (
                  <div key={child.id} className="hp-megamenu-group">
                    <Link to={`/menu`} className="hp-megamenu-group-title">
                      {child.name}
                    </Link>
                    {child.children && child.children.length > 0 && (
                      <ul className="hp-megamenu-sublist">
                        {child.children.map((sub) => (
                          <li key={sub.id}>
                            <Link to={`/menu`} className="hp-megamenu-sublink">
                              {sub.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        ))}
        <Link to="/menu" className="hp-megamenu-trigger hp-megamenu-all">
          Xem tất cả <ArrowRight size={14} />
        </Link>
      </div>
    </nav>
  );
}

/* ── Product Card (shared) ───────────────────────────────────── */
function ProductCard({
  product,
  showDiscount,
  showAddToCart,
}: {
  product: Product;
  showDiscount?: boolean;
  showAddToCart?: boolean;
}) {
  const hasDiscount = showDiscount && product.discountPercent && product.discountPercent > 0;
  const discountedPrice = hasDiscount
    ? calculateFinalPrice(product.sellPrice, product.discountPercent!)
    : product.sellPrice;

  const [added, setAdded] = useState(false);

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product, { unitPrice: discountedPrice, quantity: 1, size: "M", icePct: 100, sugar: "100", notes: "" });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  }

  return (
    <motion.div
      whileHover={{ y: -6, transition: { duration: 0.25 } }}
      className="hp-product-card"
    >
      <Link to={`/product/${product.id}`} className="hp-product-link">
        {/* Image */}
        <div className="hp-product-img-wrap">
          <div
            className="hp-product-img"
            style={{
              backgroundImage: mediaUrl(product.imageUrl)
                ? `url(${mediaUrl(product.imageUrl)})`
                : undefined,
            }}
          />
          {/* Discount Badge */}
          {hasDiscount && (
            <span className="hp-discount-badge">-{product.discountPercent}%</span>
          )}
        </div>

        {/* Info */}
        <div className="hp-product-info">
          <div className="hp-product-name">{product.name}</div>
          {product.category && (
            <div className="hp-product-cat">{product.category.name}</div>
          )}
          <div className="hp-product-price-row">
            {hasDiscount ? (
              <>
                <span className="hp-product-price-old">{formatVnd(product.sellPrice)}</span>
                <span className="hp-product-price-new">{formatVnd(discountedPrice)}</span>
              </>
            ) : (
              <span className="hp-product-price">{formatVnd(product.sellPrice)}</span>
            )}
          </div>
        </div>
      </Link>

      {/* CTA */}
      {showAddToCart && (
        <button
          type="button"
          className={`hp-add-cart-btn ${added ? "hp-add-cart-btn--added" : ""}`}
          onClick={handleAddToCart}
        >
          <ShoppingCart size={16} />
          {added ? "Đã thêm ✓" : "Thêm vào giỏ"}
        </button>
      )}
    </motion.div>
  );
}

/* ── Combo Card ──────────────────────────────────────────────── */
function ComboCard({ combo }: { combo: Combo }) {
  const [added, setAdded] = useState(false);

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    addComboToCart(combo);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  }

  const savings = combo.originalPrice - combo.comboPrice;
  const savingsPct = Math.round((savings / combo.originalPrice) * 100);

  return (
    <motion.div
      whileHover={{ y: -8, transition: { duration: 0.25 } }}
      className="hp-combo-card"
    >
      {/* HOT badge */}
      {combo.isHot && (
        <div className="hp-combo-hot-badge">
          <Flame size={12} /> HOT
        </div>
      )}

      {/* Savings badge */}
      <div className="hp-combo-save-badge">-{savingsPct}%</div>

      {/* Image */}
      <div className="hp-combo-img-wrap">
        {combo.imageUrl ? (
          <div
            className="hp-combo-img"
            style={{ backgroundImage: `url(${mediaUrl(combo.imageUrl)})` }}
          />
        ) : (
          <div className="hp-combo-img hp-combo-img--placeholder">
            <Package size={40} style={{ opacity: 0.3 }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="hp-combo-info">
        <div className="hp-combo-name">{combo.name}</div>

        {/* Items list */}
        <ul className="hp-combo-items-list">
          {combo.items.map((ci) => (
            <li key={ci.id}>
              {ci.quantity > 1 && <span className="hp-combo-qty">{ci.quantity}x </span>}
              {ci.product.name}
            </li>
          ))}
        </ul>

        {/* Pricing */}
        <div className="hp-combo-price-row">
          <span className="hp-combo-price-orig">{formatVnd(combo.originalPrice)}</span>
          <span className="hp-combo-price-combo">{formatVnd(combo.comboPrice)}</span>
        </div>

        <div className="hp-combo-save-tag">Tiết kiệm {formatVnd(savings)}</div>
      </div>

      {/* CTA */}
      <button
        type="button"
        className={`hp-add-cart-btn hp-combo-cta ${added ? "hp-add-cart-btn--added" : ""}`}
        onClick={handleAdd}
      >
        <ShoppingCart size={16} />
        {added ? "Đã thêm ✓" : "Chọn Combo này"}
      </button>
    </motion.div>
  );
}

/* ── Main HomePage ───────────────────────────────────────────── */
export function HomePage() {
  const { storeId, store } = useCustomerStore();
  const info = {
    name: store?.name ?? "TD Coffee",
    address: store?.address ?? STORE_INFO.address,
    phone: store?.phone ?? STORE_INFO.phone,
    hours: store?.openTime && store.closeTime ? `${store.openTime} – ${store.closeTime} hằng ngày` : STORE_INFO.hours,
    lat: store?.lat ?? STORE_LAT,
    lng: store?.lng ?? STORE_LNG,
  };
  const [data, setData] = useState<HomePageResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api<HomePageResponse>(withStore("/api/homepage", storeId));
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Lỗi tải trang chủ");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  if (err) {
    return (
      <div className="site-page" style={{ textAlign: "center", padding: "4rem 1rem" }}>
        <p style={{ color: "var(--danger)" }}>{err}</p>
        <Link to="/menu">Đi tới thực đơn</Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="site-page" style={{ textAlign: "center", padding: "6rem 1rem" }}>
        <div className="hp-loader" />
        <p className="subtle" style={{ marginTop: "1rem" }}>Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="hp-root">
      {/* ═══ HERO ═══ */}
      <section className="hp-hero">
        <div className="hp-hero-bg" />
        <div className="hp-hero-overlay" />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="hp-hero-content"
        >
          <div className="hp-hero-badge">
            <Coffee size={14} /> Pha tươi mỗi ngày
          </div>
          <h1 className="hp-hero-title">TD Coffee</h1>
          <p className="hp-hero-sub">
            Thưởng thức cà phê tươi pha chế tỉ mỉ — từ hạt chọn lọc đến tách thơm ngon.
          </p>
          <div className="hp-hero-actions">
            <Link to="/menu" className="hp-hero-btn hp-hero-btn--primary">
              Xem Thực Đơn <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="hp-hero-btn hp-hero-btn--ghost">
              Đăng nhập
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ═══ MEGA MENU ═══ */}
      <MegaMenu categoryTree={data.categoryTree} />

      {/* ═══ FLASH SALE ═══ */}
      {data.flashSale.length > 0 && (
        <section className="hp-section">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="hp-section-header">
              <div className="hp-section-title-group">
                <span className="hp-section-icon hp-section-icon--fire">
                  <Zap size={20} />
                </span>
                <h2 className="hp-section-title">Flash Sale — Hot Deals</h2>
              </div>
              <Link to="/menu" className="hp-section-more">
                Xem thêm <ArrowRight size={14} />
              </Link>
            </div>
            <div className="hp-product-grid">
              {data.flashSale.map((p) => (
                <ProductCard key={p.id} product={p} showDiscount showAddToCart />
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* ═══ HOT COMBOS ═══ */}
      {data.hotCombos && data.hotCombos.length > 0 && (
        <section className="hp-section hp-section--combo">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <div className="hp-section-header">
              <div className="hp-section-title-group">
                <span className="hp-section-icon hp-section-icon--fire">
                  <Flame size={20} />
                </span>
                <h2 className="hp-section-title">🔥 Combo Hot Hiện Tại</h2>
              </div>
              <span className="hp-combo-subtitle">Ưu đãi gói đặc biệt — tiết kiệm hơn mua lẻ!</span>
            </div>
            <div className="hp-combo-carousel">
              {data.hotCombos.map((combo) => (
                <ComboCard key={combo.id} combo={combo} />
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* ═══ BEST SELLERS ═══ */}
      {data.bestSellers.length > 0 && (
        <section className="hp-section hp-section--alt">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="hp-section-header">
              <div className="hp-section-title-group">
                <span className="hp-section-icon hp-section-icon--star">
                  <Star size={20} />
                </span>
                <h2 className="hp-section-title">Món Bán Chạy</h2>
              </div>
              <Link to="/menu" className="hp-section-more">
                Xem thêm <ArrowRight size={14} />
              </Link>
            </div>
            <div className="hp-product-grid">
              {data.bestSellers.map((p) => (
                <ProductCard key={p.id} product={p} showDiscount showAddToCart />
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* ═══ CONTACT & MAP ═══ */}
      <section className="hp-contact-section">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="hp-contact-inner"
        >
          {/* Info Column */}
          <div className="hp-contact-info">
            <h2 className="hp-contact-title">
              <Flame size={20} style={{ color: "var(--accent)" }} /> Ghé thăm chúng tôi
            </h2>
            <StorePicker compact />
            <div className="hp-contact-row">
              <MapPin size={18} className="hp-contact-icon" />
              <div>
                <strong>Địa chỉ</strong>
                <p>{info.address}</p>
              </div>
            </div>
            <div className="hp-contact-row">
              <Phone size={18} className="hp-contact-icon" />
              <div>
                <strong>Hotline</strong>
                <p>
                  <a href={`tel:${info.phone}`} className="hp-contact-phone">
                    {info.phone}
                  </a>
                </p>
              </div>
            </div>
            <div className="hp-contact-row">
              <Clock size={18} className="hp-contact-icon" />
              <div>
                <strong>Giờ mở cửa</strong>
                <p>{info.hours}</p>
              </div>
            </div>
            <Link to="/menu" className="hp-contact-cta">
              Đặt món ngay <ArrowRight size={16} />
            </Link>
          </div>

          {/* Map Column */}
          <div className="hp-contact-map">
            <MapContainer
              key={`${info.lat},${info.lng}`}
              center={[info.lat, info.lng]}
              zoom={16}
              scrollWheelZoom={false}
              style={{ height: "100%", width: "100%", borderRadius: 16, zIndex: 0 }}
            >
              <TileLayer
                attribution='&copy; Google Maps'
                url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              />
              <Marker position={[info.lat, info.lng]}>
                <Popup>
                  <strong>{info.name}</strong>
                  <br />
                  {info.address}
                </Popup>
              </Marker>
            </MapContainer>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
