#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh  –  Deploy OCR Intelligent lên production (Ubuntu + Docker)
# Sử dụng: bash deploy.sh [--no-cache]
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
    echo "    Hãy copy và chỉnh sửa: cp .env.example .env"
    exit 1
fi

# ── Pull code mới nhất ────────────────────────────────────────────────────────
echo "📥  Pulling code mới nhất..."
git pull origin main

# ── Build images ──────────────────────────────────────────────────────────────
echo ""
echo "🔨  Building Docker images..."
docker compose build $BUILD_FLAGS

# ── Khởi động (zero-downtime swap) ───────────────────────────────────────────
echo ""
echo "🚀  Starting containers..."
docker compose up -d --remove-orphans

# ── Chờ backend healthy ───────────────────────────────────────────────────────
echo ""
echo "⏳  Chờ backend khởi động..."
for i in {1..30}; do
    if docker compose exec -T backend curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅  Backend healthy!"
        break
    fi
    echo "   Thử lần $i/30..."
    sleep 3
done

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
echo "║  🌐  http://${SERVER_IP}"
echo "║  📋  Logs: docker compose logs -f"
echo "╚══════════════════════════════════════════════╝"
echo ""
