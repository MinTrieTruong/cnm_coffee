-- 018: Nhật ký gọi AI lưu câu AI nghe được + tóm tắt kết quả (tra lỗi "nói không được"). Không lưu âm thanh.
SET NAMES utf8mb4;
ALTER TABLE `AI_Call_Logs` ADD COLUMN `Transcript` VARCHAR(500) NULL,
    ADD COLUMN `Summary` VARCHAR(500) NULL;
