import type { Request, Response, NextFunction } from "express";
import { verifyToken, type CustomerPayload } from "../lib/jwt.js";

export function customerAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Cần đăng nhập khách hàng." });
  try {
    const p = verifyToken<CustomerPayload>(token);
    if (p.typ !== "cust") return res.status(403).json({ error: "Sai loại tài khoản." });
    (req as Request & { customerId?: number }).customerId = p.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Token không hợp lệ." });
  }
}
