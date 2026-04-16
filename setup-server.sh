#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-server.sh  –  Cài đặt môi trường server Ubuntu lần đầu
#
# Sử dụng: sudo bash setup-server.sh <domain>
# Ví dụ:   sudo bash setup-server.sh ocr.yourcompany.com
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:-}"

if [ -z "$DOMAIN" ]; then
    echo "❌  Thiếu domain!"
    echo "    Sử dụng: sudo bash setup-server.sh <domain>"
    echo "    Ví dụ:   sudo bash setup-server.sh ocr.yourcompany.com"
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        OCR Intelligent – Server Setup        ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Domain: $DOMAIN"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Cập nhật hệ thống ──────────────────────────────────────────────────────
echo "📦  Cập nhật hệ thống..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Cài Docker ─────────────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "🐳  Cài Docker..."
    curl -fsSL https://get.docker.com | bash
    # Thêm user hiện tại vào group docker
    SUDO_USER_NAME="${SUDO_USER:-$(logname 2>/dev/null || echo '')}"
    if [ -n "$SUDO_USER_NAME" ] && [ "$SUDO_USER_NAME" != "root" ]; then
        usermod -aG docker "$SUDO_USER_NAME"
        echo "    Đã thêm '$SUDO_USER_NAME' vào group docker"
    fi
else
    echo "✅  Docker đã cài: $(docker --version)"
fi

# ── 3. Cài Nginx ──────────────────────────────────────────────────────────────
if ! command -v nginx &> /dev/null; then
    echo "🌐  Cài Nginx..."
    apt-get install -y -qq nginx
    systemctl enable nginx
else
    echo "✅  Nginx đã cài: $(nginx -v 2>&1)"
fi

# ── 4. Cài Certbot ────────────────────────────────────────────────────────────
if ! command -v certbot &> /dev/null; then
    echo "🔐  Cài Certbot..."
    apt-get install -y -qq certbot python3-certbot-nginx
else
    echo "✅  Certbot đã cài: $(certbot --version)"
fi

# ── 5. Tạo webroot cho certbot ────────────────────────────────────────────────
mkdir -p /var/www/certbot

# ── 6. Copy nginx config ──────────────────────────────────────────────────────
echo "⚙️   Cấu hình Nginx cho domain: $DOMAIN"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Tạo config tạm (chỉ HTTP) để lấy cert
cat > /etc/nginx/sites-available/ocr <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:8019;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 20M;
        proxy_read_timeout 120s;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/ocr /etc/nginx/sites-enabled/ocr
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t && systemctl reload nginx
echo "    Nginx đã load config HTTP"

# ── 7. Lấy SSL certificate ────────────────────────────────────────────────────
echo ""
echo "🔐  Lấy SSL certificate từ Let's Encrypt cho: $DOMAIN"
echo "    (đảm bảo domain đã trỏ A record về IP máy chủ này)"
echo ""

certbot --nginx \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    --redirect

# ── 8. Copy nginx config đầy đủ sau khi có cert ───────────────────────────────
# Sau certbot, nó đã tự cập nhật config – ta chỉ cần thêm headers & timeout
cat > /etc/nginx/sites-available/ocr <<EOF
# Redirect HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    add_header X-Frame-Options        "SAMEORIGIN"    always;
    add_header X-Content-Type-Options "nosniff"       always;
    add_header Referrer-Policy        "strict-origin" always;

    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:8019;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout  120s;
        proxy_send_timeout  120s;
        proxy_connect_timeout 10s;
    }
}
EOF

nginx -t && systemctl reload nginx

# ── 9. Auto-renew certificate ─────────────────────────────────────────────────
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       ✅  Server setup hoàn tất!             ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  🌐  https://$DOMAIN"
echo "║"
echo "║  Bước tiếp theo:"
echo "║  1. Đảm bảo đã có file .env"
echo "║  2. Chạy: bash deploy.sh --no-cache"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "⚠️  Nếu user không phải root, hãy logout & login lại"
echo "   để áp dụng quyền docker group."
echo ""
