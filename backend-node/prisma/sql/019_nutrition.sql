-- 019: Dinh dưỡng nguyên liệu + dinh dưỡng món theo size (tính từ công thức), sở thích ăn uống của khách.
SET NAMES utf8mb4;
-- AlterTable
ALTER TABLE `Customers` ADD COLUMN `Diet_Prefs` JSON NULL;
-- CreateTable
CREATE TABLE `Ingredient_Nutrition` (
    `Item_ID` INTEGER NOT NULL,
    `Basis` VARCHAR(10) NOT NULL DEFAULT 'PER_100',
    `Kcal` DOUBLE NULL,
    `Fat_G` DOUBLE NULL,
    `Sat_Fat_G` DOUBLE NULL,
    `Sugar_G` DOUBLE NULL,
    `Protein_G` DOUBLE NULL,
    `Carb_G` DOUBLE NULL,
    `Caffeine_Mg` DOUBLE NULL,
    `Allergens` JSON NULL,
    `Is_Vegan` BOOLEAN NOT NULL DEFAULT false,
    `Is_Sugar_Source` BOOLEAN NOT NULL DEFAULT false,
    `Source` VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
    `Confidence` DOUBLE NULL,
    `Note` VARCHAR(500) NULL,
    `Warnings` JSON NULL,
    `Approved` BOOLEAN NOT NULL DEFAULT false,
    `Approved_By` INTEGER NULL,
    `Approved_At` DATETIME(3) NULL,
    `Updated_At` DATETIME(3) NOT NULL,
    PRIMARY KEY (`Item_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Product_Nutrition` (
    `Product_ID` INTEGER NOT NULL,
    `Size` VARCHAR(2) NOT NULL,
    `Kcal` DOUBLE NOT NULL DEFAULT 0,
    `Fat_G` DOUBLE NOT NULL DEFAULT 0,
    `Sat_Fat_G` DOUBLE NOT NULL DEFAULT 0,
    `Sugar_G` DOUBLE NOT NULL DEFAULT 0,
    `Protein_G` DOUBLE NOT NULL DEFAULT 0,
    `Caffeine_Mg` DOUBLE NOT NULL DEFAULT 0,
    `Sugar_From_Sources_G` DOUBLE NOT NULL DEFAULT 0,
    `Kcal_From_Sources` DOUBLE NOT NULL DEFAULT 0,
    `Allergens` JSON NULL,
    `Is_Vegan` BOOLEAN NOT NULL DEFAULT false,
    `Complete` BOOLEAN NOT NULL DEFAULT false,
    `Missing` JSON NULL,
    `Labels` JSON NULL,
    `Computed_At` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`Product_ID`, `Size`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `Ingredient_Nutrition` ADD CONSTRAINT `Ingredient_Nutrition_Item_ID_fkey` FOREIGN KEY (`Item_ID`) REFERENCES `Inventory`(`Item_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Product_Nutrition` ADD CONSTRAINT `Product_Nutrition_Product_ID_fkey` FOREIGN KEY (`Product_ID`) REFERENCES `Products`(`Product_ID`) ON DELETE CASCADE ON UPDATE CASCADE;
-- Bật / tắt: AI gợi ý dinh dưỡng nguyên liệu (100 lần / ngày), câu gợi ý món theo thời tiết (300 lần / ngày)
INSERT IGNORE INTO `AI_Settings` (`Feature`, `Enabled`, `Daily_Limit`, `Hourly_Per_User`, `Updated_At`) VALUES ('NUTRITION_ASSIST', true, 100, NULL, CURRENT_TIMESTAMP(3)), ('WEATHER_PICKS', true, 300, NULL, CURRENT_TIMESTAMP(3));
