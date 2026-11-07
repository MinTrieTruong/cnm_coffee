-- 020: AI phác thảo món mới từ nhu cầu tìm kiếm — đề xuất món lưu định mức nháp, giá vốn / giá gợi ý, bản AI để đối chiếu.
SET NAMES utf8mb4;
-- AlterTable
ALTER TABLE `Menu_Proposals`
    ADD COLUMN `Formula_Draft` JSON NULL,
    ADD COLUMN `Est_Cost_S` INTEGER NULL,
    ADD COLUMN `Est_Cost_M` INTEGER NULL,
    ADD COLUMN `Est_Cost_L` INTEGER NULL,
    ADD COLUMN `Temps` VARCHAR(10) NULL,
    ADD COLUMN `Has_Sizes` BOOLEAN NULL,
    ADD COLUMN `Price_S` INTEGER NULL,
    ADD COLUMN `Price_L` INTEGER NULL,
    ADD COLUMN `AI_Draft` JSON NULL,
    ADD COLUMN `AI_Generated` BOOLEAN NOT NULL DEFAULT false;

INSERT IGNORE INTO `AI_Settings` (`Feature`, `Enabled`, `Daily_Limit`, `Hourly_Per_User`, `Updated_At`) VALUES ('MENU_DRAFT', true, 50, 10, CURRENT_TIMESTAMP(3));
