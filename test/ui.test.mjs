/**
 * DOM behaviour tests for user/custom.js (jsdom). Skipped automatically when jsdom is not installed:
 *   npm i --no-save jsdom && node --test test/
 * or point JSDOM_FROM at any package.json whose node_modules contains jsdom.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let JSDOM = null;
try {
  JSDOM = createRequire(process.env.JSDOM_FROM || import.meta.url)('jsdom').JSDOM;
} catch {}
const skip = JSDOM ? false : 'jsdom not installed';

const SRC = fs
  .readFileSync(path.join(REPO, 'user', 'custom.js'), 'utf8')
  .replace(
    /\}\)\(\);\s*$/,
    'window.__t = { scheduleSync, syncStepStream, dispose, parseAndSlimMetricsPayload, cacheTierForRate, detectCompactStatus, triggerConversationCompact }; })();'
  );

function mount(html, { modules = {}, dict = null } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    runScripts: 'outside-only',
    url: 'http://127.0.0.1/c/abcd-1234',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const queue = new Map();
  let nextId = 1;
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => queue.delete(id);
  const cleanups = [];
  window.ctx = { modules, dict: dict || undefined, onCleanup: (fn) => cleanups.push(fn) };
  window.eval(SRC);
  const flushFrames = () => {
    for (let i = 0; i < 10 && queue.size; i++) {
      const cbs = [...queue.values()];
      queue.clear();
      cbs.forEach((cb) => cb(0));
    }
  };
  const microtasks = () => new Promise((r) => setTimeout(r, 0));
  return { window, doc: window.document, queue, cleanups, flushFrames, microtasks, close: () => window.close() };
}

const li = (text, status = 'pending') =>
  status === 'completed'
    ? `<li class="task-list-item task-checked"><div></div><span class="task-checked-content">${text}</span></li>`
    : `<li class="task-list-item"><div class="${status === 'in_progress' ? 'bg-primary' : ''}"></div>${text}</li>`;
const ul = (...items) => `<ul class="contains-task-list">${items.join('')}</ul>`;
const pane = (turns, { generating = false } = {}) =>
  `<section>${turns.map((t) => `<div data-testid="agent-response">${t}</div>`).join('')}<div id="antigravity.agentSidePanelInputBox">${
    generating ? '<button data-testid="input-cancel-button"></button>' : ''
  }</div></section>`;

test('markdown task lists stay native and stale legacy TodoWrite DOM is cleaned on mount', { skip }, () => {
  const h = mount(
    pane([
      `<div data-ag-todo-empty-wrap="true"><ul class="contains-task-list" data-ag-todo-merged="true">${li('步骤一', 'in_progress')}${li('步骤二')}</ul></div>` +
        `<div class="ag-claude-todo-card" data-ag-todo-mount="true"></div>` +
        `<div data-ag-todo-dock="true"><div class="ag-claude-todo-card"></div></div>` +
        `<p data-ag-todo-marker-line="true">legacy</p>`
    ], { generating: true })
  );
  const list = h.doc.querySelector('ul');
  assert.equal(list.hasAttribute('data-ag-todo-merged'), false);
  assert.equal(list.hasAttribute('data-ag-todo-primary'), false);
  assert.equal(h.doc.querySelector('[data-ag-todo-empty-wrap]'), null);
  assert.equal(h.doc.querySelector('[data-ag-todo-marker-line]'), null);
  assert.equal(h.doc.querySelectorAll('.ag-claude-todo-card, [data-ag-todo-dock], [data-ag-todo-mount]').length, 0);
  h.cleanups.forEach((fn) => fn());
  h.close();
});

test('dispose cancels queued frames: no indicator is resurrected', { skip }, async () => {
  const row = '<button data-testid="tool-group-collapsible" aria-expanded="false"><span title="Running command">Running command</span><svg></svg></button>';
  const h = mount(pane([row], { generating: true }));
  assert.ok(h.doc.querySelector('.ag-orbit-dots'));
  h.doc.querySelector('section').appendChild(h.doc.createElement('p'));
  await h.microtasks();
  h.window.__t.scheduleSync();
  h.cleanups.forEach((fn) => fn());
  assert.equal(h.doc.querySelector('.ag-orbit-dots'), null);
  h.flushFrames();
  await new Promise((r) => setTimeout(r, 120));
  h.flushFrames();
  assert.equal(h.doc.querySelector('.ag-orbit-dots'), null);
  h.close();
});

test('own DOM writes do not schedule another sync (no self-trigger loop)', { skip }, async () => {
  const row = '<button data-testid="tool-group-collapsible" aria-expanded="false"><span title="Running command">Running command</span><svg></svg></button>';
  const h = mount(pane([row], { generating: true }));
  await h.microtasks();
  await h.microtasks();
  assert.equal(h.queue.size, 0, 'running indicator insertion must not re-trigger syncStepStream');
  h.cleanups.forEach((fn) => fn());
  h.close();
});

test('running timer lights only the generating pane', { skip }, async () => {
  const row = (label) => `<button data-testid="tool-group-collapsible" aria-expanded="false"><span title="${label}">${label}</span><svg></svg></button>`;
  const h = mount(
    `<div>${pane([row('Running command')], { generating: true })}${pane([row('Running command')], { generating: false })}</div>`
  );
  const [a, b] = h.doc.querySelectorAll('button[data-testid="tool-group-collapsible"]');
  assert.ok(a.querySelector('.ag-orbit-dots'), 'generating pane shows the indicator');
  assert.equal(b.querySelector('.ag-orbit-dots'), null, 'idle pane must stay clean');
  h.cleanups.forEach((fn) => fn());
  h.close();
});

function modelTrigger(h) {
  const btn = h.doc.createElement('button');
  btn.setAttribute('data-testid', 'model-selector-trigger');
  btn.textContent = 'Gemini';
  let selected = { label: 'Gemini 4 Carbon (Medium)', value: 'c-m' };
  btn.__reactFiber$test = {
    memoizedProps: {
      modelOptions: [
        { label: 'Gemini 4 Carbon (Medium)', value: 'c-m' },
        { label: 'Gemini 4 Carbon (High)', value: 'c-h' },
        { label: 'Gemini 4 Carbon (XHigh)', value: 'c-xh' },
        { label: 'Gemini 3.8 Flash', value: 'f' }
      ],
      get selectedModel() {
        return selected;
      },
      setSelectedModel(o) {
        selected = o;
      }
    }
  };
  h.doc.body.appendChild(btn);
  return { btn, selected: () => selected };
}

test('keyboard activation (click detail=0) opens the custom menu', { skip }, () => {
  const h = mount('');
  const { btn, selected } = modelTrigger(h);
  btn.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
  const pop = h.doc.getElementById('ag-claude-model-popover');
  assert.ok(pop);
  assert.equal(pop.getAttribute('data-open'), 'true');
  assert.equal(pop.getAttribute('role'), 'menu');

  /* Effort flyout displays XHigh as "Extra" while still selecting the underlying XHigh option */
  const effortTrigger = pop.querySelector('[data-ag-cm-subtrigger="effort"]');
  effortTrigger.click();
  const subPop = h.doc.getElementById('ag-claude-model-subpop');
  assert.equal(subPop.getAttribute('data-open'), 'true');
  const xhRow = subPop.querySelector('[data-ag-cm-effort="XHigh"]');
  assert.ok(xhRow, 'XHigh option row exists');
  assert.equal(xhRow.textContent.includes('Extra'), true, 'displays Extra label');
  assert.equal(xhRow.textContent.includes('XHigh'), false, 'hides raw XHigh text');
  xhRow.click();
  assert.equal(selected().value, 'c-xh', 'selecting Extra commits underlying XHigh option');

  /* Re-opening reflects Extra on the main effort row too */
  btn.dispatchEvent(new h.window.Event('pointerdown', { bubbles: true, cancelable: true }));
  assert.match(pop.querySelector('[data-ag-cm-subtrigger="effort"]').textContent, /Extra/);
  assert.equal(h.doc.querySelectorAll('#ag-claude-model-popover').length, 1);
  h.close();
});

test('Enter opens + focuses menu, arrows move, Escape returns focus', { skip }, () => {
  const h = mount('');
  const { btn } = modelTrigger(h);
  btn.focus();
  const key = (target, k) => target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key(btn, 'Enter');
  const pop = h.doc.getElementById('ag-claude-model-popover');
  assert.equal(pop.getAttribute('data-open'), 'true');
  assert.ok(pop.contains(h.doc.activeElement), 'focus moved into the menu');
  const first = h.doc.activeElement;
  key(first, 'ArrowDown');
  assert.notEqual(h.doc.activeElement, first);
  key(h.doc.activeElement, 'Escape');
  assert.equal(pop.getAttribute('data-open'), 'false');
  assert.ok(pop.hasAttribute('inert'), 'closed menu leaves the tab order');
  assert.equal(h.doc.activeElement, btn);
  h.close();
});

test('feature switch off: model menu is not intercepted, checklists untouched', { skip }, () => {
  const h = mount(pane([ul(li('读代码', 'in_progress'), li('修复'))]), {
    modules: { claudeUxModelMenu: false }
  });
  const { btn } = modelTrigger(h);
  let native = 0;
  btn.addEventListener('click', () => native++);
  btn.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
  assert.equal(native, 1);
  assert.equal(h.doc.getElementById('ag-claude-model-popover'), null);
  assert.equal(h.doc.querySelectorAll('.ag-claude-todo-card').length, 0);
  h.close();
});

async function settle(h) {
  await h.microtasks();
  await new Promise((r) => setTimeout(r, 100));
  h.flushFrames();
}

test('inline undo & edit: expands in-bubble editor, previews modified files, toggles file revert, and resends via host', { skip }, async () => {
  const h = mount(`
    <div data-testid="user-input-step">
      <div class="max-w-[80%]">
        <div data-testid="user-message-bubble">
          <div data-testid="user-message-content">原始提问内容</div>
        </div>
      </div>
      <button type="button" data-testid="revert-button">撤回</button>
    </div>
    <div data-testid="agent-input-box"><div id="lex-root"></div></div>
  `);
  const revBtn = h.doc.querySelector('button[data-testid="revert-button"]');
  const lexRoot = h.doc.getElementById('lex-root');
  let submitted = false;
  let convOnlyVal = false;
  const stepHandler = {
    getRevertPreviews: async () => [{ fileUri: 'file:///repo/user/custom.js' }, { fileUri: 'file:///repo/user/custom.css' }],
    revertToIndex: async () => true
  };
  const revertPreviewState = {
    get conversationOnly() {
      return convOnlyVal;
    },
    conversationOnlyRevertEnabled: true,
    setConversationOnly(v) {
      convOnlyVal = v;
    },
    revert() {
      stepHandler.revertToIndex('11111111-2222-3333-4444-555555555555', 4);
    }
  };
  revBtn.__reactFiber$r = {
    memoizedProps: {
      revertState: { canRevert: true, revertPreviewState },
      cascadeId: '11111111-2222-3333-4444-555555555555',
      userStepIndex: 5,
      items: [{ chunk: { case: 'text', value: '原始提问内容' } }]
    },
    dependencies: {
      firstContext: {
        memoizedValue: {
          stepHandler,
          inputBoxRef: {
            current: {
              lexicalRef: { current: { getRootElement: () => lexRoot } },
              getMediaAttachments: () => [],
              submit: () => {
                submitted = true;
              }
            }
          }
        }
      }
    }
  };

  revBtn.click();
  await new Promise((r) => setTimeout(r, 30));
  const editor = h.doc.querySelector('.ag-claude-inline-editor');
  assert.ok(editor, 'in-bubble editor mounted');
  assert.equal(h.doc.querySelector('[data-testid="user-message-content"]').hidden, true, 'original bubble content hidden while editing');
  assert.match(editor.textContent, /custom\.js/, 'file revert preview chips rendered');

  const fileSwitch = editor.querySelector('[data-ag-revert-files-switch]');
  assert.equal(fileSwitch.getAttribute('aria-checked'), 'true');
  fileSwitch.click();
  assert.equal(convOnlyVal, true, 'file revert switch updates conversationOnly');

  const ta = editor.querySelector('.ag-claude-inline-textarea');
  ta.value = '修改后的新提问';
  ta.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  editor.querySelector('[data-ag-inline-send]').click();
  await new Promise((r) => setTimeout(r, 430));

  assert.equal(lexRoot.textContent, '修改后的新提问', 'edited prompt written to host composer');
  assert.equal(submitted, true, 'host submit() invoked after revert');
  assert.equal(h.doc.querySelector('.ag-claude-inline-editor'), null, 'inline editor cleaned up');
  h.cleanups.forEach((fn) => fn());
  h.close();
});

