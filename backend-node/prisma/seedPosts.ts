import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const posts = [
  {
    title: "Ra mắt Combo Sáng Trọn Vẹn: Cà phê đậm đà - Bánh sừng trâu giòn rụm",
    body: `<p><em>Bắt đầu ngày mới đầy hứng khởi với bộ đôi hoàn hảo từ chúng tôi. Tiết kiệm hơn, ngon miệng hơn!</em></p><p>Bạn thường bỏ bữa sáng vì quá bận rộn? Hãy để chúng tôi chăm sóc dạ dày của bạn bằng <strong>Combo Sáng Trọn Vẹn</strong>.</p><p>Chỉ với 45.000đ, bạn sẽ có ngay một ly <strong>Cà Phê Phin Truyền Thống</strong> đậm vị để đánh thức tinh thần, kèm theo một chiếc <strong>Bánh Sừng Trâu (Croissant)</strong> nướng bơ tỏi giòn tan, thơm lừng.</p><p>Chương trình áp dụng từ 6h00 - 10h00 sáng mỗi ngày tại tất cả các chi nhánh. Ghé ngay để nạp năng lượng nhé!</p>`,
    imageUrl: "https://placehold.co/600x400/D2B48C/ffffff?text=Combo+Sang",
    pinned: true,
  },
  {
    title: "Cà Phê Muối: Sự kết hợp táo bạo đang 'gây bão' giới trẻ",
    body: `<p><em>Vị đắng của cà phê, vị béo của kem và chút mặn mà của muối - Tất cả hòa quyện tạo nên một trải nghiệm vị giác bùng nổ.</em></p><p>Nếu bạn đã quá quen thuộc với cà phê sữa đá, sao không thử đổi gió với <strong>Cà Phê Muối</strong>?</p><p>Điểm nhấn của thức uống này chính là lớp kem muối (macchiato) đánh bông mềm mịn màng ở trên cùng. Khi uống, vị mặn nhẹ của muối sẽ làm tôn lên hương thơm nồng nàn và vị đắng đặc trưng của hạt cà phê Robusta rang mộc.</p><p>Đừng khuấy ngay! Hãy nhấp một ngụm để cảm nhận lớp kem muối tan trên đầu lưỡi, sau đó mới tận hưởng phần cà phê đậm đà bên dưới.</p>`,
    imageUrl: "https://placehold.co/600x400/8B4513/ffffff?text=Ca+Phe+Muoi",
    pinned: false,
  },
  {
    title: "Tưng bừng khai trương chi nhánh mới - Gần hơn với các tín đồ cà phê!",
    body: `<p><em>Tin vui cho các tín đồ đam mê hương vị nguyên bản. Chúng tôi vừa chính thức cắm cờ tại chi nhánh thứ 2 với không gian cực chill.</em></p><p>Nhằm đáp lại tình cảm to lớn của khách hàng, chúng tôi chính thức ra mắt Chi nhánh mới với không gian được thiết kế mở, nhiều cây xanh và góc check-in cực đỉnh.</p><p>Đặc biệt, hệ thống đặt hàng online của chúng tôi đã được nâng cấp. Giờ đây, bạn có thể dễ dàng chọn chi nhánh gần nhất để đặt giao hàng tận nơi với tốc độ chớp nhoáng.</p><p>Hãy đến trải nghiệm không gian mới và nhận ngay voucher <strong>giảm 20%</strong> cho hóa đơn đầu tiên nhé!</p>`,
    imageUrl: "https://placehold.co/600x400/A0522D/ffffff?text=Khai+Truong",
    pinned: false,
  },
];

async function main() {
  console.log("Start seeding posts...");
  for (const post of posts) {
    const exists = await prisma.post.findFirst({
      where: { title: post.title },
    });
    if (!exists) {
      await prisma.post.create({
        data: {
          title: post.title,
          body: post.body,
          imageUrl: post.imageUrl,
          pinned: post.pinned,
          isPublished: true,
        },
      });
      console.log(`Created post: ${post.title}`);
    } else {
      console.log(`Post already exists, skipping: ${post.title}`);
    }
  }
  console.log("Seeding posts finished.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
