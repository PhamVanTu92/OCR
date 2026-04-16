# Hướng dẫn Deploy OCR Intelligent lên Ubuntu Production

## Kiến trúc

```
Internet
   │  HTTPS (443)
   ▼
Host Nginx  ──→  redirect HTTP→HTTPS, SSL termination
   │  localhost:8019
   ▼
Docker: ocr_frontend (Nginx)  ──→  serve React SPA
   │  proxy /api/* → http://backend:8000
   ▼
Docker: ocr_backend (FastAPI)  ──→  kết nối SQL Server & Keycloak
```

---

## Yêu cầu

| Thành phần | Yêu cầu |
|---|---|
| OS | Ubuntu 22.04 LTS |
| RAM | ≥ 2 GB (4 GB khuyến nghị) |
| Domain | Đã trỏ A record về IP server |
| SQL Server | External (hoặc cùng máy, port 1433 mở) |
| Keycloak | External (ví dụ: https://keycloak.yourcompany.com) |

---

## Bước 1 – Upload code lên server

**Cách A – Git clone:**
```bash
git clone https://github.com/your-org/ocr-intelligent.git /opt/ocr
cd /opt/ocr
```

**Cách B – Copy thủ công từ Windows:**
```bash
# Chạy trên Windows (PowerShell)
scp -r E:\Project\OCR ubuntu@<SERVER_IP>:/opt/ocr
```

---

## Bước 2 – Tạo file .env

```bash
cd /opt/ocr
cp .env.example .env
nano .env
```

Điền đầy đủ:

```env
# Database
DB_HOST=<IP_hoặc_hostname_SQL_Server>
DB_PORT=1433
DB_NAME=ocr_db
DB_USER=sa
DB_PASSWORD=YourStrongPassword123!

# Keycloak
KEYCLOAK_URL=https://keycloak.yourcompany.com
KEYCLOAK_REALM=OCR
KEYCLOAK_CLIENT_ID=ocr
KEYCLOAK_CLIENT_SECRET=your-secret-here
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin-password

# Gemini AI
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash

# App
DEBUG=false
SECRET_KEY=<chạy: python3 -c "import secrets; print(secrets.token_hex(32))">
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

---

## Bước 3 – Setup server (1 lần duy nhất)

Script này tự động:
- Cài Docker, Nginx, Certbot
- Lấy SSL certificate từ Let's Encrypt
- Cấu hình nginx reverse proxy (HTTP → HTTPS → Docker port 8019)
- Đặt cron auto-renew certificate

```bash
sudo bash setup-server.sh ocr.yourcompany.com
```

> ⚠️ Domain phải đã trỏ A record về IP server trước khi chạy lệnh này.

---

## Bước 4 – Build & chạy

```bash
bash deploy.sh --no-cache
```

Lần đầu build mất khoảng **3–5 phút** (tải ODBC driver, npm install...).

Khi thành công, truy cập: **https://ocr.yourcompany.com**

---

## Cập nhật phiên bản mới

```bash
cd /opt/ocr
git pull origin main
bash deploy.sh
```

---

## Lệnh vận hành

```bash
# Xem trạng thái
docker compose ps

# Xem logs realtime
docker compose logs -f

# Xem log riêng backend
docker compose logs -f backend

# Restart backend (không rebuild)
docker compose restart backend

# Rebuild và deploy lại
bash deploy.sh

# Dừng tất cả
docker compose down

# Vào shell backend để debug
docker compose exec backend bash
```

---

## Cấu trúc file

```
/opt/ocr/
├── app/                    # FastAPI source code
├── frontend/               # React source + Dockerfile + nginx.conf
│   ├── Dockerfile          # Multi-stage: Node build → Nginx serve
│   └── nginx.conf          # Nginx: serve SPA + proxy /api/ → backend
├── scripts/                # DB migration scripts
├── uploads/                # File uploads (Docker volume)
├── Dockerfile              # Backend image (Python + ODBC + FastAPI)
├── docker-compose.yml      # Orchestration (backend + frontend)
├── nginx-host.conf         # Template nginx host (tham khảo)
├── setup-server.sh         # Script cài đặt server lần đầu
├── deploy.sh               # Script deploy
├── .env                    # Config production (KHÔNG commit)
└── .env.example            # Template .env
```

---

## Xử lý sự cố

### Backend không khởi động
```bash
docker compose logs backend
# Thường do: sai DB_HOST, DB_PASSWORD, hoặc SQL Server chưa mở port 1433
```

### Lỗi SSL / Let's Encrypt
```bash
# Kiểm tra domain đã trỏ đúng chưa
dig +short ocr.yourcompany.com

# Gia hạn cert thủ công
sudo certbot renew --dry-run
```

### 502 Bad Gateway
```bash
# Backend chưa healthy
docker compose ps
docker compose logs backend --tail 50
```

### Reset hoàn toàn (xóa data)
```bash
docker compose down -v    # -v xóa cả volumes (MẤT DATA UPLOADS)
docker compose up -d
```
