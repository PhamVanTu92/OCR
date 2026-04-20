#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh  –  Build & deploy OCR Intelligent lên Ubuntu server
#
# Sử dụng:
#   bash deploy.sh                  # build bình thường
#   bash deploy.sh --no-cache       # build lại toàn bộ từ đầu
#   bash deploy.sh --install-docker # cài Docker trước rồi deploy
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BUILD_FLAGS=""
INSTALL_DOCKER=0

for arg in "${@:-}"; do
    case "$arg" in
        --no-cache)       BUILD_FLAGS="--no-cache" ;;
        --install-docker) INSTALL_DOCKER=1 ;;
    esac
done

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║      OCR Intelligent – Deploy Production     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 0. Cài Docker nếu yêu cầu hoặc chưa có ───────────────────────────────────
install_docker() {
    echo "📦  Cài đặt Docker Engine + Compose plugin..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq ca-certificates curl gnupg lsb-release
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
         https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
                                 docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable --now docker
    # Cho phép user hiện tại chạy docker không cần sudo
    sudo usermod -aG docker "$USER"
    echo "✅  Docker đã cài xong. Logout & login lại để dùng docker không cần sudo."
}

if [ "$INSTALL_DOCKER" = "1" ]; then
    install_docker
elif ! command -v docker &>/dev/null; then
    echo "❌  Docker chưa được cài. Chạy:"
    echo "    bash deploy.sh --install-docker"
    exit 1
fi

# ── 1. Kiểm tra Docker Compose v2 ─────────────────────────────────────────────
if ! docker compose version &>/dev/null; then
    echo "❌  Cần Docker Compose v2 (docker compose plugin)."
    echo "    Chạy: bash deploy.sh --install-docker"
    exit 1
fi

# ── 2. Kiểm tra file .env ────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "⚠️  Chưa có .env – copy từ .env.example"
        cp .env.example .env
        echo "❗  Hãy chỉnh sửa .env cho đúng thông số rồi chạy lại:"
        echo "    nano .env"
        exit 1
    fi
    echo "❌  Không tìm thấy file .env"
    echo "    Hãy: cp .env.example .env && nano .env"
    exit 1
fi
echo "✅  File .env tồn tại"

# ── 3. Pull code mới nhất ─────────────────────────────────────────────────────
if git remote get-url origin &>/dev/null 2>&1; then
    echo "📥  Pulling code mới nhất từ remote..."
    git pull origin "$(git rev-parse --abbrev-ref HEAD)"
else
    echo "ℹ️   Không có remote git – bỏ qua git pull"
fi

# ── 4. Build images ──────────────────────────────────────────────────────────
echo ""
echo "🔨  Building Docker images... ${BUILD_FLAGS:+(no-cache)}"
docker compose build $BUILD_FLAGS

# ── 5. Khởi động container ────────────────────────────────────────────────────
echo ""
echo "🚀  Starting containers..."
docker compose up -d --remove-orphans

# ── 6. Chờ backend healthy ───────────────────────────────────────────────────
echo ""
echo "⏳  Chờ backend khởi động (tối đa 2 phút)..."
HEALTHY=0
for i in {1..40}; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' ocr_backend 2>/dev/null || echo "starting")
    if [ "$STATUS" = "healthy" ]; then
        HEALTHY=1
        break
    fi
    printf "   [%d/40] status: %s\r" "$i" "$STATUS"
    sleep 3
done
echo ""

if [ "$HEALTHY" = "1" ]; then
    echo "✅  Backend healthy!"
else
    echo "⚠️  Backend chưa healthy sau 2 phút – xem logs:"
    echo "    docker compose logs --tail=50 backend"
fi

# ── 7. Dọn images cũ ─────────────────────────────────────────────────────────
echo ""
echo "🧹  Dọn dẹp images không còn dùng..."
docker image prune -f

# ── 8. Tóm tắt ───────────────────────────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║              ✅  Deploy thành công!                ║"
echo "╠════════════════════════════════════════════════════╣"
printf "║  🌐  App:      http://%-30s║\n" "${SERVER_IP}:8019"
printf "║  📚  API docs: http://%-30s║\n" "${SERVER_IP}:8019/api/v1/docs"
echo "╠════════════════════════════════════════════════════╣"
echo "║  Lệnh hữu ích:                                     ║"
echo "║    docker compose ps                               ║"
echo "║    docker compose logs -f backend                  ║"
echo "║    docker compose logs -f frontend                 ║"
echo "║    docker compose restart backend                  ║"
echo "║    docker compose down                             ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""
