-- 014: AI tư vấn — lưu hẹn giờ trả lời, mốc tin đã xử lý, tóm tắt khi chuyển nhân viên (không mất khi khởi động lại).
SET NAMES utf8mb4;
-- AlterTable
ALTER TABLE `Chat_Sessions` ADD COLUMN `AI_Answered_Msg_ID` INTEGER NULL,
    ADD COLUMN `AI_Handoff_Summary` VARCHAR(1000) NULL,
    ADD COLUMN `AI_Reply_Due_At` DATETIME(3) NULL;
