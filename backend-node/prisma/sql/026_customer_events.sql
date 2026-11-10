-- 026: Hành vi khách trên web (xem màn hình / món, thêm-bớt giỏ, đặt đơn) + công tắc / số ngày lưu trong cài đặt.
--      Không lưu IP, user-agent, toạ độ.
SET NAMES utf8mb4;
CREATE TABLE `Customer_Events` (
    `CE_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Session_Key` VARCHAR(64) NOT NULL,
    `Visit_ID` VARCHAR(40) NOT NULL,
    `Customer_ID` INTEGER NULL,
    `Store_ID` INTEGER NULL,
    `Type` VARCHAR(24) NOT NULL,
    `Screen` VARCHAR(32) NULL,
    `Product_ID` INTEGER NULL,
    `Combo_ID` INTEGER NULL,
    `Qty` INTEGER NULL,
    `Duration_Ms` INTEGER NULL,
    `Source` VARCHAR(24) NULL,
    `Order_ID` INTEGER NULL,
    `Device` VARCHAR(10) NULL,
    `Channel` VARCHAR(10) NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `Customer_Events_Created_At_idx`(`Created_At`),
    INDEX `Customer_Events_Type_Created_At_idx`(`Type`, `Created_At`),
    INDEX `Customer_Events_Product_ID_Type_idx`(`Product_ID`, `Type`),
    INDEX `Customer_Events_Store_ID_Created_At_idx`(`Store_ID`, `Created_At`),
    INDEX `Customer_Events_Visit_ID_idx`(`Visit_ID`),
    PRIMARY KEY (`CE_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Store_Settings`
    ADD COLUMN `Behavior_Tracking` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `Behavior_Retention_Days` INTEGER NOT NULL DEFAULT 90;
