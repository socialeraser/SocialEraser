#!/bin/bash
# start-mcp.sh
# 一键启动 MCP 浏览器环境（Chrome 带调试端口 + chrome-devtools-mcp 服务）
# 适用于 X-Eraser 调试、以及其他需要登录态、要操作用户浏览器的项目
#
# 用法：
#   chmod +x scripts/start-mcp.sh
#   ./scripts/start-mcp.sh
#
# 配套：
#   ./scripts/stop-mcp.sh  关闭 Chrome + 清理 profile

set -e

CHROME_PORT=9222
CHROME_PROFILE=/tmp/eraser-chrome-profile
CHROME_LOG=/tmp/chrome-eraser.log

echo "=== start-mcp.sh ==="
echo ""

# 1. 杀干净旧 Chrome
echo "[1/4] 杀掉所有 Chrome 进程..."
pkill -9 "Google Chrome" 2>/dev/null || true
sleep 2

# 2. 准备独立 profile（避开 macOS 集成，强制新开实例）
echo "[2/4] 准备独立 Chrome profile: $CHROME_PROFILE"
mkdir -p "$CHROME_PROFILE"

# 3. 启动 Chrome（带调试端口 + 独立 profile）
echo "[3/4] 启动 Chrome (port=$CHROME_PORT)..."
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=$CHROME_PORT \
  --user-data-dir=$CHROME_PROFILE \
  > "$CHROME_LOG" 2>&1 &
CHROME_PID=$!
echo "    Chrome PID=$CHROME_PID"
echo "    日志: $CHROME_LOG"

# 4. 验证 9222 在监听
echo "[4/4] 验证端口..."
sleep 3
if lsof -iTCP:$CHROME_PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "    ✅ Chrome 在监听 $CHROME_PORT"
else
  echo "    ❌ Chrome 没在监听 $CHROME_PORT"
  echo "    看日志: tail -50 $CHROME_LOG"
  exit 1
fi

echo ""
echo "=== 完成 ==="
echo ""
echo "下一步："
echo "  1. 在新 Chrome 窗口里登录 X / 你要操作的网站"
echo "  2. 重启 Trae（Cmd+Q → 重开）"
echo "  3. 看 Trae 工具列表有没有 mcp__chrome-devtools__* 一组工具"
echo "  4. 告诉 AI 「好了」"
echo ""
echo "可选：另开终端跑 MCP 服务进程（Trae 自己会启，但手动跑能看到日志）："
echo "  npx chrome-devtools-mcp@latest --browserUrl=http://localhost:$CHROME_PORT"
echo ""
echo "关闭："
echo "  ./scripts/stop-mcp.sh"
