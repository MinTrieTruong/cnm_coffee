import { Router } from "express";
import { prisma } from "../db.js";
import { attachStaff, requireRoles } from "../middleware/staff.js";
import { inStore, storeWhere } from "../lib/storeScope.js";
import exceljs from "exceljs";
import { getHrConfig } from "../lib/hrConfig.js";
import { paidOvertimeMinutes, regularMinutes } from "../lib/attendanceRules.js";
import { approvedOvertimeBySchedule } from "../lib/overtime.js";
import { shipperShippingIncome } from "../lib/delivery.js";

/** Tiền làm thêm = số giờ làm thêm × lương giờ × (100% + phụ cấp %) — lương giờ = lương ngày / 8 */
const overtimePayOf = (minutes: number, dailyRate: number, ratePercent: number) =>
  Math.round((minutes / 60) * (dailyRate / 8) * (1 + ratePercent / 100));

const r = Router();
const auth = attachStaff(prisma);

// 1. Lấy cấu hình lương
r.get("/payroll/config", auth, requireRoles("Admin"), async (req, res) => {
  let config = await prisma.payrollConfig.findUnique({ where: { id: 1 } });
  if (!config) {
    config = await prisma.payrollConfig.create({ data: { id: 1 } });
  }
  res.json(config);
});

// 2. Cập nhật cấu hình lương
r.post("/payroll/config", auth, requireRoles("Admin"), async (req, res) => {
  const { defaultDaysOff, globalBonus } = req.body;
  const config = await prisma.payrollConfig.upsert({
    where: { id: 1 },
    update: { defaultDaysOff: Number(defaultDaysOff), globalBonus: Number(globalBonus) },
    create: { id: 1, defaultDaysOff: Number(defaultDaysOff), globalBonus: Number(globalBonus) },
  });
  res.json(config);
});

// 3. Tính toán lương tháng (hoặc lấy nếu đã tính)
r.get("/payroll/calculate", auth, requireRoles("Admin"), async (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  if (!month || !year) return res.status(400).json({ error: "Thiếu month hoặc year" });

  let config = await prisma.payrollConfig.findUnique({ where: { id: 1 } });
  if (!config) config = await prisma.payrollConfig.create({ data: { id: 1 } });
  const { overtimeRatePercent } = await getHrConfig(prisma);

  // Số ngày trong tháng
  const daysInMonth = new Date(year, month, 0).getDate();
  const standardDays = Math.max(1, daysInMonth - config.defaultDaysOff);

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 1);

  // Nhân viên của chi nhánh đang xem (Owner xem tất cả → mọi chi nhánh)
  const staffs = await prisma.staff.findMany({
    where: { ...storeWhere(req), status: "Active", role: { not: "Owner" } }
  });

  const results = [];

  for (const staff of staffs) {
    // Lấy chấm công đã duyệt hoặc có checkin/checkout thực tế
    const schedules = await prisma.workSchedule.findMany({
      where: {
        staffId: staff.id,
        workDate: { gte: startOfMonth, lt: endOfMonth },
        actualCheckIn: { not: null },
        actualCheckOut: { not: null },
      }
    });

    // Giờ thường: chỉ tính trong khung ca (vào sớm / ở lại muộn không tính).
    // Làm thêm: chỉ tính khi có phiếu đã duyệt, số phút = min(phiếu, giờ check-out sau hết ca).
    const approvedOt = await approvedOvertimeBySchedule(prisma, schedules.map((s) => s.id));
    let regularMin = 0;
    let overtimeMinutes = 0;
    for (const sch of schedules) {
      regularMin += regularMinutes(sch);
      overtimeMinutes += paidOvertimeMinutes(sch, approvedOt.get(sch.id) ?? 0);
    }

    const actualWorkedDays = Number((regularMin / 60 / 8).toFixed(2));
    const dailyRate = Math.round(staff.baseSalary / standardDays);
    const timeSalary = Math.round(dailyRate * actualWorkedDays);
    const overtimePay = overtimePayOf(overtimeMinutes, dailyRate, overtimeRatePercent);

    const existingPayslip = await prisma.payslip.findUnique({
      where: { staffId_month_year: { staffId: staff.id, month, year } }
    });

    const individualBonus = existingPayslip ? existingPayslip.individualBonus : 0;
    // Shipper: đối chiếu phí ship các đơn đã giao trong tháng → cộng thêm vào lương
    const shipping = staff.role === "Shipper"
      ? await shipperShippingIncome(prisma, staff.id, startOfMonth, endOfMonth)
      : { amount: 0, orders: 0 };
    const netSalary = timeSalary + overtimePay + staff.allowance + config.globalBonus + individualBonus + shipping.amount;

    const payslip = await prisma.payslip.upsert({
      where: { staffId_month_year: { staffId: staff.id, month, year } },
      update: {
        standardDays,
        actualWorkedDays,
        overtimeMinutes,
        overtimePay,
        baseSalary: staff.baseSalary,
        dailyRate,
        allowance: staff.allowance,
        globalBonus: config.globalBonus,
        individualBonus,
        shippingIncome: shipping.amount,
        deliveredOrders: shipping.orders,
        netSalary,
      },
      create: {
        staffId: staff.id,
        month,
        year,
        standardDays,
        actualWorkedDays,
        overtimeMinutes,
        overtimePay,
        baseSalary: staff.baseSalary,
        dailyRate,
        allowance: staff.allowance,
        globalBonus: config.globalBonus,
        individualBonus,
        shippingIncome: shipping.amount,
        deliveredOrders: shipping.orders,
        netSalary,
        status: "PENDING"
      },
      include: { staff: true }
    });

    results.push(payslip);
  }

  res.json(results);
});

