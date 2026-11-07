-- 017: Đọc hoá đơn NCC bằng AI khi nhận hàng — số hoá đơn trên phiếu nhập, kết quả AI để đối chiếu, quy đổi đơn vị đã ghi nhớ.
SET NAMES utf8mb4;
-- AlterTable
ALTER TABLE `Goods_Receipts` ADD COLUMN `Invoice_No` VARCHAR(50) NULL;
-- CreateTable
CREATE TABLE `Invoice_Extractions` (
    `Extraction_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Store_ID` INTEGER NOT NULL,
    `PO_ID` INTEGER NOT NULL,
    `GRN_ID` INTEGER NULL,
    `Staff_ID` INTEGER NOT NULL,
    `Image_URLs` JSON NOT NULL,
    `Readable` BOOLEAN NOT NULL DEFAULT true,
    `Result` JSON NULL,
    `Validated` JSON NULL,
    `Final_Lines` JSON NULL,
    `Model` VARCHAR(60) NULL,
    `Tokens_In` INTEGER NOT NULL DEFAULT 0,
    `Tokens_Out` INTEGER NOT NULL DEFAULT 0,
    `Latency_Ms` INTEGER NOT NULL DEFAULT 0,
    `Error` VARCHAR(500) NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `Invoice_Extractions_PO_ID_idx`(`PO_ID`),
    INDEX `Invoice_Extractions_GRN_ID_idx`(`GRN_ID`),
    INDEX `Invoice_Extractions_Created_At_idx`(`Created_At`),
    PRIMARY KEY (`Extraction_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Supplier_Unit_Aliases` (
    `Alias_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Supplier_ID` INTEGER NOT NULL,
    `Raw_Name` VARCHAR(150) NOT NULL,
    `Item_ID` INTEGER NOT NULL,
    `Factor` DOUBLE NOT NULL DEFAULT 1,
    `Unit_Invoice` VARCHAR(30) NULL,
    `Confirmed_By` INTEGER NOT NULL,
    `Updated_At` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Supplier_Unit_Aliases_Supplier_ID_Raw_Name_key`(`Supplier_ID`, `Raw_Name`),
    PRIMARY KEY (`Alias_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateIndex
CREATE INDEX `Goods_Receipts_Invoice_No_idx` ON `Goods_Receipts`(`Invoice_No`);
-- Bật / tắt: đọc hoá đơn (200 lần / ngày)
INSERT IGNORE INTO `AI_Settings` (`Feature`, `Enabled`, `Daily_Limit`, `Hourly_Per_User`, `Updated_At`) VALUES ('INVOICE_OCR', true, 200, NULL, CURRENT_TIMESTAMP(3));
