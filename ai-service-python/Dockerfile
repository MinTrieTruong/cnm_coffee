FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# Mặc định nghe IPv4 (docker-compose). Trên Railway đặt biến HOST=:: để nghe IPv6 (mạng nội bộ Railway).
ENV HOST=0.0.0.0 PORT=8000
CMD ["sh", "-c", "exec uvicorn main:app --host \"$HOST\" --port \"$PORT\""]
