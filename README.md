# Anti-Claude

**English** | [简体中文](README.zh-CN.md)

Bring a Claude.app-inspired **AI execution rhythm, step-stream presentation, and desktop UI** to Google Antigravity Desktop.

More than a theme—beyond refining Antigravity's visual polish and everyday controls, Anti-Claude reshapes both the agent's narration habits and frontend rendering, turning silent tool batches and post-turn black-box collapses into an interleaved **"narrate as you work + unfolded live step stream"** flow. Everything runs via local CDP injection and user-directory configuration—`/Applications/Antigravity.app` is never modified and its code signature stays intact.

![Anti-Claude Preview](assets/preview.png)

## Installation

Requires macOS and Node.js `>= 22`.

```bash
git clone https://github.com/victorcheng2333/Anti-Claude.git ~/Developer/Anti-Claude
node ~/Developer/Anti-Claude/install.mjs install
```

Or simply ask Antigravity or Claude Code: `Install https://github.com/victorcheng2333/Anti-Claude for me`. Changes hot-reload into the running window immediately—no restart required.

Common commands:

```bash
node ~/Developer/Anti-Claude/install.mjs install --cli-only    # Antigravity CLI (agy) only — macOS / Linux / Windows
node ~/Developer/Anti-Claude/install.mjs sync-upgrade --force  # Pull updates and hot-reload
node ~/Developer/Anti-Claude/install.mjs doctor                # Inspect health of all layers (Desktop & CLI)
node ~/Developer/Anti-Claude/install.mjs uninstall             # Uninstall and restore original config
```

## What Changes

### 1. AI Execution Rhythm & Step Presentation

By default, Antigravity hides reasoning inside collapsed `thinking` blocks, runs dozens of tool calls silently, and folds the entire turn under a single `Worked for Xm` wrapper when finished (or discards tool rows completely in Knowledge Work mode). Anti-Claude changes this in two ways:

- **Interleaved narration & proactive native checklist**: Strips empty filler; before each tool call, the agent writes 1–2 concise sentences explaining what it just found and what it is checking next, creating a clean `brief update → expandable tool row → next update` rhythm. For multi-step work (including diagnostics, log analysis, research, and multi-file edits), prompts the agent to proactively trigger Antigravity's native `update_steps` checklist and `update_focus` status in parallel from turn one. Progress updates, command summaries, and step labels automatically match the user's conversation language (defaulting to Simplified Chinese).
- **Unfolded step stream & live elapsed timers**: Automatically unlocks the client's full step-detail engine and unwraps the outer end-of-turn `Worked for Xm` collapse. Actively running tool rows show orbiting blue dots with a live elapsed timer, while expanded thinking blocks step back into muted grey prose.

### 2. Desktop UI & Everyday Controls

- **Claude palette & unified typography**: Pure-white light mode and warm charcoal dark mode, removing nested composer chrome and redundant badges. Uses Apple native system typography (`SF Pro` + optical-matched `PingFang SC` at 14px with live `94.5% / 95% / 100%` CJK scale calibration) with orphan-character prevention, CJK/Latin spacing, and isolated native-caret handling for dictation/IME inputs.
- **Layered model picker & context ring**: Condenses the flat model list into 5 primary models (`1–5` shortcuts: `Gemini 4 Neon`, `Gemini 4 Hydrogen`, `Orchestrator · Gemini 4 Neon`, `Claude Opus 5.5`, `Claude Sonnet 5.5`) with dedicated `Thinking effort` (`Low / Medium / High / Extra`) and `More models` flyouts (grouping all other models under `Other models` and the remaining orchestrators under `Orchestrators`). Inside `More models → Orchestrators`, supports `v2.34+` Orchestrator planners (`Gemini 4 Carbon`, `Gemini 4 Argon`, and `Claude Opus 5.5`) with Level-3 cascading planner thinking-effort menus plus a dedicated `Executor model` row strictly filtered to Antigravity's official `orchestrator-model-roles` whitelist. A `Native menu` row (or `⌥ Option`+click on the model button) always opens Antigravity's own model menu, so official options this menu does not render — the Agent selector, Best-of-N, anything a new release adds — are never hidden. Adds a live context-usage ring beside the model selector—click to inspect real 5-hour / weekly plan quotas and trigger one-click `/compact`, while keeping `tok/s · TTFT` in the footer with a hover breakdown of cache hit rate and turn timings.
- **Enhanced right `Overview` dashboard**: Upgrades the right-hand Overview panel into a unified dashboard combining a compact 4-tile shortcut grid, promoted native Artifacts, Workspace environment & live Git status, cached/uncached Context breakdown + hit rate + one-click `Compact`, Google Blue 20-segment dual-window quota bars with elapsed-time cursors (reactive to active model family), live Subagents (`Side chats`), and a collapsible Connectors/Skills/Rules inventory.
- **Long code folding & sticky code headers**: Code blocks over 40 lines collapse to a faded preview with a one-click "Show all N lines" bar (your expand/collapse choice survives virtualized scrolling), and every code block header—language label and copy button—stays pinned while you scroll.
- **Claude-style Projects workspace & Customizations manager**: Adds a dedicated `Projects` entry between `Automations` and `Skills & Customizations` with a 3-level Claude Desktop flow—project card grid, project detail workbench (project-scoped composer with full `@` mention menu, clipboard image paste/drop & `⌘+Click` URLs, multi-folder picker, project chat history, WYSIWYG two-way root `AGENTS.md` instructions editor with one-click Finder reveal, reference files, and scheduled tasks), and one-click chat navigation—plus category tabs, framed skill cards, and native-missing `+ Add Skill` / `+ New Subagent` creation & local import wizards on `Skills & Customizations`.
- **Sidebar `Recents` + `Projects` coexistence, full drag-to-cite & in-bubble undo/edit**: By default keeps the native per-project `Projects` tree while placing a collapsible Claude-style `Recents` quick section above it so both views coexist; you can also toggle **Top Sidebar Recents** or **Unified Sidebar Recents** anytime in **Settings → UI Enhancements** to switch between coexistence and a single unified scrollable `Recents` list below `Pinned` (mixing all project and standalone conversations with hover project tooltips, quick pin, inline rename, archive, two-step delete, and direct jump to the owning project). **Goes beyond native `v2.34+` (where only right-hand auxiliary pane tabs can be dragged to cite while left-sidebar rows only trigger split-pane): Anti-Claude unlocks direct drag-to-cite across all left-sidebar `Recents`, `Pinned` conversations (with a cursor-following ghost pill outside the sidebar, native drop fade-in highlight across the conversation pane, and `Option`/`Alt`-drag split-pane fallback), and Project chats/reference files into both native and Project composers.** Clicking Undo expands an inline editor directly inside the original user bubble with file-revert preview and original attachment preservation.
- **English by default, live UI & font controls, and clean Settings sidebar**: Keeps the native English UI by default; open **Settings → UI Enhancements** to toggle every module individually in 0ms—including **Chinese UI Localization** and **CJK Optical Font Scale (`94.5% / 95% / 100%`)**—while tucking verbose `Projects` & `Not in Project` token-scope lists under a collapsible 3-level `Stats` menu. A macOS LaunchAgent automatically re-attaches after Antigravity updates (including `v2.33+` CDP port changes).

