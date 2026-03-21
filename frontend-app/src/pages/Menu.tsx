import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MenuResponse, type Product } from "../lib/api";
import { clearSession, getUser, isGuestMode } from "../lib/session";
import { getCart } from "../lib/cart";
import { ChatWidget } from "../components/ChatWidget";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

export function Menu() {
  const [data, setData] = useState<MenuResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const user = getUser();
  const guest = isGuestMode();

  const qs = useMemo(() => {
    if (user?.customerId) return `?customerId=${user.customerId}`;
    return "";
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await api<MenuResponse>(`/api/menu${qs}`);
        if (!cancelled) setData(m);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Lỗi tải menu");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qs]);

  const cartCount = getCart().reduce((s, i) => s + i.quantity, 0);

  if (err) {
    return (
      <div className="app-shell">
        <p style={{ color: "var(--danger)" }}>{err}</p>
        <Link to="/">Về trang đăng nhập</Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-shell">
        <p className="subtle">Đang tải thực đơn…</p>
      </div>
    );
  }

  const byCat = new Map<number, Product[]>();
  for (const p of data.products) {
    const arr = byCat.get(p.categoryId) ?? [];
    arr.push(p);
    byCat.set(p.categoryId, arr);
  }

  return (
    <div className="app-shell">
      <div className="nav-top">
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Thực đơn
          </h1>
          <p className="subtle" style={{ marginBottom: 0, marginTop: "0.25rem" }}>
            {guest || !user ? "Khách" : user.fullName}
          </p>
        </div>
        {user && (
          <Link to="/account" className="btn btn-ghost" style={{ padding: "0.55rem 0.9rem" }}>
            Tài khoản
          </Link>
        )}
        <Link
          to="/cart"
          className="btn btn-ghost"
          style={{ position: "relative", padding: "0.55rem 0.9rem" }}
        >
          Giỏ
          {cartCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                background: "var(--accent)",
                color: "#1a120d",
                borderRadius: "999px",
                fontSize: "0.7rem",
                minWidth: "1.25rem",
                height: "1.25rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
              }}
            >
              {cartCount}
            </span>
          )}
        </Link>
      </div>

      {data.favorites.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", margin: "0 0 0.75rem" }}>
            ⭐ Món quen của bạn
          </h2>
          <div style={{ display: "flex", gap: "0.75rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
            {data.favorites.map((p) => (
              <Link
                key={p.id}
                to={`/product/${p.id}`}
                className="card"
                style={{
                  flex: "0 0 42%",
                  minWidth: "140px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    aspectRatio: "4/3",
                    background: "#1a120d",
                    backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <div style={{ padding: "0.65rem 0.75rem" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", lineHeight: 1.25 }}>{p.name}</div>
                  <div style={{ color: "var(--accent)", fontWeight: 700, marginTop: "0.35rem" }}>
                    {formatVnd(p.sellPrice)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.categories.map((c) => {
        const list = byCat.get(c.id) ?? [];
        if (!list.length) return null;
        return (
          <section key={c.id} style={{ marginBottom: "1.75rem" }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.1rem",
                margin: "0 0 0.85rem",
                color: "var(--muted)",
              }}
            >
              {c.name}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {list.map((p) => (
                <Link
                  key={p.id}
                  to={`/product/${p.id}`}
                  className="card"
                  style={{ display: "flex", gap: "0.85rem", textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      width: "96px",
                      flexShrink: 0,
                      alignSelf: "stretch",
                      minHeight: "88px",
                      background: "#1a120d",
                      backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div style={{ padding: "0.75rem 0.75rem 0.75rem 0", flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ color: "var(--accent)", fontWeight: 700, marginTop: "0.35rem" }}>
                      {formatVnd(p.sellPrice)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <p style={{ textAlign: "center", marginTop: "1rem" }}>
        <Link
          to="/"
          onClick={() => clearSession()}
          style={{ color: "var(--muted)", fontSize: "0.9rem" }}
        >
          Đăng xuất
        </Link>
      </p>

      <ChatWidget />
    </div>
  );
}
