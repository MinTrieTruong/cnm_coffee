import type { ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { POLICIES } from "../components/site/SiteFooter";
import { useSiteInfo } from "../lib/site";

/** Nội dung chính sách — trang tĩnh, viết theo đúng cách hệ thống đang vận hành */
const CONTENT: Record<string, { title: string; body: (ctx: { phone: string; email: string }) => ReactNode }> = {
  "dat-hang": {
    title: "Chính sách đặt hàng",
    body: () => (
      <>
        <p>Bạn có thể gọi món theo ba cách: quét mã QR tại bàn, đặt mang về để tự đến lấy, hoặc đặt giao hàng trong bán kính phục vụ của chi nhánh.</p>
        <h2>Chọn chi nhánh</h2>
        <p>Thực đơn, giá và tình trạng còn món hiển thị theo chi nhánh bạn chọn ở đầu trang. Món chi nhánh tạm hết sẽ được ẩn khỏi thực đơn.</p>
        <h2>Xác nhận đơn</h2>
        <p>Đơn tại bàn và mang về được gửi thẳng xuống quầy pha chế. Đơn giao hàng cần thanh toán trước, quán xác nhận và giao trong khung giờ hoạt động.</p>
        <h2>Huỷ đơn</h2>
        <p>Đơn đã thanh toán online được tự huỷ trong vài phút đầu khi quán chưa nhận đơn; tiền được hoàn ra điểm thưởng trong tài khoản.</p>
      </>
    ),
  },
  "bao-mat": {
    title: "Chính sách bảo mật",
    body: ({ email }) => (
      <>
        <p>Quán chỉ thu thập thông tin cần để phục vụ đơn hàng: họ tên, số điện thoại, địa chỉ giao hàng và lịch sử đơn.</p>
        <h2>Sử dụng thông tin</h2>
        <p>Số điện thoại dùng để đăng nhập, tích điểm và liên hệ khi giao hàng. Quán không bán hay chia sẻ thông tin của bạn cho bên thứ ba ngoài đơn vị thanh toán và giao hàng liên quan đến đơn.</p>
        <h2>Xoá dữ liệu</h2>
        <p>Bạn có thể yêu cầu xoá tài khoản bằng cách gửi email tới <a href={`mailto:${email}`}>{email}</a>.</p>
      </>
    ),
  },
  "thanh-toan": {
    title: "Chính sách thanh toán",
    body: () => (
      <>
        <p>Quán nhận tiền mặt tại quầy, chuyển khoản QR, VNPay và MoMo. Đơn giao hàng thanh toán online trước khi quán chuẩn bị món.</p>
        <h2>Điểm thưởng</h2>
        <p>Mỗi đơn đã thanh toán được tích điểm theo cấu hình của chuỗi. 1 điểm dùng như 1đ khi thanh toán lần sau.</p>
        <h2>Hoá đơn</h2>
        <p>Hoá đơn tạm tính và hoá đơn đã thanh toán đều xem được trong mục Tài khoản › Lịch sử đơn hàng.</p>
      </>
    ),
  },
  "doi-tra": {
    title: "Chính sách đổi trả",
    body: ({ phone }) => (
      <>
        <p>Đồ uống pha sai yêu cầu, đổ vỡ khi giao hoặc không đạt chất lượng: quán làm lại món mới hoặc hoàn tiền ra điểm thưởng.</p>
        <h2>Cách báo</h2>
        <p>Gửi khiếu nại kèm ảnh trong khung chat của trang, hoặc gọi <a href={`tel:${phone}`}>{phone}</a> trong vòng 2 giờ kể từ khi nhận món.</p>
        <h2>Không áp dụng</h2>
        <p>Món đã dùng quá nửa hoặc khiếu nại sau 24 giờ.</p>
      </>
    ),
  },
};

export function Policy() {
  const { slug } = useParams();
  const info = useSiteInfo();
  const page = slug ? CONTENT[slug] : undefined;
  if (!page) return <Navigate to="/" replace />;
  return (
    <div className="c-wrap c-policy">
      <nav className="c-crumbs" aria-label="Vị trí">
        <Link to="/">Trang chủ</Link> / <span aria-current="page">{page.title}</span>
      </nav>
      <div className="c-policy-grid">
        <article className="c-prose">
          <h1 className="c-sec-title">{page.title}</h1>
          {page.body({ phone: info?.hotline.value ?? "", email: info?.company.email ?? "" })}
        </article>
        <aside className="c-policy-nav">
          {POLICIES.map((p) => (
            <Link key={p.slug} to={`/policy/${p.slug}`} className={p.slug === slug ? "is-on" : undefined}>{p.label}</Link>
          ))}
        </aside>
      </div>
    </div>
  );
}
