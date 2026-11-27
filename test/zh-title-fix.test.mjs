/**
 * Unit tests for Chinese conversation title detection, prompt extraction,
 * output sanitization, and transcript reading in core/daemon.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const daemon = await import(pathToFileURL(path.join(REPO, 'core', 'daemon.mjs')).href);

test('looksLikeEnglishTitle detects English titles and preserves Chinese/placeholders/paths/UUIDs', () => {
  assert.equal(daemon.looksLikeEnglishTitle('Comparing Cindy And Agy Harness'), true);
  assert.equal(daemon.looksLikeEnglishTitle('Anti-Claude Plugin Installation Guide'), true);
  assert.equal(daemon.looksLikeEnglishTitle('AI Model Identity Inquiry'), true);

  assert.equal(daemon.looksLikeEnglishTitle('Cindy Agy架构模式兼容评估'), false);
  assert.equal(daemon.looksLikeEnglishTitle('对比 Cindy 与 Agy Harness 架构'), false);
  assert.equal(daemon.looksLikeEnglishTitle('New conversation'), false);
  assert.equal(daemon.looksLikeEnglishTitle('Untitled Conversation'), false);
  assert.equal(daemon.looksLikeEnglishTitle('b968c4c5-a50c-4dbe-bf4d-e38a31b4af3b'), false);
  assert.equal(daemon.looksLikeEnglishTitle('https://github.com/victorcheng2333/Anti-Claude'), false);
  assert.equal(daemon.looksLikeEnglishTitle('/Users/chengfei/Documents'), false);
  assert.equal(daemon.looksLikeEnglishTitle('ab'), false);
  assert.equal(daemon.looksLikeEnglishTitle(''), false);
});

test('sanitizeGeneratedZhTitle cleans formatting, preserves technical words, and rejects invalid output', () => {
  assert.equal(
    daemon.sanitizeGeneratedZhTitle('  "对比 Cindy 与 Agy Harness 架构。"  '),
    '对比 Cindy 与 Agy Harness 架构'
  );
  assert.equal(
    daemon.sanitizeGeneratedZhTitle('标题：「Anti-Claude 插件安装指南」\n多余解释'),
    'Anti-Claude 插件安装指南'
  );
  assert.equal(
    daemon.sanitizeGeneratedZhTitle('```\n# 排查 MCP 工具连接失败问题！\n```'),
    '排查 MCP 工具连接失败问题'
  );

  assert.equal(daemon.sanitizeGeneratedZhTitle('Pure English Output'), null);
  assert.equal(daemon.sanitizeGeneratedZhTitle('请生成简体中文标题'), null);
  assert.equal(daemon.sanitizeGeneratedZhTitle(''), null);

  const longTitle = '这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的中文标题用于验证截断逻辑';
  const sanitized = daemon.sanitizeGeneratedZhTitle(longTitle);
  assert.ok(sanitized);
  assert.equal(Array.from(sanitized).length, 32);
});

test('extractFirstUserPromptText extracts USER_REQUEST and strips Antigravity metadata', () => {
  const wrapped =
    '<USER_REQUEST>\n参考 Anti-Claude 给我排查一下标题问题\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: 2026\n</ADDITIONAL_METADATA>';
  assert.equal(daemon.extractFirstUserPromptText(wrapped), '参考 Anti-Claude 给我排查一下标题问题');

  const plainWithMeta = 'Review this PR please <ADDITIONAL_METADATA>time</ADDITIONAL_METADATA>';
  assert.equal(daemon.extractFirstUserPromptText(plainWithMeta), 'Review this PR please');
});

test('readConversationFirstUserPrompt reads transcript.jsonl safely and checks Chinese presence', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-claude-zh-title-'));
  try {
    const convDir = path.join(tmpRoot, 'conversations');
    const cidZh = '11111111-1111-4111-8111-111111111111';
    const cidEn = '22222222-2222-4222-8222-222222222222';
    const zhLogDir = path.join(tmpRoot, 'brain', cidZh, '.system_generated', 'logs');
    const enLogDir = path.join(tmpRoot, 'brain', cidEn, '.system_generated', 'logs');
    fs.mkdirSync(convDir, { recursive: true });
    fs.mkdirSync(zhLogDir, { recursive: true });
    fs.mkdirSync(enLogDir, { recursive: true });

    fs.writeFileSync(
      path.join(zhLogDir, 'transcript.jsonl'),
      `${JSON.stringify({
        step_index: 0,
        type: 'USER_INPUT',
        source: 'USER_EXPLICIT',
        content: '<USER_REQUEST>\n帮我对比 Cindy 和 Agy Harness\n</USER_REQUEST>'
      })}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(enLogDir, 'transcript.jsonl'),
      `${JSON.stringify({
        step_index: 0,
        type: 'USER_INPUT',
        source: 'USER_EXPLICIT',
        content: '<USER_REQUEST>\nCompare Cindy and Agy Harness\n</USER_REQUEST>'
      })}\n`,
      'utf8'
    );

    const zhRes = daemon.readConversationFirstUserPrompt(cidZh, convDir);
    assert.deepEqual(zhRes, { prompt: '帮我对比 Cindy 和 Agy Harness', hasChinese: true });

    const enRes = daemon.readConversationFirstUserPrompt(cidEn, convDir);
    assert.deepEqual(enRes, { prompt: 'Compare Cindy and Agy Harness', hasChinese: false });

    assert.equal(daemon.readConversationFirstUserPrompt('not-a-uuid', convDir), null);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('buildZhTitlePrompt includes English title and optional Chinese user message', () => {
  const p = daemon.buildZhTitlePrompt('Comparing Cindy And Agy Harness', '对比一下 Cindy 和 Agy');
  assert.match(p, /<english_title>Comparing Cindy And Agy Harness<\/english_title>/);
  assert.match(p, /<user_message>对比一下 Cindy 和 Agy<\/user_message>/);
  assert.match(p, /简体中文标题/);
});
