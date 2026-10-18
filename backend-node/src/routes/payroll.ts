import { Router } from "express";
import { prisma } from "../db.js";
import { attachStaff, requireRoles } from "../middleware/staff.js";
import exceljs from "exceljs";

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

  // Số ngày trong tháng
  const daysInMonth = new Date(year, month, 0).getDate();
  const standardDays = Math.max(1, daysInMonth - config.defaultDaysOff);

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 1);

  // Lấy tất cả nhân viên
  const staffs = await prisma.staff.findMany({
    where: { status: "Active" }
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

    let totalHours = 0;
    for (const sch of schedules) {
      if (sch.actualCheckIn && sch.actualCheckOut) {
        const diffMs = sch.actualCheckOut.getTime() - sch.actualCheckIn.getTime();
        totalHours += diffMs / (1000 * 60 * 60);
      }
    }

    const actualWorkedDays = Number((totalHours / 8).toFixed(2));
    const dailyRate = Math.round(staff.baseSalary / standardDays);
    const timeSalary = Math.round(dailyRate * actualWorkedDays);

    const existingPayslip = await prisma.payslip.findUnique({
      where: { staffId_month_year: { staffId: staff.id, month, year } }
    });

    const individualBonus = existingPayslip ? existingPayslip.individualBonus : 0;
    const netSalary = timeSalary + staff.allowance + config.globalBonus + individualBonus;

    const payslip = await prisma.payslip.upsert({
      where: { staffId_month_year: { staffId: staff.id, month, year } },
      update: {
        standardDays,
        actualWorkedDays,
        baseSalary: staff.baseSalary,
        dailyRate,
        allowance: staff.allowance,
        globalBonus: config.globalBonus,
        individualBonus,
        netSalary,
      },
      create: {
        staffId: staff.id,
        month,
        year,
        standardDays,
        actualWorkedDays,
        baseSalary: staff.baseSalary,
        dailyRate,
        allowance: staff.allowance,
        globalBonus: config.globalBonus,
        individualBonus,
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
  const payslip = await prisma.payslip.findUnique({ where: { id: Number(payslipId) } });
  if (!payslip) return res.status(404).json({ error: "Không tìm thấy phiếu lương" });

  const timeSalary = Math.round(payslip.dailyRate * payslip.actualWorkedDays);
  const netSalary = timeSalary + payslip.allowance + payslip.globalBonus + Number(individualBonus);

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
    where: { month: Number(month), year: Number(year) },
    data: { status: "PAID" }
  });
  res.json({ ok: true });
});

// 6. Xuất Excel
r.get("/payroll/export", auth, requireRoles("Admin"), async (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);

  const payslips = await prisma.payslip.findMany({
    where: { month, year },
    include: { staff: true }
  });

  const workbook = new exceljs.Workbook();
  const sheet = workbook.addWorksheet(`BangLuong_${month}_${year}`);

  sheet.columns = [
    { header: "Mã NV", key: "staffId", width: 10 },
    { header: "Tên NV", key: "staffName", width: 25 },
    { header: "Lương Cơ Bản", key: "baseSalary", width: 15 },
    { header: "Công Chuẩn", key: "standardDays", width: 15 },
    { header: "Ngày Làm Thực Tế", key: "actualWorkedDays", width: 20 },
    { header: "Phụ Cấp", key: "allowance", width: 15 },
    { header: "Thưởng Chung", key: "globalBonus", width: 15 },
    { header: "Thưởng Riêng", key: "individualBonus", width: 15 },
    { header: "Tổng Thực Lãnh", key: "netSalary", width: 20 },
    { header: "Trạng thái", key: "status", width: 15 },
  ];

  sheet.getRow(1).font = { bold: true };

  payslips.forEach(p => {
    sheet.addRow({
      staffId: p.staffId,
      staffName: p.staff.fullName,
      baseSalary: p.baseSalary,
      standardDays: p.standardDays,
      actualWorkedDays: p.actualWorkedDays,
      allowance: p.allowance,
      globalBonus: p.globalBonus,
      individualBonus: p.individualBonus,
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
