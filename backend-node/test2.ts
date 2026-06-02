import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

async function run() {
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.staff.findFirst({ where: { role: 'Admin' } });
    if (!admin) throw new Error('No admin found');
    const token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET || 'change-me-in-production', { expiresIn: '12h' });
    const res = await fetch('http://localhost:4000/api/admin/products', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(res.status, res.statusText);
    const text = await res.text();
    console.log(text.substring(0, 200));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
