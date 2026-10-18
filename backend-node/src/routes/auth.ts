import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signCustomerToken } from "../lib/jwt.js";
import { customerAuth } from "../middleware/customer.js";
import { rankTierFromLifetimeSpend } from "../lib/rank.js";

async function syncCustomerRank(prisma: PrismaClient, customerId: number) {
  const agg = await prisma.order.aggregate({
    where: { customerId, status: "Paid" },
    _sum: { totalAmount: true },
  });
  const tier = rankTierFromLifetimeSpend(agg._sum.totalAmount ?? 0);
  await prisma.customer.update({ where: { id: customerId }, data: { rankTier: tier } });
  return tier;
}

export function authRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/me", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const tier = await syncCustomerRank(prisma, customerId);
    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c) return res.status(404).json({ error: "Không tìm thấy khách." });
    res.json({
      user: {
        customerId: c.id,
        fullName: c.fullName,
        phone: c.phone,
        email: c.email,
        points: c.points,
        rankTier: tier,
        address: c.address,
        dob: c.dob,
        gender: c.gender,
        avatarUrl: c.avatarUrl,
      },
    });
  });

  r.post("/register", async (req, res) => {
    const { phone, email, password, fullName } = req.body as {
      phone?: string;
      email?: string;
      password?: string;
      fullName?: string;
    };
    if (!phone?.trim() || !password || password.length < 6) {
      return res.status(400).json({ error: "Số điện thoại và mật khẩu (≥ 6 ký tự) là bắt buộc." });
    }
    const exists = await prisma.customer.findFirst({
      where: { phone: phone.trim() },
    });
    if (exists) {
      return res.status(409).json({ error: "Số điện thoại đã được đăng ký." });
    }
    if (email?.trim()) {
      const e = await prisma.customer.findFirst({ where: { email: email.trim() } });
      if (e) return res.status(409).json({ error: "Email đã được đăng ký." });
    }
    const hash = await bcrypt.hash(password, 10);
    const nextId = (await prisma.customer.aggregate({ _max: { id: true } }))._max.id ?? 0;
    const customer = await prisma.customer.create({
      data: {
        id: nextId + 1,
        phone: phone.trim(),
        email: email?.trim() || null,
        fullName: fullName?.trim() || "Khách hàng",
        passwordHash: hash,
      },
    });
    const tier = await syncCustomerRank(prisma, customer.id);
    const token = signCustomerToken(customer.id);
    return res.status(201).json({
      token,
      user: {
        customerId: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        points: customer.points,
        rankTier: tier,
        address: customer.address,
        dob: customer.dob,
        gender: customer.gender,
        avatarUrl: customer.avatarUrl,
      },
    });
  });

  r.post("/login", async (req, res) => {
    const { login, password } = req.body as { login?: string; password?: string };
    if (!login?.trim() || !password) {
      return res.status(400).json({ error: "Nhập SĐT/Email và mật khẩu." });
    }
    const q = login.trim();
    const customer = await prisma.customer.findFirst({
      where: {
        OR: [{ phone: q }, { email: q }],
      },
    });
    if (!customer?.passwordHash || !(await bcrypt.compare(password, customer.passwordHash))) {
      return res.status(401).json({ error: "Sai thông tin đăng nhập." });
    }
    await prisma.customer.update({
      where: { id: customer.id },
      data: { lastLogin: new Date() },
    });
    const tier = await syncCustomerRank(prisma, customer.id);
    const fresh = await prisma.customer.findUnique({ where: { id: customer.id } });
    const token = signCustomerToken(customer.id);
    return res.json({
      token,
      user: {
        customerId: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        points: fresh?.points ?? customer.points,
        rankTier: tier,
        address: customer.address,
        dob: customer.dob,
        gender: customer.gender,
        avatarUrl: customer.avatarUrl,
      },
    });
  });

  return r;
}