test('sidebar folder status badges & top Recents: aggregates collapsed folders, sorts pending > running > recent, and navigates via router', { skip }, async () => {
  const h = mount(
    `
    <div class="sidebar-grand">
      <div class="sidebar-parent">
        <div data-testid="conversation-list-sidebar">
          <div>
            <div data-sidebar-section-drop-id="proj-a">
              <div class="group/header"><button type="button" data-testid="project-header" data-project-label="项目A" aria-expanded="false">项目A</button></div>
              <div data-testid="conversation-row-sidebar" data-pinned="false" class="agy-sidebar-row"><span class="truncate">排查终端状态栏渲染异常</span></div>
            </div>
            <div data-sidebar-section-drop-id="pinned-root">
              <div data-testid="conversation-row-sidebar" data-pinned="true" class="agy-sidebar-row"><span class="truncate">已置顶高频会话</span></div>
            </div>
            <div data-sidebar-section-drop-id="proj-b">
              <div class="group/header"><button type="button" data-testid="project-header" data-project-label="项目B" aria-expanded="true">项目B</button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
    { modules: { claudeUxRecentSection: true, claudeUxHideSidebarProjects: false } }
  );
  let navigatedTo = null;
  const nowSec = Math.floor(Date.now() / 1000);
  const storeState = {
    trajectorySummaries: {
      summaries: {
        'conv-idle-unread': {
          annotations: { title: '排查终端状态栏渲染异常', lastUserViewTime: { seconds: nowSec - 600 } },
          lastModifiedTime: { seconds: nowSec - 60 },
          trajectoryMetadata: { projectId: 'proj-a' },
          status: 1
        },
        'conv-running': {
          annotations: { title: '正在后台编译' },
          lastModifiedTime: { seconds: nowSec - 300 },
          trajectoryMetadata: { projectId: 'proj-b' },
          status: 2
        },
        'conv-pending': {
          annotations: { title: '等待终端命令确认' },
          lastModifiedTime: { seconds: nowSec - 900 },
          trajectoryMetadata: { projectId: 'proj-a' },
          waitingSteps: [{ metadata: { toolCall: { name: 'run_command' } } }],
          status: 2
        },
        'conv-hidden-ocr': {
          summary: '你是高精度文档转录器。把这一页扫描件逐字转录为 Markdown：',
          lastModifiedTime: { seconds: nowSec - 180 },
          trajectoryMetadata: { projectId: 'proj-a', sourceMetadata: { hideFromConversationList: true } },
          status: 1
        },
        'conv-hidden-workflow': {
          summary: '后台批处理 workflow',
          lastModifiedTime: { seconds: nowSec - 120 },
          trajectoryMetadata: { projectId: 'proj-b', sourceMetadata: { hideFromConversationList: true } },
          status: 1
        },
        'conv-pinned': {
          annotations: { title: '已置顶高频会话', pinned: true },
          lastModifiedTime: { seconds: nowSec - 10 },
          trajectoryMetadata: { projectId: 'outside-of-project' },
          status: 1
        }
      }
    }
  };
  const sb = h.doc.querySelector('[data-testid="conversation-list-sidebar"]');
  sb.firstElementChild.__reactFiber$sb = {
    memoizedProps: {
      sidebarStore: { getState: () => storeState, subscribe: () => () => {} },
      sidebarRouter: {
        state: { location: { pathname: '/' } },
        navigate: (arg) => {
          navigatedTo = arg;
        }
      },
      sidebarGroups: [
        { id: 'proj-a', label: '项目A', conversationIds: ['conv-idle-unread', 'conv-pending', 'conv-hidden-ocr'] },
        { id: 'proj-b', label: '项目B', conversationIds: ['conv-running', 'conv-hidden-workflow'] }
      ]
    }
  };
  sb.appendChild(h.doc.createElement('span'));
  await settle(h);

  const hdrs = h.doc.querySelectorAll('button[data-testid="project-header"]');
  const badgesA = hdrs[0].parentElement.querySelectorAll('.ag-claude-folder-badge');
  const badgesB = hdrs[1].parentElement.querySelectorAll('.ag-claude-folder-badge');
  assert.equal(badgesA.length, 2, 'collapsed proj-a renders pending + unread badges');
  assert.equal(badgesA[0].getAttribute('data-kind'), 'pending');
  assert.equal(badgesA[1].getAttribute('data-kind'), 'unread');
  assert.equal(badgesA[1].textContent.trim(), '1', 'hidden hideFromConversationList sessions do not count as ghost unread');
  assert.equal(badgesB.length, 0, 'expanded proj-b suppresses folder badges');

  const recentRows = h.doc.querySelectorAll('#ag-claude-recent-section .ag-recent-row');
  assert.equal(recentRows.length, 3);
  assert.deepEqual(
    Array.from(recentRows).map((r) => r.getAttribute('data-ag-recent-id')),
    ['conv-pending', 'conv-running', 'conv-idle-unread'],
    'sorted by pending > running > recent and excludes hidden workflow & already-pinned sessions'
  );
  assert.equal(h.doc.documentElement.getAttribute('lang'), 'zh-CN', 'sets zh-CN root locale for CJK shaping & line-break rules');
  assert.equal(
    h.doc.querySelector('#ag-claude-recent-section .ag-recent-row:nth-child(3) .ag-recent-title').textContent,
    '排查终端状态栏渲染异常',
    'keeps raw title untouched so native CSS text-autospace provides uniform 1/8em spacing'
  );
  assert.equal(h.doc.querySelector('[data-testid="conversation-row-sidebar"] span.truncate').textContent, '排查终端状态栏渲染异常');
  assert.equal(h.doc.querySelectorAll('#ag-claude-recent-section .ag-recent-proj').length, 0, 'Variant A uses pure single-line rows');
  assert.equal(recentRows[1].hasAttribute('title'), false, 'omits plain browser title tooltip in favor of floating hover card');
  assert.equal(recentRows[1].getAttribute('data-ag-recent-project'), '项目B', 'retains project metadata on row');

  recentRows[1].dispatchEvent(new h.window.MouseEvent('mouseover', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 340));
  const hoverCard = h.doc.getElementById('ag-recent-hover-card');
  assert.ok(hoverCard, 'renders floating Recents hover card on row hover');
  assert.equal(hoverCard.getAttribute('data-open'), 'true');
  assert.match(hoverCard.textContent || '', /正在后台编译/);
  assert.match(hoverCard.textContent || '', /项目B/);
  assert.match(hoverCard.textContent || '', /Updated /);

  const recentSec = h.doc.getElementById('ag-claude-recent-section');
  recentSec.dispatchEvent(new h.window.MouseEvent('mouseleave', { bubbles: false }));
  assert.equal(hoverCard.getAttribute('data-open'), 'false', 'hides hover card on mouseleave');

  const projSidebarRow = h.doc.querySelector('[data-testid="conversation-row-sidebar"][data-pinned="false"]');
  projSidebarRow.dispatchEvent(new h.window.MouseEvent('mouseover', { bubbles: true }));
  assert.equal(h.doc.documentElement.getAttribute('data-ag-hide-proj-hovercard'), '1', 'suppresses native hover card on Projects rows');

  const pinnedSidebarRow = h.doc.querySelector('[data-testid="conversation-row-sidebar"][data-pinned="true"]');
  pinnedSidebarRow.dispatchEvent(new h.window.MouseEvent('mouseover', { bubbles: true }));
  assert.equal(h.doc.documentElement.hasAttribute('data-ag-hide-proj-hovercard'), false, 'preserves native hover card on Pinned rows');

  recentRows[1].click();
  assert.deepEqual(JSON.parse(JSON.stringify(navigatedTo)), { to: '/c/$cascadeId', params: { cascadeId: 'conv-running' } });
  h.cleanups.forEach((fn) => fn());
  assert.equal(h.doc.documentElement.hasAttribute('lang'), false, 'dispose restores original html lang state');
  assert.equal(h.doc.getElementById('ag-recent-hover-card'), null, 'dispose removes Recents hover card');
  assert.equal(h.doc.documentElement.hasAttribute('data-ag-hide-proj-hovercard'), false, 'dispose clears Projects hover card suppression');
  h.close();
});

test('native Settings -> UI Enhancements panel: defaults to English and live-toggles Chinese UI localization with localStorage persistence', { skip }, async () => {
  const h = mount(
    `
    <div data-split-root="true">
      <div>
        <div data-testid="settings-sidebar">
          <div class="flex flex-col gap-0.5">
            <div class="group/nav-item"><button type="button" data-testid="settings-nav-item-General" class="bg-sidebar-secondary"><span>General</span></button></div>
            <div class="group/nav-item"><button type="button" data-testid="settings-nav-item-Appearance"><span>Appearance</span></button></div>
          </div>
          <div class="px-4 mt-2"><h2>Projects</h2></div>
          <div class="flex flex-col gap-0.5"><button>Demo Project</button></div>
          <div class="px-4 mt-2"><h2>Not in Project</h2></div>
          <div class="flex flex-col gap-0.5"><button>Conversations</button></div>
        </div>
      </div>
      <div>
        <div id="settings-right-host"><div id="native-general-pane">Native general content</div></div>
      </div>
    </div>
    <div id="step-stream-probe">
      <span id="p-compound">Explored file, edited files</span>
      <span id="p-count">Explored 3 files</span>
      <span id="p-active">Editing custom.js</span>
      <span id="p-runfor">Running for 4s</span>
      <span id="p-working">Working</span>
    </div>
  `,
      { dict: { General: '常规', Appearance: '外观', Working: '正在工作', 'Knowledge Work': '知识工作', 'Software Engineering': '软件工程' } }
  );
  await settle(h);

  const navBtn = h.doc.querySelector('button[data-testid="settings-nav-item-ClaudeUX"]');
  assert.ok(navBtn, 'UI Enhancements nav button injected into settings-sidebar');
  assert.equal(navBtn.textContent.trim(), 'UI Enhancements', 'defaults to English');
  assert.equal(h.doc.documentElement.getAttribute('data-ag-ux-lang'), 'en');
  assert.equal(h.doc.querySelector('button[data-testid="settings-nav-item-General"]').textContent.trim(), 'General');
  assert.equal(h.doc.getElementById('p-compound').textContent, 'Explored file, edited files');
  assert.equal(h.doc.getElementById('p-working').textContent, 'Working');
  navBtn.click();

  const rightHost = h.doc.getElementById('settings-right-host');
  const panel = h.doc.getElementById('ag-claude-ux-settings-panel');
  assert.equal(rightHost.getAttribute('data-ag-claude-settings-open'), 'true');
  assert.ok(panel && !panel.hidden, 'Anti-Claude settings panel visible');

  /* Toggle Chinese UI localization ON -> translates native UI & enhancement panel live */
  const i18nSwitch = panel.querySelector('[data-ag-cux-switch="i18n"]');
  assert.ok(i18nSwitch, 'Chinese UI localization switch rendered');
  assert.equal(i18nSwitch.getAttribute('aria-checked'), 'false', 'i18n switch off by default');
  i18nSwitch.click();
  assert.equal(h.doc.documentElement.getAttribute('data-ag-ux-lang'), 'zh');
  assert.equal(navBtn.textContent.trim(), '界面增强');
  assert.equal(h.doc.querySelector('button[data-testid="settings-nav-item-General"]').textContent.trim(), '常规');
  assert.equal(h.doc.querySelector('button[data-testid="settings-nav-item-Appearance"]').textContent.trim(), '外观');
  assert.equal(h.doc.getElementById('p-compound').textContent, '已探索文件、已编辑文件');
  assert.equal(h.doc.getElementById('p-count').textContent, '已探索 3 个文件');
  assert.equal(h.doc.getElementById('p-active').textContent, '正在编辑 custom.js');
  assert.equal(h.doc.getElementById('p-runfor').textContent, '已运行 4s');
  assert.equal(h.doc.getElementById('p-working').textContent, '正在工作');
  assert.match(panel.textContent, /中文界面汉化/);
  assert.match(h.window.localStorage.getItem('ag_claude_ux_modules_v1') || '', /"i18n":true/);

  /* Newly rendered React nodes (e.g. Knowledge Work / Software Engineering toggle) must translate synchronously in the microtask before Frame 0 paints (zero 40ms English flash) */
  const modeWrap = h.doc.createElement('div');
  modeWrap.innerHTML = '<button id="kw-btn"><span>Knowledge Work</span></button><button id="se-btn"><span>Software Engineering</span></button>';
  h.doc.body.appendChild(modeWrap);
  await Promise.resolve();
  assert.equal(h.doc.getElementById('kw-btn').textContent, '知识工作', 'translates newly mounted node in microtask before first paint');
  assert.equal(h.doc.getElementById('se-btn').textContent, '软件工程', 'translates sibling node in microtask before first paint');
  h.doc.getElementById('kw-btn').firstChild.firstChild.nodeValue = 'Knowledge Work';
  await Promise.resolve();
  assert.equal(h.doc.getElementById('kw-btn').textContent, '知识工作', 'translates characterData update in microtask before first paint');
  modeWrap.remove();

  /* Toggle Chinese UI localization back OFF -> restores native English UI & enhancement panel live */
  panel.querySelector('[data-ag-cux-switch="i18n"]').click();
  assert.equal(h.doc.documentElement.getAttribute('data-ag-ux-lang'), 'en');
  assert.equal(navBtn.textContent.trim(), 'UI Enhancements');
  assert.equal(h.doc.querySelector('button[data-testid="settings-nav-item-General"]').textContent.trim(), 'General');
  assert.equal(h.doc.querySelector('button[data-testid="settings-nav-item-Appearance"]').textContent.trim(), 'Appearance');
  assert.equal(h.doc.getElementById('p-compound').textContent, 'Explored file, edited files');
  assert.equal(h.doc.getElementById('p-count').textContent, 'Explored 3 files');
  assert.equal(h.doc.getElementById('p-active').textContent, 'Editing custom.js');
  assert.equal(h.doc.getElementById('p-runfor').textContent, 'Running for 4s');
  assert.equal(h.doc.getElementById('p-working').textContent, 'Working');
  assert.match(h.window.localStorage.getItem('ag_claude_ux_modules_v1') || '', /"i18n":false/);

  /* Verify Projects and Not in Project are grouped under collapsible "Stats / 统计" (3-level stepped tree) */
  const statsToggle = h.doc.getElementById('ag-settings-stats-toggle');
  const projH2 = [...h.doc.querySelectorAll('[data-testid="settings-sidebar"] h2')].find((el) => el.textContent.trim() === 'Projects');
  const notInProjH2 = [...h.doc.querySelectorAll('[data-testid="settings-sidebar"] h2')].find((el) => el.textContent.trim() === 'Not in Project');
  assert.ok(statsToggle, 'Stats collapsible header mounted in Settings sidebar');
  assert.equal(statsToggle.getAttribute('data-testid'), 'settings-nav-item-Stats', 'inherits native settings-nav-item testid for 1:1 row styling');
  assert.ok(projH2.parentElement.querySelector('.ag-settings-subhdr-chev'), 'Projects subheader mounts unified SVG chevron');
  assert.ok(notInProjH2.parentElement.querySelector('.ag-settings-subhdr-chev'), 'Not in Project subheader mounts unified SVG chevron');
  assert.equal(projH2.querySelector('.ag-settings-subhdr-chev'), null, 'chevron stays sibling of h2 so text walker stays clean');
  assert.equal(projH2.parentElement.getAttribute('data-ag-stats-hidden'), '1', 'Projects hidden while Stats collapsed');
  assert.equal(notInProjH2.parentElement.getAttribute('data-ag-stats-hidden'), '1', 'Not in Project hidden while Stats collapsed');

  statsToggle.click();
  assert.equal(projH2.parentElement.hasAttribute('data-ag-stats-hidden'), false, 'clicking Stats reveals Projects subheader');
  assert.equal(notInProjH2.parentElement.hasAttribute('data-ag-stats-hidden'), false, 'clicking Stats reveals Not in Project subheader');
  assert.equal(projH2.parentElement.nextElementSibling.getAttribute('data-ag-stats-hidden'), '1', 'specific project items remain collapsed until Projects clicked');

  projH2.parentElement.click();
  assert.equal(projH2.parentElement.nextElementSibling.hasAttribute('data-ag-stats-hidden'), false, 'clicking Projects expands specific project items');

  /* Verify 3-tier CJK Optical Font Scale selector (94.5% / 95% / 100%) in UI Enhancements */
  const scale945 = panel.querySelector('[data-ag-cux-cjk-scale="94.5"]');
  const scale95 = panel.querySelector('[data-ag-cux-cjk-scale="95"]');
  const scale100 = panel.querySelector('[data-ag-cux-cjk-scale="100"]');
  assert.ok(scale945 && scale95 && scale100, 'renders 94.5%, 95%, and 100% CJK font scale buttons');
  assert.equal(h.doc.documentElement.getAttribute('data-ag-cjk-scale'), '95', 'defaults to 95% CJK optical scale');
  assert.equal(scale95.getAttribute('aria-checked'), 'true');
  assert.equal(scale945.getAttribute('aria-checked'), 'false');

  scale945.click();
  assert.equal(h.doc.documentElement.getAttribute('data-ag-cjk-scale'), '94.5');
  assert.equal(scale945.getAttribute('aria-checked'), 'true');
  assert.equal(scale95.getAttribute('aria-checked'), 'false');
  assert.match(h.window.localStorage.getItem('ag_claude_ux_modules_v1') || '', /"cjkFontScale":"94\.5"/);

  scale100.click();
  assert.equal(h.doc.documentElement.getAttribute('data-ag-cjk-scale'), '100');
  assert.equal(scale100.getAttribute('aria-checked'), 'true');
  assert.equal(scale945.getAttribute('aria-checked'), 'false');
  assert.match(h.window.localStorage.getItem('ag_claude_ux_modules_v1') || '', /"cjkFontScale":"100"/);

  const projectsSwitch = panel.querySelector('[data-ag-cux-switch="claudeUxProjects"]');
  assert.equal(projectsSwitch.getAttribute('aria-checked'), 'true');
  projectsSwitch.click();
  assert.equal(projectsSwitch.getAttribute('aria-checked'), 'false');
  assert.match(h.window.localStorage.getItem('ag_claude_ux_modules_v1') || '', /"claudeUxProjects":false/);

  const recentSwitch = panel.querySelector('[data-ag-cux-switch="claudeUxRecentSection"]');
  assert.equal(recentSwitch.getAttribute('aria-checked'), 'true');
  recentSwitch.click();
  assert.equal(recentSwitch.getAttribute('aria-checked'), 'false');
  assert.match(h.window.localStorage.getItem('ag_claude_ux_modules_v1') || '', /"claudeUxRecentSection":false/);

  const hideProjSwitch = panel.querySelector('[data-ag-cux-switch="claudeUxHideSidebarProjects"]');
  assert.equal(hideProjSwitch.getAttribute('aria-checked'), 'false');
  hideProjSwitch.click();
  assert.equal(hideProjSwitch.getAttribute('aria-checked'), 'true');
  assert.match(h.window.localStorage.getItem('ag_claude_ux_modules_v1') || '', /"claudeUxHideSidebarProjects":true/);

  h.doc.querySelector('button[data-testid="settings-nav-item-General"]').click();
  assert.equal(rightHost.hasAttribute('data-ag-claude-settings-open'), false, 'clicking native nav item restores native settings pane');

  /* Closing and reopening Settings must mount collapsed Stats synchronously in the microtask (0-frame FOUC check) */
  const splitRootEl = h.doc.querySelector('[data-split-root="true"]');
  const savedHtml = splitRootEl.outerHTML;
  splitRootEl.remove();
  await Promise.resolve();
  const reopenHost = h.doc.createElement('div');
  reopenHost.innerHTML = savedHtml;
  const freshSplit = reopenHost.firstElementChild;
  freshSplit.querySelectorAll('#ag-claude-ux-settings-nav, #ag-settings-stats-wrap, .ag-settings-subhdr-chev').forEach((n) => n.remove());
  freshSplit.querySelectorAll('[data-ag-stats-hidden], [data-ag-stats-subhdr], [data-ag-stats-list]').forEach((n) => {
    n.removeAttribute('data-ag-stats-hidden');
    n.removeAttribute('data-ag-stats-subhdr');
    n.removeAttribute('data-ag-stats-list');
  });
  h.doc.body.appendChild(freshSplit);
  await Promise.resolve();
  const reopenedToggle = h.doc.getElementById('ag-settings-stats-toggle');
  const reopenedProj = [...h.doc.querySelectorAll('[data-testid="settings-sidebar"] h2')].find((el) => el.textContent.trim() === 'Projects');
  assert.ok(reopenedToggle, 'Stats button mounted in microtask before first paint');
  assert.equal(reopenedToggle.getAttribute('aria-expanded'), 'false', 'reopening Settings resets Stats to collapsed');
  assert.equal(reopenedProj.parentElement.getAttribute('data-ag-stats-hidden'), '1', 'Projects hidden before Frame 0 paint');
  assert.equal(reopenedProj.parentElement.nextElementSibling.getAttribute('data-ag-stats-hidden'), '1', 'project list hidden before Frame 0 paint');

  h.cleanups.forEach((fn) => fn());
  assert.equal(h.doc.documentElement.hasAttribute('data-ag-cjk-scale'), false, 'dispose removes data-ag-cjk-scale');
  h.close();
});

test('metrics slimming: keeps outer TTFT pill, renders minimalist two-section popover with TTFT & tiered Cache %, and stays idempotent', { skip }, () => {
  const h = mount(pane([]));
  const { parseAndSlimMetricsPayload, cacheTierForRate } = h.window.__t;

  assert.equal(cacheTierForRate(95.3), 'high');
  assert.equal(cacheTierForRate(87.0), 'mid');
  assert.equal(cacheTierForRate(80.0), 'low');

  const mkPayload = ({ turns, cacheRate, sessCacheRate, hold = false }) => ({
    cascadeId: 'abcd-1234',
    hasData: true,
    inlineHtml:
      `<span>162 tok/s</span><span class="ag-sep">·</span><span>${hold ? 'Hold 1.8s' : 'TTFT 2.5s'}</span>` +
      '<span class="ag-sep">·</span><span>Ctx 45k/512k <span class="">(9%)</span></span>' +
      '<span class="ag-sep">·</span><span>Out 4.6k</span>' +
      '<span class="ag-sep">·</span><span class="ag-sub-badge">+2 sub</span>',
    tooltipHtml:
      `<div class="ag-tt-hdr">本轮最新调用 (Gen #6)</div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">生成速度</span><span class="ag-tt-val">${hold ? '端到端（含等待） 148.8 tok/s' : '流式 162.1 tok/s | 端到端（含等待） 148.8 tok/s'}</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">响应耗时</span><span class="ag-tt-val">${hold ? '等待 1.80s | 刷出 28.24s | 总计 30.04s' : 'TTFT 2.52s | 流式 28.24s | 总计 30.76s'}</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">当前上下文</span><span class="ag-tt-val">45,226 (新增 2,125 + 缓存 43,101, ${cacheRate}%)</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">本步输出量</span><span class="ag-tt-val">4,578 (思考链 3,064 + 正文/工具 1,514)</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">本轮合计 (6步)</span><span class="ag-tt-val">输出 11,365 (思考 5,964 + 响应 5,401) | 耗时 76.8s</span></div>` +
      `<div class="ag-tt-hdr ag-tt-sec">当前会话累计 (${turns} 轮提问 / 6 次有效调用)</div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">压缩水位线</span><span class="ag-tt-val">45k / 512k (9%) · 距压缩余 467k</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输入量</span><span class="ag-tt-val">新增 48k + 缓存读取 186k (命中率 ${sessCacheRate}%)</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输出量</span><span class="ag-tt-val">总计 28k (思考链 12k + 正文/工具 16k)</span></div>`
  });

  const slim1 = parseAndSlimMetricsPayload(mkPayload({ turns: 1, cacheRate: '95.3', sessCacheRate: '79.6' }));
  assert.ok(slim1.inlineHtml.includes('TTFT 2.5s'), 'outer pill keeps TTFT');
  assert.equal(slim1.inlineHtml.includes('Cache'), false, 'outer pill does not replace TTFT with Cache');
  assert.equal(slim1.inlineHtml.includes('Ctx'), false);
  assert.equal(slim1.inlineHtml.includes('Out'), false);
  assert.equal(slim1.inlineHtml.includes('sub'), false);

  assert.ok(slim1.tooltipHtml.includes('class="ag-ux-tt"'));
  assert.ok(slim1.tooltipHtml.includes('This turn'));
  assert.ok(slim1.tooltipHtml.includes('TTFT') && slim1.tooltipHtml.includes('2.5s'));
  assert.ok(slim1.tooltipHtml.includes('1m 17s'));
  assert.ok(slim1.tooltipHtml.includes('11.4k'));
  assert.ok(slim1.tooltipHtml.includes('Session'));
  assert.ok(slim1.tooltipHtml.includes('data-cache-tier="high"'));
  assert.equal(slim1.tooltipHtml.includes('Gen #6'), false);
  assert.equal(slim1.tooltipHtml.includes('距压缩余'), false);
  assert.equal(slim1.tooltipHtml.includes('Total out'), false, 'turn 1 without subagent omits total output');

  const replayed = parseAndSlimMetricsPayload(slim1);
  assert.equal(replayed.inlineHtml, slim1.inlineHtml);
  assert.equal(replayed.tooltipHtml, slim1.tooltipHtml);

  const slimHold = parseAndSlimMetricsPayload(mkPayload({ turns: 3, cacheRate: '87.2', sessCacheRate: '82.1', hold: true }));
  assert.ok(slimHold.inlineHtml.includes('Hold 1.8s'), 'outer pill keeps Hold on buffered run');
  assert.ok(slimHold.tooltipHtml.includes('Hold') && slimHold.tooltipHtml.includes('1.8s'));
  assert.ok(slimHold.tooltipHtml.includes('data-cache-tier="mid"'));
  assert.ok(slimHold.tooltipHtml.includes('Total out') && slimHold.tooltipHtml.includes('28k'));

  h.cleanups.forEach((fn) => fn());
  h.close();
});

