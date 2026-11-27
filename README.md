# Anti-Claude

**简体中文** | [English](README.en.md)

让 Google Antigravity 桌面端拥有接近 `Claude.app`（Code / Cowork）风格的 **AI 回答节奏、过程呈现形式与界面交互**。

它不只是一套界面样式——除了优化视觉排版与高频控件，还同时改写了 Agent 的输出习惯与前端渲染逻辑：把原生「闷头调工具、跑完折叠成黑盒」改成「边做边汇报 + 平铺实时步骤流」。全程通过本地 CDP 注入与用户目录配置实现，不改 `Antigravity.app` 安装包，不破签名。

![Anti-Claude 效果预览](assets/preview.png)

## 安装

需要 macOS 与 Node.js `>= 22`。

```bash
git clone https://github.com/victorcheng2333/Anti-Claude.git ~/Developer/Anti-Claude
node ~/Developer/Anti-Claude/install.mjs install
```

也可以直接发给 Antigravity 或 Claude Code：`帮我安装 https://github.com/victorcheng2333/Anti-Claude`。装完当前窗口直接热生效，不用重启客户端。

常用命令：

```bash
node ~/Developer/Anti-Claude/install.mjs install --cli-only    # 仅安装 Antigravity CLI (agy) 支持（跨平台免桌面端）
node ~/Developer/Anti-Claude/install.mjs sync-upgrade --force  # 拉取更新并热重载
node ~/Developer/Anti-Claude/install.mjs doctor                # 检查各层状态（含桌面端与 CLI）
node ~/Developer/Anti-Claude/install.mjs uninstall             # 卸载并还原原配置
```

## 改了什么

### 1. AI 的回答方式与执行呈现

原生 Antigravity 默认把推理藏在 `thinking` 里不说话，连跑十几个工具也不吭声，回合一结束还把整轮步骤收进「已工作 Xm」（知识工作模式下工具记录跑完直接销毁）。本项目把这套黑盒流程改成了两件事：

- **边做边汇报与原生清单强触发**：去掉空洞客套话，AI 每次调工具前先用一两句短话讲清「刚查到什么、下一步干什么」，形成「一句进展 → 一行可展开工具摘要 → 下一句进展」的节奏；对 3 步以上任务（含排查诊断、日志分析、调研优化、多文件改动）主动首轮并行触发官方原生 `update_steps` 步骤清单与 `update_focus` 实时状态，进展汇报、命令摘要与步骤标题均自动跟随你的对话语言（默认简体中文）。
- **完整步骤平铺与实时读秒**：自动解锁客户端隐藏的完整步骤引擎，拆掉回合末的「已工作 Xm」外层二次折叠；正在执行的工具行显示蓝色旋转点与读秒，思考展开区退为次级灰字，主次分明。

### 2. 客户端界面与高频交互

