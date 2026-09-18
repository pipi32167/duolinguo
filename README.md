# Lingo — 拍照学语言 · 遗忘曲线复习

H5 网页应用。基于 `多邻国的原型/lingo-language-app.html`（13 屏高保真设计）实现，支持**浏览器 / 手机 / 平板**。

核心链路：**拍照或上传图片 → AI 识别单词短语 → AI 生成多邻国式课程 → 按遗忘曲线安排复习**。

---

## 快速开始

```bash
cd website/duolinguo
make setup        # 安装依赖 + 生成 server/.env
make dev          # 同时启动 api(8787) 与 web(5173)
```

打开 http://localhost:5173 ｜ AI 配置 http://localhost:5173/admin

**没有 API Key 也想先跑通全流程？**

```bash
make mock         # AI_MOCK=1，走内置假数据，不调用任何模型
```

`make` 或 `make help` 会列出全部命令：

```
快速开始   setup · dev · mock · doctor
单独启动   api · web · preview
质量       typecheck · lint · test · test-watch · check · verify · shots · shots-3ends · shots-exercises
构建       build · build-stats
AI 配置    env · ai-status · ai-test · ai-models · mock-on · mock-off · set-key · set-vision
数据库     db-stats · db-items · db-lessons · db-due · db-sql · db-reset · seed · seed-reset
进程       ports · stop · restart · open · admin · health
清理       clean · clean-all · reset
```

常用例子：

```bash
make doctor                                  # 本地环境自检（node / 依赖 / 端口 / AI）
make set-key KEY=sk-xxxx                     # 写入 API Key（Key 脱敏显示）
make set-vision MODEL=deepseek-v4-flash-vision-exp
make ai-test                                 # 真实调用文本 + 视觉模型做连通性自检
make db-stats                                # 各表行数 + 记忆状态分布 + 今日到期数
make db-sql Q="SELECT text, stability FROM items ORDER BY stability DESC LIMIT 5"
make check                                   # 类型 + lint + 测试（提交前跑这个）
make verify                                  # check + 构建 + 9 视口响应式与设计契约校验
make shots-exercises                         # 6 种题型 × 9 视口 巡检 + 截图
make shots-exercises-one VP=390x844          # 只跑一个视口
make shots-3ends                             # 手机/平板/桌面 × 5 个关键页 快照
make shots-3ends-one END=mobile              # 只拍一端（mobile | tablet | desktop）
make seed                                    # 种一份完整演示数据（纯 SQL，不花钱）
make dev WEB_PORT=4173                       # 换端口
```

### `make shots-exercises`
用 mock 数据生成一节「每种题型各 1 题」的课程，然后在 9 个视口上逐个题型：
采布局指标 → 截图 → 填正确答案 → 检查 → 断言绿色反馈 → 继续。全程答对，不掉心。

检查项：题干文案、横向溢出、**可点区域 ≥ 44px**、选项网格列数、多列数量是否相等、
输入框高度、底部「检查」是否在视口内、填答后「检查」是否解禁、判定是否为正确。

截图落在 `artifacts/exercise-types/`（72 张：9 视口 × 6 题型 + 配对中间态 + 结算页）。

### `make verify` 检查什么

它不只是“能不能跑”，而是把 handoff 里的视觉契约变成可执行断言：

1. **横向溢出** —— 9 个视口 × 全部路由，断言 `scrollWidth` 不超视口；
2. **设计 token** —— `--brand` 必须为 `#3fc161`、字体必须是 `Nunito`、`.btn` 必须是 16px 圆角；
3. **招牌 3D 按钮** —— `.btn` 是 `0 4px 0 #2FA44E`，`.node` 是 `0 6px 0 #2FA44E`；
4. **学习路径气泡** —— 必须居中于当前节点（偏移 0）、位于节点上方、带 `bob` 动效且不出视口；
5. **断点导航** —— `<1024` 底部 Tab、`≥1024` 侧边栏，二者互斥；
6. **组件样式真的生效** —— `.me-av` / `.rail-av` / `.f-ic` / `.dz-ic` 的 `display` 与
   `font-size` / `color` 必须等于组件自己声明的值（被断点隐藏的元素自动跳过）；
