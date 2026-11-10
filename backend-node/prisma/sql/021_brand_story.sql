-- 021: Trang câu chuyện thương hiệu (/about) do chủ chuỗi tự sửa + hồ sơ giới thiệu từng chi nhánh (/stores/:id).
-- Brand_Sections: 15 mục (hero, founder, journey…), mỗi mục một dòng; Data / Data_En là JSON theo kiểu khai báo ở src/shared/brand.ts.
-- Ô ảnh lưu dạng { url, small, alt, focus: { x, y } } (focus = điểm lấy nét 0–100%).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `Brand_Sections` (
    `Section_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Section_Key` VARCHAR(30) NOT NULL,
    `Sort_Order` INTEGER NOT NULL DEFAULT 0,
    `Is_Visible` BOOLEAN NOT NULL DEFAULT true,
    `Data` JSON NOT NULL,
    `Data_En` JSON NULL,
    `Updated_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `Updated_By` INTEGER NULL,
    UNIQUE INDEX `Brand_Sections_Section_Key_key`(`Section_Key`),
    PRIMARY KEY (`Section_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Stores`
    ADD COLUMN `Cover_Image` JSON NULL,
    ADD COLUMN `Story` TEXT NULL,
    ADD COLUMN `Opened_Year` INTEGER NULL,
    ADD COLUMN `Tagline` VARCHAR(140) NULL,
    ADD COLUMN `Manager_Name` VARCHAR(80) NULL,
    ADD COLUMN `Manager_Photo` JSON NULL,
    ADD COLUMN `Manager_Quote` VARCHAR(300) NULL,
    ADD COLUMN `Amenities` JSON NULL,
    ADD COLUMN `Gallery_Images` JSON NULL,
    ADD COLUMN `Favorite_Spots` JSON NULL;
