#!/usr/bin/env bash
#
# 把 `dist/` 发布到 GitHub Pages（`gh-pages` 分支）。
#
# 这个脚本的**重点不是推送，是拒绝推送**：任何一道验收过不去就停下。
# 顺序固定为
#
#   1. 工作区必须是干净的（否则"发出去的这版"对应不上任何一个提交）
#   2. 构建（typecheck → 现取测试收据的验收摘要页 → vite build，基路径由远端推导）
#   3. PWA 静态验收          scripts/verify-pwa.mjs
#   4. 真实浏览器验收（本地，按部署基路径托管）  scripts/acceptance.mjs --base=…
#   5. 推送 dist/ 到 gh-pages
#   6. 等 GitHub 构建完成，再对**线上 URL** 跑一遍真实浏览器验收（--url=…）
#
# 第 4 步验的是"我本地按部署路径托管的那份"，第 6 步验的才是"工程师真正打开的那一份"——
# 两步都要，因为两者不是同一件东西。
#
# 用法：
#   nix develop --command pnpm deploy:pages
#   CHROMIUM_BIN=/path/to/chromium scripts/deploy-pages.sh
#
# 选项：
#   --base=/<repo>/     覆盖部署基路径（默认由 origin 远端推导）
#   --branch=<name>     目标分支（默认 gh-pages）
#   --allow-dirty       允许在工作区有未提交改动时部署（会在验收摘要页上留痕）
#   --skip-live         跳过第 6 步（线上验收）——只在明确知道线上还没就绪时用
#
set -euo pipefail

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SELF="$REPO_DIR/$(basename "${BASH_SOURCE[0]}")"
cd "$REPO_DIR"

BASE_OVERRIDE=''
BRANCH='gh-pages'
ALLOW_DIRTY=0
SKIP_LIVE=0

for arg in "$@"; do
  case "$arg" in
    --base=*) BASE_OVERRIDE="${arg#*=}" ;;
    --branch=*) BRANCH="${arg#*=}" ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --skip-live) SKIP_LIVE=1 ;;
    -h | --help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      echo "✗ 未知参数：$arg（--help 看用法）" >&2
      exit 2
      ;;
  esac
done

say() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

# ── 0. 环境：NixOS 上 PATH 里没有 pnpm，自动进 devShell 再来一遍 ──────
if ! command -v pnpm >/dev/null 2>&1; then
  if [ -z "${WES_DEPLOY_IN_SHELL:-}" ] && command -v nix >/dev/null 2>&1; then
    echo "PATH 中没有 pnpm，改用 flake devShell 重跑（nix develop）"
    export WES_DEPLOY_IN_SHELL=1
    exec nix develop --command bash "$SELF" "$@"
  fi
  echo "✗ 找不到 pnpm，也没有可用的 nix develop。请在 devShell 内运行。" >&2
  exit 2
fi

# ── 1. 远端与部署坐标 ────────────────────────────────────────────────
REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)
if [ -z "$REMOTE_URL" ]; then
  echo "✗ 未配置 origin 远端，无法确定发布目标。" >&2
  exit 2
fi

# git@github.com:owner/repo.git 与 https://github.com/owner/repo.git 都接
SLUG=$(printf '%s' "$REMOTE_URL" | sed -E 's#^(git@[^:]+:|https?://[^/]+/)##; s#\.git$##')
OWNER=${SLUG%%/*}
NAME=${SLUG##*/}
if [ -z "$OWNER" ] || [ -z "$NAME" ] || [ "$OWNER" = "$SLUG" ]; then
  echo "✗ 无法从远端解析 owner/repo：$REMOTE_URL" >&2
  exit 2
fi

if [ -n "$BASE_OVERRIDE" ]; then
  BASE_PATH="/${BASE_OVERRIDE#/}"
  BASE_PATH="${BASE_PATH%/}/"
else
  BASE_PATH="/${NAME}/"
fi
# 用户站（owner.github.io）部署在域名根，不需要子路径
if [ "$NAME" = "${OWNER}.github.io" ]; then BASE_PATH='/'; fi

PAGES_URL="https://${OWNER,,}.github.io${BASE_PATH}"
COMMIT=$(git rev-parse HEAD)
COMMIT_SHORT=$(git rev-parse --short=7 HEAD)

say "发布目标"
printf '  仓库：    %s/%s\n' "$OWNER" "$NAME"
printf '  分支：    %s\n' "$BRANCH"
printf '  站点地址：%s\n' "$PAGES_URL"
printf '  提交：    %s\n' "$COMMIT_SHORT"
printf '  基路径：  %s\n' "$BASE_PATH"

# ── 2. 工作区必须干净 ────────────────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  if [ "$ALLOW_DIRTY" -eq 1 ]; then
    echo "⚠️  工作区有未提交改动（--allow-dirty）：线上那版**对应不上任何提交**，验收摘要页会写明这一点。"
  else
    echo "✗ 工作区有未提交改动 —— 先提交再发布。确实要发未提交的状态，用 --allow-dirty。" >&2
    git status --short >&2
    exit 1
  fi
