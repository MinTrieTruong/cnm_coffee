/**
 * routes/hrConfig.ts — Cấu hình ca làm, định biên, quy tắc chấm công (toàn chuỗi)
 *
 * GET /hr/config — mọi nhân viên đọc được
 * PUT /hr/config — chỉ Chủ chuỗi
 */
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles, type StaffRequest } from "../middleware/staff.js";
import { audit } from "../lib/audit.js";
import { codeFromName, getHrConfig, getShiftTemplates, SHIFT_ROLES } from "../lib/hrConfig.js";

type TemplateInput = {
  id?: number;
  name: string;
  startMin: number;
  endMin: number;
  color?: string;
  isActive?: boolean;
  staffing?: { role: string; weekdayCount: number; weekendCount: number }[];
};

const CONFIG_FIELDS = {
  lateGraceMin: [0, 120],
  earlyLeaveGraceMin: [0, 120],
  lateWarnThreshold: [1, 31],
  earlyCheckInMin: [0, 180],
  minRestHours: [0, 24],
  maxShiftsPerWeek: [1, 7],
  overtimeRatePercent: [0, 300],
  maxOvertimeMinutes: [15, 720],
} as const;

const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export function hrConfigRouter(prisma: PrismaClient) {
  const r = Router();
  const anyStaff = [attachStaff(prisma)];
  const owner = [attachStaff(prisma), requireRoles("Owner")];

  const load = async () => {
    const [config, templates] = await Promise.all([getHrConfig(prisma), getShiftTemplates(prisma)]);
    return { config, templates, roles: SHIFT_ROLES };
  };

  r.get("/hr/config", ...anyStaff, async (_req, res) => {
    res.json(await load());
  });

  r.put("/hr/config", ...owner, async (req, res) => {
    const { config, templates } = req.body as { config?: Record<string, unknown>; templates?: TemplateInput[] };

    const configData: Record<string, number> = {};
    for (const [key, [min, max]] of Object.entries(CONFIG_FIELDS)) {
      const v = config?.[key];
      if (v === undefined) continue;
      if (!isInt(v, min, max)) return res.status(400).json({ error: `Giá trị "${key}" phải là số nguyên từ ${min} đến ${max}.` });
      configData[key] = v as number;
    }

    for (const t of templates ?? []) {
      if (!t.name?.trim()) return res.status(400).json({ error: "Tên ca không được để trống." });
      if (!isInt(t.startMin, 0, 1439) || !isInt(t.endMin, 1, 1440) || t.startMin === t.endMin) {
        return res.status(400).json({ error: `Giờ của "${t.name}" không hợp lệ.` });
      }
      if (t.color && !/^#[0-9a-fA-F]{6}$/.test(t.color)) return res.status(400).json({ error: `Màu của "${t.name}" không hợp lệ.` });
      for (const s of t.staffing ?? []) {
        if (!(SHIFT_ROLES as readonly string[]).includes(s.role)) return res.status(400).json({ error: `Vị trí "${s.role}" không hợp lệ.` });
        if (!isInt(s.weekdayCount, 0, 50) || !isInt(s.weekendCount, 0, 50)) {
          return res.status(400).json({ error: "Số người mỗi ca phải từ 0 đến 50." });
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(configData).length) {
        await tx.hrConfig.upsert({ where: { id: 1 }, update: configData, create: { id: 1, ...configData } });
      }
      const taken = new Set((await tx.shiftTemplate.findMany({ select: { code: true } })).map((t) => t.code));
      for (const [i, t] of (templates ?? []).entries()) {
        const data = {
          name: t.name.trim(), startMin: t.startMin, endMin: t.endMin, sortOrder: i + 1,
          isActive: t.isActive ?? true, ...(t.color ? { color: t.color } : {}),
        };
        // Không xoá ca cũ (lịch đã xếp còn tham chiếu) — chỉ tắt "Đang dùng"
        const saved = t.id
          ? await tx.shiftTemplate.update({ where: { id: t.id }, data })
          : await tx.shiftTemplate.create({ data: { ...data, code: codeFromName(t.name, taken) } });
        taken.add(saved.code);
        for (const s of t.staffing ?? []) {
          await tx.staffingRule.upsert({
            where: { shiftTemplateId_role: { shiftTemplateId: saved.id, role: s.role } },
            update: { weekdayCount: s.weekdayCount, weekendCount: s.weekendCount },
            create: { shiftTemplateId: saved.id, role: s.role, weekdayCount: s.weekdayCount, weekendCount: s.weekendCount },
          });
        }
      }
    });

    const me = (req as StaffRequest).staffRow!;
    audit(me.id, "HR_CONFIG_UPDATE", "Cấu hình ca & chấm công");
    res.json(await load());
  });

  return r;
}
