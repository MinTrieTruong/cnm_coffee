import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Request, Response, NextFunction } from "express";
import { verifyToken, type StaffPayload } from "../lib/jwt.js";

function staffAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Cần đăng nhập nhân sự." });
  try {
    const p = verifyToken<StaffPayload>(token);
    if (p.typ !== "staff") return res.status(403).json({ error: "Không phải tài khoản nhân sự." });
    (req as Request & { staff?: StaffPayload }).staff = p;
    next();
  } catch {
    return res.status(401).json({ error: "Token không hợp lệ." });
  }
}

export function shiftsRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/shifts/open", staffAuth, async (req, res) => {
    const p = (req as Request & { staff?: StaffPayload }).staff!;
    if (p.role !== "Cashier" && p.role !== "Admin") {
      return res.status(403).json({ error: "Chỉ thu ngân hoặc quản lý mở ca." });
    }
    const open = await prisma.shift.findFirst({
      where: { staffId: p.sub, endTime: null },
      orderBy: { id: "desc" },
    });
    res.json({ shift: open });
  });

  r.post("/shifts/open", staffAuth, async (req, res) => {
    const p = (req as Request & { staff?: StaffPayload }).staff!;
    if (p.role !== "Cashier" && p.role !== "Admin") {
      return res.status(403).json({ error: "Chỉ thu ngân hoặc quản lý mở ca." });
    }
    const existing = await prisma.shift.findFirst({ where: { staffId: p.sub, endTime: null } });
    if (existing) {
      return res.status(409).json({ error: "Đã có ca đang mở.", shift: existing });
    }
    const { startingCash } = req.body as { startingCash?: number };
    const cash = typeof startingCash === "number" ? startingCash : 0;
    const shift = await prisma.shift.create({
      data: {
        staffId: p.sub,
        startTime: new Date(),
        startingCash: cash,
      },
    });
    res.status(201).json(shift);
  });

  r.post("/shifts/close", staffAuth, async (req, res) => {
    const p = (req as Request & { staff?: StaffPayload }).staff!;
    if (p.role !== "Cashier" && p.role !== "Admin") {
      return res.status(403).json({ error: "Chỉ thu ngân hoặc quản lý đóng ca." });
    }
    const { actualCash } = req.body as { actualCash?: number };
    if (typeof actualCash !== "number") {
      return res.status(400).json({ error: "Nhập số tiền mặt thực tế đếm được." });
    }
    const open = await prisma.shift.findFirst({
      where: { staffId: p.sub, endTime: null },
      orderBy: { id: "desc" },
    });
    if (!open) return res.status(400).json({ error: "Không có ca đang mở." });
    const expectedCash = open.startingCash;
    const diff = actualCash - expectedCash;
    const closed = await prisma.shift.update({
      where: { id: open.id },
      data: {
        endTime: new Date(),
        expectedCash,
        actualCash,
        differenceAmt: diff,
      },
    });
    res.json(closed);
  });

  return r;
}