7. **统计卡恒为三列** —— `.learn-srs` 的三张卡必须同一行、三个不同左边、且不得占满整行；
8. **复习会话钉底布局** —— 必须是 `.page--player`、不显示底部 Tab、主按钮距视口底 ≤ 2px。

断言用**探针元素**测量原语本身，而不是抓页面上恰好存在的变体。

这些断言是实打实抓过 Bug 的：溢出检测抓出 `.node-wrap` 全宽 `translateX` 把盒子推出视口，
设计断言抓出气泡的 CSS 选择器写错（样式完全没生效、被当成 flex 项横排）。
题型巡检又抓出两条：**组句题永远判错**、**小屏配对题「检查」掉出视口**。

第 6、7 条是补上「只看溢出和 token 抓不到」的盲区后加的：
`.split-3` 的三列网格只在 `≥768` 定义，导致**手机端三张统计卡竖着堆成三张全宽高卡**；
`.mehead span` 这种宽泛后代选择器又把 `.me-av`（同为 `span`）一起命中，
`display: grid` 被覆盖成 `block`、字号从 24px 掉到 12.5px，**头像文字跑出盒子**。
这类「样式根本没生效」的问题 `scrollWidth` 完全测不出来，所以单独做了一组 computed style 探针。
同一类选择器还误伤了 `.f-ic` / `.lc-ic` / `.dz-ic`（拍照页相机图标被染成灰色）。

---

## AI 配置（后端）

`baseurl` / `apikey` / `model` **全部在后端**，浏览器永远拿不到 Key。

### 方式一：`server/.env`

```ini
PORT=8787
AI_BASE_URL=https://api.deepseek.com     # 带不带 /v1 都行，会自动补全
AI_API_KEY=sk-xxxxxxxx
AI_MODEL=deepseek-flash                  # 文本：生成课程 / 导师对话
AI_VISION_MODEL=deepseek-v4-flash-vision-exp  # 视觉：识别图片
AI_TIMEOUT_MS=90000
AI_TEMPERATURE=0.7
AI_MOCK=0
```

### 方式二：网页后台 `/admin`（推荐）

打开 http://localhost:5173/admin，可以直接改 baseurl / apikey / 模型 / 超时 / 温度 / Mock 开关，
写入 SQLite `settings` 表，**即时生效、无需重启**，且优先级高于 `.env`。

页面上有 **连通性自检**：分别对文本模型与视觉模型发一次真实请求，逐个报告 `ok / 耗时 / 错误原因`。

### ⚠️ 关于 `deepseek-flash` 与图片识别

`deepseek-flash`（以及绝大多数 DeepSeek 文本模型）**不接受图片输入**，传图会返回
`400 This model does not support image`。因此本项目把模型分成两组：

| 用途 | 环境变量 | DeepSeek 官方示例 | 火山方舟示例 |
|---|---|---|---|
| 图片识别（必须支持 vision） | `AI_VISION_MODEL` | `deepseek-v4-flash-vision-exp` | `doubao-1.5-vision-pro-32k` |
| 课程生成 / 导师对话 | `AI_MODEL` | `deepseek-flash` | `deepseek-v4-flash-ga-260731` |

两者共用同一个 `AI_BASE_URL` + `AI_API_KEY`。如果你的服务商只有一个多模态模型，两组填同一个值即可。

### 其他环境变量

| 变量 | 说明 |
|---|---|
| `ADMIN_TOKEN` | 设置后 `/admin` 与 `PUT /api/ai/admin/config` 需要令牌。留空 = 本地开发免鉴权（**公网部署务必设置**） |
| `DATA_DIR` | SQLite 数据目录，默认 `server/data/` |

---

## 实现范围

### 原型 13 屏 ⇄ 生产路由

