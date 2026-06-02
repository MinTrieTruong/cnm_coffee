import { Link, useParams } from "react-router-dom";
import { CheckCircle, Utensils } from "lucide-react";
import { motion } from "framer-motion";

export function OrderSuccess() {
  const { id } = useParams();
  
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="site-page" style={{ textAlign: "center", maxWidth: 440, margin: "0 auto", paddingTop: "4rem" }}>
      <motion.div
        initial={{ rotate: -10 }}
        animate={{ rotate: [10, -10, 10, 0] }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <CheckCircle size={72} color="#22c55e" style={{ margin: "0 auto 1.5rem" }} />
      </motion.div>
      <h1 className="page-title" style={{ color: "var(--text)", fontSize: "2rem", marginBottom: "0.5rem" }}>Đã chốt đơn!</h1>
      <p className="subtle" style={{ marginBottom: "2.5rem", fontSize: "1.05rem", lineHeight: 1.5 }}>
        Lệnh đã được gửi xuống bếp. Món của bạn đang được chuẩn bị. <br/> Chúc bạn có một trải nghiệm thật ngon miệng tại TD Coffee!
      </p>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <Link to={`/order/${id}/checkout`} className="btn btn-primary" style={{ padding: "1rem", borderRadius: 999, fontSize: "1.05rem", background: "linear-gradient(135deg, #e8b84a 0%, var(--accent) 100%)", boxShadow: "0 8px 20px rgba(201,162,39,0.3)", color: "#1a120d" }}>
          Xem hóa đơn & Thanh toán
        </Link>
        <Link to="/menu" className="btn" style={{ padding: "1rem", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)", fontSize: "1.05rem" }}>
          Quay lại Menu
        </Link>
      </div>
    </motion.div>
  );
}
