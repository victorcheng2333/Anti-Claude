import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-claude-font-prefs-'));
process.env.ANTI_CLAUDE_STATE_DIR = tempStateDir;

const { saveUiPrefs } = await import('../core/daemon.mjs');

test.after(() => {
  fs.rmSync(tempStateDir, { recursive: true, force: true });
});

test('saveUiPrefs normalizes and persists independent uiFontSize and chatFontSize', () => {
  const saved = saveUiPrefs({
    updatedAt: 1700000000000,
    uiFontSize: '12px',
    chatFontSize: '16px',
    cjkFontScale: '95'
  });

  assert.equal(saved.uiFontSize, '12');
  assert.equal(saved.chatFontSize, '16');

  const prefsFile = path.join(tempStateDir, 'ui-prefs.json');
  const persisted = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
  assert.equal(persisted.uiFontSize, '12');
  assert.equal(persisted.chatFontSize, '16');
  assert.equal(persisted.cjkFontScale, '95');
});

test('saveUiPrefs rejects out-of-range font sizes while preserving previously valid values', () => {
  const first = saveUiPrefs({
    updatedAt: 1700000000100,
    uiFontSize: '13',
    chatFontSize: '15'
  });
  assert.equal(first.uiFontSize, '13');
  assert.equal(first.chatFontSize, '15');

  const second = saveUiPrefs({
    updatedAt: 1700000000200,
    uiFontSize: '99px',
    chatFontSize: '10'
  });
  assert.equal(second.uiFontSize, '13');
  assert.equal(second.chatFontSize, '15');

  const prefsFile = path.join(tempStateDir, 'ui-prefs.json');
  const persisted = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
  assert.equal(persisted.uiFontSize, '13');
  assert.equal(persisted.chatFontSize, '15');
});
