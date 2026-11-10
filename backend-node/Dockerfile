# Backend API (Express + Prisma + Socket.io)
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
# Giữ cả devDependencies: cần `prisma` CLI (db push) và `tsx` (chạy seed lần đầu)
RUN npm ci --no-audit --no-fund

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
# Đồng bộ schema (không xoá dữ liệu: nếu thay đổi có nguy cơ mất dữ liệu, prisma sẽ dừng và báo lỗi) rồi chạy API
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