- **配色与双栏统一排版**：浅色纯白、深色暖炭灰，去掉双层套娃输入框与多余角标；全局统一苹果原生系统字体（`SF Pro` + `PingFang SC`，支持在设置中分别调节 **界面字体大小 `12–16px`**〔默认 `13px`〕与 **对话正文字体大小 `13–18px`**〔默认 `14px`〕，并支持 `94.5% / 95% / 100%` 三档中文字高校准实时切换），正文与气泡防段尾单字孤行并开启连续全角标点挤压，左右双栏统一 `1/8` 字宽原生留白与 `zh-CN` 避头尾禁则。
- **分层模型菜单与额度圆环**：把平铺的模型菜单收成 5 个常用主力模型（数字键 `1–5` 秒切，默认展示 `Gemini 4 Neon`、`Gemini 4 Hydrogen`、`Orchestrator · Gemini 4 Neon`、`Claude Opus 5.5`、`Claude Sonnet 5.5`），「思考强度」（`Low / Medium / High / Extra`）和「更多模型」拆入二级菜单（其余模型归入「其他模型」，剩余编排器归入「多智能体编排」）；进入「更多模型 → 多智能体编排」后，全面适配 `v2.34+` 编排器规划列表（`Gemini 4 Carbon/Argon` 与 `Claude Opus 5.5`），支持右侧三级展开各主模型的思考强度，并在编排区底部提供独立「执行模型」副行（严格按官方 `orchestrator-model-roles` 白名单过滤并与原生设置双向同步）。菜单底部的「官方菜单」一行（或按住 `⌥ Option` 点模型按钮）随时打开 Antigravity 原生模型菜单，智能体（Agent）选择器、Best-of-N 以及官方新版本追加的选项都不会被遮住。模型旁增加上下文占用圆环，点开查看 5 小时 / 每周套餐额度、一键压缩当前上下文并实时同步压缩状态；底栏保留 `tok/s · TTFT`，悬停查看缓存命中率与分项耗时。
- **右侧「概览」增强仪表盘**：将右侧面板升级为集紧凑四宫格快捷入口、原生产物卡片、本地工作环境与 Git 脏状态、上下文缓存拆解与命中率 + 一键 `Compact`、谷歌蓝 20 段双窗口已用额度条（带时间进度游标并随模型切换自动联动）、子智能体（Side chats）以及折叠式 MCP / 技能 / 规则清单于一体的实时仪表盘。
- **长代码块折叠与顶栏吸顶**：超过 40 行的代码块默认收起为渐隐预览，底部一键「展开全部 · 共 N 行」（展开/收起选择跨虚拟滚动记忆），滚动时代码块顶栏的语言名与复制按钮始终吸顶。
- **Claude 风格「项目」工作区与「技能与自定义」增强**：在侧栏「自动化任务」与「技能与自定义」之间新增独立「项目」入口，复刻 Claude Desktop 三级交互流（项目卡片墙 → 项目详情工作台：含支持完整 `@` 引用菜单、剪贴板粘贴/拖入图片与 `⌘+点击` 打开 URL 的项目专属开聊框、多文件夹关联切换、历史对话、所见即所得双向直通读写项目根目录 `AGENTS.md` 指令（支持预览与一键访达定位）、参考文件与项目定时任务 → 一键直达对话）；同时为「技能与自定义」页补齐分类标签切换、技能卡片化排版以及原生缺失的「`+ 添加技能`」「`+ 新建子 Agent`」向导与本地导入。
- **侧栏顶部「最近对话」+ 原生「项目」分项目共存、状态防误点优化、全场景拖拽引用与气泡内撤回重编**：默认保留原生「项目」分项目二级目录，并在上方同时展示可折叠的「最近对话」快捷列表实现双视图共存；你也可以随时在 **Settings → UI Enhancements** 里切换「侧栏顶部『最近对话』」或「侧栏统一『最近对话』」（开启统一模式后会隐藏原生分组，在顶部 `Pinned` 下方用全量混排的「最近对话」统一展示全部项目与普通对话，支持悬停查看所属项目与快捷置顶）。无论是双视图共存还是统一模式，均支持行内重命名与完整对齐原生的右键菜单（统一模式另附 `⋯` 按钮）：直达所属项目、`重命名`、`置顶对话`、`标为未读`、`转为中文标题`（英文标题条目）、`复制`二级子菜单（`对话名称` / `对话 ID` / `项目名称`）、`分屏`二级子菜单（`向右分屏` / `向下分屏` / `替换为新对话`）、`归档`与二次确认`删除`；同时将侧栏原生后台任务态易混淆的静态 `>_` 图标统一替换为谷歌蓝双点轨道旋转动画，并隐藏对话行悬停操作区中易误点的「Stop execution」与「Archive conversation」按钮（保留置顶、更多菜单及输入区停止按钮，归档照旧可在「⋮」或右键菜单操作）。**超越官方 `v2.34+` 原版（原版仅支持拖右侧辅助栏顶部的子代理标签页，拖左栏对话只会触发分屏而无法引用）：Anti-Claude 将左栏「最近对话」、「置顶对话」（拖出侧栏带跟随鼠标悬浮小卡片，覆盖整个对话区并同步触发原生淡入高亮动画，按住 `Option`/`Alt` 拖拽可保留分屏）及项目内对话/参考文件全部打通，直接拖进任意输入框即可插入 `@对话` / `@文件` 引用胶囊。** 点击消息「撤回」时直接在原气泡内展开编辑框修改重发，可选是否同步回滚代码改动。
- **默认英文、实时汉化开关、独立字号调节、中文对话标题纠偏与设置侧栏收纳**：项目默认保持英文原版界面；在客户端「Settings → UI Enhancements（设置 → 界面增强）」内可单独免重启开关全部增强模块、切换「中文界面汉化」、分别调节 **界面字体大小（`12–16px`，默认 `13px`）** 与 **对话正文字体大小（`13–18px`，默认 `14px`）**、`94.5% / 95% / 100%` 中文字高校准以及「中文对话标题自动纠偏」（当中文提问被原生误生成英文标题时，通过隔离的本机 `agy -p` 自动纠正为简洁中文标题并保留技术英文词，同时支持设置页一键批量修正历史英文标题与侧栏右键单条转换），并将设置侧栏冗长的「项目 / 未关联项目」用量范围收纳进三级折叠「统计」菜单。macOS 下后台自动跟随客户端升级重挂注入（兼容 `v2.33+` 移除默认调试端口的改动）。

