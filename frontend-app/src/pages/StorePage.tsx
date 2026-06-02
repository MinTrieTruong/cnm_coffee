import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ReviewList } from "../components/ReviewList";
import { motion } from "framer-motion";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import "swiper/css";
import { Coffee, Leaf, MapPin, CalendarDays, ArrowRight } from "lucide-react";
import { PostViewModal } from "../components/PostViewModal";

const STORE = {
  name: "TD Coffee",
  tagline: "Cà phê tươi, phục vụ tận tâm",
  description:
    "TD Coffee là không gian cà phê ấm cúng tại trung tâm thành phố — nơi mỗi tách cà phê được pha chế tỉ mỉ từ hạt Robusta và Arabica chọn lọc. Chúng tôi tin rằng một buổi sáng tốt lành bắt đầu từ một tách cà phê ngon.",
  address: "123 Đường Cà Phê, Quận 1, TP.HCM",
  phone: "0389 730 361",
  email: "hello@tdcoffee.vn",
};

export function StorePage() {
  const [gallery, setGallery] = useState<string[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [activePost, setActivePost] = useState<any>(null);

  useEffect(() => {
    api<string[]>("/api/posts/gallery")
      .then((data) => setGallery(data))
      .catch(() => {});
    api<any[]>("/api/posts")
      .then((data) => setPosts(data))
      .catch(() => {});
  }, []);

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh", overflowX: "hidden" }}>
      {/* HEADER COVER */}
      <section style={{ position: "relative", height: "75vh", minHeight: "500px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div style={{ 
          position: "absolute", inset: 0, 
          backgroundImage: 'url("https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=1920")', 
          backgroundSize: "cover", backgroundPosition: "center", 
          filter: "brightness(0.35)" 
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(26,18,13,0) 0%, rgba(26,18,13,0.8) 80%, var(--bg) 100%)"
        }} />
        <motion.div 
          initial={{ opacity: 0, y: 30 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "0 1.5rem" }}
        >
          <h1 style={{ 
            fontFamily: "var(--font-display)", fontSize: "clamp(2.5rem, 6vw, 5rem)", 
            fontWeight: 800, margin: "0 0 1rem", color: "#e8b84a", 
            letterSpacing: "0.02em", textShadow: "0 4px 20px rgba(0,0,0,0.6)" 
          }}>
            Câu chuyện của TD Coffee
          </h1>
          <p style={{ 
            fontSize: "clamp(1.1rem, 2vw, 1.3rem)", color: "rgba(245,235,227,0.9)", 
            maxWidth: 600, margin: "0 auto 2.5rem", lineHeight: 1.6 
          }}>
            {STORE.tagline}
          </p>
          <Link to="/menu" className="btn btn-primary" style={{ 
            padding: "0.9rem 2.5rem", fontSize: "1.05rem", borderRadius: "999px", 
            textTransform: "uppercase", letterSpacing: "0.05em", 
            boxShadow: "0 8px 24px rgba(201,162,39,0.25)" 
          }}>
            Khám phá thực đơn
          </Link>
        </motion.div>
      </section>

      {/* OUR STORY */}
      <section style={{ padding: "6rem 1.5rem", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4rem" }}>
          <motion.div 
            initial={{ opacity: 0, x: -40 }} 
            whileInView={{ opacity: 1, x: 0 }} 
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ flex: "1 1 400px" }}
          >
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2.4rem", color: "var(--accent)", marginBottom: "1.5rem", lineHeight: 1.2 }}>Hành trình của hương vị</h2>
            <p style={{ fontSize: "1.05rem", lineHeight: 1.8, color: "rgba(245,235,227,0.8)", marginBottom: "1.5rem" }}>
              Bắt đầu từ một góc phố nhỏ, TD Coffee mang theo đam mê bất tận với hạt cà phê Việt. Chúng tôi lựa chọn kỹ lưỡng những hạt cà phê Arabica và Robusta hảo hạng nhất từ vùng cao nguyên Đắk Lắk.
            </p>
            <p style={{ fontSize: "1.05rem", lineHeight: 1.8, color: "rgba(245,235,227,0.8)" }}>
              {STORE.description}
            </p>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 40 }} 
            whileInView={{ opacity: 1, x: 0 }} 
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            style={{ flex: "1 1 400px", position: "relative" }}
          >
            <div style={{ position: "relative", borderRadius: "24px", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.4)", aspectRatio: "4/5" }}>
              <img src="https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&q=80&w=800" alt="Coffee brewing" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px", pointerEvents: "none" }} />
            </div>
            <div style={{ position: "absolute", bottom: "-2rem", left: "-2rem", width: "200px", height: "200px", background: "var(--accent)", borderRadius: "50%", filter: "blur(100px)", opacity: 0.15, zIndex: -1 }} />
          </motion.div>
        </div>
      </section>

      {/* CORE VALUES */}
      <section style={{ padding: "6rem 1.5rem", background: "rgba(255,255,255,0.015)", borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <motion.div 
            initial={{ opacity: 0, y: 30 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            style={{ textAlign: "center", marginBottom: "4rem" }}
          >
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2.4rem", color: "var(--accent)", margin: 0 }}>Giá trị cốt lõi</h2>
            <div style={{ width: 80, height: 2, background: "var(--accent)", margin: "1.5rem auto 0", opacity: 0.5 }} />
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "3.5rem" }}>
            {[
              { icon: Coffee, title: "Cà phê đặc sản", desc: "Sử dụng 100% hạt cà phê nguyên chất, rang mộc, giữ trọn vẹn hương vị tinh túy nhất." },
              { icon: Leaf, title: "Nguyên liệu tự nhiên", desc: "Nguồn nguyên liệu sạch, không chất bảo quản, an toàn tuyệt đối cho sức khỏe khách hàng." },
              { icon: MapPin, title: "Không gian kết nối", desc: "Thiết kế mở, hiện đại mang lại cảm giác thoải mái cho những buổi hẹn hò hay làm việc." }
            ].map((val, idx) => (
              <motion.div 
                key={val.title}
                initial={{ opacity: 0, y: 30 }} 
                whileInView={{ opacity: 1, y: 0 }} 
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: idx * 0.15 }}
                style={{ textAlign: "center", padding: "1rem" }}
              >
                <div style={{ width: 72, height: 72, margin: "0 auto 1.5rem", borderRadius: "50%", background: "linear-gradient(135deg, rgba(201,162,39,0.15) 0%, rgba(201,162,39,0.05) 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", border: "1px solid rgba(201,162,39,0.2)" }}>
                  <val.icon size={32} strokeWidth={1.2} />
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#fff", margin: "0 0 1rem", fontFamily: "var(--font-display)" }}>{val.title}</h3>
                <p style={{ fontSize: "0.95rem", lineHeight: 1.6, color: "rgba(245,235,227,0.65)", margin: 0 }}>{val.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      {gallery.length > 0 && (
        <section style={{ padding: "6rem 0", overflow: "hidden" }}>
          <motion.div 
            initial={{ opacity: 0 }} 
            whileInView={{ opacity: 1 }} 
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            style={{ textAlign: "center", marginBottom: "3rem", padding: "0 1.5rem" }}
          >
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "2.4rem", color: "var(--accent)", margin: 0 }}>Không gian quán</h2>
            <p style={{ fontSize: "1.05rem", color: "rgba(245,235,227,0.6)", marginTop: "0.75rem" }}>Trải nghiệm góc nhỏ bình yên giữa lòng thành phố</p>
          </motion.div>
          <Swiper
            modules={[Autoplay]}
            spaceBetween={32}
            slidesPerView={1.2}
            centeredSlides={true}
            loop={true}
            autoplay={{ delay: 3500, disableOnInteraction: false }}
            breakpoints={{
              640: { slidesPerView: 2 },
              1024: { slidesPerView: 3 },
            }}
            style={{ paddingBottom: "2rem" }}
          >
            {gallery.map((url, i) => (
              <SwiperSlide key={i}>
                <div style={{ borderRadius: "20px", overflow: "hidden", aspectRatio: "16/10", boxShadow: "0 12px 30px rgba(0,0,0,0.4)" }}>
                  <img src={url} alt={`Gallery ${i}`} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.5s" }} onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"} onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"} />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </section>
      )}

      {/* POSTS / NEWS */}
      {posts.length > 0 && (
        <section style={{ padding: "6rem 1.5rem", background: "rgba(255,255,255,0.015)", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <motion.div 
              initial={{ opacity: 0, y: 30 }} 
              whileInView={{ opacity: 1, y: 0 }} 
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              style={{ textAlign: "center", marginBottom: "4rem" }}
            >
              <h2 style={{ fontFamily: "var(--font-body)", fontWeight: 800, fontSize: "2.4rem", color: "var(--accent)", margin: 0 }}>Tin tức & Khuyến mãi</h2>
              <div style={{ width: 80, height: 2, background: "var(--accent)", margin: "1.5rem auto 0", opacity: 0.5 }} />
            </motion.div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2.5rem" }}>
              {posts.map((post, idx) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: idx * 0.1 }}
                  style={{ background: "linear-gradient(145deg, var(--surface) 0%, #231a15 100%)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "20px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 12px 35px rgba(0,0,0,0.3)" }}
                >
                  {post.imageUrl && (
                    <div style={{ aspectRatio: "16/9", overflow: "hidden" }}>
                      <img src={post.imageUrl} alt={post.title} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.5s ease" }} onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"} onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"} />
                    </div>
                  )}
                  <div style={{ padding: "1.75rem", flex: 1, display: "flex", flexDirection: "column" }}>
                    {post.pinned && (
                      <span style={{ display: "inline-block", padding: "0.25rem 0.75rem", background: "rgba(201,162,39,0.15)", color: "var(--accent)", borderRadius: "99px", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem", alignSelf: "flex-start" }}>Ghim</span>
                    )}
                    <h3 style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "1.35rem", margin: "0 0 0.75rem", color: "#fff", lineHeight: 1.35 }}>{post.title}</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "rgba(245,235,227,0.5)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
                      <CalendarDays size={14} />
                      <span>{new Date(post.createdAt).toLocaleDateString("vi-VN")}</span>
                    </div>
                    <p style={{ color: "rgba(245,235,227,0.7)", fontSize: "0.95rem", lineHeight: 1.6, margin: "0 0 1.5rem", flex: 1, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap" }}>
                      {post.body.replace(/<[^>]+>/g, '')}
                    </p>
                    <div onClick={() => setActivePost(post)} style={{ color: "var(--accent)", fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                      Xem thêm <ArrowRight size={16} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TESTIMONIALS */}
      <section style={{ padding: "5rem 1.5rem 8rem", background: "linear-gradient(180deg, var(--bg) 0%, #110d0a 100%)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            {/* The ReviewList already has its own title logic, but we can wrap it or pass props */}
            <ReviewList title="Khách hàng nói gì về chúng tôi?" titleSize="2rem" />
          </motion.div>
        </div>
      </section>

      {/* MODAL */}
      {activePost && <PostViewModal post={activePost} onClose={() => setActivePost(null)} />}
    </div>
  );
}
