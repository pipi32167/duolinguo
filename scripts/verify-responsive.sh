#!/usr/bin/env bash
#
# 响应式契约校验 —— 遍历 handoff 指定的 2025–2026 视口矩阵 × 全部路由，
# 断言没有横向溢出，并可选地留存截图。
#
# 用法:
#   scripts/verify-responsive.sh                          # 默认 http://localhost:5173
#   scripts/verify-responsive.sh http://localhost:4173     # 指定地址（如 vite preview）
#   scripts/verify-responsive.sh --shots                   # 同时输出截图到 artifacts/screenshots
#   LINGO_STRICT=1 scripts/verify-responsive.sh            # 缺少浏览器工具时以失败退出
#
# 依赖: agent-browser（可选，缺失时优雅跳过）
set -uo pipefail

BASE="http://localhost:5173"
SHOTS=0
for arg in "$@"; do
  case "$arg" in
    --shots) SHOTS=1 ;;
    http*) BASE="$arg" ;;
    *) echo "未知参数: $arg" >&2; exit 2 ;;
  esac
done

API="${API_BASE:-http://localhost:8787}"
DEVICE="${LINGO_DEVICE:-verify-device-0001}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHOT_DIR="$ROOT/artifacts/screenshots"
TOLERANCE=1   # 整数，bash 的 $(( )) 不支持浮点
NODE_BIN="${NODE_BIN:-node}"

# ---- 依赖检查 ---------------------------------------------------------------
if ! command -v agent-browser >/dev/null 2>&1; then
  echo "⚠️  未安装 agent-browser，跳过响应式校验。"
  echo "   安装: npm i -g agent-browser   (或设置 LINGO_STRICT=1 让此步失败)"
  [ "${LINGO_STRICT:-0}" = "1" ] && exit 1
  exit 0
fi

if ! curl -sf -o /dev/null "$BASE/"; then
  echo "❌ 无法访问 $BASE —— 先跑 'make dev' 或 'make preview'。" >&2
  exit 1
fi

# ---- 视口矩阵（来自 DESIGN-HANDOFF.md） --------------------------------------
VIEWPORTS=(
  "mobile-compact:360:800"
  "mobile-standard:390:844"
  "mobile-large:430:932"
  "foldable-small-tablet:600:960"
  "tablet-portrait:820:1180"
  "tablet-landscape:1024:768"
  "laptop:1366:768"
  "desktop:1440:900"
  "wide:1920:1080"
)

# ---- 路由清单（动态发现依赖数据的深链） --------------------------------------
ROUTES=(/ /learn /deck /review /rank /shop /quests /me /capture /super /tutor /admin)

ITEM_ID="$(curl -sf -H "x-device-id: $DEVICE" -H 'x-target-lang: %E8%8B%B1%E8%AF%AD' \
  "$API/api/items" 2>/dev/null |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.items?.[0]?.id??'')}catch{console.log('')}})" 2>/dev/null || true)"
[ -n "$ITEM_ID" ] && ROUTES+=(/deck/"$ITEM_ID")

LESSON_ID="$(curl -sf -H "x-device-id: $DEVICE" "$API/api/lessons" 2>/dev/null |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.lessons?.[0]?.id??'')}catch{console.log('')}})" 2>/dev/null || true)"
if [ -n "$LESSON_ID" ]; then
  ROUTES+=(/lesson/"$LESSON_ID" /lesson/"$LESSON_ID"/complete)
fi

# ---- 预置 onboarding 状态，否则所有路由都会被重定向到 /onboarding -----------
agent-browser eval "localStorage.setItem('lingo.device','$DEVICE');localStorage.setItem('lingo.profile',JSON.stringify({onboarded:true,lang:'en',langLabel:'英语',dailyGoalMin:10}));'seeded'" >/dev/null 2>&1 || true

[ "$SHOTS" = "1" ] && mkdir -p "$SHOT_DIR"

# ---- 播种演示数据 ---------------------------------------------------------
# 断言里要检查词库行/曲线卡片这类需要数据的结构，所以先给本脚本的设备种一份。
# 纯 SQL，不会调用模型。
if [ -f "$ROOT/scripts/seed.mjs" ]; then
  $NODE_BIN "$ROOT/scripts/seed.mjs" "$DEVICE" >/dev/null 2>&1 || \
    echo "  ⚠ 播种演示数据失败，跳过依赖数据的断言"
fi