| 原型 | 路由 | 说明 |
|---|---|---|
| 01 欢迎首屏 | `/` | 价值主张 + 语言词云 |
| 02 选择语言 | `/onboarding/language` | 8 种语言，绿描边 + 勾选中态 |
| 03 每日目标 | `/onboarding/goal` | 轻松/标准/认真/疯狂 四档 |
| 04 主页学习路径 | `/learn` | 路径节点由**今日到期数**驱动，不是静态假数据 |
| 05 课程·选择题 | `/lesson/:id` | 未选时「检查」禁用 |
| 06 课程·组句 | `/lesson/:id` | 词块在词池与答题区来回搬运，支持重复词 |
| 07 反馈·答对 | `/lesson/:id` | 绿色反馈条从底部升起，替换「检查」 |
| 08 反馈·答错 | `/lesson/:id` | 红色反馈条给出正确答案 |
| 09 课程完成 | `/lesson/:id/complete` | 经验 / 准确率 / 用时三卡 + 连续天数 |
| 10 心用完了 | `/lesson/:id` | 0 心时弹出的模态框，含恢复倒计时 |
| 11 升级 Super | `/super` | 卖「不用等」，不是「更多功能」 |
| 12 对话·正常 | `/tutor` | SSE 流式，顶部吸顶时长条 |
| 13 对话·超时 | `/tutor` | 输入框仍可打字，发送键禁用并弹提示 |

### 本次新增

| 路由 | 说明 |
|---|---|
| `/capture` | **拍照 / 相册 / 拖拽** → 视觉模型识别 → 词条确认（可勾选、删除） |
| `/deck` | 词库：搜索、按状态/类型筛选、记忆健康度热力图、多选生成课程 |
| `/deck/:id` | 词条详情：**遗忘曲线图**、手动四档评分、编辑 |
| `/review` | 遗忘曲线复习会话：到期 → 易忘 → 新词，三合一队列 |
| `/admin` | 后端 AI 配置 + 连通性自检 |
| `/rank` `/shop` `/quests` `/me` | 排行 / 商店 / 任务 / 我的 |

### 题库题型

AI 会按词表生成 6 类题目，难度递进（识别 → 拼装 → 回忆 → 自由输出）：

`translate_choice` 选择翻译 · `wordbank` 组句 · `listen_choice` 听音选词 ·
`match_pairs` 配对 · `fill_blank` 填空 · `translate_input` 自由输入

---

## 遗忘曲线（FSRS）

实现的是 **FSRS-4.5 默认参数 + Anki 式护栏**，见 `server/src/srs/fsrs.ts`。

记忆保持率随时间的衰减：

```
R(t, S) = (1 + FACTOR · t / S) ^ DECAY      DECAY = -0.5, FACTOR = 19/81
```

FACTOR 的取值使 **R(S) = 0.90 恒成立** —— 也就是说，下一次复习永远排在
「记住概率降到 90%」的那一刻。这条曲线会**直接画在词条详情页和复习页上**，
而不是只藏在算法里。

| 概念 | 含义 |
|---|---|
| `S` 记忆稳定度 | 以「天」为单位。S 越大，忘得越慢 |
| `D` 难度 | 1–10，由评分序列自动调整 |
| `R` 可提取率 | 此刻还记得的概率，实时计算 |

评分四档（`again / hard / good / easy`）：

- `再来一次` → 记忆稳定度按遗忘公式下调，进入 **relearning**，10 分钟后重现
- `有点难` → 缩短间隔
- `记得` → 延长间隔
- `很简单` → 至少比「记得」多 30%（护栏，保证四个按钮永远可区分）

复习队列 = **到期卡 + 易忘卡（lapses > 0）+ 新卡**，按紧急度排序。

### 测试

```bash
make test     # 22 个用例
```

**服务端 `server/src/srs/fsrs.test.ts`（12 个）** —— 遗忘曲线的数学性质：
- `R(S) = 0.9`、`intervalFor` 与 `retrievability` 互为逆函数
- 曲线单调递减；`R(2S) ≈ 0.825`
- 四档评分间隔严格单调（含「记得 9 天 / 很简单 9 天」的回归用例）
- 连续答对时间隔必须递增；答错必须缩短 stability 并计入 lapses

