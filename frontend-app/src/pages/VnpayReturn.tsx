import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { getUser, mergeSessionUser } from "../lib/session";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

export function VnpayReturn() {
  const [params] = useSearchParams();
  const responseCode = params.get("vnp_ResponseCode");
  const txnRef = params.get("vnp_TxnRef") ?? "";
  const amountStr = params.get("vnp_Amount") ?? "0";
  const orderId = txnRef.split("_")[0];

  const success = responseCode === "00";
  const amountVnd = Math.round(Number(amountStr) / 100); // VNPay trả về * 100

  // Refresh user points nếu thành công và đã đăng nhập
  const user = getUser();
  useEffect(() => {
    if (success && user) {
      api<{ user: Parameters<typeof mergeSessionUser>[0] }>("/api/auth/me")
        .then((d) => mergeSessionUser(d.user))
        .catch(() => {});
    }
  }, [success, user]);

  return (
    <div className="site-page" style={{ textAlign: "center", maxWidth: 440, margin: "0 auto", paddingTop: "2rem" }}>
      {success ? (
        <>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(34,197,94,0.15)",
              border: "2px solid #15803d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
              margin: "0 auto 1.25rem",
            }}
          >
            ✅
          </div>
          <h1 className="page-title" style={{ color: "#15803d" }}>
            Thanh toán thành công!
          </h1>
          <p className="subtle" style={{ marginBottom: "1rem" }}>
            Cảm ơn bạn đã thanh toán qua VNPay.
          </p>
          {amountVnd > 0 && (
            <div
              style={{
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.25)",
                borderRadius: "var(--radius)",
                padding: "0.85rem 1.25rem",
                margin: "1rem 0",
              }}
            >
              <div className="subtle" style={{ fontSize: "0.85rem" }}>Số tiền đã thanh toán</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#15803d", marginTop: "0.25rem" }}>
                {formatVnd(amountVnd)}
              </div>
            </div>
          )}
          {orderId && (
            <Link
              to={`/order/${orderId}/checkout`}
              className="btn btn-ghost"
              style={{ marginBottom: "0.65rem", display: "block" }}
            >
              Xem chi tiết đơn #{orderId}
            </Link>
          )}
          <Link to="/menu" className="btn btn-primary btn-block">
            Về thực đơn
          </Link>
        </>
      ) : (
        <>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(239,68,68,0.12)",
              border: "2px solid var(--danger)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
              margin: "0 auto 1.25rem",
            }}
          >
            ❌
          </div>
          <h1 className="page-title" style={{ color: "var(--danger)" }}>
            Thanh toán thất bại
          </h1>
          <p className="subtle" style={{ marginBottom: "1rem" }}>
            Giao dịch không thành công (mã: <strong>{responseCode}</strong>). Bạn chưa bị trừ tiền.
          </p>
          {orderId && (
            <Link
              to={`/order/${orderId}/checkout`}
              className="btn btn-primary btn-block"
              style={{ marginBottom: "0.65rem" }}
            >
              Thử lại thanh toán
            </Link>
          )}
          <Link to="/menu" className="btn btn-ghost btn-block">
            Về thực đơn
          </Link>
        </>
      )}
    </div>
  );
}