echo "\n响应式校验"
echo "  目标   $BASE"
echo "  视口   ${#VIEWPORTS[@]} 个   (容差 ${TOLERANCE}px)"
echo "  路由   ${#ROUTES[@]} 条"
echo

FAIL=0
CHECKED=0

probe() {
  # 返回 "scrollWidth\tculprits"，或 -1 表示探测失败
  agent-browser eval 'JSON.stringify({sw:document.documentElement.scrollWidth,iw:window.innerWidth,culprits:[...document.querySelectorAll("*")].filter(e=>e.getBoundingClientRect().right>window.innerWidth+1.5&&e.getBoundingClientRect().width>40).slice(0,3).map(e=>(typeof e.className==="string"&&e.className)||e.tagName)})' 2>/dev/null |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(JSON.parse(s));console.log(String(j.sw)+'\\t'+(j.culprits||[]).join(','))}catch{console.log('-1\\t')}})" 2>/dev/null || printf -- '-1\t'
}

for vp in "${VIEWPORTS[@]}"; do
  name="${vp%%:*}"; rest="${vp#*:}"; W="${rest%%:*}"; H="${rest##*:}"
  agent-browser set viewport "$W" "$H" >/dev/null 2>&1

  for route in "${ROUTES[@]}"; do
    agent-browser open "$BASE$route" >/dev/null 2>&1
    sleep 0.4
    out="$(probe)"
    sw="$(printf '%s' "$out" | cut -f1)"
    culprits="$(printf '%s' "$out" | cut -f2)"
    CHECKED=$((CHECKED + 1))

    # 容差只在探测成功时才有意义
    if [ -n "$sw" ] && [ "$sw" != "-1" ] && [ "$sw" -gt 0 ] && [ "$sw" -gt $((W + TOLERANCE)) ]; then
      FAIL=1
      printf '  \033[31m✗\033[0m %-22s %s\n' "${W}x${H}" "$route"
      printf '      scrollWidth=%s (> %s)  %s\n' "$sw" "$W" "$culprits"
    fi

    if [ "$SHOTS" = "1" ] && [ "$route" != "/" ]; then
      slug="$(printf '%s' "$route" | tr '/:' '__' | sed 's/__$//')"
      agent-browser screenshot "$SHOT_DIR/${name}${slug}.png" >/dev/null 2>&1
    fi
  done
  printf '  \033[32m✓\033[0m %-22s %sx%s\n' "$name" "$W" "$H"
done

echo
if [ "$FAIL" = "0" ]; then
  echo "✅ ${CHECKED} 个组合全部通过，无横向溢出。"
else
  echo "❌ 存在横向溢出，见上方明细。"
fi

# ---- 设计契约断言 -----------------------------------------------------------
# 光看 scrollWidth 抓不到「CSS 选择器写错、样式根本没生效」这类问题。
# 这里直接测量关键视觉原语的 computed style。
read -r -d '' ASSERTION_JS <<'JS'
JSON.stringify((() => {
  // 用探针元素测量原语本身。直接 querySelector('.btn') 会抓到页面上恰好
  // 存在的变体（.btn-sm / .btn-gold…），把它的圆角和边色当成默认值上报。
  const probe = (cls, text) => {
    const el = document.createElement('button');
    el.className = cls;
    if (text) el.textContent = text;
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const style = {
      boxShadow: cs.boxShadow,
      borderRadius: cs.borderRadius,
      background: cs.backgroundColor,
      fontWeight: cs.fontWeight,
    };
    el.remove();
    return style;
  };

  const out = {
    brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
    brandD: getComputedStyle(document.documentElement).getPropertyValue('--brand-d').trim(),
    btn: probe('btn', '检查'),
    node: probe('node'),
    rail: getComputedStyle(document.querySelector('.rail')).display,
    tabbar: getComputedStyle(document.querySelector('.tabbar')).display,
    fontFamily: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, ''),
  };

  const cur = document.querySelector('.node.is-current');
  const bubble = document.querySelector('.node .bubble');
  if (cur && bubble) {
    const nb = cur.getBoundingClientRect();
    const bb = bubble.getBoundingClientRect();
    out.bubbleCenterOffset = Math.round((bb.left + bb.right) / 2 - (nb.left + nb.right) / 2);
    out.bubbleGapAbove = Math.round(nb.top - bb.bottom);
    out.bubbleAnim = getComputedStyle(bubble).animationName;
    out.bubbleInViewport = bb.left >= 0 && bb.right <= window.innerWidth + 0.5;
  }
  return out;
})())
JS

