# Hướng dẫn Deploy OCR Intelligent lên Ubuntu

## Yêu cầu máy chủ

- Ubuntu 22.04 LTS (hoặc 20.04)
- RAM tối thiểu 2 GB (khuyến nghị 4 GB)
- Đã có SQL Server và Keycloak (external hoặc cùng máy)

---

## Bước 1 – Cài Docker & Docker Compose

```bash
# Cài đặt Docker Engine
curl -fsSL https://get.docker.com | sudo bash

# Thêm user hiện tại vào group docker (đăng xuất/đăng nhập lại để có hiệu lực)
sudo usermod -aG docker $USER
newgrp docker

# Kiểm tra
docker --version
docker compose version
```

---

## Bước 2 – Clone dự án lên server

```bash
# Clone repo (thay URL thực tế)
git clone https://github.com/your-org/ocr-intelligent.git /opt/ocr
cd /opt/ocr
```

---

## Bước 3 – Tạo file .env

```bash
cp .env.example .env
nano .env
```

Chỉnh các giá trị:

```env
# ── Database (SQL Server) ────────────────────────────────────────────────────
DB_HOST=<IP_SQL_SERVER>
DB_PORT=1433
DB_NAME=ocr_db
DB_USER=sa
DB_PASSWORD=YourStrongPassword123!

# ── Keycloak ─────────────────────────────────────────────────────────────────
KEYCLOAK_URL=https://keycloak.yourcompany.com
KEYCLOAK_REALM=OCR
KEYCLOAK_CLIENT_ID=ocr
KEYCLOAK_CLIENT_SECRET=your-client-secret

# ── Gemini AI ─────────────────────────────────────────────────────────────────
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash

# ── App ───────────────────────────────────────────────────────────────────────
DEBUG=false
SECRET_KEY=random-64-char-string-here
UPLOAD_DIR=./uploads
```

> **Tạo SECRET_KEY ngẫu nhiên:**
> ```bash
> python3 -c "import secrets; print(secrets.token_hex(32))"
> ```

---

## Bước 4 – Build & chạy

```bash
# Lần đầu (build từ đầu)
bash deploy.sh --no-cache

# Những lần sau
bash deploy.sh
```

Truy cập: `http://<IP_SERVER>` hoặc `http://<DOMAIN>`

---

## Bước 5 – HTTPS với Let's Encrypt (khuyến nghị)

```bash
# Cài certbot
sudo apt install -y certbot

# Dừng container đang dùng port 80
docker compose down

# Lấy certificate (thay domain thực tế)
sudo certbot certonly --standalone -d ocr.yourcompany.com

# Tạo thư mục nginx config với SSL
mkdir -p nginx
```

Tạo file `nginx/nginx-ssl.conf`:

```nginx
server {
    listen 80;
    server_name ocr.yourcompany.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ocr.yourcompany.com;

    ssl_certificate     /etc/letsencrypt/live/ocr.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ocr.yourcompany.com/privkey.pem;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass         http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_read_timeout 120s;
        client_max_body_size 20M;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Lệnh vận hành thường ngày

| Tác vụ | Lệnh |
|--------|------|
| Xem logs realtime | `docker compose logs -f` |
| Xem logs backend | `docker compose logs -f backend` |
| Restart backend | `docker compose restart backend` |
| Dừng tất cả | `docker compose down` |
| Xem trạng thái | `docker compose ps` |
| Vào shell backend | `docker compose exec backend bash` |
| Deploy bản mới | `bash deploy.sh` |

---

## Cấu trúc thư mục

```
/opt/ocr/
├── app/                   # FastAPI source
├── frontend/              # React source + Dockerfile + nginx.conf
├── uploads/               # File uploads (Docker volume)
├── Dockerfile             # Backend image
├── docker-compose.yml     # Orchestration
├── deploy.sh              # Deploy script
└── .env                   # Config (KHÔNG commit file này)
```
