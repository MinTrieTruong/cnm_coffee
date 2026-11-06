-- 012: Kho tri thức cho AI tư vấn (RAG) — tài liệu, đoạn đã cắt, vector embedding.
SET NAMES utf8mb4;
-- CreateTable
CREATE TABLE `Knowledge_Bases` (
    `KB_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(150) NOT NULL,
    `Description` VARCHAR(1000) NULL,
    `Store_ID` INTEGER NULL,
    `Enabled` BOOLEAN NOT NULL DEFAULT true,
    `Created_By` INTEGER NOT NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `Updated_At` DATETIME(3) NOT NULL,
    INDEX `Knowledge_Bases_Store_ID_idx`(`Store_ID`),
    PRIMARY KEY (`KB_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Knowledge_Documents` (
    `Doc_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `KB_ID` INTEGER NOT NULL,
    `Title` VARCHAR(200) NOT NULL,
    `Source_Type` VARCHAR(10) NOT NULL,
    `File_Name` VARCHAR(255) NULL,
    `Mime_Type` VARCHAR(120) NULL,
    `File_URL` VARCHAR(1024) NULL,
    `Raw_Text` LONGTEXT NOT NULL,
    `Char_Count` INTEGER NOT NULL DEFAULT 0,
    `Chunk_Count` INTEGER NOT NULL DEFAULT 0,
    `Status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `Error_Message` VARCHAR(1000) NULL,
    `Enabled` BOOLEAN NOT NULL DEFAULT true,
    `Content_Hash` VARCHAR(64) NULL,
    `Created_By` INTEGER NOT NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `Updated_At` DATETIME(3) NOT NULL,
    INDEX `Knowledge_Documents_KB_ID_idx`(`KB_ID`),
    INDEX `Knowledge_Documents_Status_idx`(`Status`),
    PRIMARY KEY (`Doc_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Knowledge_Chunks` (
    `Chunk_ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Doc_ID` INTEGER NOT NULL,
    `KB_ID` INTEGER NOT NULL,
    `Ordinal` INTEGER NOT NULL,
    `Heading` VARCHAR(300) NULL,
    `Content` TEXT NOT NULL,
    `Char_Count` INTEGER NOT NULL,
    `Embedding` MEDIUMBLOB NULL,
    `Embed_Model` VARCHAR(60) NULL,
    `Embed_Dim` INTEGER NULL,
    `Created_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `Knowledge_Chunks_KB_ID_idx`(`KB_ID`),
    INDEX `Knowledge_Chunks_Doc_ID_idx`(`Doc_ID`),
    PRIMARY KEY (`Chunk_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `Knowledge_Bases` ADD CONSTRAINT `Knowledge_Bases_Store_ID_fkey` FOREIGN KEY (`Store_ID`) REFERENCES `Stores`(`Store_ID`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Knowledge_Bases` ADD CONSTRAINT `Knowledge_Bases_Created_By_fkey` FOREIGN KEY (`Created_By`) REFERENCES `Staff`(`Staff_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Knowledge_Documents` ADD CONSTRAINT `Knowledge_Documents_KB_ID_fkey` FOREIGN KEY (`KB_ID`) REFERENCES `Knowledge_Bases`(`KB_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Knowledge_Documents` ADD CONSTRAINT `Knowledge_Documents_Created_By_fkey` FOREIGN KEY (`Created_By`) REFERENCES `Staff`(`Staff_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Knowledge_Chunks` ADD CONSTRAINT `Knowledge_Chunks_Doc_ID_fkey` FOREIGN KEY (`Doc_ID`) REFERENCES `Knowledge_Documents`(`Doc_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