check_assertions() {
  local W="$1" label="$2" raw
  raw="$(agent-browser eval "$ASSERTION_JS" 2>/dev/null)"
  if [ -z "$raw" ]; then printf '  %s\n' "— ${label}（探测失败，跳过）"; return; fi

  printf '%s' "$raw" | W="$W" LABEL="$label" node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let j;
      try { j = JSON.parse(JSON.parse(s)); }
      catch { console.log("  \u001b[33m?\u001b[0m " + process.env.LABEL + " 探测结果无法解析"); process.exit(3); }

      const W = Number(process.env.W);
      const bad = [];
      const eq = (name, got, want) => {
        if (got !== want) bad.push(name + ": " + JSON.stringify(got) + " \u2260 " + JSON.stringify(want));
      };
      const has = (name, got, needle) => {
        if (!String(got || "").includes(needle)) bad.push(name + ": " + JSON.stringify(got) + " 缺少 " + JSON.stringify(needle));
      };

      eq("--brand", j.brand, "#3fc161");
      eq("--brand-d", j.brandD, "#2fa44e");
      eq(".btn 圆角", j.btn.borderRadius, "16px");
      eq(".btn 底色", j.btn.background, "rgb(63, 193, 97)");
      has(".btn 3D 边", j.btn.boxShadow, "0px 4px 0px 0px");
      has(".btn 3D 边色", j.btn.boxShadow, "rgb(47, 164, 78)");
      has(".node 3D 边", j.node.boxShadow, "0px 6px 0px 0px");
      eq("圆体字体", j.fontFamily, "Nunito");
      eq("侧边栏 @ " + W, j.rail, W >= 1024 ? "flex" : "none");
      eq("底部 Tab @ " + W, j.tabbar, W >= 1024 ? "none" : "flex");

      if (j.bubbleCenterOffset !== undefined) {
        eq("气泡居中于当前节点", j.bubbleCenterOffset, 0);
        eq("气泡动效", j.bubbleAnim, "bob");
        eq("气泡在视口内", j.bubbleInViewport, true);
        if (j.bubbleGapAbove < 6 || j.bubbleGapAbove > 30) {
          bad.push("气泡应在节点上方: gap=" + j.bubbleGapAbove);
        }
      }

      if (bad.length) {
        console.log("  \u001b[31m\u2717\u001b[0m " + process.env.LABEL);
        bad.forEach((b) => console.log("      " + b));
        process.exit(3);
      }
      console.log("  \u001b[32m\u2713\u001b[0m " + process.env.LABEL + "  设计契约");
    });
  ' || FAIL=1
}

echo
echo "设计契约断言（token / 3D 按钮 / 学习路径气泡 / 断点导航）"
for vp in "${VIEWPORTS[@]}"; do
  name="${vp%%:*}"; rest="${vp#*:}"; W="${rest%%:*}"; H="${rest##*:}"
  agent-browser set viewport "$W" "$H" >/dev/null 2>&1
  agent-browser open "$BASE/learn" >/dev/null 2>&1
  sleep 0.5
  check_assertions "$W" "$name"
done

# ---- 三端差异化断言 ---------------------------------------------------------
# 手机 / 平板 / 桌面 应该有各自明确的信息架构，而不是同一套布局等比缩放。
# 每一条都对应 CSS 里真实的断点，而不是笼统地按“设备类型”猜测。
echo
echo "三端差异化断言（顶栏信息 / 词库密度 / 侧边栏 / Learn 分栏）"

read -r -d '' LEARN_JS <<'JS'
JSON.stringify((() => {
  const disp = (el) => (el ? getComputedStyle(el).display : null);
  const goal = document.querySelector('.learn-goal');
  const srs = document.querySelector('.learn-srs');
  const path = document.querySelector('.path');
  return {
    meters: disp(document.querySelector('.topbar-meters')),
    topStats: disp(document.querySelector('.topbar > .stats')),
    rail: disp(document.querySelector('.rail')),
    tabbar: disp(document.querySelector('.tabbar')),
    spread: path ? getComputedStyle(path).getPropertyValue('--spread').trim() : null,
    learnSideBySide: goal && srs ? Math.abs(goal.getBoundingClientRect().top - srs.getBoundingClientRect().top) < 4 : null,
  };
})())
JS

