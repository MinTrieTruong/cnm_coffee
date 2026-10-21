import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { attachStaff, requireRoles } from "../middleware/staff.js";

export function postsRouter(prisma: PrismaClient) {
  const r = Router();
  const adminOnly = [attachStaff(prisma), requireRoles("Admin")];
  // Website của cả chuỗi — chỉ Chủ chuỗi đăng bài
  const owner = [attachStaff(prisma), requireRoles("Owner")];

  /** GET /posts — danh sách bài đăng công khai (khách xem) */
  r.get("/posts", async (_req, res) => {
    const rows = await prisma.post.findMany({
      where: { isPublished: true },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      select: {
        id: true, title: true, body: true,
        imageUrl: true, pinned: true, createdAt: true, updatedAt: true,
      },
    });
    res.json(rows);
  });

  /** GET /posts/gallery — mock gallery endpoint */
  r.get("/posts/gallery", async (_req, res) => {
    const mockGallery = [
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1445116572660-236099ce83f0?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&q=80&w=800",
      "https://images.unsplash.com/photo-1600093463592-8e36ae95ef56?auto=format&fit=crop&q=80&w=800"
    ];
    res.json(mockGallery);
  });

  /** GET /posts/admin — tất cả bài (kể cả ẩn) */
  r.get("/posts/admin", ...adminOnly, async (_req, res) => {
    const rows = await prisma.post.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    });
    res.json(rows);
  });

  /** GET /posts/:id — chi tiết bài đăng công khai
   *  (khai báo SAU /posts/gallery và /posts/admin, nếu không :id sẽ bắt mất các đường dẫn đó) */
  r.get("/posts/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ." });
    
    const post = await prisma.post.findUnique({
      where: { id },
    });
    
    if (!post || !post.isPublished) {
      return res.status(404).json({ error: "Không tìm thấy bài viết." });
    }
    
    res.json(post);
  });

  /** POST /posts — tạo bài mới */
  r.post("/posts", ...owner, async (req, res) => {
    const { title, body, imageUrl, pinned, isPublished } = req.body as {
      title: string; body: string;
      imageUrl?: string | null; pinned?: boolean; isPublished?: boolean;
    };
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "Tiêu đề và nội dung là bắt buộc." });
    }
    const post = await prisma.post.create({
      data: {
        title: title.trim(),
        body: body.trim(),
        imageUrl: imageUrl?.trim() || null,
        pinned: pinned ?? false,
        isPublished: isPublished ?? true,
      },
    });
    res.status(201).json(post);
  });

  /** PATCH /posts/:id — sửa bài */
  r.patch("/posts/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ." });
    const { title, body, imageUrl, pinned, isPublished } = req.body as Partial<{
      title: string; body: string;
      imageUrl: string | null; pinned: boolean; isPublished: boolean;
    }>;
    const updated = await prisma.post.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(body !== undefined && { body: body.trim() }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl?.trim() || null }),
        ...(pinned !== undefined && { pinned }),
        ...(isPublished !== undefined && { isPublished }),
      },
    });
    res.json(updated);
  });

  /** DELETE /posts/:id — xóa bài */
  r.delete("/posts/:id", ...owner, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ." });
    await prisma.post.delete({ where: { id } });
    res.json({ ok: true });
  });

  return r;
}