test('context ring & quota popover: adds inline compact button and immediately clears post-/compact 94% red state', { skip }, async () => {
  const html = `
    <section>
      <div data-testid="autoscroll-viewport" id="vp">
        <div data-testid="user-input-step"><div data-testid="user-message-content">帮我分析代码</div></div>
        <div data-testid="agent-response"><p>分析完毕。</p></div>
      </div>
      <div id="antigravity.agentSidePanelInputBox">
        <div class="flex min-w-0 flex-1 items-center">
          <div><button type="button" data-testid="model-selector-trigger">Gemini 4 Carbon High</button></div>
          <div id="ag-live-metrics-pill"></div>
        </div>
      </div>
      <div id="ag-live-metrics-tooltip"></div>
    </section>
  `;
  const h = mount(html);
  let submittedArgs = null;
  let simRunning = false;
  const ib = h.doc.getElementById('antigravity.agentSidePanelInputBox');
  ib.__reactFiber$t = {
    memoizedProps: {
      get isRunning() {
        return simRunning;
      },
      slashCommandItems: [
        {
          title: 'compact',
          info: {
            $typeName: 'exa.codeium_common_pb.SlashCommandInfo',
            name: 'compact',
            modelFacingText: '',
            type: 1,
            icon: 'collapse_all',
            displayName: '',
            logo: ''
          }
        }
      ],
      handleSubmit: async (items, media, clearEditor) => {
        submittedArgs = { items, media, clearEditor };
        simRunning = true;
      }
    }
  };

  h.window.__ag_render_metrics = function (payload) {
    h.window.__ag_last_metrics = payload;
  };
  h.window.__t.syncStepStream();
  await settle(h);

  const mkHighPayload = (ctxShort, pct, outShort) => ({
    cascadeId: 'abcd-1234',
    hasData: true,
    inlineHtml:
      `<span>49 tok/s</span><span class="ag-sep">·</span><span>TTFT 29.6s</span>` +
      `<span class="ag-sep">·</span><span>Ctx ${ctxShort}/512k <span class="ag-ctx-crit">(${pct}%)</span></span>` +
      `<span class="ag-sep">·</span><span>Out ${outShort}</span>`,
    tooltipHtml:
      `<div class="ag-tt-hdr">本轮最新调用 (Gen #804)</div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">生成速度</span><span class="ag-tt-val">流式 48.7 tok/s | 端到端（含等待） 27.9 tok/s</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">响应耗时</span><span class="ag-tt-val">TTFT 29.59s | 流式 39.61s | 总计 69.20s</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">当前上下文</span><span class="ag-tt-val">482,947 (新增 482,947 + 缓存 0, 0.0%)</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">本步输出量</span><span class="ag-tt-val">1,931 (思考链 1,074 + 正文/工具 857)</span></div>` +
      `<div class="ag-tt-hdr ag-tt-sec">当前会话累计 (28 轮提问 / 804 次有效调用)</div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">压缩水位线</span><span class="ag-tt-val">${ctxShort} / 512k (${pct}%) · 距压缩余 29k</span></div>`
  });

  /* 1. High context before compact -> ring is red (crit), popover shows urgent ready compact button */
  h.window.__ag_render_metrics(mkHighPayload('483k', 94, '1.9k'));
  const ring = h.doc.getElementById('ag-claude-ctx-ring');
  assert.ok(ring, 'context ring mounted');
  assert.equal(ring.getAttribute('data-level'), 'crit');
  assert.equal(ring.hasAttribute('title'), false, 'context ring has no native hover title tooltip');

  ring.click();
  const pop = h.doc.getElementById('ag-claude-quota-popover');
  assert.equal(pop.getAttribute('data-open'), 'true');
  const compactBtn = pop.querySelector('[data-ag-qp-compact]');
  assert.ok(compactBtn, 'compact button rendered next to 当前上下文');
  assert.equal(compactBtn.getAttribute('data-state'), 'ready');
  assert.equal(compactBtn.getAttribute('data-urgent'), 'crit');
  assert.equal(compactBtn.textContent.trim(), 'Compact');

  /* 2. Clicking compact dispatches native slashCommand:compact without clearing draft & enters compacting state */
  compactBtn.click();
  await h.microtasks();
  assert.ok(submittedArgs, 'invoked native handleSubmit');
  assert.equal(submittedArgs.items[0].chunk.value.scopeItem.case, 'slashCommand');
  assert.equal(submittedArgs.items[0].chunk.value.scopeItem.value.info.name, 'compact');
  assert.equal(ring.getAttribute('data-level'), 'normal', 'ring leaves red crit immediately on compacting');
  assert.equal(ring.getAttribute('data-compact-state'), 'compacting');
  assert.equal(pop.querySelector('[data-ag-qp-compact]').getAttribute('data-state'), 'compacting');
  assert.match(pop.textContent, /Compacting…/);

  /* 3a. /compact finishes (checkpoint without hydrated metadata.modelUsage), while daemon still pushes 481k/94% + Out 574 */
  const vp = h.doc.getElementById('vp');
  simRunning = false;
  vp.__reactFiber$t = {
    memoizedProps: {
      trajectorySlice: {
        conversationId: 'abcd-1234',
        stepsInSlice: [
          { type: 14, status: 3, step: { case: 'userInput', value: { userResponse: '帮我分析代码' } } },
          { type: 15, status: 3, step: { case: 'plannerResponse', value: { response: '分析完毕。' } } },
          { type: 14, status: 3, step: { case: 'userInput', value: { userResponse: '/compact ' } } },
          { type: 23, status: 3, step: { case: 'checkpoint', value: { modelSummarizationFailed: false } } }
        ]
      }
    }
  };
  h.window.__ag_render_metrics(mkHighPayload('481k', 94, '574'));
  await settle(h);

  assert.equal(h.window.__t.detectCompactStatus('abcd-1234'), 'compacted');
  assert.equal(ring.getAttribute('data-level'), 'normal', 'ring stays normal instead of stale 94% red');
  assert.equal(ring.getAttribute('data-compact-state'), 'compacted');
  assert.equal(pop.querySelector('[data-ag-qp-compact]').getAttribute('data-state'), 'compacted');
  assert.match(pop.textContent, /Compacted/);
  assert.equal(pop.textContent.includes('574'), false, 'must never misread prior Out 574 as compact summary');
  assert.equal(pop.textContent.includes('→ 摘要'), false);
  assert.match(pop.textContent, /Compacted · refreshes next turn/);

  /* 3b. checkpoint hydrates metadata.modelUsage -> displays real 5.2k / 512k (1%) */
  vp.__reactFiber$t.memoizedProps.trajectorySlice.stepsInSlice[3].metadata = {
    modelUsage: {
      inputTokens: '3531',
      cacheReadTokens: '478996',
      outputTokens: '5443',
      responseOutputTokens: '5178'
    }
  };
  h.window.__ag_render_metrics(mkHighPayload('481k', 94, '574'));
  await settle(h);

  assert.match(pop.textContent, /5\.2k \/ 512k/);
  assert.match(pop.textContent, /1%/);
  assert.equal(pop.textContent.includes('574'), false);
  assert.equal(pop.textContent.includes('~5%'), false);
  assert.match(h.window.__ag_last_metrics.tooltipHtml, /5\.2k \/ 512k/);
  assert.match(h.window.__ag_last_metrics.tooltipHtml, /was 483k/);
  assert.equal(h.window.__ag_last_metrics.tooltipHtml.includes('94%'), false);

  /* 3c. Narrow window hides metrics pill instead of wrapping onto a second bottom row */
  const customCss = fs.readFileSync(path.join(REPO, 'user', 'custom.css'), 'utf8');
  assert.match(
    customCss,
    /#ag-live-metrics-pill\[data-ag-row-mode="hidden"\][\s\S]*?display:\s*none\s*!important/,
    'custom.css hides metrics pill when narrow instead of wrapping onto a second row'
  );
  const pillEl = h.doc.getElementById('ag-live-metrics-pill');
  pillEl.setAttribute('data-ag-row-mode', 'middle');
  const textEl = h.doc.createElement('span');
  textEl.id = 'ag-live-metrics-text';
  textEl.textContent = '110 tok/s · TTFT 10.9s';
  Object.defineProperty(textEl, 'offsetWidth', { value: 120, configurable: true });
  pillEl.getBoundingClientRect = () => ({ left: 40, top: 500, width: 120, height: 22, right: 160, bottom: 522 });
  textEl.getBoundingClientRect = () => ({ left: 44, top: 502, width: 120, height: 18, right: 164, bottom: 520 });
  pillEl.appendChild(textEl);
  const ttEl = h.doc.getElementById('ag-live-metrics-tooltip');
  ttEl.innerHTML = h.window.__ag_last_metrics.tooltipHtml;
  pillEl.dispatchEvent(new h.window.MouseEvent('mouseenter', { bubbles: true }));
  await h.microtasks();
  assert.equal(ttEl.style.left, '44px', 'tooltip aligns with inline metrics text in middle mode');

  /* 4. Next user turn completes with fresh 35k (7%) metrics -> returns to live idle state & re-enables button */
  vp.__reactFiber$t.memoizedProps.trajectorySlice.stepsInSlice.push(
    { type: 14, status: 3, step: { case: 'userInput', value: { userResponse: '继续下一步' } } },
    { type: 15, status: 3, step: { case: 'plannerResponse', value: { response: '好的。' } } }
  );
  h.window.__ag_render_metrics(mkHighPayload('35k', 7, '1k'));
  await settle(h);

  assert.equal(h.window.__t.detectCompactStatus('abcd-1234'), 'idle');
  assert.equal(ring.hasAttribute('data-compact-state'), false);
  assert.equal(ring.getAttribute('data-level'), 'normal');
  assert.equal(pop.querySelector('[data-ag-qp-compact]').getAttribute('data-state'), 'ready');
  assert.match(pop.textContent, /35k \/ 512k · Out 1k/);

  h.cleanups.forEach((fn) => fn());
  h.close();
});