fi

# ── 3. 构建 ──────────────────────────────────────────────────────────
say "构建（VITE_BASE=${BASE_PATH}）"
VITE_BASE="$BASE_PATH" pnpm run build

# ── 4. 静态验收 ──────────────────────────────────────────────────────
say "PWA 静态验收"
node scripts/verify-pwa.mjs

# ── 5. 真实浏览器验收（本地，按部署基路径托管）───────────────────────
resolve_chromium() {
  if [ -n "${CHROMIUM_BIN:-}" ] && [ -x "${CHROMIUM_BIN}" ]; then
    printf '%s' "$CHROMIUM_BIN"
    return 0
  fi
  for n in chromium chromium-browser google-chrome google-chrome-stable; do
    if command -v "$n" >/dev/null 2>&1; then
      command -v "$n"
      return 0
    fi
  done
  return 1
}

CHROME=$(resolve_chromium || true)
if [ -z "$CHROME" ]; then
  echo "✗ 找不到 Chromium —— 浏览器验收**没跑**，因此这次发布不算通过。" >&2
  echo "  设 CHROMIUM_BIN=<可执行文件> 或把 chromium 放进 PATH 后重试。" >&2
  exit 1
fi
say "真实浏览器验收（本地：${PAGES_URL} 的等价物）"
CHROMIUM_BIN="$CHROME" node scripts/acceptance.mjs --base="$BASE_PATH"

# ── 6. 推送 dist/ 到 gh-pages ────────────────────────────────────────
say "发布到 ${BRANCH}"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -R dist/. "$STAGE/"
touch "$STAGE/.nojekyll" # 关掉 Jekyll：不处理、不忽略下划线开头的文件

AUTHOR_NAME=$(git config user.name || true)
AUTHOR_EMAIL=$(git config user.email || true)
AUTHOR_NAME=${AUTHOR_NAME:-$(git log -1 --format='%an' 2>/dev/null || echo deploy)}
AUTHOR_EMAIL=${AUTHOR_EMAIL:-$(git log -1 --format='%ae' 2>/dev/null || echo deploy@localhost)}

git -C "$STAGE" init -q
git -C "$STAGE" checkout -q -b "$BRANCH"
git -C "$STAGE" add -A
git -C "$STAGE" -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_EMAIL" \
  commit -q -m "deploy: ${COMMIT_SHORT} → ${PAGES_URL}"
git -C "$STAGE" remote add origin "$REMOTE_URL"
# 该分支是纯产物分支（每次整体重建），故用 --force 覆盖，不留半新半旧的树
git -C "$STAGE" push -q --force origin "$BRANCH"
echo "  已推送 gh-pages（${COMMIT_SHORT}）"

# ── 7. 确保 Pages 已启用，并等它构建完 ───────────────────────────────
if command -v gh >/dev/null 2>&1; then
  if gh api "repos/$OWNER/$NAME/pages" >/dev/null 2>&1; then
    echo "  Pages 已启用"
  else
    echo "  正在启用 Pages（source: $BRANCH /）…"
    gh api -X POST "repos/$OWNER/$NAME/pages" \
      -f "source[branch]=$BRANCH" -f 'source[path]=/' >/dev/null
  fi

  say "等待 GitHub Pages 构建"
  built=0
  for i in $(seq 1 60); do
    status=$(gh api "repos/$OWNER/$NAME/pages/builds/latest" --jq '.status' 2>/dev/null || echo unknown)
    if [ "$status" = 'built' ]; then built=1; break; fi
    if [ "$status" = 'errored' ]; then
      echo "✗ Pages 构建失败（status=errored）" >&2
      gh api "repos/$OWNER/$NAME/pages/builds/latest" --jq '.error' >&2 || true
      exit 1
    fi
    sleep 5
  done
  if [ "$built" -ne 1 ]; then
    echo "✗ 等待 Pages 构建超时（最后一次 status=${status}）" >&2
    exit 1
  fi
  echo "  构建完成"
else
  echo "⚠️  没有 gh 命令，跳过 Pages 启用与构建状态检查"
fi

# ── 8. 线上验收（这一步才是"工程师打开的那一份"）────────────────────
if [ "$SKIP_LIVE" -eq 1 ]; then
  echo "⚠️  --skip-live：**线上验收没有做**，这次发布不构成'已验收'。"
  exit 0
fi

say "线上验收：${PAGES_URL}"
CHROMIUM_BIN="$CHROME" node scripts/acceptance.mjs --url="$PAGES_URL"

say "完成"
printf '  站点：%s\n  对应提交：%s\n' "$PAGES_URL" "$COMMIT_SHORT"
