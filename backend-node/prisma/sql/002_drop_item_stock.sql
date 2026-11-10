-- 002: Tồn kho chuyển hẳn sang Store_Inventory (đã chép ở 001) — bỏ cột tồn kho cũ của Inventory.

-- AlterTable
ALTER TABLE `Inventory` DROP COLUMN `Min_Level`,
    DROP COLUMN `Stock_Qty`;

