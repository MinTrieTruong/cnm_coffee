-- 003: Toạ độ/bán kính đã chuyển sang Stores (001) — bỏ khỏi Store_Settings.
-- Bỏ DEFAULT 1 của Store_ID: mọi bản ghi mới phải ghi rõ chi nhánh.

-- AlterTable
ALTER TABLE `Chat_Sessions` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Goods_Receipts` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Inventory_Batches` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Inventory_Transactions` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Orders` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Purchase_Orders` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Purchase_Requisitions` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Requests` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Shift_Inventory_Logs` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Shifts` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Staff` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Stock_Receipts` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Store_Settings` DROP COLUMN `Allowed_Radius`,
    DROP COLUMN `Store_Address`,
    DROP COLUMN `Store_Lat`,
    DROP COLUMN `Store_Lng`;

-- AlterTable
ALTER TABLE `Tables` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Work_Schedules` ALTER COLUMN `Store_ID` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Zones` ALTER COLUMN `Store_ID` DROP DEFAULT;

