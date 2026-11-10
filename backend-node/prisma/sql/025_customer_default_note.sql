-- 025: Ghi chú mặc định của khách cho mọi đơn (điền sẵn ở bước thanh toán, hiện cho thu ngân ở POS).
SET NAMES utf8mb4;
-- AlterTable
ALTER TABLE `Customers` ADD COLUMN `Default_Note` VARCHAR(120) NULL;
