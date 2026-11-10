-- 008: Ca bổ sung — quản lý tự chọn giờ khi cần thêm người vài tiếng; giờ trong ca tính lương như làm thêm.
SET NAMES utf8mb4;
ALTER TABLE `Work_Schedules` ADD COLUMN `Is_Extra` BOOLEAN NOT NULL DEFAULT false;
