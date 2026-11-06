-- 010: Hộp thư khách — quán nhắn / tặng voucher / điều chỉnh điểm từ hồ sơ khách (thao tác chăm sóc).
SET NAMES utf8mb4;
-- CreateTable
CREATE TABLE `Customer_Messages` (
    `Msg_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Customer_ID` INTEGER NOT NULL,
    `Kind` VARCHAR(10) NOT NULL DEFAULT 'MESSAGE',
    `Title` VARCHAR(150) NOT NULL,
    `Body` VARCHAR(1000) NULL,
    `Sender_ID` INTEGER NULL,
    `Store_ID` INTEGER NULL,
    `Read_At` DATETIME(3) NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `Customer_Messages_Customer_ID_Created_At_idx`(`Customer_ID`, `Created_At`),
    PRIMARY KEY (`Msg_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `Customer_Messages` ADD CONSTRAINT `Customer_Messages_Customer_ID_fkey` FOREIGN KEY (`Customer_ID`) REFERENCES `Customers`(`Customer_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