test('inline pill CJK hygiene & fractional sub-1 tok/s metrics formatting', { skip }, async () => {
  const html = `
    <section>
      <div data-testid="autoscroll-viewport" id="vp">
        <div data-testid="agent-response">
          <div data-testid="planner-response-text" class="select-text">
            <p id="p1">第 24、25 张截图（ <bdi class="context-scope-mention"><button class="inline-pill">a.png</button></bdi> 、 <bdi class="context-scope-mention"><button class="inline-pill">b.png</button></bdi> ）：改成 <code>Extra</code> ，发布 <code>v2.3.4</code> 。</p>
            ${ul(li('改成 Extra', 'completed'), li('跑全量单测', 'completed'), li('推送 GitHub', 'completed'))}
          </div>
        </div>
        <div data-testid="agent-response">
          <div data-testid="planner-response-text">
            ${ul(li('普通完成一', 'completed'), li('普通完成二', 'completed'), li('普通完成三', 'completed'))}
          </div>
        </div>
      </div>
      <div id="antigravity.agentSidePanelInputBox"></div>
    </section>
  `;
  const h = mount(html);
  const vp = h.doc.getElementById('vp');
  vp.__reactFiber$t = {
    memoizedProps: {
      trajectorySlice: {
        stepsInSlice: [
          { step: { case: 'plannerResponse', value: { response: '推进第二步。<!-- todo:2/3 -->' } } },
          { step: { case: 'plannerResponse', value: { response: '推进第三步。<!-- todo:3/3 -->' } } },
          {
            step: {
              case: 'plannerResponse',
              value: { response: '- [x] 改成 Extra\n- [x] 跑全量单测\n- [x] 推送 GitHub' }
            }
          }
        ]
      }
    }
  };
  h.window.__t.syncStepStream();
  await settle(h);

  /* 1. Inline code & file pill boundary spaces stripped + U+2060 Word Joiner attached to CJK punctuation */
  const p1 = h.doc.getElementById('p1');
  const bdis = p1.querySelectorAll('bdi.context-scope-mention');
  const codes = p1.querySelectorAll('code');
  assert.equal(bdis[0].previousSibling.nodeValue, '第 24、25 张截图（\u2060');
  assert.equal(bdis[0].nextSibling.nodeValue, '\u2060、');
  assert.equal(bdis[1].nextSibling.nodeValue, '\u2060）：改成');
  assert.equal(codes[0].nextSibling.nodeValue, '\u2060，发布');
  assert.equal(codes[1].nextSibling.nodeValue, '\u2060。');

  /* 2. Checklists stay completely native now that TodoWrite card is retired */
  assert.equal(h.doc.querySelectorAll('.ag-claude-todo-card').length, 0);
  for (const listEl of h.doc.querySelectorAll('ul.contains-task-list')) {
    assert.equal(listEl.hasAttribute('data-ag-todo-merged'), false);
  }

  /* 3. Fractional 0.3 tok/s + Hold >= 60s formatted cleanly instead of "0 tok/s · Hold 264.5s" */
  const slim = h.window.__t.parseAndSlimMetricsPayload({
    cascadeId: 'abcd-1234',
    hasData: true,
    inlineHtml:
      '<span>0 tok/s</span><span class="ag-sep">·</span><span>Hold 264.5s</span>' +
      '<span class="ag-sep">·</span><span>Ctx 225k/512k <span>(44%)</span></span><span class="ag-sep">·</span><span>Out 75</span>',
    tooltipHtml:
      '<div class="ag-tt-hdr">本轮最新调用 (Gen #40)</div>' +
      '<div class="ag-tt-row"><span class="ag-tt-lbl">生成速度</span><span class="ag-tt-val">端到端（含等待） 0.3 tok/s</span></div>' +
      '<div class="ag-tt-row"><span class="ag-tt-lbl">响应耗时</span><span class="ag-tt-val">等待 264.51s | 刷出 0.41s | 总计 264.91s</span></div>' +
      '<div class="ag-tt-row"><span class="ag-tt-lbl">压缩水位线</span><span class="ag-tt-val">225k / 512k (44%) · 距压缩余 287k</span></div>'
  });
  assert.match(slim.inlineHtml, /0\.3 tok\/s/);
  assert.match(slim.inlineHtml, /Hold 4m 25s/);
  assert.equal(slim.inlineHtml.includes('>0 tok/s<'), false);
  assert.match(slim.tooltipHtml, /0\.3 tok\/s/);

  /* 4. dispose() restores exact original text nodes */
  h.cleanups.forEach((fn) => fn());
  assert.equal(bdis[0].previousSibling.nodeValue, '第 24、25 张截图（ ');
  assert.equal(bdis[0].nextSibling.nodeValue, ' 、 ');
  assert.equal(codes[0].nextSibling.nodeValue, ' ，发布 ');
  h.close();
});

