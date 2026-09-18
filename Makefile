# ============================================================
#  Lingo — 拍照学语言 · 遗忘曲线复习
#  GNU Make 3.81 兼容（macOS 自带版本），不使用 .ONESHELL / $(file ...)
#  运行 `make` 或 `make help` 查看全部命令
# ============================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

ROOT      := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
NPM       ?= npm
NODE      ?= node
ENV_FILE  := server/.env
WEB_PORT  ?= 5173
API_PORT  ?= 8787
DEVICE    ?= docs-ui-seed

C_HEAD := \033[1;36m
C_CMD  := \033[36m
C_OK   := \033[32m
C_WARN := \033[33m
C_ERR  := \033[31m
C_DIM := \033[2m
C_OFF  := \033[0m

# 空格分隔的端到端服务
SERVICES := web api

# ------------------------------------------------------------
.PHONY: help
help: ## 显示本帮助
	@printf "\n  $(C_HEAD)Lingo$(C_OFF)  $(C_DIM)拍照学语言 · 遗忘曲线复习$(C_OFF)\n"
	@awk 'BEGIN {FS = ":.*##"} \
	  /^##@/ { printf "\n  $(C_HEAD)%s$(C_OFF)\n", substr($$0, 5) } \
	  /^[a-zA-Z0-9_-]+:.*?##/ { printf "    $(C_CMD)%-16s$(C_OFF) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf "\n  $(C_DIM)变量: WEB_PORT=%s  API_PORT=%s  NPM=%s$(C_OFF)\n" "$(WEB_PORT)" "$(API_PORT)" "$(NPM)"
	@printf "  $(C_DIM)例:   make dev WEB_PORT=4173   /   make db-sql Q=\"SELECT * FROM items LIMIT 5\"$(C_OFF)\n\n"

# ============================================================
##@ 快速开始
# ============================================================

.PHONY: setup
setup: ## 安装依赖并生成 server/.env
	@$(NPM) install
	@if [ -f $(ENV_FILE) ]; then \
	  printf "  $(C_WARN)$(ENV_FILE) 已存在，保留原配置$(C_OFF)\n"; \
	else \
	  cp server/.env.example $(ENV_FILE); \
	  printf "  $(C_OK)已生成 $(ENV_FILE)$(C_OFF)\n"; \
	fi
	@printf "\n  下一步: $(C_CMD)make dev$(C_OFF)    填好 AI 配置后启动\n"
	@printf "  无 Key:  $(C_CMD)make mock$(C_OFF)   用内置假数据跑通全流程\n\n"

.PHONY: dev
dev: ensure-env ## 同时启动 api 与 web（Ctrl-C 一起退出）
	@$(NPM) run dev

.PHONY: mock
mock: ensure-env ## 以 AI_MOCK=1 启动，不调用真实模型
	@printf "  $(C_WARN)MOCK 模式: 识别与课程生成使用内置假数据$(C_OFF)\n\n"
	@AI_MOCK=1 $(NPM) run dev

.PHONY: doctor
doctor: ## 检查本地环境（node / 依赖 / 端口 / AI）
	@printf "\n  $(C_HEAD)环境自检$(C_OFF)\n\n"
	@printf "  %-15s %s\n" "node" "$$($(NODE) -v 2>/dev/null || printf '$(C_ERR)未安装$(C_OFF)')"
	@printf "  %-15s %s\n" "npm" "$$($(NPM) -v 2>/dev/null || printf '$(C_ERR)未安装$(C_OFF)')"
	@printf "  %-15s %s\n" "make" "$$(make -v 2>/dev/null | head -1 || printf '$(C_ERR)未安装$(C_OFF)')"
	@printf "  %-15s %s\n" "deps" "$$([ -d node_modules ] && printf '$(C_OK)已安装$(C_OFF)' || printf '$(C_WARN)未安装 → make setup$(C_OFF)')"
	@printf "  %-15s %s\n" "env" "$$([ -f $(ENV_FILE) ] && printf '$(C_OK)$(ENV_FILE)$(C_OFF)' || printf '$(C_WARN)缺失 → make setup$(C_OFF)')"
	@printf "  %-15s %s\n" "web:$(WEB_PORT)" "$$(lsof -ti tcp:$(WEB_PORT) -sTCP:LISTEN >/dev/null 2>&1 && printf '$(C_OK)运行中$(C_OFF)' || printf '$(C_DIM)空闲$(C_OFF)')"
	@printf "  %-15s %s\n" "api:$(API_PORT)" "$$(lsof -ti tcp:$(API_PORT) -sTCP:LISTEN >/dev/null 2>&1 && printf '$(C_OK)运行中$(C_OFF)' || printf '$(C_DIM)空闲$(C_OFF)')"
	@printf "  %-15s %s\n" "sqlite" "$$([ -f server/data/lingo.db ] && printf '$(C_OK)已有数据 ($(shell du -h server/data/lingo.db 2>/dev/null | cut -f1))$(C_OFF)' || printf '$(C_DIM)暂无（首次请求时创建）$(C_OFF)')"
	@printf "  %-15s %s\n" "agent-browser" "$$(command -v agent-browser >/dev/null 2>&1 && printf '$(C_OK)已安装$(C_OFF)' || printf '$(C_DIM)未安装（make verify 会跳过）$(C_OFF)')"
	@printf "\n"

# ============================================================
##@ 单独启动
# ============================================================

.PHONY: api
api: ensure-env ## 只启动后端 (--watch)
	@$(NPM) --workspace server run dev

.PHONY: web
web: ## 只启动前端
	@$(NPM) --workspace web run dev

.PHONY: preview
preview: build ## 用生产产物启动本地预览
	@printf "  $(C_OK)产物已构建 → http://localhost:4173$(C_OFF)\n\n"
	@$(NPM) --workspace web run preview -- --port 4173

# ============================================================
##@ 质量
# ============================================================

.PHONY: typecheck
typecheck: ## 前后端类型检查
	@$(NPM) run typecheck

.PHONY: lint
lint: ## 前端静态检查 (oxlint)
	@$(NPM) --workspace web run lint

.PHONY: test
test: ## 跑 SRS 遗忘曲线单元测试
	@$(NPM) test

.PHONY: test-watch
test-watch: ## 监听模式跑测试
	@$(NPM) --workspace server exec -- tsx --test --watch src/srs/fsrs.test.ts

.PHONY: check
check: typecheck lint test ## 类型 + lint + 测试（提交前跑这个）
	@printf "\n  $(C_OK)✓ 全部通过$(C_OFF)\n\n"

.PHONY: verify
verify: check build ## check + 生产构建 + 响应式契约校验
	@printf "\n  $(C_HEAD)响应式校验: 9 视口 × 全部路由$(C_OFF)\n"
	@bash scripts/verify-responsive.sh http://localhost:$(WEB_PORT)

.PHONY: shots-exercises
shots-exercises: ## 题型 × 设备 巡检（6 题型 × 9 视口；需 mock 模式）
	@$(NODE) scripts/shoot-exercises.mjs

.PHONY: shots-exercises-one
shots-exercises-one: ## 只跑一个视口: make shots-exercises-one VP=390x844
	@if [ -z "$(VP)" ]; then printf "  $(C_ERR)用法: make shots-exercises-one VP=390x844$(C_OFF)\n"; exit 1; fi
	@$(NODE) scripts/shoot-exercises.mjs --viewport $(VP)

.PHONY: shots
shots: ## 采集 9 个视口的截图到 artifacts/screenshots
	@bash scripts/verify-responsive.sh --shots http://localhost:$(WEB_PORT)

.PHONY: shots-3ends
shots-3ends: ## 三端关键页快照（手机/平板/桌面 × 5 页）到 artifacts/ui-3ends
	@$(NODE) scripts/shoot-3ends.mjs

.PHONY: shots-3ends-one
shots-3ends-one: ## 只拍一端: make shots-3ends-one END=mobile   (mobile|tablet|desktop)
	@if [ -z "$(END)" ]; then printf "  $(C_ERR)用法: make shots-3ends-one END=mobile$(C_OFF)\n"; exit 1; fi
	@$(NODE) scripts/shoot-3ends.mjs --only $(END)

# ============================================================
##@ 构建
# ============================================================

.PHONY: build
build: ## 生产构建（tsc + vite build）
	@$(NPM) run build

.PHONY: build-stats
build-stats: build ## 构建并打印产物体积明细
	@printf "\n  $(C_HEAD)产物$(C_OFF)\n\n"
	@ls -lh web/dist/assets | tail -n +2 | awk '{printf "    %-34s %s\n", $$9, $$5}'
	@printf "\n"

# ============================================================
##@ AI 配置
# ============================================================

.PHONY: env
env: ## 打印 server/.env 当前内容（Key 脱敏）
	@$(NODE) -e "const fs=require('fs');const p='$(ENV_FILE)'; \
	  if(!fs.existsSync(p)){console.log('$(C_ERR)缺少 '+p+' → make setup$(C_OFF)');process.exit(1)} \
	  const SECRET=/key|token|secret|password/i; \
	  console.log('\n  $(C_HEAD)server/.env$(C_OFF)\n'); \
	  for(const raw of fs.readFileSync(p,'utf8').split('\n')){ \
	    const l=raw.trim(); if(!l||l.startsWith('#'))continue; \
	    const i=l.indexOf('='); if(i<0)continue; \
	    const k=l.slice(0,i).trim(), v=l.slice(i+1).trim(); \
	    const shown=(SECRET.test(k)&&v.length>8)?v.slice(0,6)+'…'+v.slice(-4):(v||'$(C_DIM)(空)$(C_OFF)'); \
	    console.log('    '+k.padEnd(18)+shown); } console.log('');"

.PHONY: ai-status
ai-status: ## 查看后端生效的 AI 配置
	@$(NODE) scripts/ai.mjs status

.PHONY: ai-test
ai-test: ## 真实调用模型做连通性自检（文本 + 视觉）
	@$(NODE) scripts/ai.mjs test

.PHONY: ai-models
ai-models: ## 打印每个模型会命中的接口地址
	@$(NODE) scripts/ai.mjs models

.PHONY: mock-on
mock-on: ensure-env ## 把 AI_MOCK 切到 1（免 Key 模式）
	@$(NODE) -e "const fs=require('fs'),p='$(ENV_FILE)';let s=fs.readFileSync(p,'utf8'); \
	  s=/^AI_MOCK=/m.test(s)?s.replace(/^AI_MOCK=.*$$/m,'AI_MOCK=1'):s.replace(/\s*$$/,'\nAI_MOCK=1\n'); \
	  fs.writeFileSync(p,s);console.log('  $(C_OK)AI_MOCK=1$(C_OFF)  重启后端后生效（make restart）')"

.PHONY: mock-off
mock-off: ensure-env ## 把 AI_MOCK 切到 0（调用真实模型）
	@$(NODE) -e "const fs=require('fs'),p='$(ENV_FILE)';let s=fs.readFileSync(p,'utf8'); \
	  s=/^AI_MOCK=/m.test(s)?s.replace(/^AI_MOCK=.*$$/m,'AI_MOCK=0'):s.replace(/\s*$$/,'\nAI_MOCK=0\n'); \
	  fs.writeFileSync(p,s);console.log('  $(C_OK)AI_MOCK=0$(C_OFF)  重启后端后生效（make restart）')"

.PHONY: set-key
set-key: ensure-env ## 写入 API Key: make set-key KEY=sk-xxx
	@if [ -z "$(KEY)" ]; then printf "  $(C_ERR)用法: make set-key KEY=sk-xxxxxxxx$(C_OFF)\n"; exit 1; fi
	@$(NODE) -e "const fs=require('fs'),p='$(ENV_FILE)';let s=fs.readFileSync(p,'utf8'); \
	  s=/^AI_API_KEY=/m.test(s)?s.replace(/^AI_API_KEY=.*$$/m,'AI_API_KEY=$(KEY)'):s.replace(/\s*$$/,'\nAI_API_KEY=$(KEY)\n'); \
	  fs.writeFileSync(p,s);console.log('  $(C_OK)API Key 已写入$(C_OFF)  重启后端后生效（make restart）')"

.PHONY: set-vision
set-vision: ensure-env ## 设置视觉模型: make set-vision MODEL=deepseek-v4-flash-vision-exp
	@if [ -z "$(MODEL)" ]; then printf "  $(C_ERR)用法: make set-vision MODEL=<模型名>$(C_OFF)\n"; exit 1; fi
	@$(NODE) -e "const fs=require('fs'),p='$(ENV_FILE)';let s=fs.readFileSync(p,'utf8'); \
	  s=/^AI_VISION_MODEL=/m.test(s)?s.replace(/^AI_VISION_MODEL=.*$$/m,'AI_VISION_MODEL=$(MODEL)'):s.replace(/\s*$$/,'\nAI_VISION_MODEL=$(MODEL)\n'); \
	  fs.writeFileSync(p,s);console.log('  $(C_OK)视觉模型 = $(MODEL)$(C_OFF)  重启后端后生效（make restart）')"

# ============================================================
##@ 数据库
# ============================================================

.PHONY: db-stats
db-stats: ## 各表行数 + 记忆状态分布 + 今日到期数
	@$(NODE) scripts/db.mjs stats

.PHONY: seed
seed: ## 种一份完整演示数据（纯 SQL，不调用模型）
	@$(NODE) scripts/seed.mjs $(DEVICE)

.PHONY: seed-reset
seed-reset: ## 清掉演示数据再重新种: make seed-reset DEVICE=docs-ui-seed
	@$(NODE) scripts/db.mjs reset
	@$(MAKE) --no-print-directory seed

.PHONY: db-items
db-items: ## 词库明细（含 S / D / 下次到期）
	@$(NODE) scripts/db.mjs items

.PHONY: db-lessons
db-lessons: ## 最近生成的课程
	@$(NODE) scripts/db.mjs lessons

.PHONY: db-due
db-due: ## 今日到期卡片
	@$(NODE) scripts/db.mjs due

.PHONY: db-sql
db-sql: ## 只读查询: make db-sql Q="SELECT * FROM items LIMIT 5"
	@if [ -z "$(Q)" ]; then printf "  $(C_ERR)用法: make db-sql Q=\"SELECT ...\"$(C_OFF)\n"; exit 1; fi
	@$(NODE) scripts/db.mjs sql "$(Q)"

.PHONY: db-reset
db-reset: ## 删除 SQLite 数据库（下次启动重建）
	@$(NODE) scripts/db.mjs reset
	@printf "  $(C_OK)已重置，数据会在下次请求时重建$(C_OFF)\n"

# ============================================================
##@ 进程与地址
# ============================================================

.PHONY: ports
ports: ## 查看端口占用
	@printf "\n  $(C_HEAD)端口占用$(C_OFF)\n\n"
	@for pair in "web:$(WEB_PORT)" "api:$(API_PORT)"; do \
	  name="$${pair%%:*}"; port="$${pair##*:}"; \
	  pid="$$(lsof -ti tcp:$$port -sTCP:LISTEN 2>/dev/null | head -1)"; \
	  if [ -n "$$pid" ]; then printf "  %-6s %-6s $(C_OK)运行中$(C_OFF)  pid %s\n" "$$name" "$$port" "$$pid"; \
	  else printf "  %-6s %-6s $(C_DIM)空闲$(C_OFF)\n" "$$name" "$$port"; fi; \
	done
	@printf "\n"

.PHONY: stop
stop: ## 停止本项目占用的 web / api 进程
	@found=0; \
	for port in $(WEB_PORT) $(API_PORT); do \
	  pids="$$(lsof -ti tcp:$$port -sTCP:LISTEN 2>/dev/null)"; \
	  if [ -n "$$pids" ]; then \
	    printf "  停止端口 %s 上的进程: %s\n" "$$port" "$$(echo $$pids | tr '\n' ' ')"; \
	    echo "$$pids" | xargs kill 2>/dev/null; found=1; \
	  fi; \
	done; \
	pkill -f 'scripts/dev.mjs' 2>/dev/null; \
	pkill -f 'tsx watch src/index.ts' 2>/dev/null; \
	[ "$$found" = "0" ] && printf "  $(C_DIM)没有正在运行的服务$(C_OFF)\n" || printf "  $(C_OK)已停止$(C_OFF)\n"

.PHONY: restart
restart: stop ## 重启（stop + dev）
	@sleep 1
	@$(MAKE) --no-print-directory dev

.PHONY: open
open: ## 在浏览器打开应用
	@open "http://localhost:$(WEB_PORT)" 2>/dev/null || xdg-open "http://localhost:$(WEB_PORT)" 2>/dev/null || printf "  请手动打开 http://localhost:$(WEB_PORT)\n"

.PHONY: admin
admin: ## 在浏览器打开 AI 配置页
	@open "http://localhost:$(WEB_PORT)/admin" 2>/dev/null || xdg-open "http://localhost:$(WEB_PORT)/admin" 2>/dev/null || printf "  请手动打开 http://localhost:$(WEB_PORT)/admin\n"

.PHONY: health
health: ## 探测前后端是否就绪
	@printf "\n  $(C_HEAD)健康检查$(C_OFF)\n\n"
	@code="$$(curl -sf -o /dev/null -w '%{http_code}' http://localhost:$(WEB_PORT)/ 2>/dev/null)"; \
	 if [ "$$code" = "200" ]; then printf "  %-7s $(C_OK)%s$(C_OFF)\n" "web" "$$code"; \
	 else printf "  %-7s $(C_ERR)不可达$(C_OFF)\n" "web"; fi
	@body="$$(curl -sf http://localhost:$(API_PORT)/api/health 2>/dev/null)"; \
	 if [ -n "$$body" ]; then printf "  %-7s $(C_OK)200$(C_OFF)  %s\n" "api" "$$body"; \
	 else printf "  %-7s $(C_ERR)不可达$(C_OFF)\n" "api"; fi
	@code="$$(curl -sf -o /dev/null -w '%{http_code}' http://localhost:$(WEB_PORT)/api/health 2>/dev/null)"; \
	 if [ "$$code" = "200" ]; then printf "  %-7s $(C_OK)%s$(C_OFF)  $(C_DIM)vite → api 代理正常$(C_OFF)\n" "proxy" "$$code"; \
	 else printf "  %-7s $(C_ERR)代理不通$(C_OFF)\n" "proxy"; fi
	@printf "\n"

# ============================================================
##@ 清理
# ============================================================

.PHONY: clean
clean: ## 清理构建产物、日志、截图
	@rm -rf web/dist artifacts
	@printf "  $(C_OK)已清理 web/dist 与 artifacts$(C_OFF)\n"

.PHONY: clean-all
clean-all: clean ## 追加清理 node_modules 与本地数据库
	@rm -rf node_modules web/node_modules server/node_modules server/data
	@printf "  $(C_OK)已清理依赖与数据库$(C_OFF)\n"

.PHONY: reset
reset: stop clean-all ## 回到全新状态（装依赖前）
	@printf "  $(C_DIM)已重置。重新开始: make setup && make dev$(C_OFF)\n"

# ============================================================
# 内部辅助
# ============================================================

.PHONY: ensure-env
ensure-env:
	@if [ ! -f $(ENV_FILE) ]; then \
	  cp server/.env.example $(ENV_FILE); \
	  printf "  $(C_WARN)已自动生成 $(ENV_FILE)（来自 .env.example）$(C_OFF)\n"; \
	fi
