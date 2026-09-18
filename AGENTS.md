# Lingo（拍照学语言 · 遗忘曲线复习）

H5 网页应用：拍照/上传图片 → AI 识别单词短语 → 生成多邻国式课程 → 按遗忘曲线安排复习。
npm workspaces 单仓双包：`web`（Vite 前端，5173）、`server`（API，8787）。Node >= 20。

## Commands

日常入口是 `Makefile`，一律用 `make`，不要自己拼裸 npm 命令。`make help` 列出全部目标。

- `make setup` — 安装依赖并生成 `server/.env`
- `make dev` — 同时启动 api 与 web（Ctrl-C 一起退出）
- `make mock` — 以 `AI_MOCK=1` 启动，走内置假数据，不调用任何模型
- `make check` — 提交前跑这个：typecheck + lint + test
- `make verify` — `make check` + 生产构建 + 响应式契约校验（9 视口 × 全部路由）
- `make test-watch` — 以监听模式跑测试

要直接调子包脚本时用 `npm --workspace web run lint` 或 `npm --workspace server run test`
这类形式，不要在子目录里裸跑 npm：依赖装在根，子目录里跑会装错位置。

## Testing

测试与被测代码同目录，命名 `*.test.ts`，例如 `web/src/lib/answer.test.ts`、
`server/src/srs/fsrs.test.ts`。跑测试用的是 Node 内置 runner，没有 vitest/jest。

- 全量用 `make test`，监听用 `make test-watch`
- 单个文件用 `npm --workspace server exec -- tsx --test src/srs/fsrs.test.ts`
  （与 `test-watch` 同形，去掉 `--watch`）
- 先写一个描述行为的失败测试，看到它红了再写实现；没红过的测试不算测试
- 只写让当前测试通过的最少代码，不为下一个测试提前搭结构
- 只有全绿之后才重构；重构中变红就先回到上一个绿点
- 不要先批量写完所有测试再写实现——那测的是想象出来的形状，不是真实行为
- 断言针对公开接口的行为，不要把内部函数名写进断言
- `server/src/srs/fsrs.ts` 的复习调度是纯逻辑，改动必须带测试：算错不会在页面上立刻暴露

## Conventions

- 前端代码在 `web/src/`，后端在 `server/src/`
- lint 只覆盖前端（oxlint）；`server` 没有 lint 脚本，类型问题靠 `typecheck` 兜
- 完整命令清单、AI/数据库配置、验收流程以 `README.md` 为准，不在此处重复

## Safety

- 不要提交 `server/.env`（示例见 `server/.env.example`）
- `make db-reset` 会删掉 SQLite 库、`make seed-reset` 会清演示数据：只在确认数据无关紧要时使用

## Gotchas

- 本仓库没有 CI，`make check` 就是唯一的自动门禁 —— 本地不跑就没人替你跑
- 改 AI 相关链路先用 `make mock` 验证逻辑，再去调真实模型，否则既花 Key 的钱也要等
