# Bước 1: build giao diện React (Vite)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# URL công khai của API, ví dụ https://tdcoffee.vn (cùng tên miền với web)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# Dùng `vite build` (bỏ qua tsc) — kiểm tra kiểu chạy riêng trong CI
RUN npx vite build

# Bước 2: Caddy vừa phục vụ file tĩnh, vừa làm reverse proxy + tự cấp HTTPS
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
