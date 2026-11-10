-- 028: Lưu từng lần chạy "Tự xếp lịch tháng" (seed, chỉ số, nguyện vọng chưa đáp ứng, phương án phân công, lời giải thích)
--      để quản lý so sánh / chọn phương án trước khi công bố; tháng trỏ tới lần chạy đang nằm trong bản nháp.
SET NAMES utf8mb4;
CREATE TABLE `Schedule_Runs` (
    `Run_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Store_ID` INTEGER NOT NULL,
    `Month` CHAR(7) NOT NULL,
    `Seed` INTEGER NOT NULL,
    `Use_Wishes` BOOLEAN NOT NULL DEFAULT true,
    `Include_Late` BOOLEAN NOT NULL DEFAULT false,
    `Metrics` JSON NOT NULL,
    `Unmet_Wishes` JSON NOT NULL,
    `Assignments` JSON NOT NULL,
    `Explanations` JSON NULL,
    `Created_By_ID` INTEGER NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `Schedule_Runs_Store_ID_Month_idx`(`Store_ID`, `Month`),
    PRIMARY KEY (`Run_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Schedule_Months` ADD COLUMN `Applied_Run_ID` INTEGER NULL;
