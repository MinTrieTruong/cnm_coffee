import { Link, useParams } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { GameBanner } from "../modules/games/MyGifts";

export function OrderSuccess() {
  const { id } = useParams();
  
  return (
    <div className="site-page" style={{ textAlign: "center", maxWidth: 440, margin: "0 auto", paddingTop: "4rem" }}>
      <div
       
       
       
      >
        <CheckCircle size={72} color="#15803d" style={{ margin: "0 auto 1.5rem" }} />
      </div>
      <h1 className="page-title" style={{ color: "var(--text)", fontSize: "2rem", marginBottom: "0.5rem" }}>Đã chốt đơn!</h1>
      <p className="subtle" style={{ marginBottom: "2.5rem", fontSize: "1.05rem", lineHeight: 1.5 }}>
        Lệnh đã được gửi xuống bếp. Món của bạn đang được chuẩn bị. <br/> Chúc bạn có một trải nghiệm thật ngon miệng tại TD Coffee!
      </p>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <GameBanner compact />
        <Link to={`/order/${id}/checkout`} className="btn btn-primary" style={{ padding: "1rem", borderRadius: 4, fontSize: "1.05rem", background: "var(--accent)", boxShadow: "0 8px 20px rgba(146,64,14,0.3)", color: "#fff" }}>
          Xem hóa đơn & Thanh toán
        </Link>
        <Link to="/menu" className="btn" style={{ padding: "1rem", borderRadius: 4, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "1.05rem" }}>
          Quay lại Menu
        </Link>
      </div>
    </div>
  );
}
