-- 005: Đánh giá theo từng món — Product_ID null = đánh giá chung cho quán / cả đơn (đánh giá cũ giữ nguyên).
SET NAMES utf8mb4;
ALTER TABLE `Reviews` ADD COLUMN `Product_ID` INTEGER NULL;
CREATE INDEX `Reviews_Product_ID_idx` ON `Reviews`(`Product_ID`);
CREATE UNIQUE INDEX `Reviews_Order_ID_Product_ID_key` ON `Reviews`(`Order_ID`, `Product_ID`);
ALTER TABLE `Reviews` ADD CONSTRAINT `Reviews_Product_ID_fkey` FOREIGN KEY (`Product_ID`) REFERENCES `Products`(`Product_ID`) ON DELETE SET NULL ON UPDATE CASCADE;
