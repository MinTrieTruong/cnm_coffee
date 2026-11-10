import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { clearCartBackup, restoreCartFromBackup } from "../lib/cart";
import { getTableId, getTakeawaySessionId } from "../lib/session";

type OrderPayload = {
  id: number;
  status: string;
  graceEndsAt: string | null;
};

export function OrderGrace() {
  const { id } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState<OrderPayload | null>(null);
  const [left, setLeft] = useState(15);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const o = await api<OrderPayload>(`/api/orders/${id}`);
        if (cancelled) return;
        setOrder(o);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Lỗi");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!order?.graceEndsAt || order.status !== "Pending_Grace") return;
    const end = new Date(order.graceEndsAt).getTime();
    const tick = () => {
      const sec = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(sec);
      if (sec <= 0) {
        clearCartBackup();
        void (async () => {
          for (let i = 0; i < 8; i++) {
            try {
              const o = await api<{ status: string }>(`/api/orders/${id}`);
              if (o.status === "Confirmed") {
                nav(`/order/${id}/success`, { replace: true });
                return;
              }
            } catch {
              /* retry */
            }
            await new Promise((r) => setTimeout(r, 400));
          }
          nav(`/order/${id}/success`, { replace: true });
        })();
      }
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [order, nav]);

  async function onCancel() {
    if (!id) return;
    try {
      // Chứng minh đúng người đặt: phiên mang về / bàn (khách đăng nhập thì máy chủ dựa vào token)
      await api(`/api/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ sessionId: getTakeawaySessionId(), tableId: getTableId() }) });
      restoreCartFromBackup();
      nav("/cart", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không hủy được");
    }
  }

  if (err && !order) {
    return (
      <div className="site-page">
        <p style={{ color: "var(--danger)" }}>{err}</p>
        <Link to="/menu">Menu</Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="site-page">
        <p className="subtle">Đang tải…</p>
      </div>
    );
  }

  if (order.status !== "Pending_Grace") {
    return (
      <div className="site-page">
        <p className="subtle">Đơn đã xác nhận hoặc kết thúc ân hạn.</p>
        <Link to="/menu">Menu</Link>
      </div>
    );
  }

  return (
    <div className="site-page" style={{ textAlign: "center" }}>
      <h1 className="page-title">Ân hạn chỉnh sửa</h1>
      <p className="subtle">QTNV-01: Trong 15 giây có thể hủy đơn; sau đó lệnh xuống bếp (KDS).</p>
      <div
        style={{
          margin: "2rem auto",
          width: 160,
          height: 160,
          borderRadius: "50%",
          border: "6px solid var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "2.5rem",
          fontWeight: 800,
          fontFamily: "var(--font-display)",
        }}
      >
        {left}s
      </div>
      <button
        type="button"
        className="btn btn-primary"
        style={{ background: "var(--danger)", border: "none" }}
        onClick={() => void onCancel()}
      >
        Hủy / Sửa đơn
      </button>
      {err && <p style={{ color: "var(--danger)", marginTop: "1rem" }}>{err}</p>}
      <p style={{ marginTop: "1.5rem" }}>
        <Link to="/menu">Về menu</Link>
      </p>
    </div>
  );
}
