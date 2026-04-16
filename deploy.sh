#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh  –  Build & deploy OCR Intelligent (production)
#
# Sử dụng:
#   bash deploy.sh                  # build bình thường
#   bash deploy.sh --no-cache       # build lại toàn bộ từ đầu
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BUILD_FLAGS=""
if [[ "${1:-}" == "--no-cache" ]]; then
    BUILD_FLAGS="--no-cache"
    echo "⚠️  Build không dùng cache"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║      OCR Intelligent – Deploy Production     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Kiểm tra file .env ────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    echo "❌  Không tìm thấy file .env"
    echo "    Hãy: cp .env.example .env && nano .env"
    exit 1
fi

# ── Pull code mới nhất (bỏ qua nếu chạy lần đầu chưa có remote) ──────────────
if git remote get-url origin &>/dev/null; then
    echo "📥  Pulling code mới nhất..."
    git pull origin main
else
    echo "ℹ️   Không có remote git – bỏ qua git pull"
fi

# ── Build images ──────────────────────────────────────────────────────────────
echo ""
echo "🔨  Building Docker images..."
docker compose build $BUILD_FLAGS

# ── Khởi động ─────────────────────────────────────────────────────────────────
echo ""
echo "🚀  Starting containers..."
docker compose up -d --remove-orphans

# ── Chờ backend healthy ───────────────────────────────────────────────────────
echo ""
echo "⏳  Chờ backend khởi động..."
HEALTHY=0
for i in {1..40}; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' ocr_backend 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "healthy" ]; then
        HEALTHY=1
        break
    fi
    printf "   [%d/40] %s\r" "$i" "$STATUS"
    sleep 3
done
echo ""

if [ "$HEALTHY" = "1" ]; then
    echo "✅  Backend healthy!"
else
    echo "⚠️  Backend chưa healthy sau 2 phút – kiểm tra logs:"
    echo "    docker compose logs backend"
fi

# ── Dọn images cũ ────────────────────────────────────────────────────────────
echo ""
echo "🧹  Dọn dẹp images không dùng..."
docker image prune -f

# ── Done ─────────────────────────────────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║             ✅  Deploy thành công!           ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  🌐  http://${SERVER_IP}:8019  (nội bộ)"
echo "║  📋  Logs: docker compose logs -f"
echo "║  🔍  Status: docker compose ps"
echo "╚══════════════════════════════════════════════╝"
echo ""
