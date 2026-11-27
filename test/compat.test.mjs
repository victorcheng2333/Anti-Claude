/**
 * Host compatibility registry: core/runtime.js `ctx.compat`, the dependency list in user/custom.js, the
 * Settings › Compatibility section, the daemon's live merge, and `install.mjs compat`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_SRC = fs.readFileSync(path.join(REPO, 'core', 'runtime.js'), 'utf8');
const CUSTOM_JS_SRC = fs.readFileSync(path.join(REPO, 'user', 'custom.js'), 'utf8');
const HERMETIC_DAEMON_STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-compat-state-'));
process.env.ANTI_CLAUDE_STATE_DIR = HERMETIC_DAEMON_STATE;
process.on('exit', () => fs.rmSync(HERMETIC_DAEMON_STATE, { recursive: true, force: true }));

let JSDOM = null;
try {
  JSDOM = createRequire(process.env.JSDOM_FROM || import.meta.url)('jsdom').JSDOM;
} catch {}
const skip = JSDOM ? false : 'jsdom not installed';

function boot(bodyHtml, { customJs = '' } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    url: 'http://127.0.0.1/c/11111111-2222-3333-4444-555555555555',
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.__APP_CONFIG__ = { productName: 'antigravity', version: '9.9.9' };
  const warnings = [];
  window.console.warn = (...args) => warnings.push(args.join(' '));
  const inject = () => {
    const payload = {
      version: 'anti-claude-test',
      platform: 'darwin',
      enabled: true,
      config: {},
      modules: { i18n: false, metrics: false, customCss: true, customJs: true },
      themeVars: {},
      darkThemeVars: {},
      cssText: '',
      customCss: '',
      customJs,
      dict: {}
    };
    window.eval(RUNTIME_SRC.replace('(__AG_BOOT_PAYLOAD__);', () => `(${JSON.stringify(payload)});`));
  };
  inject();
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 60));
  };
  return { window, doc: window.document, warnings, inject, settle, close: () => window.close() };
}

test('runtime registry: anchors separate "not rendered" from "broken"; reports, subscribe and re-inject cleanup', { skip }, async () => {
  const h = boot('<div id="host-anchor"></div>');
  const c = h.window.__ag_compat;
  assert.ok(c && typeof c.check === 'function', 'runtime exposes window.__ag_compat');

  let shape = null;
  c.define('t.absent', { label: 'absent', kind: 'selector', features: ['a'], anchor: () => null, probe: () => false });
  c.define('t.shape', {
    kind: 'react-fiber',
    features: ['featX', 'featY'],
    anchor: () => h.doc.getElementById('host-anchor'),
    probe: () => (shape ? true : 'shape missing')
  });
  c.define('t.throws', { kind: 'bridge', probe: () => { throw new Error('boom'); } });
  c.define('t.abstain', { anchor: () => true, probe: () => null });

  const seen = [];
  const unsub = c.subscribe((snap) => seen.push(snap.counts));

  let snap = c.check();
  const byId = (s) => Object.fromEntries(s.entries.map((e) => [e.id, e]));
  assert.equal(byId(snap)['t.absent'].status, 'unseen', 'missing anchor never reads as broken');
  assert.equal(byId(snap)['t.shape'].status, 'degraded');
  assert.equal(byId(snap)['t.shape'].reason, 'shape missing');
  assert.equal(byId(snap)['t.throws'].status, 'degraded');
  assert.match(byId(snap)['t.throws'].reason, /boom/);
  assert.equal(byId(snap)['t.abstain'].status, 'unseen', 'abstaining probe leaves the verdict to call-site reports');
  assert.equal(snap.hostVersion, '9.9.9');
  assert.equal(snap.patchVersion, 'anti-claude-test');
  assert.deepEqual([...c.degradedFeatures()].sort(), ['featX', 'featY']);
  assert.equal(h.warnings.filter((w) => /t\.shape/.test(w)).length, 1, 'degradation logged once');
  c.check();
  assert.equal(h.warnings.filter((w) => /t\.shape/.test(w)).length, 1, 'repeat failure is not re-logged');

  shape = {};
  snap = c.check();
  assert.equal(byId(snap)['t.shape'].status, 'ok', 'recovers once the shape is back');
  assert.equal(byId(snap)['t.shape'].reason, '');

  c.report('t.abstain', false, 'call site saw nothing');
  assert.equal(c.status('t.abstain'), 'degraded');
  c.ok('t.abstain');
  assert.equal(c.status('t.abstain'), 'ok');

  await h.settle();
  assert.ok(seen.length >= 1, 'subscribers notified on status changes');
  unsub();

  h.inject();
  assert.notEqual(h.window.__ag_compat, c, 're-injection installs a fresh registry');
  assert.equal(h.window.__ag_compat.snapshot().entries.length, 0);
  h.close();
});

test('custom.js host deps: broken surfaces degrade, unopened UI stays unseen, a found shape turns ok', { skip }, async () => {
  const h = boot(
    `
    <aside data-testid="conversation-list-sidebar"><a href="/c/abc">Chat</a></aside>
    <div id="antigravity.agentSidePanelInputBox"><button data-testid="model-selector-trigger">Model</button></div>
    <button data-testid="input-send-button"></button>
  `,
    { customJs: CUSTOM_JS_SRC }
  );
  await h.settle();
  const c = h.window.__ag_compat;
  const ids = c.snapshot().entries.map((e) => e.id);
  for (const id of ['composer.inputBox', 'composer.agentProps', 'model.nativeApi', 'app.store', 'app.router', 'sidebar.rows', 'bridge.projectRpc']) {
    assert.ok(ids.includes(id), `custom.js registers ${id}`);
  }

  const status = () => Object.fromEntries(c.check().entries.map((e) => [e.id, e]));
  let st = status();
  assert.equal(st['composer.inputBox'].status, 'ok', 'send button + input box present');
  assert.equal(st['model.nativeApi'].status, 'degraded', 'model trigger without a fiber API');
  assert.equal(st['composer.agentProps'].status, 'degraded', 'input box without handleSubmit fiber');
  assert.equal(st['sidebar.rows'].status, 'degraded', 'sidebar lists chats but rows lost their testid');
  assert.equal(st['app.store'].status, 'degraded');
  assert.equal(st['bridge.projectRpc'].status, 'degraded', 'no daemon binding in this window');
  assert.equal(st['revert.native'].status, 'unseen', 'no revert button on screen -> no verdict');
  assert.equal(st['settings.nav'].status, 'unseen');
  assert.ok(st['model.nativeApi'].features.includes('modelMenu'));

  const btn = h.doc.querySelector('[data-testid="model-selector-trigger"]');
  btn.__reactFiber$test = {
    memoizedProps: { value: { setSelectedModel() {}, modelOptions: [{ label: 'M', value: 1 }] } },
    return: null
  };
  h.window.__agProjectRpc = () => {};
  st = status();
  assert.equal(st['model.nativeApi'].status, 'ok', 'fiber API found -> ok');
  assert.equal(st['bridge.projectRpc'].status, 'ok');
  h.close();
});

test('Settings › UI Enhancements shows the Compatibility section and tags degraded features', { skip }, async () => {
  const h = boot(
    `
    <div data-split-root="true">
      <div>
        <div data-testid="settings-sidebar">
          <div class="flex flex-col gap-0.5">
            <div class="group/nav-item"><button type="button" data-testid="settings-nav-item-General"><span>General</span></button></div>
          </div>
        </div>
      </div>
      <div><div id="settings-right-host"><div>Native</div></div></div>
    </div>
    <div id="antigravity.agentSidePanelInputBox"><button data-testid="model-selector-trigger">Model</button></div>
  `,
    { customJs: CUSTOM_JS_SRC }
  );
  await h.settle();
  const navBtn = h.doc.querySelector('button[data-testid="settings-nav-item-ClaudeUX"]');
  assert.ok(navBtn, 'UI Enhancements nav injected');
  navBtn.click();
  const panel = h.doc.getElementById('ag-claude-ux-settings-panel');
  assert.ok(panel && !panel.hidden);
  const section = panel.querySelector('[data-ag-compat-section]');
  assert.ok(section, 'compatibility section rendered');
  assert.match(section.textContent, /Compatibility/);
  assert.match(section.textContent, /Antigravity 9\.9\.9/);
  const modelRow = section.querySelector('[data-ag-compat-id="model.nativeApi"]');
  assert.equal(modelRow.getAttribute('data-ag-compat-status'), 'degraded');
  assert.match(modelRow.textContent, /setSelectedModel/, 'row shows the failure reason');
  assert.equal(section.querySelector('[data-ag-compat-id="settings.nav"]').getAttribute('data-ag-compat-status'), 'ok');
  const rows = [...section.querySelectorAll('[data-ag-compat-status]')].map((r) => r.getAttribute('data-ag-compat-status'));
  assert.equal(rows[0], 'degraded', 'degraded entries sorted first');

  const modelSwitchRow = panel.querySelector('[data-ag-cux-feat="modelMenu"]').closest('.ag-cux-settings-row');
  assert.ok(modelSwitchRow.querySelector('.ag-compat-feature-tag'), 'feature switch tagged as degraded');
  const i18nSwitchRow = panel.querySelector('[data-ag-cux-feat="zhTitleFix"]').closest('.ag-cux-settings-row');
  assert.ok(i18nSwitchRow.querySelector('.ag-compat-feature-tag'), 'bridge-dependent feature tagged too');

  /* Recovery re-renders live via subscribe */
  h.doc.querySelector('[data-testid="model-selector-trigger"]').__reactFiber$x = {
    memoizedProps: { value: { setSelectedModel() {}, modelOptions: [{ label: 'M', value: 1 }] } },
    return: null
  };
  section.querySelector('[data-ag-compat-recheck]').click();
  await h.settle();
  assert.equal(
    panel.querySelector('[data-ag-compat-id="model.nativeApi"]').getAttribute('data-ag-compat-status'),
    'ok'
  );
  h.close();
});

