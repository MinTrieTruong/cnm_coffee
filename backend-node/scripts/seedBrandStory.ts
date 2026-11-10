/**
 * Seed trang câu chuyện thương hiệu (/about) — 15 mục, tiếng Việt + tiếng Anh — và hồ sơ giới thiệu cho mọi chi nhánh.
 * NỘI DUNG MẪU để trang có hồn khi demo: chủ chuỗi sửa lại ở Website › Câu chuyện thương hiệu (không cần sửa code).
 *
 *   npm run seed:brand            — chỉ tạo mục / hồ sơ còn trống (không ghi đè phần chủ chuỗi đã sửa)
 *   npm run seed:brand -- --force — ghi đè toàn bộ bằng nội dung mẫu
 *
 * Ảnh: khóa ảnh mặc định trong frontend public/site (nguồn ở public/site/CREDITS.md); ô để trống hiện ảnh giữ chỗ SVG.
 * "Khách kể về tụi mình" chỉ lấy từ đánh giá thật trong bảng Review (không tạo lời kể giả).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { BRAND_SECTIONS, validateSection, validateStoreProfile, type BrandDataMap, type BrandImage, type BrandKey } from "../src/shared/brand.js";

const prisma = new PrismaClient();
const force = process.argv.includes("--force");
const img = (url: string, alt: string, x = 50, y = 50): BrandImage => ({ url, alt, focus: { x, y } });
const NO_IMG: BrandImage = { url: "", alt: "" };

async function main() {
  const product = async (kw: string) => (await prisma.product.findFirst({ where: { isActive: true, name: { contains: kw } }, orderBy: { id: "asc" }, select: { id: true } }))?.id ?? null;
  const [bacXiu, muoi, denDa, latte, traDao] = await Promise.all([product("Bạc Xỉu"), product("Muối"), product("Đen Đá"), product("Latte"), product("Trà Đào")]);
  // Lời kể: đánh giá thật có nội dung, điểm cao
  const reviews = await prisma.review.findMany({ where: { hidden: false, comment: { not: null }, rating: { gte: 4 } }, orderBy: [{ rating: "desc" }, { createdAt: "desc" }], take: 6, select: { id: true } });

  const vi: { [K in BrandKey]: BrandDataMap[K] } = {
    hero: {
      eyebrow: "Câu chuyện TD Coffee",
      title: "Bắt đầu từ một chiếc xe đẩy ở Gò Vấp",
      subtitle: "Bảy năm, hai quán, và vẫn là ly phin pha từng ly như buổi sáng đầu tiên.",
      image: img("home/hero-khong-gian", "Không gian quán sàn gỗ, nắng chiếu qua cửa", 50, 60),
    },
    founder: {
      eyebrow: "Thư người sáng lập",
      title: "Gửi bạn, người vừa ghé quán",
      photo: NO_IMG,
      opening: "Hồi đó tụi mình chỉ có một chiếc xe đẩy, hai cái phin nhôm và một nồi nước sôi.",
      paragraphs: [
        "Sáng nào cũng vậy, năm giờ rưỡi tụi mình đẩy xe ra cổng trường, pha ba mươi ly, bán hết trước tiết đầu. Khách quen nhất là bác bảo vệ, uống đen đá không đường, trả tiền bằng những câu chuyện về Sài Gòn ngày trước.",
        "Tụi mình không giỏi kinh doanh. Tụi mình chỉ muốn một ly cà phê ngon mà ai cũng uống được mỗi ngày, ở một chỗ đủ yên để ngồi lại lâu hơn dự định.",
        "TD Coffee bây giờ có hai quán, có máy rang, có cả phần mềm quản lý. Nhưng mỗi ly vẫn được pha ngay lúc bạn gọi, như buổi sáng đầu tiên trước cổng trường.",
        "Cảm ơn bạn đã ghé. Lần sau gặp, nhớ chào tụi mình một tiếng.",
      ],
      signature: NO_IMG,
      name: "Triết & Đạt",
      role: "Hai người bạn mở TD Coffee",
    },
    journey: {
      eyebrow: "Hành trình",
      title: "Từ xe đẩy đến hai quán nhỏ",
      items: [
        { year: "2019", title: "Xe đẩy đầu tiên", story: "Hai đứa bạn, một chiếc xe đẩy mua lại, ba mươi ly mỗi sáng trước cổng trường. Ngày nào bán hết sớm là ngày đó vui.", images: [img("story/phin-ban-tre", "Bộ phin và ly trên bàn tre")], lesson: "Khách quay lại vì ly hôm nay giống hệt ly hôm qua." },
        { year: "2020", title: "Mùa dịch", story: "Xe phải đóng. Tụi mình chuyển sang bán online, tự chạy xe giao từng ly trong hẻm. Cà phê pha sẵn đóng chai ra đời từ những tối ngồi thử công thức đến khuya.", images: [img("menu/ca-phe-da", "Ly cà phê sữa đá cầm trên tay")], lesson: "Khi không bán được ở chỗ cũ, mang ly cà phê đến tận nhà khách." },
        { year: "2021", title: "Quán đầu tiên ở Dương Quảng Hàm", story: "Mười hai chỗ ngồi, bàn ghế tự đóng, tường tự sơn ba lần mới ưng màu. Ngày khai trương mưa to, khách vẫn đến kín quán.", images: [img("space/ben-cua-so", "Góc ngồi cạnh cửa kính nhìn ra phố"), img("space/ban-go", "Dãy bàn gỗ và ghế sofa dưới đèn vàng")], lesson: "" },
        { year: "2022", title: "Tự rang hạt", story: "Mua một máy rang nhỏ, đặt ở góc sau quán. Tụi mình lên Cầu Đất, làm việc trực tiếp với một nông hộ, mua cả vụ để họ yên tâm chăm vườn.", images: [img("story/may-rang", "Máy rang cà phê đỏ trong xưởng rang"), img("story/vuon-ca-phe", "Đồi cà phê xanh bên hồ ở cao nguyên")], lesson: "Biết hạt từ đâu đến thì mới dám nói ly này ngon." },
        { year: "2024", title: "Chi nhánh thứ hai", story: "Lần đầu tuyển quản lý, lần đầu không đứng quầy mỗi ngày. Tụi mình viết sổ tay pha chế dày bốn mươi trang để ly nào, quán nào cũng một vị.", images: [img("space/quay-bar", "Quầy bar và dãy bàn dài trong quán")], lesson: "Muốn lớn lên thì phải viết ra những gì trước giờ chỉ nằm trong đầu." },
        { year: "2026", title: "Quản lý thông minh", story: "Cả chuỗi lên một hệ thống: đơn, kho, ca làm, khách quen. AI giúp dự báo nguyên liệu, tư vấn món cho khách và đọc hóa đơn nhập hàng thay cho việc gõ tay.", images: [], lesson: "" },
      ],
    },
    hardest: {
      eyebrow: "Những ngày khó nhất",
      title: "Tuần mẻ rang hỏng",
      quote: "Có một tuần tụi mình đổ đi gần bốn mươi ký hạt, và nghĩ chắc phải đóng quán.",
      story: "Tháng thứ ba sau khi mua máy rang, cả tuần liền mẻ nào ra cũng khét đầu, chua cuối. Tụi mình vẫn mở quán bằng hạt mua ngoài, nhưng tiền máy chưa trả xong, tiền mặt bằng tháng đó cũng chưa đủ.",
      outcome: "Tụi mình gọi cho nông hộ ở Cầu Đất, họ giới thiệu một anh thợ rang lâu năm. Anh ở lại quán ba ngày, chỉ cách nghe tiếng nổ của hạt, cách ghi nhật ký từng mẻ. Từ đó đến giờ, mẻ nào cũng có một trang ghi chép.",
      image: img("story/xuong-rang", "Xưởng rang nhỏ với máy rang và bao hạt"),
    },
    stats: {
      eyebrow: "Con số biết nói",
      title: "Bảy năm, đếm bằng ly",
      items: [
        { source: "manual", value: 7, suffix: "", label: "năm đứng quầy", note: "Tính từ chiếc xe đẩy năm 2019" },
        { source: "stores", value: 0, suffix: "", label: "quán ở Sài Gòn", note: "Cập nhật tự động" },
        { source: "cups", value: 0, suffix: "+", label: "ly đã pha", note: "Đơn đã thanh toán trên hệ thống" },
        { source: "rating", value: 0, suffix: "/5", label: "điểm khách chấm", note: "Trung bình các đánh giá" },
      ],
    },
    values: {
      eyebrow: "Điều tụi mình giữ",
      title: "Bốn điều không đổi",
      items: [
        { title: "Hạt Việt chọn lọc", text: "Robusta Buôn Ma Thuột, Arabica Cầu Đất, mua thẳng từ nông hộ. Không trộn bắp, không tẩm hương.", image: img("story/qua-chin", "Chùm quả cà phê chín đỏ trên cành") },
        { title: "Pha mới mỗi ly", text: "Không pha sẵn cả bình để rót dần. Bạn gọi lúc nào, phin nhỏ giọt lúc đó.", image: img("story/nen-ca-phe", "Pha chế nén bột cà phê vào tay cầm máy") },
        { title: "Giá để ghé mỗi ngày", text: "Một ly đen đá vẫn dưới ba mươi nghìn. Cà phê ngon không nên là thứ để dành cuối tuần.", image: img("menu/phin-sua", "Phin cà phê trên ly có sữa đặc") },
        { title: "Chỗ để ở lại", text: "Wifi mạnh, ổ cắm ở mọi bàn, không ai hối bạn đứng dậy. Ngồi cả buổi cũng được.", image: img("space/goc-gach", "Góc quán tường gạch, mái hiên vàng") },
      ],
    },
    farm: {
      eyebrow: "Từ nông trại đến ly",
      title: "Hạt của tụi mình lớn lên ở Cầu Đất",
      story: "Ở độ cao 1.500 mét, sương xuống từ bốn giờ chiều, quả cà phê chín chậm nên ngọt hơn. Tụi mình mua theo vụ từ một nông hộ, hái tay từng quả chín đỏ, phơi trên giàn tre cho khô đều.",
      image: img("story/vuon-ca-phe", "Đồi cà phê xanh bên hồ ở cao nguyên"),
      farmerName: "Gia đình chú Ba",
      farmerRegion: "Cầu Đất, Lâm Đồng",
      farmerQuote: "Mấy đứa mua cả vụ nên chú dám để quả chín hẳn mới hái, không phải bán non.",
      farmerPhoto: NO_IMG,
      steps: [
        { title: "Chọn hạt", text: "Chỉ hái quả chín đỏ, loại bỏ quả xanh và quả sâu ngay tại vườn.", image: img("story/qua-chin", "Chùm quả cà phê chín đỏ trên cành") },
        { title: "Rang", text: "Rang mộc từng mẻ nhỏ, ghi nhật ký nhiệt độ, nghỉ ba ngày rồi mới xay.", image: img("story/may-rang", "Máy rang cà phê đỏ trong xưởng rang") },
        { title: "Pha", text: "Phin nhôm ủ ba mươi giây, châm nước 92 độ, nhỏ giọt chừng năm phút.", image: img("story/nen-ca-phe", "Pha chế nén bột cà phê vào tay cầm máy") },
        { title: "Phục vụ", text: "Rót lên đá viên to hoặc ly sứ hâm nóng, mang ra bàn khi còn thơm.", image: img("space/quay-bar", "Quầy bar và dãy bàn dài trong quán") },
      ],
    },
    team: {
      eyebrow: "Gương mặt sau quầy",
      title: "Những người pha ly của bạn",
      items: [
        { name: "Triết", role: "Đồng sáng lập · Rang hạt", joinedYear: "2019", photo: NO_IMG, favoriteProductId: denDa, quote: "Mình thích nhất ở quán là tiếng phin nhỏ giọt lúc sáu giờ sáng, khi quán chưa mở." },
        { name: "Đạt", role: "Đồng sáng lập · Vận hành", joinedYear: "2019", photo: NO_IMG, favoriteProductId: bacXiu, quote: "Mình thích nhất ở quán là lúc khách quen bước vào, chưa kịp gọi đã thấy ly của mình." },
        { name: "Thảo", role: "Trưởng pha chế", joinedYear: "2021", photo: NO_IMG, favoriteProductId: muoi, quote: "Mình thích nhất ở quán là được thử công thức mới với cả đội vào chiều thứ Hai." },
        { name: "Khang", role: "Quản lý chi nhánh 2", joinedYear: "2024", photo: NO_IMG, favoriteProductId: latte, quote: "Mình thích nhất ở quán là góc ngồi cạnh cửa sổ lúc trời mưa." },
      ],
    },
    signature: {
      eyebrow: "Ly làm nên tên tuổi",
      title: "Ba ly khách hay gọi lại",
      items: [
        { productId: bacXiu, story: "Công thức bạc xỉu này thử bốn mươi lần mới chốt: sữa tươi đánh nóng, sữa đặc vừa đủ ngọt, cà phê chỉ một phần ba để vẫn còn thơm. Khách quen gọi nó là ly sữa có hồn cà phê.", image: NO_IMG },
        { productId: muoi, story: "Lớp kem muối đánh tay mỗi sáng, mặn vừa chạm đầu lưỡi rồi tan vào vị đắng của Robusta. Đừng khuấy ngay, hãy uống một ngụm từ trên trước.", image: NO_IMG },
        { productId: denDa, story: "Ly đầu tiên tụi mình bán trên chiếc xe đẩy năm 2019. Vẫn là phin nhôm, vẫn là đá viên to, vẫn không đường cho những ai thích đắng thật.", image: NO_IMG },
      ],
    },
    stores: { eyebrow: "Mỗi quán một câu chuyện", title: "Ghé quán nào cũng có chỗ quen", subtitle: "Cùng một vị cà phê, nhưng mỗi quán có góc ngồi, cái cây và những người khách riêng." },
    community: {
      eyebrow: "Cùng cộng đồng",
      title: "Những việc nhỏ tụi mình làm mỗi ngày",
      items: [
        { title: "Bớt ly nhựa", text: "Mang ly riêng giảm 3.000đ. Ống hút giấy và ly giấy cho đơn mang đi.", figure: "4.800", figureLabel: "ly nhựa bớt được năm qua", image: img("menu/latte-tren-cao", "Rót sữa vào ly latte nhìn từ trên") },
        { title: "Bã cà phê thành phân bón", text: "Bã phin mỗi ngày được phơi khô, gửi cho vườn rau của mấy hộ hàng xóm.", figure: "1.200 kg", figureLabel: "bã cà phê mỗi năm", image: img("story/hat-rang", "Hạt cà phê rang đậm rải trên nền tối") },
        { title: "Mua hạt giá công bằng", text: "Mua cả vụ với giá chốt từ đầu mùa, trả trước một nửa để nông hộ có vốn chăm vườn.", figure: "100%", figureLabel: "hạt mua thẳng từ nông hộ", image: img("story/phoi-qua", "Quả cà phê phơi trên sân") },
        { title: "Cà phê treo", text: "Khách gửi thêm một ly, quán treo phiếu lên bảng. Ai cần một ly ấm thì cứ lấy.", figure: "320", figureLabel: "ly treo đã được uống", image: img("story/tro-chuyen", "Nhóm bạn trò chuyện bên bàn cà phê") },
      ],
    },
    testimonials: {
      eyebrow: "Khách kể về tụi mình",
      title: "Lời thật từ khách quen",
      items: reviews.map((r) => ({ reviewId: r.id, text: "", name: "", storeName: "", photo: NO_IMG })),
    },
    press: { eyebrow: "Báo chí & giải thưởng", title: "Người ta nói gì về TD Coffee", items: [] },
    gallery: {
      eyebrow: "Không gian quán",
      title: "Những góc khách hay ngồi",
      items: [
        { image: img("space/ben-cua-so", "Góc ngồi cạnh cửa kính nhìn ra phố"), caption: "Bàn cửa sổ, nắng sớm", storeId: null, topic: "space" },
        { image: img("space/quay-bar", "Quầy bar và dãy bàn dài trong quán"), caption: "Quầy pha nhìn từ cửa vào", storeId: null, topic: "space" },
        { image: img("space/goc-gach", "Góc quán tường gạch, mái hiên vàng"), caption: "Góc tường gạch", storeId: null, topic: "space" },
        { image: img("space/san-vuon", "Sân vườn ngoài trời nhiều hoa"), caption: "Sân sau buổi chiều", storeId: null, topic: "space" },
        { image: img("menu/phin-sua", "Phin cà phê trên ly có sữa đặc"), caption: "Phin sữa đá", storeId: null, topic: "drinks" },
        { image: img("menu/croissant", "Bánh sừng trâu và tách cà phê sữa"), caption: "Croissant buổi sáng", storeId: null, topic: "drinks" },
        { image: img("events/tiec-nhom", "Quán đông khách, các nhóm bạn tụ họp"), caption: "Tối thứ Sáu đông vui", storeId: null, topic: "events" },
        { image: img("space/tu-banh", "Tủ bánh ngọt ở quầy"), caption: "Tủ bánh ở quầy", storeId: null, topic: "drinks" },
      ],
    },
    future: {
      eyebrow: "Chặng tiếp theo",
      title: "Một quán nữa, và vẫn là ly phin ấy",
      text: "Tụi mình muốn mở thêm một quán gần trường đại học, nơi sinh viên ngồi học cả ngày mà không ngại ví mỏng. Và một ngày nào đó, mang hạt Cầu Đất của mình đến tận tay khách ở xa.",
      image: img("story/tro-chuyen", "Nhóm bạn trò chuyện bên bàn cà phê"),
    },
  };

  // Bản tiếng Anh: chỉ chữ (và mô tả ảnh); thiếu ô nào trang hiện tiếng Việt ô đó
  const en: Partial<Record<BrandKey, unknown>> = {
    hero: { eyebrow: "The TD Coffee story", title: "It started with a coffee cart in Gò Vấp", subtitle: "Seven years, two shops, and still one phin per cup, just like the very first morning.", image: { alt: "Wooden-floored café with sunlight through the door" } },
    founder: {
      eyebrow: "A letter from the founders", title: "To you, who just walked in",
      opening: "Back then we had one cart, two aluminium phins and a pot of boiling water.",
      paragraphs: [
        "Every morning at half past five we pushed the cart to the school gate, brewed thirty cups and sold out before first period. Our most loyal customer was the security guard: iced black, no sugar, paid in stories about old Saigon.",
        "We weren't good at business. We just wanted a good cup that anyone could afford every day, in a place quiet enough to stay longer than planned.",
        "TD Coffee now has two shops, a roaster, even management software. But every cup is still brewed the moment you order, like that first morning at the school gate.",
        "Thank you for coming by. Next time, say hi.",
      ],
      name: "Triết & Đạt", role: "The two friends behind TD Coffee",
    },
    journey: {
      eyebrow: "Our journey", title: "From a cart to two small shops",
      items: [
        { title: "The first cart", story: "Two friends, a second-hand cart, thirty cups every morning outside a school gate. The days we sold out early were the good days.", images: [{ alt: "Phin set and glass on a bamboo table" }], lesson: "People come back because today's cup tastes exactly like yesterday's." },
        { title: "The pandemic", story: "The cart had to close. We moved online and delivered every cup ourselves through the alleys. Bottled ready-to-drink coffee was born from late nights testing recipes.", images: [{ alt: "Iced milk coffee held in hand" }], lesson: "When customers can't come to you, bring the coffee to their door." },
        { title: "Our first shop on Dương Quảng Hàm", story: "Twelve seats, furniture we built ourselves, walls painted three times until the colour felt right. It poured on opening day and the shop was still full.", images: [{ alt: "Window seat looking out to the street" }, { alt: "Wooden tables and sofas under warm lights" }] },
        { title: "Roasting our own beans", story: "We bought a small roaster and set it up in the back. We went up to Cầu Đất, worked directly with one farming family and bought the whole harvest so they could tend the trees with peace of mind.", images: [{ alt: "Red coffee roaster in a roastery" }, { alt: "Green coffee hills by a highland lake" }], lesson: "Only when you know where the beans come from can you say the cup is good." },
        { title: "A second shop", story: "Our first hired manager, our first time not behind the bar every day. We wrote a forty-page brewing handbook so every cup tastes the same in every shop.", images: [{ alt: "Bar counter and long tables in the shop" }], lesson: "To grow, write down what used to live only in your head." },
        { title: "Smarter management", story: "The whole chain moved onto one system: orders, stock, shifts, regulars. AI helps forecast ingredients, recommend drinks to customers and read supplier invoices instead of typing them in." },
      ],
    },
    hardest: {
      eyebrow: "The hardest days", title: "The week of ruined roasts",
      quote: "One week we threw out almost forty kilos of beans and thought we would have to close.",
      story: "Three months after buying the roaster, every batch for a whole week came out burnt at first and sour at the end. We kept the shop open with bought-in beans, but the roaster wasn't paid off and we were short on rent that month.",
      outcome: "We called the family in Cầu Đất and they introduced us to a veteran roaster. He stayed with us for three days, taught us to listen to the crack of the beans and to log every batch. Since then every roast has its own page of notes.",
      image: { alt: "Small roastery with a roaster and sacks of beans" },
    },
    stats: { eyebrow: "Numbers that speak", title: "Seven years, counted in cups", items: [{ label: "years behind the bar", note: "Since the coffee cart in 2019" }, { label: "shops in Saigon", note: "Updated automatically" }, { label: "cups brewed", note: "Paid orders in our system" }, { label: "average rating", note: "Across all reviews" }] },
    values: {
      eyebrow: "What we hold on to", title: "Four things that never change",
      items: [
        { title: "Selected Vietnamese beans", text: "Robusta from Buôn Ma Thuột, Arabica from Cầu Đất, bought straight from farmers. No corn fillers, no added flavouring.", image: { alt: "Ripe red coffee cherries on the branch" } },
        { title: "Brewed fresh, every cup", text: "No big batch poured out slowly. Whenever you order, that's when the phin starts dripping.", image: { alt: "Barista tamping coffee into a portafilter" } },
        { title: "A price for every day", text: "An iced black is still under thirty thousand đồng. Good coffee shouldn't be a weekend treat.", image: { alt: "Phin on a glass with condensed milk" } },
        { title: "A place to stay", text: "Strong wifi, outlets at every table, nobody rushing you out. Stay all afternoon if you like.", image: { alt: "Brick-walled corner with a yellow awning" } },
      ],
    },
    farm: {
      eyebrow: "From farm to cup", title: "Our beans grow up in Cầu Đất",
      story: "At 1,500 metres the mist rolls in by four in the afternoon and the cherries ripen slowly, which makes them sweeter. We buy the harvest from one family, cherries are hand-picked only when red and dried on bamboo racks.",
      image: { alt: "Green coffee hills by a highland lake" },
      farmerName: "Uncle Ba's family", farmerRegion: "Cầu Đất, Lâm Đồng",
      farmerQuote: "You buy the whole crop, so I can wait until the cherries are fully ripe instead of selling them green.",
      steps: [
        { title: "Choosing", text: "Only ripe red cherries are picked; green and damaged ones are sorted out in the field.", image: { alt: "Ripe red coffee cherries on the branch" } },
        { title: "Roasting", text: "Plain-roasted in small batches, temperatures logged, rested three days before grinding.", image: { alt: "Red coffee roaster in a roastery" } },
        { title: "Brewing", text: "Aluminium phin, thirty-second bloom, 92°C water, about five minutes of drip.", image: { alt: "Barista tamping coffee into a portafilter" } },
        { title: "Serving", text: "Poured over big ice or into a warmed ceramic cup, brought to your table while the aroma is fresh.", image: { alt: "Bar counter and long tables in the shop" } },
      ],
    },
    team: {
      eyebrow: "The faces behind the bar", title: "The people who make your cup",
      items: [
        { role: "Co-founder · Roasting", quote: "My favourite thing here is the sound of the phin dripping at six in the morning, before we open." },
        { role: "Co-founder · Operations", quote: "My favourite thing here is when a regular walks in and their cup is already on its way." },
        { role: "Head barista", quote: "My favourite thing here is testing new recipes with the whole team on Monday afternoons." },
        { role: "Manager, branch 2", quote: "My favourite thing here is the window seat when it rains." },
      ],
    },
    signature: {
      eyebrow: "The cups that made our name", title: "Three cups people keep coming back for",
      items: [
        { story: "We tested this bạc xỉu forty times before settling: steamed fresh milk, just enough condensed milk, only a third coffee so the aroma still comes through. Regulars call it milk with a coffee soul." },
        { story: "The salted cream is whipped by hand every morning, salty for a moment then melting into the bitterness of the Robusta. Don't stir it yet; take the first sip from the top." },
        { story: "The very first cup we sold from the cart in 2019. Still an aluminium phin, still big ice, still no sugar for those who like it truly bitter." },
      ],
    },
    stores: { eyebrow: "Every shop has a story", title: "A familiar seat at every shop", subtitle: "The same coffee, but each shop has its own corners, its own tree and its own regulars." },
    community: {
      eyebrow: "With our community", title: "Small things we do every day",
      items: [
        { title: "Less plastic", text: "Bring your own cup and get 3,000đ off. Paper straws and paper cups for takeaway.", figureLabel: "plastic cups saved last year", image: { alt: "Pouring milk into a latte, seen from above" } },
        { title: "Coffee grounds into compost", text: "Used grounds are dried every day and sent to our neighbours' vegetable gardens.", figureLabel: "of grounds a year", image: { alt: "Dark roasted coffee beans on a dark background" } },
        { title: "Fair prices for beans", text: "We buy the whole harvest at a price agreed at the start of the season and pay half upfront.", figureLabel: "of beans bought direct from farmers", image: { alt: "Coffee cherries drying in a yard" } },
        { title: "Suspended coffee", text: "Guests pay for an extra cup and we pin the ticket on the board. Anyone who needs a warm cup can take one.", figureLabel: "suspended cups enjoyed", image: { alt: "Friends chatting around a coffee table" } },
      ],
    },
    testimonials: { eyebrow: "What guests say", title: "Real words from regulars" },
    press: { eyebrow: "Press & awards", title: "What people say about TD Coffee" },
    gallery: {
      eyebrow: "Our spaces", title: "Corners our guests love",
      items: [
        { caption: "Window table, early sun", image: { alt: "Window seat looking out to the street" } },
        { caption: "The bar from the front door", image: { alt: "Bar counter and long tables in the shop" } },
        { caption: "The brick corner", image: { alt: "Brick-walled corner with a yellow awning" } },
        { caption: "The back garden in the afternoon", image: { alt: "Outdoor garden full of flowers" } },
        { caption: "Phin with condensed milk", image: { alt: "Phin on a glass with condensed milk" } },
        { caption: "Morning croissant", image: { alt: "Croissant with a cup of milk coffee" } },
        { caption: "Busy Friday nights", image: { alt: "Crowded café with groups of friends" } },
        { caption: "The pastry case", image: { alt: "Pastry display case at the counter" } },
      ],
    },
    future: { eyebrow: "What's next", title: "One more shop, and still the same phin", text: "We want to open a shop near a university, where students can study all day without worrying about thin wallets. And one day, bring our Cầu Đất beans to people far away.", image: { alt: "Friends chatting around a coffee table" } },
  };

  // ── 15 mục ──
  let created = 0, skipped = 0;
  for (const [i, def] of BRAND_SECTIONS.entries()) {
    const exists = await prisma.brandSection.findUnique({ where: { key: def.key }, select: { id: true } });
    if (exists && !force) { skipped++; continue; }
    const v = validateSection(def.key, vi[def.key]);
    const e = en[def.key] ? validateSection(def.key, en[def.key], true) : null;
    const errs = { ...v.errors, ...(e?.errors ?? {}) };
    if (Object.keys(errs).length) throw new Error(`Mục ${def.key} sai dữ liệu mẫu: ${JSON.stringify(errs)}`);
    const data = v.data as Prisma.InputJsonValue;
    const dataEn = e ? (e.data as Prisma.InputJsonValue) : Prisma.DbNull;
    await prisma.brandSection.upsert({
      where: { key: def.key },
      update: { data, dataEn, sortOrder: i, isVisible: def.defaultVisible },
      create: { key: def.key, data, dataEn, sortOrder: i, isVisible: def.defaultVisible },
    });
    created++;
  }
  console.log(`Câu chuyện thương hiệu: ghi ${created} mục, giữ nguyên ${skipped} mục đã có${force ? " (--force)" : ""}.`);

  // ── Hồ sơ chi nhánh ──
  const stores = await prisma.store.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  const samples = [
    {
      coverImage: img("space/ben-cua-so", "Mặt tiền quán với cửa kính lớn nhìn ra phố", 50, 55), tagline: "Quán đầu tiên — bàn ghế tự đóng, tường tự sơn", openedYear: 2021,
      story: "Tụi mình chọn Dương Quảng Hàm vì đây là con đường chiếc xe đẩy đi qua mỗi sáng suốt hai năm. Mặt bằng nhỏ, chỉ đủ mười hai chỗ, nhưng có ô cửa kính lớn đón nắng sớm. Máy rang đầu tiên của chuỗi vẫn đặt ở góc sau quán.",
      managerName: "Thảo", managerQuote: "Ghé buổi sáng sớm nhé, lúc đó quán còn thơm mùi rang.", amenities: ["wifi", "outlet", "parking", "aircon", "quiet"],
      favoriteSpots: [{ image: img("space/ben-cua-so", "Bàn cạnh cửa kính lớn"), caption: "Bàn cửa kính, nắng lúc bảy giờ" }, { image: img("space/ban-go", "Dãy bàn gỗ dưới đèn vàng"), caption: "Bàn dài cho nhóm học" }],
      galleryImages: [{ image: img("space/quay-bar", "Quầy pha của quán"), caption: "Quầy pha" }, { image: img("story/may-rang", "Máy rang ở góc sau quán"), caption: "Máy rang đầu tiên" }, { image: img("space/tu-banh", "Tủ bánh ở quầy"), caption: "Tủ bánh" }],
    },
    {
      coverImage: img("space/san-vuon", "Sân vườn nhiều hoa của quán", 50, 50), tagline: "Có khoảng sân sau đầy hoa giấy", openedYear: 2024,
      story: "Quán thứ hai nằm trong một căn nhà cũ có khoảng sân sau. Tụi mình giữ lại giàn hoa giấy của chủ nhà, kê thêm bàn ngoài trời cho những ai thích ngồi gió.",
      managerName: "Khang", managerQuote: "Chiều mát ra sân sau ngồi, mình pha cho ly cold brew.", amenities: ["wifi", "outlet", "parking", "aircon", "outdoor", "pets"],
      favoriteSpots: [{ image: img("space/san-vuon", "Sân sau với hoa giấy"), caption: "Sân sau lúc chiều" }, { image: img("space/goc-gach", "Góc tường gạch mái hiên vàng"), caption: "Góc tường gạch" }],
      galleryImages: [{ image: img("events/tiec-nhom", "Quán đông khách buổi tối"), caption: "Tối cuối tuần" }, { image: img("menu/croissant", "Bánh sừng trâu và cà phê sữa"), caption: "Bữa sáng" }],
    },
  ];
  let profiles = 0;
  for (const [i, s] of stores.entries()) {
    if (!force && (s.story || s.coverImage)) continue;
    const { data, errors } = validateStoreProfile({ ...samples[i % samples.length], managerPhoto: NO_IMG, ...(i >= samples.length ? { openedYear: null, tagline: "" } : {}) });
    if (Object.keys(errors).length) throw new Error(`Hồ sơ chi nhánh ${s.id} sai: ${JSON.stringify(errors)}`);
    await prisma.store.update({
      where: { id: s.id },
      data: {
        coverImage: data.coverImage, story: data.story, openedYear: data.openedYear, tagline: data.tagline || null, managerName: data.managerName,
        managerPhoto: data.managerPhoto, managerQuote: data.managerQuote, amenities: data.amenities, galleryImages: data.galleryImages, favoriteSpots: data.favoriteSpots,
      },
    });
    profiles++;
  }
  console.log(`Hồ sơ chi nhánh: điền ${profiles}/${stores.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