### 3. Antigravity CLI（`agy`）支持

- **自动识别与纯 CLI 模式**：默认运行 `install` 时若检测到本机已安装 `agy` 或存在 `~/.gemini/antigravity-cli`，会自动一并配置 CLI 支持（可用 `--no-cli` 跳过）；也可运行 `install --cli-only` 仅部署 CLI 层，无需桌面端或 CDP，支持 macOS / Linux / Windows。
- **零依赖 Claude 风格终端状态栏**：自动部署 `~/.gemini/antigravity-cli/anti-claude-statusline.mjs` 并在 `~/.gemini/antigravity-cli/settings.json` 中启用 `statusLine`，实时展示当前模型、分级配色上下文进度条、Git 分支与脏状态、工作区名及运行状态，并随终端宽度自动精简防换行（可用 `--no-cli-statusline` 跳过）。
- **共享规则与无损回滚**：复用 `~/.gemini/AGENTS.md`（非交互终端自动降级选项提示），升级时尊重用户手动改过的 `statusLine` 配置，执行 `uninstall` 时逐项还原原配置并清理脚本。

## 本机改动范围

安装器不触碰 `/Applications/Antigravity.app`，仅修改以下用户层文件（全部记录在 `~/.gemini/antigravity/anti-claude/install-state.json`，执行 `uninstall` 逐项还原）：

- `~/.gemini/AGENTS.md`：写入「边做边汇报 + 原生 `update_steps`/`update_focus` 强触发 + 交互式选择卡」协作规则（可用 `--no-agents-rule` 跳过）。
- `antigravity_state.pbtxt` 与 `~/.gemini/config/config.json`：开启完整步骤详情展示（可用 `--no-step-unlock` 跳过）。
- `~/.gemini/antigravity/anti-claude/user/`：写入样式、脚本与配置，由仓库内置零依赖 `core/` CDP 守护进程直接驱动（升级时通过三路合并保留本地自定义改动；旧版 `theme-patch` 环境会自动迁移配置并清理退役）。
- `~/.gemini/antigravity-cli/anti-claude-statusline.mjs` 与 `~/.gemini/antigravity-cli/settings.json`：检测到 `agy` 或传入 `--cli` / `--cli-only` 时部署终端状态栏并启用 `statusLine`（可用 `--no-cli` 或 `--no-cli-statusline` 跳过）。
- `~/Library/LaunchAgents/com.antigravity.anti-claude.{daemon,autosync}.plist`：运行自有 CDP 热注入与实时指标守护进程，并监听客户端升级自动重挂（`--no-auto-update` 可跳过定期远程拉取）。

## 致谢与许可

基于 [@hongqi7/Anti-Claude](https://github.com/hongqi7/Anti-Claude) 定制。自带零外部依赖的独立 CDP 注入与 SQLite 遥测内核，早期架构与部分配色思路曾参考 [@Anarcadia/chuanban-antigravity-theme-patch](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) 与 [@AlexByoung/Claudized-Antigravity](https://github.com/AlexByoung/Claudized-Antigravity)。MIT License。
