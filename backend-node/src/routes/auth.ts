import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signCustomerToken } from "../lib/jwt.js";
import { normalizeVnPhone } from "../lib/contactLinks.js";
import { customerAuth } from "../middleware/customer.js";
import { createCustomer, customerUser, logCustomerAuth, syncCustomerRank } from "../lib/customerAccount.js";
import { socialRoutes } from "./socialAuth.js";

export function authRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/me", customerAuth, async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const tier = await syncCustomerRank(prisma, customerId);
    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c) return res.status(404).json({ error: "Không tìm thấy khách." });
    res.json({ user: customerUser(c, tier) });
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
    const normPhone = normalizeVnPhone(phone);
    if (!normPhone) return res.status(400).json({ error: "Số điện thoại chưa đúng." });
    const exists = await prisma.customer.findFirst({
      where: { phone: normPhone },
    });
    if (exists) {
      return res.status(409).json({ error: "Số điện thoại đã được đăng ký." });
    }
    if (email?.trim()) {
      const e = await prisma.customer.findFirst({ where: { email: email.trim() } });
      if (e) return res.status(409).json({ error: "Email đã được đăng ký." });
    }
    const hash = await bcrypt.hash(password, 10);
    const customer = await createCustomer(prisma, {
      phone: normPhone,
      email: email?.trim() || null,
      fullName: fullName?.trim().slice(0, 255) || "Khách hàng",
      passwordHash: hash,
    });
    const tier = await syncCustomerRank(prisma, customer.id);
    logCustomerAuth(prisma, req, customer.id, "REGISTER", "PASSWORD");
    const token = signCustomerToken(customer.id);
    return res.status(201).json({ token, user: customerUser(customer, tier) });
  });

  r.post("/login", async (req, res) => {
    const { login, password } = req.body as { login?: string; password?: string };
    if (!login?.trim() || !password) {
      return res.status(400).json({ error: "Nhập SĐT/Email và mật khẩu." });
    }
    const q = login.trim();
    const customer = await prisma.customer.findFirst({
      where: {
        OR: [{ phone: normalizeVnPhone(q) ?? q }, { email: q }],
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
    logCustomerAuth(prisma, req, customer.id, "LOGIN", "PASSWORD");
    const token = signCustomerToken(customer.id);
    return res.json({ token, user: customerUser(fresh ?? customer, tier) });
  });

  // Google / Facebook: /google, /facebook, /social/link, /phone, /identities…
  r.use(socialRoutes(prisma));

  return r;
}
