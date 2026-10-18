import type { Request, Response, NextFunction } from "express";
import type { PrismaClient, Supplier } from "@prisma/client";
import { verifyToken, type SupplierPayload } from "../lib/jwt.js";

export interface SupplierRequest extends Request {
  supplier?: { id: number };
  supplierRow?: Supplier;
}

export function attachSupplier(prisma: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid token" });
    }
    const token = authHeader.split(" ")[1];
    try {
      const payload = verifyToken<SupplierPayload>(token);
      if (payload.typ !== "supp") {
        return res.status(401).json({ error: "Invalid token type" });
      }
      (req as SupplierRequest).supplier = { id: payload.sub };
      const supplierRow = await prisma.supplier.findUnique({ where: { id: payload.sub } });
      if (!supplierRow || !supplierRow.isActive) {
        return res.status(401).json({ error: "Supplier inactive or not found" });
      }
      (req as SupplierRequest).supplierRow = supplierRow;
      next();
    } catch (e) {
      return res.status(401).json({ error: "Token expired or invalid" });
    }
  };
}
