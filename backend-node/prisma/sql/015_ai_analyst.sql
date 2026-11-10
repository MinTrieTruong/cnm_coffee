-- 015: Trợ lý AI hỏi số liệu — bật / tắt tính năng AI, hội thoại và tin nhắn của trợ lý.
SET NAMES utf8mb4;
-- CreateTable
CREATE TABLE `AI_Settings` (
    `Feature` VARCHAR(30) NOT NULL,
    `Enabled` BOOLEAN NOT NULL DEFAULT true,
    `Daily_Limit` INTEGER NULL,
    `Hourly_Per_User` INTEGER NULL,
    `Updated_At` DATETIME(3) NOT NULL,
    PRIMARY KEY (`Feature`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Analyst_Conversations` (
    `Conversation_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Staff_ID` INTEGER NOT NULL,
    `Store_Scope` VARCHAR(100) NOT NULL,
    `Title` VARCHAR(80) NOT NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `Updated_At` DATETIME(3) NOT NULL,
    INDEX `Analyst_Conversations_Staff_ID_Updated_At_idx`(`Staff_ID`, `Updated_At`),
    PRIMARY KEY (`Conversation_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Analyst_Messages` (
    `Message_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Conversation_ID` INTEGER NOT NULL,
    `Role` VARCHAR(10) NOT NULL,
    `Content` TEXT NOT NULL,
    `Charts` JSON NULL,
    `Tool_Calls` JSON NULL,
    `Follow_Ups` JSON NULL,
    `Model` VARCHAR(60) NULL,
    `Tokens_In` INTEGER NOT NULL DEFAULT 0,
    `Tokens_Out` INTEGER NOT NULL DEFAULT 0,
    `Latency_Ms` INTEGER NOT NULL DEFAULT 0,
    `Rating` INTEGER NOT NULL DEFAULT 0,
    `Error_Message` VARCHAR(1000) NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `Analyst_Messages_Conversation_ID_idx`(`Conversation_ID`),
    INDEX `Analyst_Messages_Created_At_idx`(`Created_At`),
    PRIMARY KEY (`Message_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `Analyst_Conversations` ADD CONSTRAINT `Analyst_Conversations_Staff_ID_fkey` FOREIGN KEY (`Staff_ID`) REFERENCES `Staff`(`Staff_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Analyst_Messages` ADD CONSTRAINT `Analyst_Messages_Conversation_ID_fkey` FOREIGN KEY (`Conversation_ID`) REFERENCES `Analyst_Conversations`(`Conversation_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
-- Mặc định: trợ lý bật, 200 câu hỏi / ngày toàn hệ thống, 30 câu / người / giờ
INSERT INTO `AI_Settings` (`Feature`, `Enabled`, `Daily_Limit`, `Hourly_Per_User`, `Updated_At`) VALUES ('ANALYST', true, 200, 30, CURRENT_TIMESTAMP(3));
