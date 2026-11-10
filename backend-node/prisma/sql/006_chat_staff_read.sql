-- 006: Badge "Tin nhắn" của nhân viên — mốc nhân viên đã xem phiên chat (null = chưa xem lần nào).
SET NAMES utf8mb4;
ALTER TABLE `Chat_Sessions` ADD COLUMN `Staff_Read_At` DATETIME(3) NULL;
