import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { customerAuth } from "../middleware/customer.js";

export function addressesRouter(prisma: PrismaClient) {
  const r = Router();

  // Yêu cầu phải đăng nhập
  r.use(customerAuth);

  r.get("/", async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const addresses = await prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { id: "desc" }],
    });
    res.json(addresses);
  });

  r.post("/", async (req, res) => {
    const customerId = (req as Request & { customerId?: number }).customerId!;
    const { address, lat, lng, isDefault } = req.body as {
      address: string;
      lat?: number;
      lng?: number;
      isDefault?: boolean;
    };

    if (!address?.trim()) {
      return res.status(400).json({ error: "Địa chỉ là bắt buộc." });
    }

    if (isDefault) {
      await prisma.customerAddress.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });
    }

    const newAddr = await prisma.customerAddress.create({
      data: {
        customerId,
        address: address.trim(),
        lat,
        lng,
        isDefault: isDefault ?? false,
      },
    });

    res.status(201).json(newAddr);
  });

  return r;
}