read -r -d '' DECK_JS <<'JS'
JSON.stringify((() => {
  const list = document.querySelector('.itemlist--grid');
  const row = document.querySelector('.itemrow');
  const meter = document.querySelector('.ir-meter');
  const badge = document.querySelector('.ir-ret');
  const main = document.querySelector('.ir-main');
  return {
    deckCols: list ? getComputedStyle(list).gridTemplateColumns.split(' ').length : null,
    rowW: row ? Math.round(row.getBoundingClientRect().width) : null,
    meter: meter ? getComputedStyle(meter).display : null,
    retBadge: badge ? getComputedStyle(badge).display : null,
    textW: main ? Math.round(main.getBoundingClientRect().width) : null,
  };
})())
JS

check_triple() {
  local W="$1" label="$2" learn="$3" deck="$4"
  W="$W" LABEL="$label" LEARN="$learn" DECK="$deck" node -e '
    const L = JSON.parse(process.env.LEARN)
    const D = JSON.parse(process.env.DECK)
    const W = Number(process.env.W)
    const bad = []
    const eq = (n, got, want) => { if (got !== want) bad.push(n + ": " + JSON.stringify(got) + " ≠ " + JSON.stringify(want)) }
    const vis = (v) => v === "inline-flex" || v === "flex"

    // 顶栏：600 起补「今日目标 / 补心倒计时」；1024 起交给侧边栏，顶栏不再重复计数
    if (W < 600) {
      eq("手机 · 顶栏不显示今日目标", vis(L.meters), false)
      eq("手机 · 顶栏显示计数", vis(L.topStats), true)
    } else {
      eq("平板+ · 顶栏补今日目标/补心倒计时", vis(L.meters), true)
      eq("桌面 · 顶栏不再重复计数", L.topStats, W >= 1024 ? "none" : "flex")
    }

    // 导航：1024 是侧边栏与底部 Tab 的分界
    eq(W >= 1024 ? "桌面 · 显示侧边栏" : "平板 · 隐藏侧边栏", L.rail, W >= 1024 ? "flex" : "none")
    eq(W >= 1024 ? "桌面 · 隐藏底部 Tab" : "平板 · 底部 Tab", L.tabbar, W >= 1024 ? "none" : "flex")

    // 词库密度：768 起双列（600 时双列会把行压到 ~275px，太窄）
    eq(W >= 768 ? "平板+ · 词库双列" : "窄屏 · 词库单列", D.deckCols, W >= 768 ? 2 : 1)

    // 记忆进度按「行自身宽度」切换（容器查询），不是视口宽度：
    // 平板双列后每行只有 ~350px，进度条会把标题压到 156px。
    const wideRow = (D.rowW ?? 0) >= 420
    eq(
      wideRow ? "宽行 · 词库显示进度条" : "窄行 · 词库用百分比徽章",
      wideRow ? D.meter : D.retBadge,
      wideRow ? "block" : "flex",
    )
    if (D.textW !== null && D.textW < 190) bad.push("词库文字区过窄: " + D.textW + "px (行宽 " + D.rowW + ")")

    // Learn 桌面分栏与路径展开
    if (W >= 1024) {
      eq("桌面 · Learn 今日目标与曲线总览并排", L.learnSideBySide, true)
      eq("桌面 · 路径展开更充分", L.spread, "104px")
    }

    if (bad.length) {
      console.log("  \u001b[31m\u2717\u001b[0m " + process.env.LABEL)
      bad.forEach((b) => console.log("      " + b))
      process.exit(3)
    }
    console.log("  \u001b[32m\u2713\u001b[0m " + process.env.LABEL + "  三端差异化")
  ' || FAIL=1
}

for vp in "${VIEWPORTS[@]}"; do
  name="${vp%%:*}"; rest="${vp#*:}"; W="${rest%%:*}"; H="${rest##*:}"
  agent-browser set viewport "$W" "$H" >/dev/null 2>&1

  agent-browser open "$BASE/learn" >/dev/null 2>&1
  sleep 0.6
  learn_raw="$(agent-browser eval "$LEARN_JS" 2>/dev/null)"

  agent-browser open "$BASE/deck" >/dev/null 2>&1
  sleep 0.6
  deck_raw="$(agent-browser eval "$DECK_JS" 2>/dev/null)"

  learn_json="$(printf '%s' "$learn_raw" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.stringify(JSON.parse(JSON.parse(s))))}catch{console.log('{}')}})")"
  deck_json="$(printf '%s' "$deck_raw" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.stringify(JSON.parse(JSON.parse(s))))}catch{console.log('{}')}})")"

  check_triple "$W" "$name" "$learn_json" "$deck_json"