test('dictation editor isolation, ask-question icon removal & Orchestrator model pass-through', { skip }, async () => {
  const customCss = fs.readFileSync(path.join(REPO, 'user', 'custom.css'), 'utf8');
  const configJson = JSON.parse(fs.readFileSync(path.join(REPO, 'user', 'config.json'), 'utf8'));
  const i18nOverride = JSON.parse(fs.readFileSync(path.join(REPO, 'user', 'i18n.override.json'), 'utf8'));

  /* 1. Editable Lexical / textarea / input blocks isolate from @font-face size-adjust and force no-autospace + space-all */
  assert.match(customCss, /--font-editor-sans:/);
  assert.match(
    customCss,
    /\[data-lexical-editor="true"\][\s\S]*?font-family:\s*var\(--font-editor-sans\)\s*!important[\s\S]*?text-autospace:\s*no-autospace\s*!important[\s\S]*?text-spacing-trim:\s*space-all\s*!important/
  );
  assert.match(customCss, /\[data-testid="ask-question-header-icon"\]\s*\{\s*display:\s*none\s*!important;\s*\}/);

  /* 2. i18n config & override protect all Orchestrator model names */
  const ex = configJson.selectors && configJson.selectors.excludeI18n;
  for (const sel of [
    '[data-testid="model-selector-trigger"]',
    '[data-ag-i18n-ignore="1"]',
    '#ag-claude-model-popover',
    '#ag-claude-model-subpop'
  ]) {
    assert.ok(ex.includes(sel), `excludeI18n contains ${sel}`);
  }
  assert.equal(i18nOverride['Orchestrator (Neon)'], 'Orchestrator (Neon)');

  /* 3. syncModelTriggerDisplay shortens Orchestrator -> Orch on the footer trigger and maps XHigh -> Extra */
  const html = `
    <section>
      <div id="antigravity.agentSidePanelInputBox">
        <button type="button" data-testid="model-selector-trigger"><span>编排器 (Neon)</span></button>
      </div>
    </section>
  `;
  const h = mount(html);
  h.window.__t.syncStepStream();
  await settle(h);
  const btn = h.doc.querySelector('button[data-testid="model-selector-trigger"]');
  assert.equal(btn.getAttribute('data-ag-i18n-ignore'), '1');
  assert.equal(btn.textContent.trim(), 'Orch (Neon)');

  btn.querySelector('span').textContent = 'Orchestrator Gemini 4 Neon High';
  h.window.__t.syncStepStream();
  assert.equal(btn.textContent.trim(), 'Orch Gemini 4 Neon High');

  btn.querySelector('span').textContent = 'Gemini 4 Carbon Extra High';
  h.window.__t.syncStepStream();
  assert.equal(btn.textContent.trim(), 'Gemini 4 Carbon Extra');

  /* 4. Primary list follows the curated order (bc105d1): Gemini 4 Neon, Gemini 4 Hydrogen, Orchestrator Neon, Claude
        Opus 5.5 (Sonnet 5.5 is absent from this account); the active non-primary model marks 更多模型 without an Orch label */
  btn.__reactFiber$m = {
    memoizedProps: {
      selectedModel: { label: 'Gemini 4 Carbon (High)', value: 'c-h' },
      setSelectedModel: () => {},
      modelOptions: [
        { label: 'Gemini 4 Carbon (High)', value: 'c-h' },
        { label: 'Gemini 4 Argon (High)', value: 'a-h' },
        { label: 'Gemini 4 Hydrogen (High)', value: 'h-h' },
        { label: 'Gemini 3.8 Flash', value: 'f' },
        { label: 'Gemini 4 Neon (High)', value: 'n-h' },
        { label: 'Orchestrator (Neon)', value: 'orch-neon' },
        { label: 'Claude Opus 5.5', value: 'opus' }
      ]
    }
  };
  btn.dispatchEvent(new h.window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  const mainPop = h.doc.getElementById('ag-claude-model-popover');
  const primaryNames = [...mainPop.querySelectorAll('[data-ag-cm-family]')].map((el) =>
    el.getAttribute('data-ag-cm-family')
  );
  assert.deepEqual(primaryNames, ['Gemini 4 Neon', 'Gemini 4 Hydrogen', 'Orchestrator (Neon)', 'Claude Opus 5.5']);
  const moreRow = mainPop.querySelector('[data-ag-cm-subtrigger="more"]');
  assert.ok(moreRow && moreRow.querySelector('.ag-cm-dot'), 'blue dot marks active model inside 更多模型');
  assert.equal(moreRow.textContent.includes('Orch'), false, 'no abbreviated label shown on 更多模型 row');

  h.cleanups.forEach((fn) => fn());
  h.close();
});

test('answered ask_question card hides speech-bubble ? icon and running timer stays live while drafting in composer', { skip }, async () => {
  const css = fs.readFileSync(path.join(REPO, 'user', 'custom.css'), 'utf8');
  assert.match(css, /\.rounded-xl\.border\s*>\s*div\.border-b\s*>\s*svg:has\(>\s*path\[d\^="M477\.92-295\.77"\]\)/);

  /* Active turn with `<h6>Agent working</h6>` but NO `input-cancel-button` (user drafting a queued message mid-turn) */
  const html = `
    <section>
      <div data-testid="agent-response">
        <h6 class="sr-only">Agent working</h6>
        <button data-testid="tool-group-collapsible" aria-expanded="false"><span title="Running command">Running command</span><svg></svg></button>
      </div>
      <div id="antigravity.agentSidePanelInputBox">
        <button type="button" data-testid="input-send-button">Send</button>
      </div>
    </section>
  `;
  const h = mount(html);
  h.window.__t.syncStepStream();
  await settle(h);

  assert.ok(h.doc.querySelector('.ag-orbit-dots'), 'running indicator stays active when composer swaps cancel button for send button');

  /* Localized Chinese heading (`Agent 正在执行`) also keeps indicator live */
  const h6 = h.doc.querySelector('[data-testid="agent-response"] > h6');
  h6.textContent = 'Agent 正在执行';
  h.window.__t.syncStepStream();
  assert.ok(h.doc.querySelector('.ag-orbit-dots'), 'localized Agent 正在执行 keeps running indicator live');

  /* Once the turn finishes/cancels (`Agent said`), indicator clears */
  h6.textContent = 'Agent said';
  h.window.__t.syncStepStream();
  assert.equal(h.doc.querySelector('.ag-orbit-dots'), null, 'indicator clears once heading switches to Agent said');

  h.cleanups.forEach((fn) => fn());
  h.close();
});

test('Home composer with top project/location bar mounts context ring beside model picker, not top row', { skip }, async () => {
  const html = `
    <div id="antigravity.agentSidePanelInputBox">
      <div id="home-top-row" class="flex min-w-0 flex-1 items-center">
        <div><button type="button" data-testid="project-selector-trigger">Project</button></div>
        <div><button type="button" data-testid="location-selector-trigger">Local</button></div>
      </div>
      <div id="home-bottom-row" class="flex min-w-0 flex-1 items-center">
        <button type="button">+</button>
        <div id="model-wrap"><button type="button" data-testid="model-selector-trigger">Gemini 4 Neon High</button></div>
      </div>
    </div>
  `;
  const h = mount(html);
  h.window.__t.syncStepStream();
  await settle(h);
  const ring = h.doc.getElementById('ag-claude-ctx-ring');
  assert.ok(ring, 'context ring mounted on Home composer');
  assert.equal(ring.parentElement.id, 'home-bottom-row', 'ring mounts in bottom toolbar, not top project row');
  assert.equal(ring.previousElementSibling.id, 'model-wrap', 'ring sits immediately after model selector wrapper');
  h.cleanups.forEach((fn) => fn());
  h.close();
});

test('quota popover: refreshes userTier after account switch and preserves specific Gemini model group names', { skip }, async () => {
  const html = `
    <div id="antigravity.agentSidePanelInputBox">
      <div class="flex min-w-0 flex-1 items-center">
        <div><button type="button" data-testid="model-selector-trigger">Gemini 4 Argon High</button></div>
      </div>
    </div>
  `;
  const h = mount(html);
  const ib = h.doc.getElementById('antigravity.agentSidePanelInputBox');
  let activeTier = { id: 'g1-ultra-tier', name: 'Google AI Ultra' };
  let activeEmail = 'ultra@example.com';
  let activeGroups = [
    { displayName: 'Gemini Models', buckets: [{ window: '5h', remainingFraction: 0.9 }] },
    { displayName: 'Claude and GPT models', buckets: [{ window: '5h', remainingFraction: 1 }] }
  ];
  let fetchCount = 0;
  const fetchArgs = [];
  ib.__reactFiber$q = {
    dependencies: {
      firstContext: {
        memoizedValue: {
          retrieveUserQuotaSummary: async (req, _opts) => {
            fetchCount += 1;
            fetchArgs.push(req);
            return { groups: activeGroups };
          },
          get userStatus() {
            return { email: activeEmail, userTier: activeTier };
          }
        }
      }
    }
  };

  h.window.__t.syncStepStream();
  await settle(h);
  const ring = h.doc.getElementById('ag-claude-ctx-ring');
  ring.click();
  await h.microtasks();

  const pop = h.doc.getElementById('ag-claude-quota-popover');
  assert.match(pop.querySelector('.ag-qp-tier').textContent, /Ultra/, 'shows initial Ultra tier');
  assert.deepEqual(
    [...pop.querySelectorAll('.ag-qp-tab')].map((b) => b.textContent.trim()),
    ['Gemini', 'Claude / GPT']
  );

  /* Switch account in-place from Ultra to Pro with a dedicated Gemini 4 Argon quota group */
  ring.click(); // close
  activeTier = { id: 'g1-pro-tier', name: 'Google AI Pro' };
  activeEmail = 'pro@example.com';
  activeGroups = [
    { displayName: 'Gemini Models', buckets: [{ window: '5h', remainingFraction: 1 }] },
    { displayName: 'Claude and GPT models', buckets: [{ window: '5h', remainingFraction: 1 }] },
    { displayName: 'Gemini 4 Argon', buckets: [{ window: 'weekly', remainingFraction: 0.7 }] }
  ];

  ring.click(); // reopen on new account
  assert.equal(pop.getAttribute('data-loading-hold'), 'true', 'holds visibility until uncached account quota resolves');
  assert.doesNotMatch(pop.textContent, /No plan usage data available|暂无可用套餐限额数据/, 'never flashes empty state before RPC returns');
  await h.microtasks();
  assert.equal(pop.hasAttribute('data-loading-hold'), false, 'releases loading hold immediately when RPC resolves');
  assert.match(pop.querySelector('.ag-qp-tier').textContent, /Pro/, 'updates tier immediately to Pro on account switch');
  assert.doesNotMatch(pop.querySelector('.ag-qp-tier').textContent, /Ultra/, 'no stale Ultra tier');
  assert.ok(fetchCount >= 2, 'account switch invalidates stale quota cache and refetches');
  assert.equal(fetchArgs[fetchArgs.length - 1]?.forceRefresh, true, 'passes protobuf { forceRefresh: true } to raw RPC client');
  assert.deepEqual(
    [...pop.querySelectorAll('.ag-qp-tab')].map((b) => b.textContent.trim()),
    ['Gemini', 'Claude / GPT', 'Gemini 4 Argon'],
    'specific Gemini model group keeps its distinct name instead of duplicating Gemini'
  );
  const activeTab = pop.querySelector('.ag-qp-tab[data-active="true"]');
  assert.equal(activeTab.textContent.trim(), 'Gemini 4 Argon', 'selects dedicated Argon tab when Gemini 4 Argon is active');
  assert.match(h.window.localStorage.getItem('ag_claude_ux_quota_cache_v1') || '', /Gemini 4 Argon/, 'persists SWR quota snapshot for 0ms next-boot open');

  h.cleanups.forEach((fn) => fn());
  h.close();
});

test('projects workspace: 3-level Claude Projects flow (grid -> detail page with project chats & right Instructions/Context card -> chat navigation)', { skip }, async () => {
  const html = `
    <div class="bg-sidebar">
      <div class="flex flex-col gap-1.5">
        <a data-testid="new-conversation-button" href="/">New chat</a>
        <button data-testid="automations-button" class="agy-button">Automations</button>
        <a href="/customizations" class="agy-button">Skills &amp; Customizations</a>
      </div>
      <div data-testid="conversation-list-sidebar">
        <div class="w-full relative" style="height: 220px;">
          <div data-index="0" style="position: sticky; top: 0px;"><div data-testid="section-header">Pinned</div></div>
          <div data-index="1" style="position: absolute; transform: translateY(24px);"><div data-testid="conversation-row-sidebar">Pinned chat</div></div>
          <div data-index="2" style="position: absolute; transform: translateY(57px);"></div>
          <div data-index="3" style="position: absolute; transform: translateY(73px);"><div data-testid="section-header"><span>Projects</span><button data-testid="sidebar-add-project-button"></button></div></div>
          <div data-index="4" style="position: absolute; transform: translateY(97px);"></div>
          <div data-index="5" style="position: absolute; transform: translateY(113px);"><div data-testid="section-header">Conversations</div></div>
          <div data-index="6" style="position: absolute; transform: translateY(137px);"><div data-testid="conversation-row-sidebar">Regular chat</div></div>
        </div>
      </div>
      <div data-testid="project-header" data-project-label="Quotation">Quotation</div>
    </div>
  `;
  const h = mount(html, { modules: { claudeUxHideSidebarProjects: true } }); /* unified Recents is opt-in since c74cee4 */
  const navigated = [];
  const storeState = {
    userStatus: {
      cascadeModelConfigData: {
        clientModelConfigs: [
          { label: 'Gemini 4 Neon (High)', modelId: 'gemini-4-neon-high', modelOrAlias: { choice: { case: 'model', value: 1532 } } },
          { label: 'Gemini 4 Neon (XHigh)', modelId: 'gemini-4-neon-xhigh', modelOrAlias: { choice: { case: 'model', value: 1535 } } },
          { label: 'Gemini 4 Argon (High)', modelId: 'gemini-4-argon-high', modelOrAlias: { choice: { case: 'model', value: 1417 } } }
        ]
      }
    },
    modelSelection: {
      default: { model: 1535 }
    },
    sidebarProjects: {
      projects: [
        { id: 'p-1', name: 'Quotation', folderUris: ['file:///Users/demo/Documents/Quotation'] },
        { id: 'p-2', name: 'Legal Notes', folderUris: ['file:///Users/demo/Documents/Legal'] },
        { id: 'default-cli-project', name: 'CLI Project', folderUris: [] }
      ]
    },
    trajectorySummaries: {
      summaries: {
        'c-101': {
          projectId: 'p-1',
          summary: 'Switchgear BOM pricing',
          lastModifiedTime: { seconds: Math.floor(Date.now() / 1000) - 300 },
          annotations: { title: 'Switchgear BOM pricing' }
        },
        'c-102': {
          projectId: 'p-2',
          summary: 'Contract review',
          lastModifiedTime: { seconds: Math.floor(Date.now() / 1000) - 600 },
          annotations: { title: 'Contract review' }
        }
      },
      indexes: {
        byProject: { 'p-1': ['c-101'], 'p-2': ['c-102'] }
      }
    }
  };
  const hdr = h.doc.querySelector('[data-testid="project-header"]');
  const sb = h.doc.querySelector('[data-testid="conversation-list-sidebar"]');
  const dispatched = [];
  const mockStore = {
    getState: () => storeState,
    subscribe: () => () => {},
    dispatch: (act) => dispatched.push(act)
  };
  const mockRouter = {
    state: { location: { pathname: '/c/old-chat', search: { project: 'outside-of-project' } } },
    navigate: (opts) => {
      navigated.push(opts);
      if (opts && opts.to === '/') {
        mockRouter.state.location = { pathname: '/', search: opts.search || {} };
      }
    }
  };
  const fiberNode = {
    memoizedProps: {
      sidebarStore: mockStore,
      sidebarRouter: mockRouter
    },
    dependencies: {
      firstContext: {
        memoizedValue: {
          store: mockStore
        }
      }
    }
  };
  hdr.__reactFiber$p = fiberNode;
  sb.__reactFiber$p = fiberNode;

  let savedPayload = null;
  let savedScheduledPayload = null;
  const mockState = {
    instructions: 'Always output prices in CNY.',
    files: [{ name: 'price.md', relPath: '.anti-claude/files/price.md', size: 512, sizeText: '512 B', inlined: true }],
    extraFolders: [],
    scheduledTasks: []
  };
  h.window.__agProjectCall = async (action, payload) => {
    if (action === 'listContexts') {
      return {
        ok: true,
        contexts: {
          '/Users/demo/Documents/Quotation': {
            ok: true,
            dirPath: '/Users/demo/Documents/Quotation',
            ...mockState,
            hasOtherAgentsMd: false,
            lastModifiedMs: Date.now()
          }
        }
      };
    }
    if (action === 'readContext') {
      return {
        ok: true,
        dirPath: payload.dirPath,
        ...mockState,
        hasOtherAgentsMd: false,
        lastModifiedMs: Date.now()
      };
    }
    if (action === 'pickFolder') {
      return { ok: true, canceled: false, folderPath: '/Volumes/GM7/CivilLaw/Guide', name: 'Guide' };
    }
    if (action === 'saveContext') {
      savedPayload = payload;
      mockState.instructions = payload.instructions;
      mockState.extraFolders = payload.extraFolders || [];
      return {
        ok: true,
        dirPath: payload.dirPath,
        ...mockState,
        hasOtherAgentsMd: false,
        lastModifiedMs: Date.now()
      };
    }
    if (action === 'saveScheduledTask') {
      savedScheduledPayload = payload;
      const t = { ...payload.task, id: 'ac-daily-briefing-1', sidecarId: payload.task.frequency !== 'manual' ? 'ac-daily-briefing-1' : '', syncedSidecar: payload.task.frequency !== 'manual' };
      mockState.scheduledTasks = [t];
      return {
        ok: true,
        dirPath: payload.dirPath,
        ...mockState,
        hasOtherAgentsMd: false,
        lastModifiedMs: Date.now()
      };
    }
    return { ok: false };
  };

  h.window.__t.syncStepStream();
  await settle(h);

  /* 1. Verify placement strictly between Automations and Skills */
  const autoBtn = h.doc.querySelector('[data-testid="automations-button"]');
  const skillsLink = h.doc.querySelector('a[href="/customizations"]');
  const projBtn = h.doc.getElementById('ag-claude-projects-nav-btn');
  assert.ok(projBtn, 'Projects nav button mounted');
  assert.equal(autoBtn.nextElementSibling, projBtn, 'Projects nav sits directly after Automations');
  assert.equal(projBtn.nextElementSibling, skillsLink, 'Projects nav sits directly before Skills & Customizations');
  assert.ok(projBtn.querySelector('svg path[d*="M5.25 2.75"]'), 'renders Claude stacked-box SVG icon');

  /* 1b. Verify unified Claude-style sidebar: native Projects & standalone Conversations hidden, Pinned kept to exact height, unified Recents mixes all project & standalone chats below */
  const sbList = h.doc.querySelector('[data-testid="conversation-list-sidebar"] > div');
  assert.equal(sb.getAttribute('data-ag-sb-unified'), 'pinned', 'keeps Pinned slice visible with exact height');
  assert.equal(sb.style.getPropertyValue('--ag-sb-pinned-height'), '73px', 'measures exact 73px Pinned height');
  assert.equal(sbList.querySelector('[data-index="0"]').hasAttribute('data-ag-sb-hide-proj'), false, 'Pinned header stays visible');
  assert.equal(sbList.querySelector('[data-index="1"]').hasAttribute('data-ag-sb-hide-proj'), false, 'Pinned row stays visible');
  assert.equal(sbList.querySelector('[data-index="3"]').getAttribute('data-ag-sb-hide-proj'), '1', 'native sidebar Projects header hidden');
  assert.equal(sbList.querySelector('[data-index="4"]').getAttribute('data-ag-sb-hide-proj'), '1', 'native sidebar Projects spacer hidden');
  assert.equal(sbList.querySelector('[data-index="5"]').getAttribute('data-ag-sb-hide-proj'), '1', 'native standalone Conversations header hidden');
  assert.equal(sbList.querySelector('[data-index="6"]').getAttribute('data-ag-sb-hide-proj'), '1', 'native standalone Conversations rows hidden');
  const unifiedSec = h.doc.getElementById('ag-claude-recent-section');
  assert.ok(unifiedSec, 'unified Recents section mounted below Pinned');
  assert.equal(unifiedSec.getAttribute('data-mode'), 'unified');
  assert.equal(sb.nextElementSibling, unifiedSec, 'unified Recents sits directly after Pinned container');
  const unifiedRows = [...unifiedSec.querySelectorAll('.ag-recent-row')];
  assert.equal(unifiedRows.length, 2, 'unified Recents surfaces project conversations directly in sidebar');
  assert.deepEqual(
    unifiedRows.map((r) => r.getAttribute('data-ag-recent-id')),
    ['c-101', 'c-102'],
    'sorted newest-first across projects'
  );
  assert.equal(unifiedRows[0].hasAttribute('title'), false, 'omits plain browser title tooltip');
  assert.equal(unifiedRows[0].getAttribute('data-ag-recent-project'), 'Quotation', 'row metadata exposes owning project name');

  /* 2. Level 1: Clicking opens Projects card grid (including CLI Project) */
  projBtn.click();
  await h.microtasks();
  const view = h.doc.getElementById('ag-claude-projects-view');
  assert.equal(view.getAttribute('data-open'), 'true');
  const cards = [...view.querySelectorAll('.ag-proj-card')];
  assert.equal(cards.length, 3, 'renders the 2 local projects plus CLI Project');
  assert.match(cards[0].textContent, /Quotation/);
  assert.ok(cards.some((c) => /CLI Project/.test(c.textContent)), 'CLI Project included in Projects workspace');

  /* 3. Level 2: Clicking a card navigates into the Project Detail Page with composer, Recents & Instructions/Context card */
  cards[0].click();
  await h.microtasks();
  assert.equal(view.querySelector('.ag-pd-crumb-cur').textContent.trim(), 'Quotation');
  assert.ok(view.querySelector('#ag-pd-composer-input'), 'project quick-start composer rendered');
  const chatRows = [...view.querySelectorAll('.ag-pd-chat-row')];
  assert.equal(chatRows.length, 1, 'lists only conversations belonging to Quotation');
  assert.match(chatRows[0].textContent, /Switchgear BOM pricing/);
  assert.match(view.querySelector('.ag-pd-sidecard').textContent, /Always output prices in CNY/);
  assert.match(view.querySelector('.ag-pd-sidecard').textContent, /price\.md/);

  /* 4. Editing Instructions from the right-hand card saves via local RPC bridge */
  view.querySelector('[data-ag-pd-edit-inst]').click();
  await h.microtasks();
  const modal = h.doc.getElementById('ag-claude-project-modal');
  assert.ok(modal, 'instructions editor modal opened');
  const ta = modal.querySelector('#ag-pm-instructions');
  ta.value = 'Always output prices in CNY with tax breakdown.';
  ta.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  modal.querySelector('[data-ag-pm-save]').click();
  await h.microtasks();
  assert.ok(savedPayload, 'saveContext RPC invoked');
  assert.equal(savedPayload.instructions, 'Always output prices in CNY with tax breakdown.');
  assert.equal(h.doc.getElementById('ag-claude-project-modal'), null, 'modal closes cleanly after save');

  /* 4b. Adding an extra local folder from the composer dropdown persists it in extraFolders & switches active folder */
  view.querySelector('[data-ag-pd-folder-toggle]').click();
  const folderMenu = view.querySelector('[data-ag-pd-folder-menu]');
  assert.ok(folderMenu, 'folder picker dropdown opened');
  folderMenu.querySelector('[data-ag-pd-add-folder]').click();
  await h.microtasks();
  await h.microtasks();
  assert.equal(savedPayload.extraFolders.length, 1, 'extra folder persisted via saveContext');
  assert.equal(savedPayload.extraFolders[0].absPath, '/Volumes/GM7/CivilLaw/Guide');
  assert.match(view.querySelector('[data-ag-pd-folder-toggle]').textContent, /Guide/, 'active folder trigger reflects newly added folder');

  /* 4c. Right-hand Scheduled section opens Claude-style Create scheduled task modal and saves recurring task */
  const schedAddBtn = view.querySelector('[data-ag-pd-add-sched]');
  assert.ok(schedAddBtn, 'Scheduled + button mounted in right card');
  schedAddBtn.click();
  await h.microtasks();
  const schedModal = h.doc.getElementById('ag-claude-project-modal');
  assert.ok(schedModal, 'Create scheduled task modal opened');
  assert.equal(schedModal.querySelector('[data-ag-sched-save]').disabled, true, 'Save disabled until required fields filled');
  const setVal = (sel, val, ev = 'input') => {
    const el = schedModal.querySelector(sel);
    el.value = val;
    el.dispatchEvent(new h.window.Event(ev, { bubbles: true }));
  };
  setVal('#ag-sched-name', 'daily-briefing');
  setVal('#ag-sched-desc', 'Summarize quote updates');
  setVal('#ag-sched-instructions', 'Check latest BOM prices and produce daily report.');
  setVal('#ag-sched-freq', 'daily', 'change');
  await h.microtasks();
  const saveSchedBtn = h.doc.getElementById('ag-claude-project-modal').querySelector('[data-ag-sched-save]');
  assert.equal(saveSchedBtn.disabled, false, 'Save enabled once required fields are filled');
  saveSchedBtn.click();
  await h.microtasks();
  await h.microtasks();
  assert.ok(savedScheduledPayload, 'saveScheduledTask RPC invoked');
  assert.equal(savedScheduledPayload.task.name, 'daily-briefing');
  assert.equal(savedScheduledPayload.task.frequency, 'daily');
  assert.equal(h.doc.getElementById('ag-claude-project-modal'), null, 'scheduled modal closes cleanly after save');
  assert.match(view.querySelector('[data-ag-pd-sched-sec]').textContent, /daily-briefing/, 'saved scheduled task rendered in right Scheduled section');
  assert.ok(view.querySelector('[data-ag-pd-run-sched]'), 'Run now button rendered for scheduled task');

  /* 4d. Submitting a prompt from Project Detail composer dispatches official project-binding actions & navigates with search.project */
  const compInput = view.querySelector('#ag-pd-composer-input');
  const pdModelBtn = view.querySelector('#ag-pd-model-btn');
  assert.ok(pdModelBtn, 'interactive model selector button rendered in project composer');
  assert.match(pdModelBtn.textContent, /Gemini 4 Neon/, 'model label resolves from Redux even without a native model-selector-trigger in DOM');
  assert.match(pdModelBtn.textContent, /Extra/, 'effort label resolves from Redux default model');
  pdModelBtn.dispatchEvent(new h.window.Event('pointerdown', { bubbles: true }));
  const modelPop = h.doc.getElementById('ag-claude-model-popover');
  assert.equal(modelPop && modelPop.getAttribute('data-open'), 'true', 'clicking project model button opens real Claude model popover purely via Redux fallback');
  /* Gemini 4 Argon is not in the curated primary list (bc105d1), so it is picked from More models */
  modelPop.querySelector('[data-ag-cm-subtrigger="more"]').click();
  h.doc.getElementById('ag-claude-model-subpop').querySelector('[data-ag-cm-more-family="Gemini 4 Argon"]').click();
  assert.ok(
    dispatched.some((a) => a && a.type === 'modelSelection/modelPicked' && a.payload && a.payload.model === 1417),
    'selecting a model from project composer dispatches modelSelection/modelPicked'
  );
  assert.ok(view.querySelector('[data-ag-pd-composer-add]'), 'composer + add-file button rendered');
  compInput.value = 'Draft quotation summary';
  compInput.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  view.querySelector('[data-ag-pd-send]').click();
  await h.microtasks();
  assert.ok(
    dispatched.some((a) => a && a.type === 'newConvoResourceSelector/setLastSelectedProject' && a.payload === 'p-1'),
    'dispatches setLastSelectedProject(p-1)'
  );
  assert.ok(
    dispatched.some((a) => a && a.type === 'newConvoResourceSelector/setMagicWorkspaceSelected' && a.payload === false),
    'dispatches setMagicWorkspaceSelected(false)'
  );
  assert.ok(
    navigated.some((n) => n && n.to === '/' && n.search && n.search.project === 'p-1'),
    'navigates to / with search.project = p-1 so the new conversation belongs to the project'
  );

  /* Re-open project detail to verify Level 3 direct chat navigation */
  projBtn.click();
  await h.microtasks();
  view.querySelectorAll('.ag-proj-card')[0].click();
  await h.microtasks();

  /* 5. Level 3: Clicking a conversation in Recents closes Projects view and navigates straight into that conversation */
  view.querySelector('.ag-pd-chat-row').click();
  assert.equal(view.getAttribute('data-open'), 'false', 'Projects overlay closes when opening a chat');
  assert.ok(navigated.some((n) => JSON.stringify(n).includes('c-101')), 'navigated directly to project conversation c-101');

  /* 6. Clean disposal */
  h.cleanups.forEach((fn) => fn());
  assert.equal(h.doc.getElementById('ag-claude-projects-nav-btn'), null, 'nav button removed on dispose');
  assert.equal(h.doc.getElementById('ag-claude-projects-view'), null, 'projects view removed on dispose');
  h.close();
});

test('unified sidebar Recents: mixes project & standalone chats without 8-item cap, supports pin/rename/archive/delete & direct project jump', { skip }, async () => {
  const html = `
    <div class="bg-sidebar">
      <div class="flex flex-col gap-1.5">
        <a data-testid="new-conversation-button" href="/">New chat</a>
        <button data-testid="automations-button" class="agy-button">Automations</button>
        <a href="/customizations" class="agy-button">Skills &amp; Customizations</a>
      </div>
      <div class="sb-grand flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div class="sb-parent w-full relative flex-1">
          <div data-testid="conversation-list-sidebar">
            <div class="w-full relative" style="height: 200px;">
              <div data-index="0" style="position: absolute; transform: translateY(0px);"><div data-testid="section-header"><span>Projects</span><button data-testid="sidebar-add-project-button"></button></div></div>
              <div data-index="1" style="position: absolute; transform: translateY(40px);"><div data-testid="section-header">Conversations</div></div>
              <div data-index="2" style="position: absolute; transform: translateY(64px);"><div data-testid="conversation-row-sidebar">Standalone 1</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  const h = mount(html, { modules: { claudeUxHideSidebarProjects: true } }); /* unified Recents is opt-in since c74cee4 */
  const nowSec = Math.floor(Date.now() / 1000);
  const summaries = {};
  for (let i = 1; i <= 10; i++) {
    summaries[`c-${i}`] = {
      annotations: { title: i === 1 ? 'Project Test Chat' : `Chat ${i}` },
      lastModifiedTime: { seconds: nowSec - i * 60 },
      trajectoryMetadata: { projectId: i % 2 === 1 ? 'p-web' : 'outside-of-project' },
      status: 1
    };
  }
  const storeState = {
    sidebarProjects: {
      projects: [{ id: 'p-web', name: '前端工程重构', folderUris: ['file:///Users/demo/WebApp'] }]
    },
    trajectorySummaries: { summaries }
  };
  const mutations = [];
  const deleted = [];
  const navigated = [];
  const sb = h.doc.querySelector('[data-testid="conversation-list-sidebar"]');
  const sbParent = h.doc.querySelector('.sb-parent');
  sb.firstElementChild.__reactFiber$sb = {
    memoizedProps: {
      sidebarStore: { getState: () => storeState, subscribe: () => () => {} },
      sidebarRouter: {
        state: { location: { pathname: '/c/c-1' } },
        navigate: (arg) => navigated.push(arg)
      },
      sidebarActions: {
        updateConversationAnnotations: async (id, patch, merge) => {
          mutations.push({ id, patch, merge });
        },
        deleteCascadeTrajectory: async (id) => {
          deleted.push(id);
        }
      }
    }
  };

  h.window.__t.syncStepStream();
  await settle(h);

  /* Empty pinned section collapses wrapper cleanly */
  assert.equal(sbParent.getAttribute('data-ag-sb-unified'), 'empty', 'collapses empty native wrapper when no Pinned chats exist');
  const sec = h.doc.getElementById('ag-claude-recent-section');
  assert.ok(sec, 'unified Recents mounted');
  assert.equal(sec.getAttribute('data-mode'), 'unified');
  assert.equal(sbParent.nextElementSibling, sec, 'unified Recents sits right after native wrapper inside sbGrand');

  /* Shows all 10 mixed chats without 4/8 cap */
  const rows = [...sec.querySelectorAll('.ag-recent-row')];
  assert.equal(rows.length, 10, 'renders all 10 mixed project + standalone chats without old 4/8 cap');
  assert.equal(rows[0].getAttribute('data-ag-recent-id'), 'c-1');
  assert.equal(rows[0].hasAttribute('title'), false, 'omits plain browser title tooltip');
  assert.equal(rows[0].getAttribute('data-ag-recent-project'), '前端工程重构', 'shows owning project name in metadata');

  /* Inline hover Pin button */
  rows[0].querySelector('[data-ag-recent-pin="c-1"]').click();
  await h.microtasks();
  assert.deepEqual(
    JSON.parse(JSON.stringify(mutations[0])),
    { id: 'c-1', patch: { pinned: true }, merge: true },
    'hover pin calls updateConversationAnnotations'
  );

  /* More menu: jump straight to owning project detail */
  rows[0].querySelector('[data-ag-recent-menu="c-1"]').click();
  const menu = h.doc.getElementById('ag-recent-row-menu');
  assert.ok(menu, 'more menu opened');
  const projItem = menu.querySelector('[data-ag-rm-act="open-project"]');
  assert.ok(projItem, 'menu exposes owning project entry');
  assert.match(projItem.textContent, /前端工程重构/);
  projItem.click();
  await h.microtasks();
  const view = h.doc.getElementById('ag-claude-projects-view');
  assert.ok(view && view.getAttribute('data-open') === 'true', 'clicking project entry opens project detail view');
  assert.match(view.querySelector('.ag-pd-crumb-cur').textContent, /前端工程重构/);

  /* Inline rename via menu */
  rows[0].querySelector('[data-ag-recent-menu="c-1"]').click();
  h.doc.querySelector('#ag-recent-row-menu [data-ag-rm-act="rename"]').click();
  await settle(h);
  const renameInput = sec.querySelector('[data-ag-recent-rename-input="c-1"]');
  assert.ok(renameInput, 'inline rename input mounted');
  renameInput.value = 'Renamed Web Chat';
  renameInput.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await h.microtasks();
  assert.deepEqual(
    JSON.parse(JSON.stringify(mutations[1])),
    { id: 'c-1', patch: { title: 'Renamed Web Chat' }, merge: true },
    'Enter commits rename'
  );

  /* Archive via menu */
  sec.querySelector('[data-ag-recent-menu="c-2"]').click();
  h.doc.querySelector('#ag-recent-row-menu [data-ag-rm-act="archive"]').click();
  await h.microtasks();
  assert.deepEqual(
    JSON.parse(JSON.stringify(mutations[2])),
    { id: 'c-2', patch: { archived: true }, merge: true },
    'archive updates annotations'
  );

  /* Two-step confirm delete via menu */
  sec.querySelector('[data-ag-recent-menu="c-2"]').click();
  const delBtn1 = h.doc.querySelector('#ag-recent-row-menu [data-ag-rm-act="delete"]');
  delBtn1.click();
  assert.equal(deleted.length, 0, 'first delete click arms confirmation instead of deleting immediately');
  const delBtn2 = h.doc.querySelector('#ag-recent-row-menu [data-ag-rm-act="delete"]');
  assert.equal(delBtn2.getAttribute('data-confirm'), '1');
  delBtn2.click();
  await h.microtasks();
  assert.deepEqual(deleted, ['c-2'], 'second delete click calls deleteCascadeTrajectory');

  /* Clean disposal */
  h.cleanups.forEach((fn) => fn());
  assert.equal(h.doc.getElementById('ag-claude-recent-section'), null);
  assert.equal(h.doc.getElementById('ag-recent-row-menu'), null);
  assert.equal(sbParent.hasAttribute('data-ag-sb-unified'), false);
  h.close();
});

test('customizations layout enhancement: mounts category tabs, frames skills list, supports search bypass & + Add skill modal', { skip }, async () => {
  const html = `
    <div class="flex-1 overflow-y-auto">
      <div class="sticky top-0 z-20 bg-background">
        <div class="w-full max-w-4xl mx-auto">
          <div class="flex items-center justify-between">
            <h1>Customizations</h1>
            <nav data-testid="plugins-tabs">
              <a data-testid="plugins-tab-browse" href="/customizations/browse">Marketplace</a>
              <a data-testid="plugins-tab-installed" href="/customizations/installed" aria-current="page">Installed</a>
            </nav>
          </div>
          <input data-testid="customizations-search" type="search" value="" placeholder="Search customizations..." />
        </div>
      </div>
      <div class="max-w-4xl w-full mx-auto">
        <section data-testid="customizations-installed-plugins">
          <div><h3><button>Installed Plugins <span data-testid="customization-section-count">4</span></button></h3></div>
          <div class="grid"><div>gdocs-plugin</div></div>
        </section>
        <section>
          <div>
            <h3><button>Skills &amp; Rules <span data-testid="customization-section-count">64</span></button></h3>
            <div><button data-testid="skills-rules-filter">All</button></div>
          </div>
          <div><div class="flex flex-col"><div class="group">/code-review</div></div></div>
        </section>
        <section>
          <div><h3><button>Custom Agents <span data-testid="customization-section-count">0</span></button></h3></div>
          <p>No custom agents yet.</p>
        </section>
        <section>
          <div>
            <h3><button>MCP Servers <span data-testid="customization-section-count">4</span></button></h3>
            <div><button data-testid="add-mcp-button">+</button></div>
          </div>
          <div>atlassian</div>
        </section>
      </div>
    </div>
  `;
  const h = mount(html);
  const rpcCalls = [];
  h.window.__agProjectCall = async (action, payload) => {
    rpcCalls.push({ action, payload });
    if (action === 'createLocalSkill') {
      return { ok: true, folderName: 'lint-check', dirPath: '/Users/demo/.gemini/config/skills/lint-check' };
    }
    if (action === 'createLocalAgent') {
      return { ok: true, name: 'code-reviewer', filePath: '/Users/demo/.gemini/config/agents/code-reviewer.md' };
    }
    if (action === 'openSkillsDir' || action === 'openAgentsDir') return { ok: true };
    return { ok: false };
  };

  h.window.__t.syncStepStream();
  await settle(h);

  const catBar = h.doc.getElementById('ag-cust-cat-bar');
  assert.ok(catBar, 'category tabs bar mounted inside sticky header');
  const tabs = [...catBar.querySelectorAll('[data-ag-cust-cat]')].map((b) => b.getAttribute('data-ag-cust-cat'));
  assert.deepEqual(tabs, ['skills', 'plugins', 'mcp', 'agents', 'all'], 'renders ordered category tabs plus All');

  const secSkills = h.doc.querySelector('section[data-ag-cust-sec="skills"]');
  const secPlugins = h.doc.querySelector('section[data-ag-cust-sec="plugins"]');
  const secMcp = h.doc.querySelector('section[data-ag-cust-sec="mcp"]');
  assert.equal(secSkills.hasAttribute('data-ag-cust-hidden'), false, 'Skills section visible by default');
  assert.equal(secPlugins.getAttribute('data-ag-cust-hidden'), '1', 'Plugins hidden while Skills tab active');
  assert.equal(secMcp.getAttribute('data-ag-cust-hidden'), '1', 'MCP hidden while Skills tab active');

  /* Switching to MCP isolates MCP section */
  catBar.querySelector('[data-ag-cust-cat="mcp"]').click();
  assert.equal(secMcp.hasAttribute('data-ag-cust-hidden'), false, 'MCP section visible after clicking MCP tab');
  assert.equal(secSkills.getAttribute('data-ag-cust-hidden'), '1', 'Skills hidden when MCP tab active');

  /* Typing in search reveals all sections via searching mode */
  const search = h.doc.querySelector('[data-testid="customizations-search"]');
  search.value = 'review';
  search.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  assert.equal(h.doc.querySelector('[data-ag-cust-page="1"]').getAttribute('data-ag-cust-searching'), '1');
  assert.equal(secSkills.hasAttribute('data-ag-cust-hidden'), false, 'search un-hides all sections');

  /* Clicking + Add skill opens modal and calls createLocalSkill RPC */
  const addBtn = h.doc.getElementById('ag-cust-add-skill-btn');
  assert.ok(addBtn, '+ Add skill button injected in Skills & Rules header');
  assert.ok(h.doc.getElementById('ag-cust-open-skills-dir-btn'), 'Open skills folder button injected');
  addBtn.click();
  const modal = h.doc.getElementById('ag-claude-project-modal');
  assert.ok(modal, 'Add skill modal opened');
  assert.equal(modal.querySelector('[data-ag-skill-save]').disabled, true, 'Create skill disabled until required fields filled');
  for (const [sel, val] of [
    ['#ag-skill-name', 'lint-check'],
    ['#ag-skill-desc', 'Run repository lint checks'],
    ['#ag-skill-body', '# Steps\n1. Check syntax.']
  ]) {
    const el = modal.querySelector(sel);
    el.value = val;
    el.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  }
  const saveBtn = modal.querySelector('[data-ag-skill-save]');
  assert.equal(saveBtn.disabled, false);
  saveBtn.click();
  await h.microtasks();
  await h.microtasks();
  assert.ok(
    rpcCalls.some((c) => c.action === 'createLocalSkill' && c.payload.name === 'lint-check'),
    'invokes createLocalSkill RPC'
  );
  assert.match(h.doc.getElementById('ag-claude-project-modal').textContent, /lint-check/);
  h.doc.querySelector('#ag-claude-project-modal [data-ag-pm-close]').click();

  /* Clicking + New subagent opens Custom Subagent modal, switches tool preset, and calls createLocalAgent */
  const addAgentBtn = h.doc.getElementById('ag-cust-add-agent-btn');
  assert.ok(addAgentBtn, '+ New subagent button injected in Custom Agents header');
  assert.ok(h.doc.getElementById('ag-cust-open-agents-dir-btn'), 'Open agents folder button injected');
  addAgentBtn.click();
  const agentModal = h.doc.getElementById('ag-claude-project-modal');
  assert.ok(agentModal, 'New subagent modal opened');
  agentModal.querySelector('[data-ag-agent-preset="editor"]').click();
  const agentModal2 = h.doc.getElementById('ag-claude-project-modal');
  for (const [sel, val] of [
    ['#ag-agent-name', 'code-reviewer'],
    ['#ag-agent-desc', 'Reviews pull requests and flags issues'],
    ['#ag-agent-prompt', 'Always cite exact line numbers.']
  ]) {
    const el = agentModal2.querySelector(sel);
    el.value = val;
    el.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  }
  agentModal2.querySelector('[data-ag-agent-save]').click();
  await h.microtasks();
  await h.microtasks();
  const agentCall = rpcCalls.find((c) => c.action === 'createLocalAgent');
  assert.ok(agentCall, 'invokes createLocalAgent RPC');
  assert.equal(agentCall.payload.name, 'code-reviewer');
  assert.deepEqual(Array.from(agentCall.payload.tools), ['read_file', 'edit_file', 'write_file', 'search_web']);

  /* Clean disposal */
  h.cleanups.forEach((fn) => fn());
  assert.equal(h.doc.getElementById('ag-cust-cat-bar'), null);
  assert.equal(h.doc.getElementById('ag-cust-skill-actions'), null);
  assert.equal(h.doc.getElementById('ag-cust-agent-actions'), null);
  h.close();
});
