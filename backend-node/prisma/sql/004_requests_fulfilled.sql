-- 004: Phiếu xin NL thêm bước Thủ kho thực hiện (Approved → Fulfilled).
-- Trước đây duyệt phiếu là đã cộng kho ngay, nên các phiếu Approved cũ coi như đã hoàn tất
-- (không để Thủ kho thực hiện lại → tránh cộng/trừ kho hai lần).
SET NAMES utf8mb4;
UPDATE `Requests` SET `Status` = 'Fulfilled' WHERE `Status` = 'Approved';
