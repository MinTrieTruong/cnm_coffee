-- 022: Ảnh đại diện danh mục (menu "Thực đơn" trên web khách, khối Danh mục trang chủ). Rỗng → web dùng ảnh món đầu tiên có ảnh.
SET NAMES utf8mb4;
ALTER TABLE `Categories` ADD COLUMN `Image_URL` VARCHAR(1024) NULL;