### 3. Antigravity CLI (`agy`) Support

- **Auto-detected or standalone CLI mode**: Running `install` automatically configures Antigravity CLI (`agy`) when detected alongside Desktop (disable with `--no-cli`), or run `install --cli-only` on macOS, Linux, or Windows to install CLI support without requiring Antigravity Desktop or CDP.
- **Zero-dependency Claude-style status line**: Deploys `~/.gemini/antigravity-cli/anti-claude-statusline.mjs` and wires `statusLine` in `~/.gemini/antigravity-cli/settings.json` to display active model, color-coded context progress bar, Git branch/dirty marker, workspace name, and live agent state with automatic narrow-terminal adaptation (skip with `--no-cli-statusline`).
- **Shared execution rules & clean rollback**: Shares `~/.gemini/AGENTS.md` (with graceful terminal fallback when `ask_question` is unavailable), respects user edits to `settings.json` / statusline scripts on `sync-upgrade`, and restores prior `statusLine` settings cleanly on `uninstall`.

## Local Footprint

The installer never touches `/Applications/Antigravity.app`. It only manages the following user-level files (tracked in `~/.gemini/antigravity/anti-claude/install-state.json` and cleanly restored on `uninstall`):

- `~/.gemini/AGENTS.md`: Adds the execution-sync, proactive native `update_steps` / `update_focus`, and `ask_question` collaboration rule block (skip with `--no-agents-rule`).
- `antigravity_state.pbtxt` & `~/.gemini/config/config.json`: Enables detailed step visibility (skip with `--no-step-unlock`).
- `~/.gemini/antigravity/anti-claude/user/`: Deploys standalone CSS, JS, and config powered by Anti-Claude's built-in zero-dependency `core/` CDP runtime (preserves local customizations via 3-way JSON merge; legacy `theme-patch` installs are migrated and retired automatically).
- `~/.gemini/antigravity-cli/anti-claude-statusline.mjs` & `~/.gemini/antigravity-cli/settings.json`: Deploys the zero-dependency CLI status bar and enables `statusLine` when `agy` is detected or `--cli` / `--cli-only` is passed (skip with `--no-cli` or `--no-cli-statusline`).
- `~/Library/LaunchAgents/com.antigravity.anti-claude.{daemon,autosync}.plist`: Runs the standalone CDP injection & metrics daemon and watches client upgrades periodically (`--no-auto-update` skips periodic git sync).

## Credits & License

Forked from [@hongqi7/Anti-Claude](https://github.com/hongqi7/Anti-Claude). Self-contained zero-dependency CDP runtime and telemetry engine, with early architecture & color inspiration from [@Anarcadia/chuanban-antigravity-theme-patch](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) and [@AlexByoung/Claudized-Antigravity](https://github.com/AlexByoung/Claudized-Antigravity). MIT License.
