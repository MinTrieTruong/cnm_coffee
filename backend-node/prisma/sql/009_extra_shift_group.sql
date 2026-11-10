-- 009: Ca bổ sung nhiều người — các chỗ cùng khung giờ chung mã nhóm (mời 1 lần, đủ người thì ngưng nhận).
SET NAMES utf8mb4;
ALTER TABLE `Work_Schedules` ADD COLUMN `Extra_Group` VARCHAR(36) NULL;
CREATE INDEX `Work_Schedules_Extra_Group_idx` ON `Work_Schedules`(`Extra_Group`);