done

# ---- 组件样式生效断言 -------------------------------------------------------
# 踩过的一类坑：宽泛的后代选择器（.mehead span）把带 class 的同名元素
# （.me-av）一起命中了，display/font-size 被悄悄覆盖，元素看着"没样式"。
# 横向溢出与 token 断言都测不到这个，所以这里逐个探针组件的 computed style。
read -r -d '' COMPONENT_JS <<'JS'
JSON.stringify((() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // 元素在断点外被 display:none 藏起来时，它的组件样式本来就不会声明
    // （.rail-av 只在 >=1024 的媒体查询里定义），不该拿它报错。
    if (r.width === 0 || r.height === 0) return null;
    return {
      display: cs.display,
      fontSize: parseFloat(cs.fontSize),
      color: cs.color,
      overflowY: cs.overflowY,
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
      boxW: Math.round(el.getBoundingClientRect().width),
      boxH: Math.round(el.getBoundingClientRect().height),
    };
  };
  const order = (parent, a, b) => {
    const root = document.querySelector(parent);
    if (!root) return null;
    const na = root.querySelector(a), nb = root.querySelector(b);
    if (!na || !nb) return null;
    // 文档序：a 在 b 之前 → -1
    return na.compareDocumentPosition(nb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  };
  return { meav: pick('.me-av'), railav: pick('.rail-av'), dzic: pick('.dz-ic'), ftic: pick('.f-ic') };
})())
JS

check_components() {
  local W="$1" label="$2" raw
  for route in me capture super; do
    agent-browser open "$BASE/$route" >/dev/null 2>&1
    sleep 0.6
    raw="$(agent-browser eval "$COMPONENT_JS" 2>/dev/null)"
    printf '%s' "$raw" | W="$W" LABEL="$label" ROUTE="$route" node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        let j;
        try { j = JSON.parse(JSON.parse(s)); } catch { console.log("  \u001b[33m?\u001b[0m " + process.env.ROUTE + " 探测失败"); return; }
        const bad = [];
        const R = process.env.ROUTE;
        const box = (name, o, wantFont) => {
          if (!o) return;                       // 该路由没有这个组件，或被断点隐藏
          if (o.display !== "grid") bad.push(R + " " + name + " display=" + o.display + "（应 grid，被后代选择器覆盖了？）");
          if (wantFont && Math.abs(o.fontSize - wantFont) > 0.6) bad.push(R + " " + name + " font-size=" + o.fontSize + "px（应 " + wantFont + "px）");
          if (o.scrollH > o.clientH + 1) bad.push(R + " " + name + " 内容溢出盒子 " + o.scrollH + ">" + o.clientH);
          if (o.boxW !== o.boxH) bad.push(R + " " + name + " 不是正方形 " + o.boxW + "x" + o.boxH);
        };
        box(".me-av", j.meav, 24);
        box(".rail-av", j.railav, 13);
        box(".f-ic", j.ftic, 0);
        if (j.dzic) {
          // .dropzone span 曾把相机图标的品牌色覆盖成灰。这里要求它保持绿色。
          if (j.dzic.color !== "rgb(63, 193, 97)") bad.push(R + " .dz-ic 颜色=" + j.dzic.color + "（应保持品牌绿 rgb(63, 193, 97)）");
          if (j.dzic.display !== "grid") bad.push(R + " .dz-ic display=" + j.dzic.display + "（应 grid）");
        }
        if (bad.length) {
          console.log("  \u001b[31m\u2717\u001b[0m " + process.env.LABEL + " 组件样式");
          bad.forEach((b) => console.log("      " + b));
          process.exit(3);
        }
        if (R === "super") console.log("  \u001b[32m\u2713\u001b[0m " + process.env.LABEL + "  组件样式生效");
      });
    ' || FAIL=1
  done
}

echo
echo "组件样式生效断言（头像 / 图标容器未被后代选择器覆盖）"
for vp in "${VIEWPORTS[@]}"; do
  name="${vp%%:*}"; rest="${vp#*:}"; W="${rest%%:*}"; H="${rest##*:}"
  agent-browser set viewport "$W" "$H" >/dev/null 2>&1
  check_components "$W" "$name"
done

