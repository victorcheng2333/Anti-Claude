---
name: anti-claude
description: Deploy Anti-Claude's Claude-inspired desktop UI, typography, stratified model selector, live context & plan quota popover, in-bubble undo & edit, sidebar top Recents & collapsed folder badges, native Settings module switches, interleaved step stream, and in-flow live TodoWrite checklist card onto Google Antigravity Desktop 2.0 via non-invasive CDP runtime injection.
---

# Anti-Claude — Agent Auto-Deployment Skill

Only run these steps when the user **explicitly asks to install, update, or uninstall** `Anti-Claude`. If the user only shares the URL or asks you to read, review, or evaluate the project, do **not** install anything.

The installer changes user config (`~/.gemini/antigravity/anti-claude/user/` files, `product_skin`, `verboseConversationSteps`, a rule block in `~/.gemini/AGENTS.md`) and records every change for rollback. Tell the user this before running it.

## Prerequisites
- Google Antigravity Desktop 2.0 (`v2.30+`, tested through `v2.34.0`) on macOS, Windows, or Linux (or Antigravity CLI `agy` via `--cli-only`)
- Node.js `>= 22`

## 1-Step Installation (Fresh Install or Update to Latest)
1. Clone this repository (or pull the latest `main` if already cloned) and run the installer:
   ```bash
   if [ -d "$HOME/Developer/Anti-Claude/.git" ]; then
     git -C "$HOME/Developer/Anti-Claude" pull --ff-only
   else
     git clone https://github.com/victorcheng2333/Anti-Claude.git "$HOME/Developer/Anti-Claude"
   fi
   node "$HOME/Developer/Anti-Claude/install.mjs" install
   node "$HOME/Developer/Anti-Claude/install.mjs" doctor
   ```
2. What `node install.mjs install` automatically handles:
   - Starts Anti-Claude's self-contained, zero-dependency CDP & SQLite metrics daemon (`core/daemon.mjs` via `com.antigravity.anti-claude.daemon`), automatically migrating any user overrides and retiring legacy `theme-patch` installations if present;
   - Automatically copies official Anthropic variable fonts from `/Applications/Claude.app/Contents/Resources/fonts` on macOS if `Claude.app` is installed locally;
   - Deploys all 4 user-layer files (`config.json`, `custom.css`, `custom.js`, `i18n.override.json`) into `~/.gemini/antigravity/anti-claude/user/` with `base/` 3-way JSON merge baselines and `install-state.json` rollback manifest;
   - Enables the stratified Model Selector (`Models · This chat`, `1–5` quick keys defaulting to `Gemini 4 Neon`, `Gemini 4 Hydrogen`, `Orchestrator · Gemini 4 Neon`, `Claude Opus 5.5`, `Claude Sonnet 5.5`, plus separate `Thinking effort >` & `More models >` flyouts), radial Context Progress Ring + live 5h/weekly Quota Popover, Claude-style `Projects` workspace (`AGENTS.md`, local context files & scheduled tasks), `Skills & Customizations` category tabs + `+ Add Skill` / `+ New Subagent` wizards, sidebar top `Recents` + native `Projects` coexistence by default (with live toggles for `Top Sidebar Recents` and `Unified Sidebar Recents`) & collapsed folder status badges, in-bubble Undo & Edit, and clean Settings sidebar (collapsible `Stats` tree + `UI Enhancements` live switches including `Chinese UI Localization` and `94.5% / 95% / 100%` CJK font scale);
   - Unlocks Antigravity's hidden Developer Step Stream (`project4kMode = 1` / `PRODUCT_SKIN_DEVELOPER` + `verboseConversationSteps = true`) via live CDP and persistent config so intermediate tool & MCP calls are never wiped;
   - Prepends an idempotent `<!-- BEGIN anti-claude -->` rule block to `~/.gemini/AGENTS.md` enabling language-adaptive Claude-style mid-turn progress updates, invisible `<!-- todo:N/M -->` progression, `ask_question` interactive choice cards, official-blue orbiting step timers (`#2F75C3` / `#2F71E3`), and in-flow 3-state `- [ ]` / `- [/]` / `- [x]` live checklist cards compatible with both Developer and Knowledge Work modes;
   - Registers the `0-token` macOS `launchd` auto-sync watcher (`com.antigravity.anti-claude.autosync`), handles `v2.33.0+` macOS cold-launch `--remote-debugging-port=0` auto-bootstrap natively inside `core/daemon.mjs` (keeping `/Applications/Antigravity.app`'s Apple code signature 100% untouched), and triggers immediate hot-reload in the running Antigravity window.

## After an Antigravity Update
If a feature stops working, run `node "$HOME/Developer/Anti-Claude/install.mjs" compat` with Antigravity open. It probes every private Antigravity surface the patch relies on and reports each broken one as a `host dependency degraded: <id> (<reason>) → affects <features>` warning. The same list is shown under Settings → UI Enhancements → Compatibility. Fix entries in `HOST_COMPAT_DEPS` (`user/custom.js`) first.

## Clean Rollback
```bash
node "$HOME/Developer/Anti-Claude/install.mjs" uninstall
```
Stops the background daemon and auto-update watcher, performs live DOM teardown on the running Antigravity window, removes deployed `~/.gemini/antigravity/anti-claude/` files (saving any post-install local edits to a side folder first), reverts the step-stream settings it changed, and removes the rule block from `~/.gemini/AGENTS.md`. Running it twice is a no-op.

Options: `install [--cli | --cli-only | --no-cli | --no-cli-statusline] [--no-auto-update] [--no-step-unlock] [--no-agents-rule] [--overwrite-local]`. Feature switches live in `user/config.json` → `modules.claudeUx*`. Never touches `/Applications/Antigravity.app/Contents/Resources/app.asar`.
