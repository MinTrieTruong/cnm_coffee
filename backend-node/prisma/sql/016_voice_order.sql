-- 016: Đặt món bằng giọng nói / câu tự nhiên — tên gọi khác của món, nhật ký gọi AI (hạn mức, token).
SET NAMES utf8mb4;
-- AlterTable
ALTER TABLE `Products` ADD COLUMN `Aliases` JSON NULL;
-- CreateTable
CREATE TABLE `AI_Call_Logs` (
    `Call_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Feature` VARCHAR(30) NOT NULL,
    `Store_ID` INTEGER NULL,
    `Staff_ID` INTEGER NULL,
    `Session_Key` VARCHAR(64) NULL,
    `IP_Hash` VARCHAR(16) NULL,
    `Status` VARCHAR(10) NOT NULL,
    `Input_Kind` VARCHAR(10) NOT NULL,
    `Model` VARCHAR(60) NULL,
    `Tokens_In` INTEGER NOT NULL DEFAULT 0,
    `Tokens_Out` INTEGER NOT NULL DEFAULT 0,
    `Latency_Ms` INTEGER NOT NULL DEFAULT 0,
    `Error` VARCHAR(500) NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `AI_Call_Logs_Feature_Created_At_idx`(`Feature`, `Created_At`),
    INDEX `AI_Call_Logs_Session_Key_Created_At_idx`(`Session_Key`, `Created_At`),
    INDEX `AI_Call_Logs_IP_Hash_Created_At_idx`(`IP_Hash`, `Created_At`),
    PRIMARY KEY (`Call_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Bật / tắt: gọi món POS (không giới hạn), web khách (500 lần / ngày, 10 lần / phiên / giờ)
INSERT IGNORE INTO `AI_Settings` (`Feature`, `Enabled`, `Daily_Limit`, `Hourly_Per_User`, `Updated_At`) VALUES
  ('VOICE_ORDER_POS', true, NULL, NULL, CURRENT_TIMESTAMP(3)),
  ('VOICE_ORDER_WEB', true, 500, 10, CURRENT_TIMESTAMP(3));
-- Tên gọi khác mẫu cho thực đơn demo (chỉ món chưa có)
UPDATE `Products` SET `Aliases` = JSON_ARRAY('cf đen', 'đen đá', 'cà phê đen', 'cafe đen') WHERE `Product_Name` = 'Cà Phê Đen Đá' AND `Aliases` IS NULL;
UPDATE `Products` SET `Aliases` = JSON_ARRAY('bx', 'bạc xỉu', 'bac siu', 'bạc sỉu') WHERE `Product_Name` = 'Bạc Xỉu Đá' AND `Aliases` IS NULL;
UPDATE `Products` SET `Aliases` = JSON_ARRAY('cf sữa', 'cà phê sữa', 'nâu đá', 'cafe sữa') WHERE `Product_Name` = 'Cà Phê Sữa Đá' AND `Aliases` IS NULL;
UPDATE `Products` SET `Aliases` = JSON_ARRAY('trà đào', 'đào cam sả', 'tra dao') WHERE `Product_Name` = 'Trà Đào Cam Sả' AND `Aliases` IS NULL;
UPDATE `Products` SET `Aliases` = JSON_ARRAY('ts trân châu', 'trà sữa đường đen', 'ts đường đen') WHERE `Product_Name` = 'Trà Sữa Trân Châu Đường Đen' AND `Aliases` IS NULL;
UPDATE `Products` SET `Aliases` = JSON_ARRAY('croissant', 'sừng trâu', 'bánh sừng bò') WHERE `Product_Name` = 'Bánh Sừng Trâu (Croissant)' AND `Aliases` IS NULL;
UPDATE `Products` SET `Aliases` = JSON_ARRAY('bánh mì que', 'bmq', 'mì que') WHERE `Product_Name` = 'Bánh Mì Que Pâté' AND `Aliases` IS NULL;
UPDATE `Products` SET `Aliases` = JSON_ARRAY('matcha', 'trà xanh latte', 'matcha sữa') WHERE `Product_Name` = 'Matcha Latte (Nóng/Đá)' AND `Aliases` IS NULL;