# ---- 统计卡与复习会话布局断言 -----------------------------------------------
# 1) Learn 的三张统计卡在任何宽度都必须是三列（原型 .statcards）。
# 2) 复习会话用 player 布局：不显示底部 Tab，主按钮钉底，评分钉底。
read -r -d '' LAYOUT_JS <<'JS'
JSON.stringify((() => {
  const out = {};
  const cards = [...document.querySelectorAll('.learn-srs > *')];
  out.cardCount = cards.length;
  if (cards.length) {
    const r = cards.map((c) => c.getBoundingClientRect());
    out.cardTops = [...new Set(r.map((x) => Math.round(x.top)))];
    out.cardLefts = [...new Set(r.map((x) => Math.round(x.left)))];
    const host = document.querySelector('.learn-srs').getBoundingClientRect();
    out.cardMaxW = Math.round(Math.max(...r.map((x) => x.width)));
    out.hostW = Math.round(host.width);
  }
  const player = document.querySelector('.page--player');
  out.hasPlayer = !!player;
  out.tabbar = document.querySelector('.tabbar') ? getComputedStyle(document.querySelector('.tabbar')).display : 'none';
  const foot = document.querySelector('.lessonfoot');
  if (foot) {
    const b = foot.getBoundingClientRect();
    out.footBottomGap = Math.round(window.innerHeight - b.bottom);
    out.footH = Math.round(b.height);
  }
  out.gradesInFoot = !!document.querySelector('.lessonfoot .grades');
  return out;
})())
JS

check_layout() {
  local W="$1" label="$2"

  agent-browser open "$BASE/learn" >/dev/null 2>&1
  sleep 0.6
  local raw
  raw="$(agent-browser eval "$LAYOUT_JS" 2>/dev/null)"
  printf '%s' "$raw" | W="$W" LABEL="$label" MODE=learn node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let j; try { j = JSON.parse(JSON.parse(s)); } catch { return; }
      const bad = [];
      if (j.cardCount !== 3) bad.push("统计卡数量=" + j.cardCount + "（应 3）");
      if ((j.cardTops || []).length !== 1) bad.push("统计卡不在同一行: tops=" + JSON.stringify(j.cardTops));
      if ((j.cardLefts || []).length !== 3) bad.push("统计卡不是三列: lefts=" + JSON.stringify(j.cardLefts));
      if (j.hostW && j.cardMaxW >= j.hostW * 0.6) bad.push("统计卡占满整行 " + j.cardMaxW + "/" + j.hostW + "（应三列窄卡）");
      if (bad.length) {
        console.log("  \u001b[31m\u2717\u001b[0m " + process.env.LABEL + " Learn 统计卡");
        bad.forEach((b) => console.log("      " + b));
        process.exit(3);
      }
    });
  ' || FAIL=1

  agent-browser open "$BASE/review" >/dev/null 2>&1
  sleep 1.0
  raw="$(agent-browser eval "$LAYOUT_JS" 2>/dev/null)"
  printf '%s' "$raw" | W="$W" LABEL="$label" MODE=review node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let j; try { j = JSON.parse(JSON.parse(s)); } catch { return; }
      const bad = [];
      if (!j.hasPlayer) bad.push("复习会话未使用 .page--player");
      if (j.tabbar !== "none") bad.push("复习会话仍显示底部 Tab（display=" + j.tabbar + "）");
      if (j.footBottomGap === undefined) bad.push("找不到钉底 .lessonfoot");
      else if (Math.abs(j.footBottomGap) > 2) bad.push("「显示答案」未钉底: 距底 " + j.footBottomGap + "px");
      if (bad.length) {
        console.log("  \u001b[31m\u2717\u001b[0m " + process.env.LABEL + " 复习会话布局");
        bad.forEach((b) => console.log("      " + b));
        process.exit(3);
      }
    });
  ' || FAIL=1
}

echo
echo "统计卡三列 / 复习会话钉底布局断言"
for vp in "${VIEWPORTS[@]}"; do
  name="${vp%%:*}"; rest="${vp#*:}"; W="${rest%%:*}"; H="${rest##*:}"
  agent-browser set viewport "$W" "$H" >/dev/null 2>&1
  check_layout "$W" "$name"
  printf '  \033[32m✓\033[0m %-22s 统计卡三列 + 复习钉底\n' "$name"
done

echo
if [ "$FAIL" = "0" ]; then
  printf '✅ 响应式 + 设计契约 + 三端差异化 + 组件样式 + 会话布局 全部通过。\n'
  [ "$SHOTS" = "1" ] && printf '   截图: %s\n' "$SHOT_DIR"
else
  printf '❌ 存在失败项，见上方明细。\n'
fi
exit "$FAIL"
