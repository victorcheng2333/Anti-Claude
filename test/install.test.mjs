/**
 * Installer regression tests. Zero dependencies: `node --test test/`
 * Every test runs install.mjs against a throw-away HOME using Anti-Claude's built-in core/.
 * Network, launchd, CDP and font copying are disabled through env switches.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(REPO, 'install.mjs');

function makeHome({ withPreExistingUserFiles = false, withAllUserFiles = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-claude-test-'));
  const agy = path.join(home, '.gemini', 'antigravity');
  const userDir = path.join(agy, 'anti-claude', 'user');
  fs.mkdirSync(agy, { recursive: true });
  if (withPreExistingUserFiles) {
    fs.mkdirSync(userDir, { recursive: true });
    const u = (f, c) => fs.writeFileSync(path.join(userDir, f), c);
    u('custom.css', '/* my original css */\n');
    u('config.json', JSON.stringify({ enabled: true, modules: { i18n: true } }, null, 2));
    if (withAllUserFiles) {
      u('custom.js', '/* my original js */\n');
      u('i18n.override.json', '{"Hello":"你好"}\n');
    }
  }
  fs.writeFileSync(path.join(agy, 'antigravity_state.pbtxt'), 'foo: 1\nproduct_skin: PRODUCT_SKIN_NON_TECHNICAL\n');
  fs.mkdirSync(path.join(home, '.gemini', 'config'), { recursive: true });
  fs.writeFileSync(path.join(home, '.gemini', 'config', 'config.json'), JSON.stringify({ userSettings: { verboseConversationSteps: false, other: 1 } }));
  fs.writeFileSync(path.join(home, '.gemini', 'AGENTS.md'), '# my rules\n');
  return {
    home,
    user: (f) => path.join(userDir, f),
    read: (rel) => fs.readFileSync(path.join(home, rel), 'utf8'),
    readUser: (f) => fs.readFileSync(path.join(userDir, f), 'utf8'),
    exists: (rel) => fs.existsSync(path.join(home, rel)),
    cleanup: () => fs.rmSync(home, { recursive: true, force: true })
  };
}

function parseTrailingJson(s) {
  const starts = s.startsWith('{') ? [0] : [];
  for (let i = s.indexOf('\n{'); i !== -1; i = s.indexOf('\n{', i + 1)) starts.push(i + 1);
  for (let j = starts.length - 1; j >= 0; j--) {
    try {
      return JSON.parse(s.slice(starts[j]).trim());
    } catch {}
  }
  return null;
}

function run(h, args, env = {}) {
  const r = spawnSync(process.execPath, [INSTALL, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: h.home,
      ANTI_CLAUDE_NO_NETWORK: '1',
      ANTI_CLAUDE_NO_LAUNCHD: '1',
      ANTI_CLAUDE_NO_CDP: '1',
      ANTI_CLAUDE_NO_FONTS: '1',
      ANTI_CLAUDE_NO_CLI: '1',
      FAKE_VERIFY_OK: '1',
      ...env
    }
  });
  return { status: r.status, out: parseTrailingJson(r.stdout || ''), stdout: r.stdout, stderr: r.stderr };
}

test('fresh install deploys standalone user layer and uninstall removes state cleanly', () => {
  const h = makeHome({ withPreExistingUserFiles: false });
  try {
    const before = {
      pbtxt: h.read('.gemini/antigravity/antigravity_state.pbtxt'),
      agents: h.read('.gemini/AGENTS.md')
    };
    const inst = run(h, ['install']);
    assert.equal(inst.status, 0, inst.stderr);
    assert.equal(inst.out.status, 'ok', JSON.stringify(inst.out));
    assert.equal(h.exists('.gemini/antigravity/theme-patch'), false, 'no external theme-patch directory created');
    assert.match(h.readUser('custom.js'), /__agClaudeUxDispose/);
    assert.match(h.read('.gemini/antigravity/antigravity_state.pbtxt'), /PRODUCT_SKIN_DEVELOPER/);
    assert.equal(JSON.parse(h.read('.gemini/config/config.json')).userSettings.verboseConversationSteps, true);
    assert.match(h.read('.gemini/AGENTS.md'), /BEGIN anti-claude/);
    assert.match(h.read('.gemini/AGENTS.md'), /执行进度同步/);
    assert.match(h.read('.gemini/AGENTS.md'), /与用户当前一致的语言/);
    assert.match(h.read('.gemini/AGENTS.md'), /update_steps/);
    assert.match(h.read('.gemini/AGENTS.md'), /ask_question/);

    const un = run(h, ['uninstall']);
    assert.equal(un.status, 0, un.stderr);
    assert.equal(h.read('.gemini/antigravity/antigravity_state.pbtxt'), before.pbtxt);
    const cfg = JSON.parse(h.read('.gemini/config/config.json'));
    assert.equal(cfg.userSettings.verboseConversationSteps, false);
    assert.equal(cfg.userSettings.other, 1);
    assert.equal(h.read('.gemini/AGENTS.md'), before.agents);
    assert.equal(h.exists('.gemini/antigravity/anti-claude'), false);
  } finally {
    h.cleanup();
  }
});

