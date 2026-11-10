import type { Request } from "express";
import { Prisma, type Customer, type PrismaClient } from "@prisma/client";
import { rankTierFromLifetimeSpend } from "./rank.js";

type Db = PrismaClient | Prisma.TransactionClient;

export async function syncCustomerRank(prisma: PrismaClient, customerId: number) {
  const agg = await prisma.order.aggregate({
    where: { customerId, status: "Paid" },
    _sum: { totalAmount: true },
  });
  const tier = rankTierFromLifetimeSpend(agg._sum.totalAmount ?? 0);
  await prisma.customer.update({ where: { id: customerId }, data: { rankTier: tier } });
  return tier;
}

/** Thông tin khách trả về sau đăng nhập / GET /me — frontend lưu nguyên vào phiên */
export function customerUser(c: Customer, tier = c.rankTier) {
  return {
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
  };
}

/** Customer_ID không tự tăng → cấp max+1; nhiều người đăng ký cùng lúc trùng ID thì thử lại với ID mới */
export async function createCustomer(db: Db, data: Omit<Prisma.CustomerUncheckedCreateInput, "id">) {
  for (let attempt = 0; ; attempt++) {
    const nextId = (await db.customer.aggregate({ _max: { id: true } }))._max.id ?? 0;
    try {
      return await db.customer.create({ data: { ...data, id: nextId + 1 + attempt } });
    } catch (e) {
      const target = String((e as Prisma.PrismaClientKnownRequestError).meta?.target ?? "");
      const dupId = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && !/phone|email/i.test(target);
      if (!dupId || attempt >= 8) throw e;
    }
  }
}

export type AuthEvent = "LOGIN" | "REGISTER" | "LINK" | "UNLINK" | "SET_PASSWORD";
export type AuthMethod = "PASSWORD" | "GOOGLE" | "FACEBOOK";

/** Ghi nhật ký đăng nhập / liên kết của khách — không chặn request nếu lỗi */
export function logCustomerAuth(prisma: PrismaClient, req: Request, customerId: number, event: AuthEvent, provider: AuthMethod) {
  prisma.customerAuthLog
    .create({
      data: {
        customerId,
        event,
        provider,
        ip: (req.ip ?? req.socket.remoteAddress ?? "").slice(0, 64) || null,
        userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
      },
    })
    .catch(() => {});
}

/** Che bớt SĐT / email khi báo "tài khoản đã tồn tại" — đủ để khách nhận ra, không lộ thông tin người khác */
export function maskPhone(p: string | null) {
  return p ? `${p.slice(0, 3)}****${p.slice(-3)}` : null;
}
export function maskEmail(e: string | null) {
  if (!e) return null;
  const [name, domain] = e.split("@");
  return domain ? `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${domain}` : null;
}
