/**
 * lib/siteImages.ts — Ảnh trang trí mặc định trong public/site/ (WebP, 2 cỡ). Nguồn + giấy phép: public/site/CREDITS.md.
 * Khối nội dung (SitePage) lưu khóa ảnh ("home/hero-phin") hoặc URL ảnh chủ chuỗi tải lên — <SiteImg> xử lý cả hai.
 */
export type SiteImageInfo = { w: number; h: number; sizes: number[]; alt: string };

export const SITE_IMAGES: Record<string, SiteImageInfo> = {
  "home/hero-rot-sua": { w: 1600, h: 1064, sizes: [1600, 800], alt: "Barista rót sữa tạo hình lên ly cà phê" },
  "home/hero-phin": { w: 1600, h: 2400, sizes: [1600, 800], alt: "Phin cà phê nhỏ giọt trên ly, nền quán ấm" },
  "home/hero-khong-gian": { w: 1600, h: 1205, sizes: [1600, 800], alt: "Không gian quán sàn gỗ, nắng chiếu qua cửa" },
  "home/hero-pha-may": { w: 1600, h: 2400, sizes: [1600, 800], alt: "Tay pha chế chiết espresso ở máy pha" },
  "story/hat-rang": { w: 1200, h: 800, sizes: [1200, 600], alt: "Hạt cà phê rang đậm rải trên nền tối" },
  "story/vuon-ca-phe": { w: 1200, h: 797, sizes: [1200, 600], alt: "Đồi cà phê xanh bên hồ ở cao nguyên" },
  "story/qua-chin": { w: 1200, h: 842, sizes: [1200, 600], alt: "Chùm quả cà phê chín đỏ trên cành" },
  "story/phoi-qua": { w: 1200, h: 900, sizes: [1200, 600], alt: "Quả cà phê phơi trên sân" },
  "story/may-rang": { w: 1200, h: 1800, sizes: [1200, 600], alt: "Máy rang cà phê đỏ trong xưởng rang" },
  "story/xuong-rang": { w: 1200, h: 900, sizes: [1200, 600], alt: "Xưởng rang nhỏ với máy rang và bao hạt" },
  "story/nen-ca-phe": { w: 1200, h: 800, sizes: [1200, 600], alt: "Pha chế nén bột cà phê vào tay cầm máy" },
  "story/phin-ban-tre": { w: 1200, h: 796, sizes: [1200, 600], alt: "Bộ phin và ly trên bàn tre" },
  "story/tro-chuyen": { w: 1200, h: 800, sizes: [1200, 600], alt: "Nhóm bạn trò chuyện bên bàn cà phê" },
  "space/ben-cua-so": { w: 1200, h: 900, sizes: [1200, 600], alt: "Góc ngồi cạnh cửa kính nhìn ra phố" },
  "space/quay-bar": { w: 1200, h: 904, sizes: [1200, 600], alt: "Quầy bar và dãy bàn dài trong quán" },
  "space/goc-gach": { w: 1200, h: 956, sizes: [1200, 600], alt: "Góc quán tường gạch, mái hiên vàng" },
  "space/ban-go": { w: 1200, h: 900, sizes: [1200, 600], alt: "Dãy bàn gỗ và ghế sofa dưới đèn vàng" },
  "space/tu-banh": { w: 1200, h: 904, sizes: [1200, 600], alt: "Tủ bánh ngọt ở quầy" },
  "space/san-vuon": { w: 1200, h: 798, sizes: [1200, 600], alt: "Sân vườn ngoài trời nhiều hoa" },
  "careers/barista": { w: 1200, h: 800, sizes: [1200, 600], alt: "Barista đứng sau máy pha espresso" },
  "careers/quay-pha": { w: 1200, h: 801, sizes: [1200, 600], alt: "Pha chế làm việc tại quầy" },
  "events/tiec-nhom": { w: 1200, h: 900, sizes: [1200, 600], alt: "Quán đông khách, các nhóm bạn tụ họp" },
  "events/ban-banh": { w: 1200, h: 900, sizes: [1200, 600], alt: "Bàn bánh ngọt bày cho buổi tiệc" },
  "membership/latte-ban-go": { w: 1200, h: 1800, sizes: [1200, 600], alt: "Ly latte trên bàn gỗ" },
  "faq/ly-ca-phe-sach": { w: 1200, h: 1798, sizes: [1200, 600], alt: "Tách cà phê bên trang sách" },
  "menu/croissant": { w: 1200, h: 900, sizes: [1200, 600], alt: "Bánh sừng trâu và tách cà phê sữa" },
  "menu/tiramisu": { w: 1200, h: 1594, sizes: [1200, 600], alt: "Miếng tiramisu rắc ca cao" },
  "menu/ca-phe-da": { w: 1200, h: 1798, sizes: [1200, 600], alt: "Ly cà phê sữa đá cầm trên tay" },
  "menu/tra-trai-cay": { w: 1200, h: 900, sizes: [1200, 600], alt: "Ly đồ uống trái cây nhiều đá" },
  "menu/phin-sua": { w: 1200, h: 1600, sizes: [1200, 600], alt: "Phin cà phê trên ly có sữa đặc" },
  "menu/latte-tren-cao": { w: 1200, h: 799, sizes: [1200, 600], alt: "Rót sữa vào ly latte nhìn từ trên" },
};

export const isSiteImageKey = (s: string | null | undefined): s is string => !!s && s in SITE_IMAGES;

/** URL + srcset của ảnh mặc định (cỡ lớn nhất làm src) */
export function siteImageSrc(key: string) {
  const info = SITE_IMAGES[key];
  const [big, small] = [Math.max(...info.sizes), Math.min(...info.sizes)];
  return {
    src: `/site/${key}-${big}.webp`,
    srcSet: `/site/${key}-${small}.webp ${small}w, /site/${key}-${big}.webp ${big}w`,
    info,
  };
}
