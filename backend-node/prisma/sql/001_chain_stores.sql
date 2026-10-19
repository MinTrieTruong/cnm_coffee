-- 001: Chuỗi cửa hàng — thêm chi nhánh, chuyển dữ liệu hiện có thành Chi nhánh #1.
-- Sinh bằng `prisma migrate diff`, chèn tay khối DataMigration trước phần khoá ngoại.
-- Chạy: docker exec -i cmn-mysql mysql -uroot -proot coffee_shop_db < prisma/sql/001_chain_stores.sql
-- Sau đó: npx tsx prisma/store-migration.ts (tạo tài khoản Owner).

-- AlterTable
ALTER TABLE `Audit_Logs` ADD COLUMN `Store_ID` INTEGER NULL;

-- AlterTable
ALTER TABLE `Chat_Sessions` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Goods_Receipts` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Inventory_Batches` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Inventory_Transactions` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Orders` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Purchase_Orders` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Purchase_Requisitions` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Requests` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Shift_Inventory_Logs` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Shifts` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Staff` ADD COLUMN `Store_ID` INTEGER NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Stock_Receipts` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Tables` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Work_Schedules` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Zones` ADD COLUMN `Store_ID` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `Stores` (
    `Store_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Store_Code` VARCHAR(20) NOT NULL,
    `Store_Name` VARCHAR(255) NOT NULL,
    `Address` VARCHAR(255) NULL,
    `Phone` VARCHAR(20) NULL,
    `Lat` DOUBLE NOT NULL DEFAULT 10.7769,
    `Lng` DOUBLE NOT NULL DEFAULT 106.7009,
    `Allowed_Radius` INTEGER NOT NULL DEFAULT 50,
    `Open_Time` VARCHAR(5) NULL,
    `Close_Time` VARCHAR(5) NULL,
    `Is_Active` BOOLEAN NOT NULL DEFAULT true,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Stores_Store_Code_key`(`Store_Code`),
    PRIMARY KEY (`Store_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Store_Products` (
    `Store_ID` INTEGER NOT NULL,
    `Product_ID` INTEGER NOT NULL,
    `Is_Available` BOOLEAN NOT NULL DEFAULT true,
    `Out_Of_Stock` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`Store_ID`, `Product_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Store_Inventory` (
    `Store_ID` INTEGER NOT NULL,
    `Item_ID` INTEGER NOT NULL,
    `Stock_Qty` INTEGER NOT NULL DEFAULT 0,
    `Min_Level` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`Store_ID`, `Item_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Stock_Transfers` (
    `Transfer_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Transfer_Code` VARCHAR(50) NOT NULL,
    `From_Store_ID` INTEGER NOT NULL,
    `To_Store_ID` INTEGER NOT NULL,
    `Status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `Note` VARCHAR(500) NULL,
    `Created_By` INTEGER NOT NULL,
    `Received_By` INTEGER NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `Shipped_At` DATETIME(3) NULL,
    `Received_At` DATETIME(3) NULL,

    UNIQUE INDEX `Stock_Transfers_Transfer_Code_key`(`Transfer_Code`),
    INDEX `Stock_Transfers_From_Store_ID_idx`(`From_Store_ID`),
    INDEX `Stock_Transfers_To_Store_ID_idx`(`To_Store_ID`),
    PRIMARY KEY (`Transfer_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Stock_Transfer_Items` (
    `STI_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Transfer_ID` INTEGER NOT NULL,
    `Item_ID` INTEGER NOT NULL,
    `Qty` INTEGER NOT NULL,
    `Received_Qty` INTEGER NULL,

    UNIQUE INDEX `Stock_Transfer_Items_Transfer_ID_Item_ID_key`(`Transfer_ID`, `Item_ID`),
    PRIMARY KEY (`STI_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Voucher_Stores` (
    `Voucher_ID` INTEGER NOT NULL,
    `Store_ID` INTEGER NOT NULL,

    PRIMARY KEY (`Voucher_ID`, `Store_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Audit_Logs_Store_ID_idx` ON `Audit_Logs`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Chat_Sessions_Store_ID_idx` ON `Chat_Sessions`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Goods_Receipts_Store_ID_idx` ON `Goods_Receipts`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Inventory_Batches_Store_ID_idx` ON `Inventory_Batches`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Inventory_Transactions_Store_ID_idx` ON `Inventory_Transactions`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Orders_Store_ID_idx` ON `Orders`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Purchase_Orders_Store_ID_idx` ON `Purchase_Orders`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Purchase_Requisitions_Store_ID_idx` ON `Purchase_Requisitions`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Requests_Store_ID_idx` ON `Requests`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Shift_Inventory_Logs_Store_ID_idx` ON `Shift_Inventory_Logs`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Shifts_Store_ID_idx` ON `Shifts`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Staff_Store_ID_idx` ON `Staff`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Stock_Receipts_Store_ID_idx` ON `Stock_Receipts`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Tables_Store_ID_idx` ON `Tables`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Work_Schedules_Store_ID_idx` ON `Work_Schedules`(`Store_ID`);

-- CreateIndex
CREATE INDEX `Zones_Store_ID_idx` ON `Zones`(`Store_ID`);

-- DataMigration: dữ liệu hiện có thuộc Chi nhánh #1
INSERT INTO `Stores` (`Store_ID`, `Store_Code`, `Store_Name`, `Address`, `Lat`, `Lng`, `Allowed_Radius`, `Is_Active`, `Created_At`)
SELECT 1, "CN1", "TD Coffee - Chi nhánh 1", `Store_Address`, `Store_Lat`, `Store_Lng`, `Allowed_Radius`, true, NOW(3)
FROM `Store_Settings` WHERE `id` = 1;
INSERT IGNORE INTO `Stores` (`Store_ID`, `Store_Code`, `Store_Name`, `Is_Active`, `Created_At`)
VALUES (1, "CN1", "TD Coffee - Chi nhánh 1", true, NOW(3));
INSERT INTO `Store_Inventory` (`Store_ID`, `Item_ID`, `Stock_Qty`, `Min_Level`)
SELECT 1, `Item_ID`, `Stock_Qty`, `Min_Level` FROM `Inventory`;
INSERT INTO `Store_Products` (`Store_ID`, `Product_ID`, `Is_Available`, `Out_Of_Stock`)
SELECT 1, `Product_ID`, true, true FROM `Products` WHERE `Out_Of_Stock` = true;
UPDATE `Audit_Logs` SET `Store_ID` = 1;

-- AddForeignKey
ALTER TABLE `Zones` ADD CONSTRAINT `Zones_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tables` ADD CONSTRAINT `Tables_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Staff` ADD CONSTRAINT `Staff_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shifts` ADD CONSTRAINT `Shifts_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Orders` ADD CONSTRAINT `Orders_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Requests` ADD CONSTRAINT `Requests_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stock_Receipts` ADD CONSTRAINT `Stock_Receipts_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Audit_Logs` ADD CONSTRAINT `Audit_Logs_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift_Inventory_Logs` ADD CONSTRAINT `Shift_Inventory_Logs_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Work_Schedules` ADD CONSTRAINT `Work_Schedules_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Chat_Sessions` ADD CONSTRAINT `Chat_Sessions_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inventory_Transactions` ADD CONSTRAINT `Inventory_Transactions_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase_Requisitions` ADD CONSTRAINT `Purchase_Requisitions_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Goods_Receipts` ADD CONSTRAINT `Goods_Receipts_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inventory_Batches` ADD CONSTRAINT `Inventory_Batches_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase_Orders` ADD CONSTRAINT `Purchase_Orders_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Store_Products` ADD CONSTRAINT `Store_Products_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Store_Products` ADD CONSTRAINT `Store_Products_Product_ID_fkey` FOREIGN KEY (`Product_ID`) REFERENCES `Products`(`Product_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Store_Inventory` ADD CONSTRAINT `Store_Inventory_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Store_Inventory` ADD CONSTRAINT `Store_Inventory_Item_ID_fkey` FOREIGN KEY (`Item_ID`) REFERENCES `Inventory`(`Item_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stock_Transfers` ADD CONSTRAINT `Stock_Transfers_From_Store_ID_fkey` FOREIGN KEY (`From_Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stock_Transfers` ADD CONSTRAINT `Stock_Transfers_To_Store_ID_fkey` FOREIGN KEY (`To_Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stock_Transfers` ADD CONSTRAINT `Stock_Transfers_Created_By_fkey` FOREIGN KEY (`Created_By`) REFERENCES `Staff`(`Staff_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stock_Transfers` ADD CONSTRAINT `Stock_Transfers_Received_By_fkey` FOREIGN KEY (`Received_By`) REFERENCES `Staff`(`Staff_ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stock_Transfer_Items` ADD CONSTRAINT `Stock_Transfer_Items_Transfer_ID_fkey` FOREIGN KEY (`Transfer_ID`) REFERENCES `Stock_Transfers`(`Transfer_ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stock_Transfer_Items` ADD CONSTRAINT `Stock_Transfer_Items_Item_ID_fkey` FOREIGN KEY (`Item_ID`) REFERENCES `Inventory`(`Item_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher_Stores` ADD CONSTRAINT `Voucher_Stores_Voucher_ID_fkey` FOREIGN KEY (`Voucher_ID`) REFERENCES `Vouchers`(`Voucher_ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher_Stores` ADD CONSTRAINT `Voucher_Stores_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

