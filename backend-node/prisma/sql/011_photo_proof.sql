-- 011: Ảnh bằng chứng giao hàng / báo xong việc — GPS, lúc chụp, khoảng cách tới điểm cần có mặt.
SET NAMES utf8mb4;
-- AlterTable
ALTER TABLE `Orders` ADD COLUMN `Proof_Accuracy` INTEGER NULL,
    ADD COLUMN `Proof_Distance_M` INTEGER NULL,
    ADD COLUMN `Proof_Lat` DOUBLE NULL,
    ADD COLUMN `Proof_Lng` DOUBLE NULL,
    ADD COLUMN `Proof_Taken_At` DATETIME(3) NULL;
-- AlterTable
ALTER TABLE `Work_Task_Assignees` ADD COLUMN `Photo_Accuracy` INTEGER NULL,
    ADD COLUMN `Photo_Distance_M` INTEGER NULL,
    ADD COLUMN `Photo_Lat` DOUBLE NULL,
    ADD COLUMN `Photo_Lng` DOUBLE NULL,
    ADD COLUMN `Photo_Taken_At` DATETIME(3) NULL;
