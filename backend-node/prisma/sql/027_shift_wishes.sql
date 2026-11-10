-- 027: Nguyện vọng xếp ca của nhân viên (câu gốc + ràng buộc có cấu trúc), dấu "tháng đã công bố lịch",
--      hạn gửi nguyện vọng và số ràng buộc tối đa trong cấu hình nhân sự.
SET NAMES utf8mb4;
CREATE TABLE `Shift_Wishes` (
    `Wish_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Store_ID` INTEGER NOT NULL,
    `Staff_ID` INTEGER NOT NULL,
    `Month` CHAR(7) NOT NULL,
    `Raw_Text` TEXT NULL,
    `Status` VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    `Late` BOOLEAN NOT NULL DEFAULT false,
    `Submitted_At` DATETIME(3) NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `Updated_At` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Shift_Wishes_Staff_ID_Month_key`(`Staff_ID`, `Month`),
    INDEX `Shift_Wishes_Store_ID_Month_idx`(`Store_ID`, `Month`),
    PRIMARY KEY (`Wish_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Shift_Wish_Rules` (
    `Rule_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Wish_ID` INTEGER NOT NULL,
    `Type` VARCHAR(20) NOT NULL,
    `Dates` JSON NULL,
    `Weekdays` JSON NULL,
    `From_Date` DATE NULL,
    `To_Date` DATE NULL,
    `Shift_Codes` JSON NULL,
    `Time_From` INTEGER NULL,
    `Time_To` INTEGER NULL,
    `Count` INTEGER NULL,
    `Period` VARCHAR(10) NULL,
    `Quote` VARCHAR(255) NULL,
    `Source` VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
    `Confidence` DOUBLE NULL,
    INDEX `Shift_Wish_Rules_Wish_ID_idx`(`Wish_ID`),
    PRIMARY KEY (`Rule_ID`),
    CONSTRAINT `Shift_Wish_Rules_Wish_ID_fkey` FOREIGN KEY (`Wish_ID`) REFERENCES `Shift_Wishes`(`Wish_ID`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Schedule_Months` (
    `SM_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Store_ID` INTEGER NOT NULL,
    `Month` CHAR(7) NOT NULL,
    `Published_At` DATETIME(3) NULL,
    `Published_By_ID` INTEGER NULL,
    UNIQUE INDEX `Schedule_Months_Store_ID_Month_key`(`Store_ID`, `Month`),
    PRIMARY KEY (`SM_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Hr_Configs`
    ADD COLUMN `Wish_Deadline_Day` INTEGER NOT NULL DEFAULT 20,
    ADD COLUMN `Max_Wish_Rules` INTEGER NOT NULL DEFAULT 15;