**前端 `web/src/lib/answer.test.ts`（10 个）** —— 判分逻辑，应用里最关键的一环：
- 词块复合键 `the§3` 的编码/解码往返，重复词不互相顶掉
- **组句题正确顺序必须判对**（回归用例：曾因没剥索引导致永远判错）
- 判分宽容度：大小写 / 标点 / 弯引号 / 撇号
- 各题型在未作答时不得放行「检查」

两者都用 Node 原生能力跑（`tsx --test` / `--experimental-strip-types --test`），**不引入测试框架依赖**。

---

## 响应式与三端差异化

一套自适应 Web，不是三个固定截图。断点按语义划分，**每一端都有不同的信息架构**，
而不是同一套布局等比缩放：

| | `< 600` 手机 | `600–1023` 平板 | `≥ 1024` 桌面 |
|---|---|---|---|
| 导航 | 底部 5 Tab（每格 ~67px） | 底部 Tab 收成居中 620px 带 | 左侧 244px 侧边栏，底 Tab 隐藏 |
| 顶栏 | 语言 chip ←→ 连续/宝石/心 | 中间补「今日目标 + 补心倒计时」填掉空档 | 不再重复计数（侧边栏已有），改为左对齐 |
| 侧边栏 | — | — | 品牌 + 7 项导航 + **用户卡 / 计数 / 导师倒计时 / AI 配置** |
| 学习页 | 今日目标、曲线总览竖排；路径展开 30px | 同上，展开 56px | 今日目标与曲线总览**并排**；路径展开 104px |
| 词库 | 单列，百分比徽章 | ≥768 双列 | 双列 |
| 记忆进度 | | 按**行自身宽度**切换：< 420px 徽章，≥ 420px 进度条 | 同左 |
| 我的页 | 记忆健康度 / 最近课程竖排 | 竖排 | **并排两栏** |
| 列表页 | 全宽 | 全宽 | 收窄到 820px 可读宽度 |

### 为什么记忆进度用容器查询

进度条固定占 110px。平板双列后每行只有 ~350px，比手机（313px）还窄，
进度条会把标题压到 **156px**。所以判断依据是**行自身的宽度**而不是视口宽度：

| 视口 | 行宽 | 文字区 | 用哪个 |
|---|---|---|---|
| 360×800 | 313 | 245 | 徽章 |
| 830×1180 | 384 | **316**（原 182） | 徽章 |
| 1024×768 | 346 | **278**（原 156） | 徽章 |
| 1440×900 | 504 | 314 | 进度条 |

`@supports` 内的 `@container` 负责现代浏览器，之前的视口媒体查询保留作为回退。

### 图表高度

遗忘曲线的 SVG 有固有宽高比，`width: 100%` 会让它在桌面端等比放大成 260px+ 高。
加 `max-height: 190px` 封顶，由 `preserveAspectRatio` 居中适配，不变形。

### 实测

**9 视口 × 12 路由 = 108 个组合零横向溢出**，再加 9 个视口的设计契约与三端差异化断言：
`360×800 · 390×844 · 430×932 · 600×960 · 820×1180 · 1024×768 · 1366×768 · 1440×900 · 1920×1080`

字号用 `clamp()` 流体缩放，`prefers-reduced-motion` 下自动降级动效，
`env(safe-area-inset-*)` 适配刘海屏。

---

## 目录结构