test('pre-existing user files are backed up on install and restored on uninstall; second uninstall is a no-op', () => {
  const h = makeHome({ withPreExistingUserFiles: true, withAllUserFiles: false });
  try {
    const beforeCss = h.readUser('custom.css');
    const beforeCfg = h.readUser('config.json');
    run(h, ['install']);
    assert.ok(fs.existsSync(h.user('custom.js')));

    const un = run(h, ['uninstall']);
    assert.equal(un.status, 0, un.stderr);
    assert.equal(fs.existsSync(h.user('custom.js')), false);
    assert.equal(fs.existsSync(h.user('i18n.override.json')), false);
    assert.equal(h.readUser('custom.css'), beforeCss);
    assert.equal(h.readUser('config.json'), beforeCfg);
    assert.equal(h.exists('.gemini/antigravity/anti-claude/install-state.json'), false);

    const again = run(h, ['uninstall']);
    assert.equal(again.status, 0);
    assert.equal(again.out.noop, true);
    assert.equal(h.readUser('custom.css'), beforeCss);
  } finally {
    h.cleanup();
  }
});

test('sync keeps user edits: JSON overrides survive, edited CSS is not overwritten', () => {
  const h = makeHome();
  try {
    run(h, ['install']);
    const cfg = JSON.parse(h.readUser('config.json'));
    assert.equal(cfg.modules.i18n, false, 'default config keeps English UI (i18n: false)');
    cfg.modules.i18n = true;
    cfg.contextLimit = 999;
    fs.writeFileSync(h.user('config.json'), JSON.stringify(cfg, null, 2));
    fs.appendFileSync(h.user('custom.css'), '\n/* my tweak */\n');

    const s = run(h, ['sync-upgrade', '--force']);
    assert.equal(s.status, 0, s.stderr);
    const after = JSON.parse(h.readUser('config.json'));
    assert.equal(after.modules.i18n, true);
    assert.equal(after.contextLimit, 999);
    assert.match(h.readUser('custom.css'), /my tweak/);

    /* explicit overwrite saves the local copy first */
    const o = run(h, ['sync-upgrade', '--overwrite-local']);
    assert.equal(o.status, 0);
    assert.doesNotMatch(h.readUser('custom.css'), /my tweak/);
    const saves = fs.readdirSync(path.join(h.home, '.gemini/antigravity/anti-claude/local-saves'));
    assert.ok(saves.some((f) => f.endsWith('custom.css')));
  } finally {
    h.cleanup();
  }
});

test('uninstall keeps post-install edits in a saved copy', () => {
  const h = makeHome({ withPreExistingUserFiles: true });
  try {
    run(h, ['install']);
    fs.appendFileSync(h.user('custom.css'), '\n/* edited after install */\n');
    const un = run(h, ['uninstall']);
    assert.equal(un.out.files.savedLocalEdits.length, 1);
    assert.match(fs.readFileSync(un.out.files.savedLocalEdits[0], 'utf8'), /edited after install/);
    assert.equal(h.readUser('custom.css'), '/* my original css */\n');
  } finally {
    h.cleanup();
  }
});