// 4. Cập nhật thưởng riêng
r.post("/payroll/update-bonus", auth, requireRoles("Admin"), async (req, res) => {
  const { payslipId, individualBonus } = req.body;
  const payslip = await prisma.payslip.findUnique({ where: { id: Number(payslipId) }, include: { staff: true } });
  if (!payslip || !inStore(req, payslip.staff)) return res.status(404).json({ error: "Không tìm thấy phiếu lương" });

  const timeSalary = Math.round(payslip.dailyRate * payslip.actualWorkedDays);
  const netSalary = timeSalary + payslip.overtimePay + payslip.allowance + payslip.globalBonus + Number(individualBonus) + payslip.shippingIncome;

  const updated = await prisma.payslip.update({
    where: { id: payslip.id },
    data: { individualBonus: Number(individualBonus), netSalary },
    include: { staff: true }
  });
  res.json(updated);
});

// 5. Chốt lương
r.post("/payroll/finalize", auth, requireRoles("Admin"), async (req, res) => {
  const { month, year } = req.body;
  await prisma.payslip.updateMany({
    where: { month: Number(month), year: Number(year), staff: storeWhere(req) },
    data: { status: "PAID" }
  });
  res.json({ ok: true });
});

// 6. Xuất Excel
r.get("/payroll/export", auth, requireRoles("Admin"), async (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);

  const payslips = await prisma.payslip.findMany({
    where: { month, year, staff: storeWhere(req) },
    include: { staff: { include: { store: { select: { name: true } } } } }
  });

  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet(`BangLuong_${month}_${year}`);

  sheet.columns = [
    { header: "Mã NV", key: "staffId", width: 10 },
    { header: "Tên NV", key: "staffName", width: 25 },
    { header: "Chi nhánh", key: "storeName", width: 25 },
    { header: "Lương Cơ Bản", key: "baseSalary", width: 15 },
    { header: "Công Chuẩn", key: "standardDays", width: 15 },
    { header: "Ngày Làm Thực Tế", key: "actualWorkedDays", width: 20 },
    { header: "Giờ Làm Thêm", key: "overtimeHours", width: 15 },
    { header: "Tiền Làm Thêm", key: "overtimePay", width: 15 },
    { header: "Phụ Cấp", key: "allowance", width: 15 },
    { header: "Thưởng Chung", key: "globalBonus", width: 15 },
    { header: "Thưởng Riêng", key: "individualBonus", width: 15 },
    { header: "Số Đơn Giao", key: "deliveredOrders", width: 12 },
    { header: "Phí Ship", key: "shippingIncome", width: 15 },
    { header: "Tổng Thực Lãnh", key: "netSalary", width: 20 },
    { header: "Trạng thái", key: "status", width: 15 },
  ];

  sheet.getRow(1).font = { bold: true };

  payslips.forEach(p => {
    sheet.addRow({
      staffId: p.staffId,
      staffName: p.staff.fullName,
      storeName: p.staff.store?.name ?? "",
      baseSalary: p.baseSalary,
      standardDays: p.standardDays,
      actualWorkedDays: p.actualWorkedDays,
      overtimeHours: Number((p.overtimeMinutes / 60).toFixed(2)),
      overtimePay: p.overtimePay,
      allowance: p.allowance,
      globalBonus: p.globalBonus,
      individualBonus: p.individualBonus,
      deliveredOrders: p.deliveredOrders,
      shippingIncome: p.shippingIncome,
      netSalary: p.netSalary,
      status: p.status === "PAID" ? "Đã chốt" : "Chờ chốt"
    });
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="BangLuong_Thang${month}_${year}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// 7. Lấy phiếu lương của cá nhân (Staff)
r.get("/payroll/my-payslips", auth, async (req, res) => {
  const staffId = (req as any).staffRow!.id;
  const payslips = await prisma.payslip.findMany({
    where: { staffId },
    orderBy: [{ year: "desc" }, { month: "desc" }]
  });
  res.json(payslips);
});

export const payrollRoutes = r;