```
duolinguo/
├── Makefile                    # make help 查看全部命令
├── scripts/
│   ├── dev.mjs                 # 双进程启动器（带前缀输出）
│   ├── ai.mjs                  # AI 配置 / 连通性自检 CLI
│   ├── db.mjs                  # 只读查看 SQLite
│   ├── verify-responsive.sh    # 9 视口溢出 + 设计契约 + 组件样式 + 会话布局断言
│   ├── shoot-3ends.mjs         # 手机/平板/桌面 关键页快照
│   ├── shoot-exercises.mjs     # 题型 × 设备 巡检
│   └── exercise-driver.js      # 上面那个脚本注入浏览器的页面侧驱动
├── server/                     # Node + Hono + SQLite
│   ├── .env.example            # ← AI baseurl / apikey / model
│   └── src/
│       ├── ai/
│       │   ├── config.ts       # env 默认值 + DB 运行时覆盖 + Key 脱敏
│       │   ├── client.ts       # OpenAI 兼容客户端：JSON 模式、流式、修复重试
│       │   ├── extract.ts      # 图片 → 结构化词表（zod 校验）
│       │   ├── lesson.ts       # 词表 → 题库
│       │   ├── tutor.ts        # 导师对话（SSE）
│       │   └── mock.ts         # AI_MOCK 假数据
│       ├── srs/fsrs.ts         # 遗忘曲线调度 + 12 个测试
│       ├── db/                 # schema + 仓储层
│       └── routes/             # extract / deck / lessons / review / tutor / me / ai
└── web/                        # React 19 + Vite + 原生 CSS + 设计 token
    └── src/
        ├── styles/tokens.css   # ← 设计系统的唯一来源
        ├── styles/primitives.css
        ├── components/         # AppShell / TopBar / ForgettingCurve / Icons
        ├── lib/                # api / hooks / speech / image / answer / format
        └── routes/             # 每屏一个文件
```

---

## 设计系统

token 从原型逐条抽取，冻结在 `web/src/styles/tokens.css`，不使用框架默认主题：

| token | 值 |
|---|---|
| 品牌绿 | `#3FC161` / 深 `#2FA44E` / 浅底 `#E9F9EE` |
| 金币 / 蓝 / 红 / 紫 | `#FFB420` · `#1FB6F0` · `#FF4B4B` · `#A96BFF` |
| 文字 | `#17211F` / `#3E4A47` / `#8894A0` |
| 圆角 | 10–26px + 99px 胶囊 |
| 招牌 3D 按钮 | `box-shadow: 0 4px 0 <深色>`，`:active` 下沉 3px |
| 字体 | Nunito（圆体）→ 中文回退 PingFang SC |

原型的**设计画布 chrome**（masthead、`.cap` 标注、`.phone` 外壳、假状态栏、`.homebar`）
按要求未进入生产 UI。

### 与原型的两处有意偏离

1. **底部 Tab 从 5 个换成 学习 / 词库 / 复习 / 排行 / 我的**：原型是 学习/排行/商店/任务/我的。
   本项目的核心闭环是「加词 → 学 → 复习」，所以底栏让位给词库和复习；
   商店与任务移到桌面侧边栏（7 项全显示）以及学习页的入口按钮，移动端不会失联。
2. **课程页在桌面端收窄居中**（`max-width: 560px`）而不是拉满：保持原型的单列节奏。

---

## 已知边界

- **账户是匿名设备会话**：`localStorage` 里的一个 UUID，没有注册/登录。换浏览器或清缓存 = 新账号。
- **支付未接入**：宝石包、订阅、补心都用模拟扣费，仅演示状态流转。
- **TTS / 语音识别用浏览器原生 API**（`SpeechSynthesis` / `SpeechRecognition`）。
  识别在 Chrome 与 Safari 可用，Firefox 不支持时自动隐藏麦克风按钮并提示改用输入。
- **排行榜**里的其他学习者按固定数据生成，你的名次由真实经验值决定。
- 心恢复按原型文案为 **8 小时 1 颗**（`HEART_REFILL_MS` 可调）。

---

## 常用命令

日常用 Makefile（见开头），没有 make 的环境可以用 npm scripts：

```bash
npm run dev          # api + web 一起起
npm run mock         # 无 Key 跑通全流程
npm test             # SRS 单元测试（12 个）
npm run typecheck    # 前后端类型检查
npm run build        # 前端生产构建
```

辅助脚本也可以单独调用：

```bash
node scripts/ai.mjs status|test|models        # AI 配置 / 连通性 / 接口地址
node scripts/db.mjs stats|items|lessons|due|sql|reset
node scripts/shoot-exercises.mjs [--viewport 390x844] [--out DIR]
node scripts/shoot-3ends.mjs [--only mobile] [--device DEVICE_ID]
bash scripts/verify-responsive.sh [url] [--shots]
node scripts/dev.mjs                          # 带前缀的双进程输出
```
