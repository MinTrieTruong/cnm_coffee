/**
 * Ảnh mẫu dùng chung cho prisma/seed.ts (seed lại từ đầu) và prisma/site-seed.ts (CSDL đang chạy).
 * Ảnh Unsplash, đã kiểm tra mở được (11/2026).
 */

/** Ảnh đại diện danh mục theo id (tròn trên menu "Thực đơn" web khách) */
export const categoryImages: Record<number, string> = {
  1: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=800&q=80", // Cà Phê Phin & Truyền Thống
  2: "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=800&q=80", // Cà Phê Pha Máy (Espresso)
  3: "https://images.unsplash.com/photo-1499638673689-79a0b5115d87?w=800&q=80", // Trà Trái Cây
  4: "https://images.unsplash.com/photo-1525803377221-4f6ccdaa5133?w=800&q=80", // Trà Sữa & Trân Châu
  5: "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=800&q=80", // Matcha & Sữa Tươi
  200: "https://images.unsplash.com/photo-1530610476181-d83430b64dcd?w=800&q=80", // Đồ Ăn Nhẹ
};
/** Tên danh mục mẫu → id ở trên (CSDL đang chạy có thể khác id, tìm theo tên) */
export const categoryImageByName: [string, number][] = [
  ["Cà Phê Phin", 1], ["Espresso", 2], ["Trà Trái Cây", 3], ["Trà Sữa", 4], ["Matcha", 5], ["Đồ Ăn Nhẹ", 200],
];

/** Link ảnh món cũ đã 404 → ảnh thay (chỉ thay đúng link chết, không đụng ảnh chủ quán đã tải) */
export const deadProductImages: Record<string, string> = {
  "https://images.unsplash.com/photo-1558857563-b37103387b5f?w=800&q=80": "https://images.unsplash.com/photo-1525803377221-4f6ccdaa5133?w=800&q=80",
  "https://images.unsplash.com/photo-1556679343-c1306c40fc7a?w=800&q=80": "https://images.unsplash.com/photo-1558857563-b371033873b8?w=800&q=80",
  "https://images.unsplash.com/photo-1515823064-d6e0c04616e7?w=800&q=80": "https://images.unsplash.com/photo-1582785513054-8d1bf9d69c1a?w=800&q=80",
};
