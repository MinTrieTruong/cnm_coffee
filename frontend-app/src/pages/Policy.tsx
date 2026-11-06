import type { ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { POLICIES, policyHref } from "../components/site/SiteFooter";
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
  privacy: {
    title: "Chính sách quyền riêng tư",
    body: ({ email, phone }) => (
      <>
        <p>Quán chỉ thu thập thông tin cần để phục vụ đơn hàng và chương trình thành viên. Trang này nói rõ quán thu thập gì, dùng vào việc gì và bạn có quyền gì với dữ liệu của mình.</p>
        <h2>Thông tin quán thu thập</h2>
        <ul>
          <li>Họ tên, số điện thoại, email (nếu có), ngày sinh, giới tính và ảnh đại diện bạn tự cập nhật.</li>
          <li>Địa chỉ và vị trí ghim trên bản đồ khi đặt giao hàng.</li>
          <li>Lịch sử đơn hàng, điểm thưởng, voucher, đánh giá và lượt chơi mini game.</li>
          <li>Nhật ký đăng nhập: thời điểm, phương thức đăng nhập và địa chỉ IP, để phát hiện truy cập bất thường.</li>
        </ul>
        <h2>Đăng nhập bằng Google hoặc Facebook</h2>
        <p>Khi bạn chọn “Tiếp tục với Google” hoặc “Tiếp tục với Facebook”, quán chỉ nhận <strong>mã định danh tài khoản, tên, email (nếu bạn cho phép) và ảnh đại diện</strong>. Quán không nhận mật khẩu, danh sách bạn bè, bài viết hay bất kỳ quyền đăng bài nào thay bạn.</p>
        <p>Thông tin này chỉ dùng để tạo và đăng nhập tài khoản thành viên. Bạn có thể hủy liên kết bất cứ lúc nào trong Tài khoản › Bảo mật.</p>
        <h2>Sử dụng thông tin</h2>
        <p>Số điện thoại dùng để đăng nhập, tích điểm và liên hệ khi giao hàng. Quán không bán hay chia sẻ thông tin của bạn cho bên thứ ba, ngoài đơn vị thanh toán và giao hàng liên quan trực tiếp đến đơn của bạn.</p>
        <h2>Lưu trữ và bảo vệ</h2>
        <p>Mật khẩu được mã hoá một chiều, quán không xem được. Dữ liệu được lưu trên máy chủ của quán và chỉ nhân viên có phân quyền mới truy cập.</p>
        <h2>Quyền của bạn</h2>
        <p>Bạn có thể xem và sửa thông tin trong mục Tài khoản, hoặc yêu cầu xoá toàn bộ dữ liệu theo hướng dẫn tại trang <Link to="/data-deletion">Xoá dữ liệu người dùng</Link>.</p>
        <h2>Liên hệ</h2>
        <p>Mọi câu hỏi về quyền riêng tư, gửi email tới <a href={`mailto:${email}`}>{email}</a>{phone && <> hoặc gọi <a href={`tel:${phone}`}>{phone}</a></>}.</p>
      </>
    ),
  },
  "data-deletion": {
    title: "Xoá dữ liệu người dùng",
    body: ({ email, phone }) => (
      <>
        <p>Bạn có quyền yêu cầu quán xoá tài khoản thành viên và dữ liệu cá nhân liên quan, kể cả khi bạn đăng ký bằng Google hoặc Facebook.</p>
        <h2>Cách gửi yêu cầu</h2>
        <ol>
          <li>Gửi email tới <a href={`mailto:${email}?subject=${encodeURIComponent("Yêu cầu xoá dữ liệu")}`}>{email}</a> với tiêu đề “Yêu cầu xoá dữ liệu”{phone && <>, hoặc gọi <a href={`tel:${phone}`}>{phone}</a></>}.</li>
          <li>Ghi số điện thoại hoặc email của tài khoản, và cách bạn đăng nhập (số điện thoại, Google hoặc Facebook).</li>
          <li>Quán xác nhận bạn là chủ tài khoản (gọi lại số điện thoại hoặc trả lời từ đúng email đã đăng ký), rồi xoá trong vòng 30 ngày và báo lại cho bạn.</li>
        </ol>
        <h2>Gỡ liên kết với Facebook / Google</h2>
        <p>Bạn có thể tự hủy liên kết trong Tài khoản › Bảo mật. Bạn cũng có thể gỡ quyền truy cập của quán ngay trên nền tảng:</p>
        <ul>
          <li>Facebook: Cài đặt &amp; quyền riêng tư › Cài đặt › Ứng dụng và trang web › chọn ứng dụng của quán › Gỡ.</li>
          <li>Google: Tài khoản Google › Bảo mật › Kết nối của bạn với ứng dụng và dịch vụ bên thứ ba › chọn ứng dụng của quán › Xoá kết nối.</li>
        </ul>
        <h2>Dữ liệu được xoá</h2>
        <p>Họ tên, số điện thoại, email, ảnh đại diện, địa chỉ đã lưu, liên kết Google / Facebook, nhật ký đăng nhập, điểm thưởng và voucher chưa dùng.</p>
        <h2>Dữ liệu quán phải giữ lại</h2>
        <p>Hoá đơn bán hàng được giữ theo quy định kế toán, thuế nhưng được tách khỏi thông tin cá nhân của bạn (không còn tên, số điện thoại).</p>
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

/** Link cũ → trang mới (Meta cần URL cố định /privacy, /data-deletion) */
const MOVED: Record<string, string> = { "bao-mat": "/privacy" };

export function Policy({ slug: fixed }: { slug?: string }) {
  const params = useParams();
  const slug = fixed ?? params.slug;
  const info = useSiteInfo();
  const page = slug ? CONTENT[slug] : undefined;
  if (slug && MOVED[slug]) return <Navigate to={MOVED[slug]} replace />;
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
            <Link key={p.slug} to={policyHref(p.slug)} className={p.slug === slug ? "is-on" : undefined}>{p.label}</Link>
          ))}
        </aside>
      </div>
    </div>
  );
}
