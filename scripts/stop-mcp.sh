#!/bin/bash
# stop-mcp.sh
# 关闭 MCP 浏览器环境（杀 Chrome + 清理 profile）
# 配套 start-mcp.sh

set -e

CHROME_PORT=9222
CHROME_PROFILE=/tmp/eraser-chrome-profile

echo "=== stop-mcp.sh ==="
echo ""

# 1. 杀 Chrome
echo "[1/2] 杀掉 Chrome 进程..."
pkill -9 "Google Chrome" 2>/dev/null || true
sleep 1

# 2. 清 profile
echo "[2/2] 清理独立 profile: $CHROME_PROFILE"
if [ -d "$CHROME_PROFILE" ]; then
  rm -rf "$CHROME_PROFILE"
  echo "    ✅ 已删除"
else
  echo "    目录不存在，跳过"
fi

# 3. 验证 9222 不在监听
if lsof -iTCP:$CHROME_PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "    ⚠️  端口 $CHROME_PORT 还有别的进程监听"
  lsof -iTCP:$CHROME_PORT -sTCP:LISTEN
else
  echo "    ✅ 端口 $CHROME_PORT 已释放"
fi

echo ""
echo "=== 完成 ==="
echo ""
echo "下次启动："
echo "  ./scripts/start-mcp.sh"
