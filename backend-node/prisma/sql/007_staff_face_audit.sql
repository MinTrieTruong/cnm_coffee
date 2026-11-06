-- 007: FaceID nhân viên đăng ký 1 lần — lưu thời điểm + ảnh chụp lúc đăng ký (đường dẫn trong thư mục riêng, không công khai).
SET NAMES utf8mb4;
ALTER TABLE `Staff` ADD COLUMN `Face_Registered_At` DATETIME(3) NULL;
ALTER TABLE `Staff` ADD COLUMN `Face_Photo_Path` VARCHAR(255) NULL;
