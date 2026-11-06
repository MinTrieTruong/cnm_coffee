import { Router } from "express";
import type { Request, Response } from "express";
import { Prisma, type Customer, type PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { signCustomerToken } from "../lib/jwt.js";
import { normalizeVnPhone } from "../lib/contactLinks.js";
import { customerAuth } from "../middleware/customer.js";
import { getStoreSettings } from "../lib/pricing.js";
import { createCustomer, customerUser, logCustomerAuth, maskEmail, maskPhone, syncCustomerRank } from "../lib/customerAccount.js";
import {
  SocialAuthError, signLinkTicket, socialConfigured, socialPublicIds, verifyFacebook, verifyGoogle, verifyLinkTicket,
  type SocialProfile, type SocialProvider,
} from "../lib/socialAuth.js";

const LABEL: Record<SocialProvider, string> = { GOOGLE: "Google", FACEBOOK: "Facebook" };
const PARAM: Record<string, SocialProvider> = { google: "GOOGLE", facebook: "FACEBOOK" };

/** Nhập sai mật khẩu khi liên kết: tối đa 5 lần cho mỗi phiếu (phiếu sống 10 phút) */
const linkFails = new Map<string, number>();
setInterval(() => linkFails.clear(), 15 * 60 * 1000).unref();

type AuthedReq = Request & { customerId?: number };

export function socialRoutes(prisma: PrismaClient) {
  const r = Router();

  /** Nhà cung cấp đang dùng được: công tắc của chủ chuỗi + đủ biến môi trường */
  async function enabled() {
    const s = await getStoreSettings(prisma);
    return { GOOGLE: s.googleLoginEnabled && socialConfigured.GOOGLE, FACEBOOK: s.facebookLoginEnabled && socialConfigured.FACEBOOK };
  }

  /** Xác minh token theo nhà cung cấp; lỗi đã gửi response thì trả null */
  async function verify(provider: SocialProvider, token: unknown, res: Response): Promise<SocialProfile | null> {
    if (!(await enabled())[provider]) {
      res.status(403).json({ error: `Đăng nhập bằng ${LABEL[provider]} đang tắt.` });
      return null;
    }
    if (typeof token !== "string" || !token || token.length > 4096) {
      res.status(400).json({ error: `Thiếu thông tin đăng nhập ${LABEL[provider]}.` });
      return null;
    }
    try {
      return provider === "GOOGLE" ? await verifyGoogle(token) : await verifyFacebook(token);
    } catch (e) {
      if (e instanceof SocialAuthError) {
        res.status(401).json({ error: e.message });
        return null;
      }
      throw e;
    }
  }

  async function signedIn(req: Request, res: Response, c: Customer, status = 200, extra: Record<string, unknown> = {}) {
    const tier = await syncCustomerRank(prisma, c.id);
    const fresh = (await prisma.customer.findUnique({ where: { id: c.id } })) ?? c;
    res.status(status).json({ token: signCustomerToken(c.id), user: customerUser(fresh, tier), needsPhone: !fresh.phone, ...extra });
  }

  /** Trùng tài khoản có sẵn → không tự gộp: phát phiếu liên kết, khách phải nhập mật khẩu tài khoản cũ */
  function linkRequired(res: Response, target: Customer, profile: SocialProfile, tempId: number | null) {
    res.status(409).json({
      code: "LINK_REQUIRED",
      error: "Tài khoản này đã tồn tại — đăng nhập bằng mật khẩu để liên kết.",
      ticket: signLinkTicket({ profile, targetId: target.id, tempId }),
      provider: profile.provider,
      account: {
        fullName: target.fullName,
        phone: maskPhone(target.phone),
        email: maskEmail(target.email),
        hasPassword: !!target.passwordHash,
      },
    });
  }

  const identityData = (p: SocialProfile) => ({
    email: p.email?.slice(0, 150) ?? null,
    name: p.name?.slice(0, 255) ?? null,
    avatarUrl: p.picture && p.picture.length <= 255 ? p.picture : null,
  });

  async function socialSignIn(req: Request, res: Response, provider: SocialProvider, token: unknown) {
    const profile = await verify(provider, token, res);
    if (!profile) return;
    const key = { provider_providerUserId: { provider, providerUserId: profile.providerUserId } };

    // 1. Đã liên kết → đăng nhập luôn
    const ident = await prisma.customerIdentity.findUnique({ where: key, include: { customer: true } });
    if (ident) {
      const now = new Date();
      await prisma.customerIdentity.update({ where: { id: ident.id }, data: { lastLoginAt: now } });
      await prisma.customer.update({ where: { id: ident.customerId }, data: { lastLogin: now } });
      logCustomerAuth(prisma, req, ident.customerId, "LOGIN", provider);
      return signedIn(req, res, ident.customer);
    }

    // 3. Email đã xác minh trùng tài khoản có sẵn → phải nhập mật khẩu để liên kết
    if (profile.email) {
      const existing = await prisma.customer.findFirst({ where: { email: profile.email } });
      if (existing) return linkRequired(res, existing, profile, null);
    }

    // 2 & 4. Khách mới (Facebook không có email vẫn tạo được) → bổ sung SĐT ở bước sau
    let customer: Customer;
    try {
      customer = await prisma.$transaction(async (tx) => {
        const c = await createCustomer(tx, {
          phone: null,
          email: profile.email,
          fullName: profile.name?.trim().slice(0, 255) || "Khách hàng",
          passwordHash: null,
          avatarUrl: profile.picture && profile.picture.length <= 255 ? profile.picture : null,
          lastLogin: new Date(),
        });
        await tx.customerIdentity.create({
          data: { customerId: c.id, provider, providerUserId: profile.providerUserId, lastLoginAt: new Date(), ...identityData(profile) },
        });
        return c;
      });
    } catch (e) {
      // Bấm 2 lần cùng lúc: lần kia đã tạo xong → đăng nhập vào tài khoản đó
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await prisma.customerIdentity.findUnique({ where: key, include: { customer: true } });
        if (again) return signedIn(req, res, again.customer);
      }
      throw e;
    }
    logCustomerAuth(prisma, req, customer.id, "REGISTER", provider);
    return signedIn(req, res, customer, 201, { isNew: true });
  }

  r.get("/providers", async (_req, res) => {
    const on = await enabled();
    res.json({
      google: { enabled: on.GOOGLE, clientId: socialPublicIds.googleClientId },
      facebook: { enabled: on.FACEBOOK, appId: socialPublicIds.facebookAppId },
    });
  });

  r.post("/google", (req, res) => socialSignIn(req, res, "GOOGLE", req.body?.idToken));
  r.post("/facebook", (req, res) => socialSignIn(req, res, "FACEBOOK", req.body?.accessToken));

  /** Nhập mật khẩu tài khoản có sẵn để gắn Google / Facebook vào (giữ nguyên điểm, hạng, lịch sử đơn) */
  r.post("/social/link", async (req, res) => {
    const { ticket, password } = req.body as { ticket?: string; password?: string };
    const t = ticket ? verifyLinkTicket(ticket) : null;
    if (!t) return res.status(400).json({ error: "Phiên liên kết đã hết hạn — vui lòng đăng nhập lại." });
    const fails = linkFails.get(ticket!) ?? 0;
    if (fails >= 5) return res.status(429).json({ error: "Nhập sai quá nhiều lần — vui lòng đăng nhập lại từ đầu." });

    const target = await prisma.customer.findUnique({ where: { id: t.targetId } });
    if (!target) return res.status(404).json({ error: "Không tìm thấy tài khoản cần liên kết." });
    if (!target.passwordHash) {
      return res.status(400).json({ code: "NO_PASSWORD", error: "Tài khoản có sẵn chưa đặt mật khẩu — vui lòng liên hệ quán để được hỗ trợ liên kết." });
    }
    if (!password || !(await bcrypt.compare(password, target.passwordHash))) {
      linkFails.set(ticket!, fails + 1);
      return res.status(401).json({ error: "Mật khẩu chưa đúng." });
    }

    const { profile } = t;
    const key = { provider_providerUserId: { provider: profile.provider, providerUserId: profile.providerUserId } };
    const ident = await prisma.customerIdentity.findUnique({ where: key });
    if (ident && ident.customerId !== target.id && ident.customerId !== t.tempId) {
      return res.status(409).json({ error: `Tài khoản ${LABEL[profile.provider]} này đã liên kết với tài khoản khác.` });
    }
    const sameProvider = await prisma.customerIdentity.findFirst({
      where: { customerId: target.id, provider: profile.provider, NOT: { providerUserId: profile.providerUserId } },
    });
    if (sameProvider) {
      return res.status(409).json({ error: `Tài khoản có sẵn đã liên kết với một tài khoản ${LABEL[profile.provider]} khác.` });
    }

    let tempDeleted = false;
    await prisma.$transaction(async (tx) => {
      if (ident) await tx.customerIdentity.update({ where: { id: ident.id }, data: { customerId: target.id, lastLoginAt: new Date() } });
      else {
        await tx.customerIdentity.create({
          data: { customerId: target.id, provider: profile.provider, providerUserId: profile.providerUserId, lastLoginAt: new Date(), ...identityData(profile) },
        });
      }
      if (t.tempId && t.tempId !== target.id) {
        // Liên kết khác của tài khoản tạm (nhà cung cấp tài khoản cũ chưa có) cũng chuyển sang
        const targetProviders = (await tx.customerIdentity.findMany({ where: { customerId: target.id }, select: { provider: true } })).map((i) => i.provider);
        await tx.customerIdentity.updateMany({ where: { customerId: t.tempId, provider: { notIn: targetProviders } }, data: { customerId: target.id } });
        // Tài khoản tạm chưa phát sinh dữ liệu → xoá
        const temp = await tx.customer.findUnique({
          where: { id: t.tempId },
          include: { _count: { select: { orders: true, reviews: true, pointTransactions: true, userVouchers: true, gameTickets: true, gamePlays: true, giftClaims: true } } },
        });
        if (temp && !temp.passwordHash && temp.points === 0 && Object.values(temp._count).every((n) => n === 0)) {
          await tx.customer.delete({ where: { id: temp.id } });
          tempDeleted = true;
        }
      }
      await tx.customer.update({ where: { id: target.id }, data: { lastLogin: new Date() } });
    });
    linkFails.delete(ticket!);
    logCustomerAuth(prisma, req, target.id, "LINK", profile.provider);
    logCustomerAuth(prisma, req, target.id, "LOGIN", profile.provider);
    return signedIn(req, res, target, 200, { linked: true, tempDeleted });
  });

  /** Bổ sung SĐT cho tài khoản tạo từ mạng xã hội; SĐT đã thuộc tài khoản khác → mời liên kết */
  r.post("/phone", customerAuth, async (req, res) => {
    const customerId = (req as AuthedReq).customerId!;
    const p = normalizeVnPhone(String(req.body?.phone ?? ""));
    // SĐT di động 10 số (không nhận tổng đài 1900…)
    if (!p || !/^0\d{9}$/.test(p)) return res.status(400).json({ error: "Số điện thoại chưa đúng (10 số)." });
    const me = await prisma.customer.findUnique({ where: { id: customerId }, include: { identities: { orderBy: { id: "asc" } } } });
    if (!me) return res.status(404).json({ error: "Không tìm thấy khách." });
    if (me.phone === p) return signedIn(req, res, me);
    const taken = await prisma.customer.findFirst({ where: { phone: p, NOT: { id: me.id } } });
    if (taken) {
      // Chỉ tài khoản mới tạo bằng mạng xã hội (chưa có mật khẩu) mới được gộp vào tài khoản có sẵn
      const ident = me.identities[0];
      if (!ident || me.passwordHash) return res.status(409).json({ error: "Số điện thoại đã được tài khoản khác sử dụng." });
      const profile: SocialProfile = {
        provider: ident.provider as SocialProvider, providerUserId: ident.providerUserId, email: ident.email, name: ident.name, picture: ident.avatarUrl,
      };
      return linkRequired(res, taken, profile, me.id);
    }
    try {
      const c = await prisma.customer.update({ where: { id: me.id }, data: { phone: p } });
      return signedIn(req, res, c);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return res.status(409).json({ error: "Số điện thoại đã được tài khoản khác sử dụng." });
      }
      throw e;
    }
  });

  /* ── Tài khoản › Bảo mật: liên kết / hủy liên kết ── */

  r.get("/identities", customerAuth, async (req, res) => {
    const customerId = (req as AuthedReq).customerId!;
    const c = await prisma.customer.findUnique({ where: { id: customerId }, include: { identities: true } });
    if (!c) return res.status(404).json({ error: "Không tìm thấy khách." });
    res.json({
      hasPassword: !!c.passwordHash,
      hasPhone: !!c.phone,
      // Mật khẩu chỉ đăng nhập được khi có SĐT hoặc email
      canPasswordLogin: !!c.passwordHash && !!(c.phone || c.email),
      identities: c.identities.map((i) => ({ provider: i.provider, email: i.email, name: i.name, createdAt: i.createdAt, lastLoginAt: i.lastLoginAt })),
    });
  });

  r.post("/identities/:provider", customerAuth, async (req, res) => {
    const customerId = (req as AuthedReq).customerId!;
    const provider = PARAM[String(req.params.provider)];
    if (!provider) return res.status(404).json({ error: "Nhà cung cấp không hợp lệ." });
    const profile = await verify(provider, req.body?.idToken ?? req.body?.accessToken, res);
    if (!profile) return;
    const ident = await prisma.customerIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
    });
    if (ident) {
      if (ident.customerId === customerId) return res.json({ ok: true });
      return res.status(409).json({ error: `Tài khoản ${LABEL[provider]} này đã liên kết với một tài khoản khác.` });
    }
    const mine = await prisma.customerIdentity.findFirst({ where: { customerId, provider } });
    if (mine) return res.status(409).json({ error: `Bạn đã liên kết một tài khoản ${LABEL[provider]} khác — hủy liên kết trước.` });
    await prisma.customerIdentity.create({ data: { customerId, provider, providerUserId: profile.providerUserId, ...identityData(profile) } });
    logCustomerAuth(prisma, req, customerId, "LINK", provider);
    res.status(201).json({ ok: true });
  });

  r.delete("/identities/:provider", customerAuth, async (req, res) => {
    const customerId = (req as AuthedReq).customerId!;
    const provider = PARAM[String(req.params.provider)];
    if (!provider) return res.status(404).json({ error: "Nhà cung cấp không hợp lệ." });
    const c = await prisma.customer.findUnique({ where: { id: customerId }, include: { identities: true } });
    if (!c) return res.status(404).json({ error: "Không tìm thấy khách." });
    const ident = c.identities.find((i) => i.provider === provider);
    if (!ident) return res.status(404).json({ error: `Chưa liên kết ${LABEL[provider]}.` });
    // Mật khẩu chỉ đăng nhập được khi có SĐT hoặc email
    const passwordUsable = !!c.passwordHash && !!(c.phone || c.email);
    if (!passwordUsable && c.identities.length <= 1) {
      return res.status(400).json({ error: "Không thể hủy phương thức đăng nhập cuối cùng — hãy đặt mật khẩu trước." });
    }
    await prisma.customerIdentity.delete({ where: { id: ident.id } });
    logCustomerAuth(prisma, req, customerId, "UNLINK", provider);
    res.json({ ok: true });
  });

  return r;
}