test('background sync does not re-add a removed AGENTS.md rule or re-force step settings', () => {
  const h = makeHome();
  try {
    run(h, ['install']);
    fs.writeFileSync(path.join(h.home, '.gemini/AGENTS.md'), '# my rules\n');
    fs.writeFileSync(path.join(h.home, '.gemini/antigravity/antigravity_state.pbtxt'), 'product_skin: PRODUCT_SKIN_NON_TECHNICAL\n');
    const s = run(h, ['sync-upgrade']);
    assert.equal(s.out.ruleStatus, 'absent_respected');
    assert.doesNotMatch(h.read('.gemini/AGENTS.md'), /anti-claude|antigravity-claude-ux/);
    assert.match(h.read('.gemini/antigravity/antigravity_state.pbtxt'), /NON_TECHNICAL/);
  } finally {
    h.cleanup();
  }
});

test('live verify ok:false is reported as partial, not success', () => {
  const h = makeHome();
  try {
    const r = run(h, ['install'], { FAKE_VERIFY_OK: '0' });
    assert.equal(r.status, 0);
    assert.equal(r.out.ok, false);
    assert.equal(r.out.status, 'partial');
    assert.equal(r.out.verify.ok, false);
    assert.ok(r.out.warnings.some((w) => /verify/.test(w)));
  } finally {
    h.cleanup();
  }
});