test('custom.js: no empty catch swallows a failed call into a host-private API', () => {
  const HOST_CALL = /\.(dispatch|navigate|setPrefValue|getPrefValue|setSelectedModel|setIsOpen|onOpenChange|showContextMenu|getPathForFile|getMediaAttachments|setMediaAttachments|openConversation|getProjectStateProvider|submit)\(|orchestratorPick\.select\(|Pick\.select\(/;
  const lines = CUSTOM_JS_SRC.split('\n');
  const offenders = [];
  lines.forEach((line, i) => {
    const m = /^(\s*)\} catch \{\}/.exec(line);
    if (!m) return;
    const indent = m[1];
    let j = i - 1;
    while (j >= 0 && !lines[j].startsWith(`${indent}try {`)) j--;
    const body = lines.slice(j + 1, i).join('\n');
    if (HOST_CALL.test(body)) offenders.push(`custom.js:${i + 1}: ${body.trim().split('\n')[0]}`);
  });
  assert.deepEqual(offenders, [], 'report host failures with compatFail(id, err) instead of an empty catch');
});

test('daemon merges live windows per dependency: degraded > ok > unseen', async () => {
  const daemon = await import(pathToFileURL(path.join(REPO, 'core', 'daemon.mjs')).href);
  const merged = daemon.mergeCompatSnapshots([
    null,
    {
      patchVersion: 'p',
      hostVersion: '',
      entries: [
        { id: 'a', status: 'ok', reason: '', features: ['x'] },
        { id: 'b', status: 'unseen', reason: '', features: [] }
      ]
    },
    {
      patchVersion: 'p',
      hostVersion: '2.40.0',
      entries: [
        { id: 'a', status: 'degraded', reason: 'gone', features: ['x'] },
        { id: 'b', status: 'ok', reason: '', features: [] },
        { id: 'c', status: 'unseen', reason: '', features: [] }
      ]
    }
  ]);
  assert.equal(merged.windows, 2);
  assert.equal(merged.hostVersion, '2.40.0');
  assert.deepEqual(merged.counts, { ok: 1, degraded: 1, unseen: 1 });
  assert.deepEqual(merged.degraded, [{ id: 'a', reason: 'gone', features: ['x'] }]);
  assert.deepEqual(merged.unseen, ['c']);
  assert.equal(daemon.mergeCompatSnapshots([null, undefined]), null);
});

test('`install.mjs compat` turns degraded dependencies into warnings and fails without a registry', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-compat-home-'));
  const run = (extraEnv) => {
    const r = spawnSync(process.execPath, [path.join(REPO, 'install.mjs'), 'compat'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        ANTI_CLAUDE_NO_NETWORK: '1',
        ANTI_CLAUDE_NO_LAUNCHD: '1',
        ANTI_CLAUDE_NO_FONTS: '1',
        ANTI_CLAUDE_NO_CLI: '1',
        ...extraEnv
      }
    });
    const start = r.stdout.lastIndexOf('\n{');
    return { status: r.status, out: JSON.parse(r.stdout.slice(start + 1)) };
  };
  try {
    const degraded = run({
      ANTI_CLAUDE_FAKE_VERIFY_OK: '1',
      ANTI_CLAUDE_FAKE_COMPAT: JSON.stringify({
        counts: { ok: 3, degraded: 1, unseen: 2 },
        degraded: [{ id: 'model.nativeApi', reason: 'no setSelectedModel', features: ['modelMenu'] }],
        unseen: ['revert.native'],
        entries: [{ id: 'model.nativeApi', status: 'degraded' }]
      })
    });
    assert.equal(degraded.out.status, 'partial');
    assert.equal(degraded.status, 0, 'degraded deps warn but do not fail the command');
    assert.ok(degraded.out.warnings.some((w) => /model\.nativeApi.*no setSelectedModel.*modelMenu/.test(w)));

    const clean = run({
      ANTI_CLAUDE_FAKE_VERIFY_OK: '1',
      ANTI_CLAUDE_FAKE_COMPAT: JSON.stringify({ counts: { ok: 1, degraded: 0, unseen: 0 }, degraded: [], unseen: [], entries: [{ id: 'a', status: 'ok' }] })
    });
    assert.equal(clean.out.status, 'ok');

    const staleUserLayer = run({
      ANTI_CLAUDE_FAKE_VERIFY_OK: '1',
      ANTI_CLAUDE_FAKE_COMPAT: JSON.stringify({ counts: { ok: 0, degraded: 0, unseen: 0 }, degraded: [], unseen: [], entries: [] })
    });
    assert.equal(staleUserLayer.out.status, 'failed', 'an empty registry must not read as healthy');
    assert.match(staleUserLayer.out.errors[0], /predates the compatibility list/);

    const noRegistry = run({ ANTI_CLAUDE_FAKE_VERIFY_OK: '1' });
    assert.equal(noRegistry.out.status, 'failed');
    assert.equal(noRegistry.status, 1);
    assert.match(noRegistry.out.errors[0], /no compatibility registry/);

    const unreachable = run({ ANTI_CLAUDE_FAKE_VERIFY_OK: '0' });
    assert.equal(unreachable.out.status, 'failed');
    assert.match(unreachable.out.errors[0], /cannot reach/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
