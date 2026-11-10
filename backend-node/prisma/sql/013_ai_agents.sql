-- 013: AI Agent tư vấn — cấu hình agent, gán kênh, mẫu trả lời nhanh, nhật ký chạy; cột AI trên phiên chat.
SET NAMES utf8mb4;
-- AlterTable
ALTER TABLE `Chat_Messages` ADD COLUMN `AI_Run_ID` INTEGER NULL;
-- AlterTable
ALTER TABLE `Chat_Sessions` ADD COLUMN `AI_Agent_ID` INTEGER NULL,
    ADD COLUMN `AI_Out_Of_Hours_At` DATETIME(3) NULL,
    ADD COLUMN `AI_Paused` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `AI_Paused_Reason` VARCHAR(20) NULL,
    ADD COLUMN `Channel` VARCHAR(20) NOT NULL DEFAULT 'WEB';
-- CreateTable
CREATE TABLE `AI_Agents` (
    `Agent_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(60) NOT NULL,
    `Description` VARCHAR(500) NULL,
    `Icon` VARCHAR(12) NOT NULL DEFAULT 'DEFAULT',
    `Enabled` BOOLEAN NOT NULL DEFAULT true,
    `Bot_Name` VARCHAR(60) NOT NULL DEFAULT 'TD Bot',
    `Tone` VARCHAR(15) NOT NULL DEFAULT 'FRIENDLY',
    `Self_Pronoun` VARCHAR(20) NOT NULL DEFAULT 'em',
    `Customer_Pronoun` VARCHAR(20) NOT NULL DEFAULT 'anh/chị',
    `Greeting` TEXT NOT NULL,
    `Fallback_Message` TEXT NOT NULL,
    `Memory` VARCHAR(1000) NULL,
    `Extra_Instructions` VARCHAR(2000) NULL,
    `Response_Length` VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
    `Split_Long_Messages` BOOLEAN NOT NULL DEFAULT true,
    `Allow_General_Knowledge` BOOLEAN NOT NULL DEFAULT false,
    `Allow_Web_Search` BOOLEAN NOT NULL DEFAULT false,
    `Merge_Window_Sec` INTEGER NOT NULL DEFAULT 5,
    `History_Size` INTEGER NOT NULL DEFAULT 20,
    `Reasoning_Level` VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
    `Min_Score` DOUBLE NOT NULL DEFAULT 0.68,
    `Handoff_Enabled` BOOLEAN NOT NULL DEFAULT true,
    `Quick_Replies_Enabled` BOOLEAN NOT NULL DEFAULT true,
    `Schedule_Mode` VARCHAR(10) NOT NULL DEFAULT 'ALWAYS',
    `Schedule` JSON NULL,
    `Out_Of_Hours_Message` TEXT NULL,
    `Staff_Wait_Minutes` INTEGER NOT NULL DEFAULT 0,
    `Daily_Request_Limit` INTEGER NULL,
    `Created_By` INTEGER NOT NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `Updated_At` DATETIME(3) NOT NULL,
    PRIMARY KEY (`Agent_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `AI_Agent_Knowledge_Bases` (
    `Agent_ID` INTEGER NOT NULL,
    `KB_ID` INTEGER NOT NULL,
    PRIMARY KEY (`Agent_ID`, `KB_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `AI_Agent_Bindings` (
    `Binding_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Agent_ID` INTEGER NOT NULL,
    `Channel` VARCHAR(20) NOT NULL,
    `Store_ID` INTEGER NULL,
    `Channel_Account_ID` INTEGER NULL,
    INDEX `AI_Agent_Bindings_Agent_ID_idx`(`Agent_ID`),
    UNIQUE INDEX `AI_Agent_Bindings_Channel_Store_ID_Channel_Account_ID_key`(`Channel`, `Store_ID`, `Channel_Account_ID`),
    PRIMARY KEY (`Binding_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `AI_Quick_Replies` (
    `QR_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Agent_ID` INTEGER NOT NULL,
    `Name` VARCHAR(60) NOT NULL,
    `Match_Type` VARCHAR(10) NOT NULL DEFAULT 'CONTAINS',
    `Patterns` JSON NOT NULL,
    `Replies` JSON NOT NULL,
    `Action` VARCHAR(10) NOT NULL DEFAULT 'NONE',
    `Enabled` BOOLEAN NOT NULL DEFAULT true,
    `Sort_Order` INTEGER NOT NULL DEFAULT 0,
    INDEX `AI_Quick_Replies_Agent_ID_idx`(`Agent_ID`),
    PRIMARY KEY (`QR_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `AI_Run_Logs` (
    `Run_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Agent_ID` INTEGER NOT NULL,
    `Session_ID` INTEGER NULL,
    `Channel` VARCHAR(20) NOT NULL DEFAULT 'WEB',
    `Store_ID` INTEGER NULL,
    `Kind` VARCHAR(15) NOT NULL,
    `Input` TEXT NOT NULL,
    `Output` TEXT NOT NULL,
    `Retrieved` JSON NULL,
    `Tool_Calls` JSON NULL,
    `Model` VARCHAR(60) NULL,
    `Prompt_Tokens` INTEGER NOT NULL DEFAULT 0,
    `Output_Tokens` INTEGER NOT NULL DEFAULT 0,
    `Thinking_Tokens` INTEGER NOT NULL DEFAULT 0,
    `Latency_Ms` INTEGER NOT NULL DEFAULT 0,
    `Cost_VND` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `Error_Message` VARCHAR(1000) NULL,
    `Rating` VARCHAR(5) NULL,
    `Rated_By` INTEGER NULL,
    `Correction` TEXT NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `AI_Run_Logs_Agent_ID_Created_At_idx`(`Agent_ID`, `Created_At`),
    INDEX `AI_Run_Logs_Created_At_idx`(`Created_At`),
    INDEX `AI_Run_Logs_Session_ID_idx`(`Session_ID`),
    PRIMARY KEY (`Run_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `AI_Agents` ADD CONSTRAINT `AI_Agents_Created_By_fkey` FOREIGN KEY (`Created_By`) REFERENCES `Staff`(`Staff_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `AI_Agent_Knowledge_Bases` ADD CONSTRAINT `AI_Agent_Knowledge_Bases_Agent_ID_fkey` FOREIGN KEY (`Agent_ID`) REFERENCES `AI_Agents`(`Agent_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `AI_Agent_Knowledge_Bases` ADD CONSTRAINT `AI_Agent_Knowledge_Bases_KB_ID_fkey` FOREIGN KEY (`KB_ID`) REFERENCES `Knowledge_Bases`(`KB_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `AI_Agent_Bindings` ADD CONSTRAINT `AI_Agent_Bindings_Agent_ID_fkey` FOREIGN KEY (`Agent_ID`) REFERENCES `AI_Agents`(`Agent_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `AI_Agent_Bindings` ADD CONSTRAINT `AI_Agent_Bindings_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `AI_Quick_Replies` ADD CONSTRAINT `AI_Quick_Replies_Agent_ID_fkey` FOREIGN KEY (`Agent_ID`) REFERENCES `AI_Agents`(`Agent_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `AI_Run_Logs` ADD CONSTRAINT `AI_Run_Logs_Agent_ID_fkey` FOREIGN KEY (`Agent_ID`) REFERENCES `AI_Agents`(`Agent_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