test('legacy theme-patch installs migrate user overrides to anti-claude/user and retire theme-patch cleanly', () => {
  const h = makeHome({ withPreExistingUserFiles: false });
  try {
    /* Simulate <= v2.3.9 layout: state in anti-claude/, live files in theme-patch/user/, wrapper script in scripts/ */
    const agy = path.join(h.home, '.gemini/antigravity');
    const legacyUserDir = path.join(agy, 'theme-patch/user');
    const stateDir = path.join(agy, 'anti-claude');
    fs.mkdirSync(legacyUserDir, { recursive: true });
    fs.mkdirSync(path.join(stateDir, 'base'), { recursive: true });
    fs.mkdirSync(path.join(stateDir, 'backup'), { recursive: true });
    fs.mkdirSync(path.join(agy, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(agy, 'scripts/antigravity-font-daemon.mjs'), '// legacy wrapper\n');

    const filesMeta = {};
    for (const f of ['config.json', 'custom.css', 'custom.js', 'i18n.override.json']) {
      const tmpl = fs.readFileSync(path.join(REPO, 'user', f), 'utf8');
      fs.writeFileSync(path.join(stateDir, 'base', f), tmpl);
      fs.writeFileSync(path.join(stateDir, 'backup', f), '/* stock upstream */\n');
      fs.writeFileSync(path.join(legacyUserDir, f), tmpl);
      filesMeta[f] = { existedBefore: true, deployedSha: 'legacy' };
    }
    /* User enabled i18n in legacy theme-patch/user/config.json */
    const customCfg = JSON.parse(fs.readFileSync(path.join(legacyUserDir, 'config.json'), 'utf8'));
    customCfg.modules.i18n = true;
    fs.writeFileSync(path.join(legacyUserDir, 'config.json'), JSON.stringify(customCfg, null, 2));

    fs.writeFileSync(
      path.join(stateDir, 'install-state.json'),
      JSON.stringify({
        schema: 2,
        installedAt: Date.now() - 10000,
        options: { desktop: true, cli: false, stepUnlock: true, agentsRule: true, autoUpdate: false },
        files: filesMeta,
        settings: {},
        agentsRule: { inserted: false },
        sync: {}
      })
    );

    const s = run(h, ['sync-upgrade']);
    assert.equal(s.status, 0, s.stderr);
    assert.equal(h.exists('.gemini/antigravity/theme-patch'), false, 'legacy theme-patch dir removed');
    assert.equal(h.exists('.gemini/antigravity/scripts/antigravity-font-daemon.mjs'), false, 'legacy wrapper removed');
    const migratedCfg = JSON.parse(h.readUser('config.json'));
    assert.equal(migratedCfg.modules.i18n, true, 'user config override migrated from theme-patch/user');

    const un = run(h, ['uninstall']);
    assert.equal(un.status, 0, un.stderr);
    assert.equal(h.exists('.gemini/antigravity/anti-claude'), false, 'cleanly removed on uninstall after retiring theme-patch');
  } finally {
    h.cleanup();
  }
});

test('v1 installs are migrated, retire theme-patch, and uninstall cleanly', () => {
  const h = makeHome({ withPreExistingUserFiles: false });
  try {
    const agy = path.join(h.home, '.gemini/antigravity');
    const legacyUserDir = path.join(agy, 'theme-patch/user');
    const legacyBak = path.join(legacyUserDir, '.backup-before-claude-ux');
    fs.mkdirSync(legacyBak, { recursive: true });
    fs.writeFileSync(path.join(agy, 'antigravity_state.pbtxt'), 'product_skin: PRODUCT_SKIN_DEVELOPER\n');
    fs.writeFileSync(path.join(h.home, '.gemini/config/config.json'), JSON.stringify({ userSettings: { verboseConversationSteps: true } }));
    for (const f of ['custom.css', 'custom.js', 'config.json', 'i18n.override.json']) {
      fs.writeFileSync(path.join(legacyBak, f), `/* v1 bak ${f} */\n`);
      fs.copyFileSync(path.join(REPO, 'user', f), path.join(legacyUserDir, f));
    }
    const s = run(h, ['sync-upgrade']);
    assert.equal(s.status, 0, s.stderr);
    assert.equal(h.exists('.gemini/antigravity/theme-patch'), false);
    const un = run(h, ['uninstall']);
    assert.equal(un.status, 0);
    assert.match(un.out.settings.note, /v1/);
    assert.equal(h.exists('.gemini/antigravity/anti-claude'), false);
  } finally {
    h.cleanup();
  }
});

test('legacy claude-ux v2 installs migrate automatically to anti-claude and upgrade AGENTS.md marker', () => {
  const h = makeHome({ withPreExistingUserFiles: false });
  try {
    run(h, ['install']);
    /* Simulate a pre-rename claude-ux install on disk */
    fs.renameSync(path.join(h.home, '.gemini/antigravity/anti-claude'), path.join(h.home, '.gemini/antigravity/claude-ux'));
    fs.writeFileSync(
      path.join(h.home, '.gemini/AGENTS.md'),
      '<!-- BEGIN antigravity-claude-ux -->\nold block\n<!-- END antigravity-claude-ux -->\n\n---\n\n# my rules\n'
    );
    const s = run(h, ['sync-upgrade']);
    assert.equal(s.status, 0, s.stderr);
    assert.equal(h.exists('.gemini/antigravity/claude-ux'), false, 'old claude-ux state dir migrated away');
    assert.equal(h.exists('.gemini/antigravity/anti-claude/install-state.json'), true, 'new anti-claude state dir created');
    assert.match(h.read('.gemini/AGENTS.md'), /BEGIN anti-claude/);
    assert.doesNotMatch(h.read('.gemini/AGENTS.md'), /BEGIN antigravity-claude-ux/);
    assert.match(h.read('.gemini/AGENTS.md'), /# my rules/);

    const un = run(h, ['uninstall']);
    assert.equal(un.status, 0, un.stderr);
    assert.equal(h.read('.gemini/AGENTS.md'), '# my rules\n');
    assert.equal(h.exists('.gemini/antigravity/anti-claude'), false);
  } finally {
    h.cleanup();
  }
});

test('pure helpers: scheduling, 3-way merge, trailing JSON, semver', async () => {
  const m = await import(INSTALL);
  let now = 1_700_000_000_000;
  const sync = {};
  let checks = 0;
  for (let i = 0; i < 9; i++) {
    if (m.shouldCheckRemote(sync, { now })) {
      checks++;
      sync.lastRemoteCheckAt = now;
    }
    sync.lastAppliedAt = now;
    now += 12 * 3600 * 1000;
  }
  assert.equal(checks, 9);

  const base = { modules: { i18n: true, a: 1 }, preset: 'x' };
  const local = { modules: { i18n: false, a: 1 }, preset: 'x', mine: true };
  const remote = { modules: { i18n: true, a: 2, b: 3 }, preset: 'y' };
  assert.deepEqual(m.threeWayMergeJson(base, local, remote), { modules: { i18n: false, a: 2, b: 3 }, preset: 'y', mine: true });

  assert.deepEqual(m.parseTrailingJson('[daemon] hi\n{"x":1}\nnoise? no\n{\n  "ok": false\n}\n'), { ok: false });
  assert.ok(m.compareSemver('5.4.0', '5.3.9') > 0);
  assert.equal(m.compareSemver('5.3.0', '5.3.0'), 0);
});
