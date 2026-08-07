import { describe, expect, test } from 'bun:test';

import type { MessageChunk } from '../../types';

import { createArchonUIBridge, createArchonUIContext } from './ui-context-stub';

describe('createArchonUIBridge', () => {
  test('drops notifications when no emitter is set', () => {
    const bridge = createArchonUIBridge();
    expect(() => bridge.emit({ type: 'system', content: 'x' })).not.toThrow();
  });

  test('forwards notifications to the configured emitter', () => {
    const bridge = createArchonUIBridge();
    const chunks: MessageChunk[] = [];
    bridge.setEmitter(c => chunks.push(c));
    bridge.emit({ type: 'system', content: 'hello' });
    expect(chunks).toEqual([{ type: 'system', content: 'hello' }]);
  });

  test('detaches emitter when cleared (bridgeSession cleanup path)', () => {
    const bridge = createArchonUIBridge();
    const chunks: MessageChunk[] = [];
    bridge.setEmitter(c => chunks.push(c));
    bridge.setEmitter(undefined);
    bridge.emit({ type: 'system', content: 'late' });
    expect(chunks).toEqual([]);
  });
});

describe('createArchonUIContext', () => {
  function mk() {
    const bridge = createArchonUIBridge();
    const chunks: MessageChunk[] = [];
    bridge.setEmitter(c => chunks.push(c));
    const ui = createArchonUIContext(bridge);
    return { ui, chunks };
  }

  test('notify("info") forwards as assistant chunk with info glyph and flush:true (captured in nodeOutput, surfaces before node blocks)', () => {
    const { ui, chunks } = mk();
    ui.notify('Remote session. Open: http://host:8080/', 'info');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      type: 'assistant',
      content: '\n[pi extension ℹ️] Remote session. Open: http://host:8080/\n',
      flush: true,
    });
  });

  test('notify defaults to info when type omitted', () => {
    const { ui, chunks } = mk();
    ui.notify('bare message');
    expect(chunks[0]?.content).toBe('\n[pi extension ℹ️] bare message\n');
  });

  test('notify("warning") and notify("error") use distinct glyphs', () => {
    const { ui, chunks } = mk();
    ui.notify('soft', 'warning');
    ui.notify('hard', 'error');
    expect(chunks[0]?.content).toBe('\n[pi extension ⚠️] soft\n');
    expect(chunks[1]?.content).toBe('\n[pi extension ❌] hard\n');
  });

  test('select resolves to undefined (no operator to answer)', async () => {
    const { ui } = mk();
    await expect(ui.select('pick', ['a', 'b'])).resolves.toBeUndefined();
  });

  test('confirm resolves to false', async () => {
    const { ui } = mk();
    await expect(ui.confirm('are you sure?', 'really')).resolves.toBe(false);
  });

  test('input and editor resolve to undefined', async () => {
    const { ui } = mk();
    await expect(ui.input('title')).resolves.toBeUndefined();
    await expect(ui.editor('title', 'prefill')).resolves.toBeUndefined();
  });

  test('custom resolves to undefined-cast', async () => {
    const { ui } = mk();
    const res = await ui.custom(() => ({}) as never);
    expect(res).toBeUndefined();
  });

  test('getEditorText returns empty string', () => {
    const { ui } = mk();
    expect(ui.getEditorText()).toBe('');
  });

  test('getToolsExpanded returns false', () => {
    const { ui } = mk();
    expect(ui.getToolsExpanded()).toBe(false);
  });

  test('getAllThemes returns empty list and getTheme returns undefined', () => {
    const { ui } = mk();
    expect(ui.getAllThemes()).toEqual([]);
    expect(ui.getTheme('anything')).toBeUndefined();
  });

  test('setTheme returns failure result without throwing', () => {
    const { ui } = mk();
    const result = ui.setTheme('dark');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  /**
   * This test previously asserted that the theme proxy THROWS, matching /Archon's remote UI stub/.
   * It has never passed. Both this file and ui-context-stub.ts arrived in the same snapshot commit
   * (c251fef) already disagreeing, and the package's old &&-chained test script never named this
   * file, so nothing ever ran it.
   *
   * The implementation is the correct side. ui-context-stub.ts:37-40 states the contract and its
   * reason: theme returns identity decorators, because the styled strings are handed to no-op
   * setStatus/setWidget sinks anyway, so stripping styling is safe — and throwing here would crash
   * extensions like plannotator mid-tool-call. The message the old test looked for belongs to a
   * different method entirely (setTheme, line 151), which is covered above.
   *
   * Rewritten to assert the real contract, because it is load-bearing: a regression to throwing
   * would take down any extension that styles a string.
   */
  test('theme decorators are identity functions and never throw', () => {
    const { ui } = mk();
    const theme = ui.theme;

    // fg(color, text) and bg(color, text) — the decorated text is the LAST string argument.
    expect(theme.fg('accent', 'text')).toBe('text');
    expect(theme.bg('accent', 'text')).toBe('text');

    // Single-argument decorators return their input unchanged.
    expect(theme.bold('loud')).toBe('loud');
    expect(theme.strikethrough('gone')).toBe('gone');

    // An unknown decorator must not throw either — the proxy answers every property.
    expect(() =>
      (theme as unknown as Record<string, (s: string) => string>).notAThing!('x')
    ).not.toThrow();
  });

  test('theme exposes colour-mode metadata without styling', () => {
    const { ui } = mk();
    const theme = ui.theme;
    expect(theme.getColorMode()).toBe('truecolor');
    expect(theme.getFgAnsi()).toBe('');
    expect(theme.getBgAnsi()).toBe('');
    // Identifying fields are deliberately absent — there is no real theme behind this stub.
    expect(theme.name).toBeUndefined();
  });

  test('onTerminalInput returns a disposer that is safe to call', () => {
    const { ui } = mk();
    const dispose = ui.onTerminalInput(() => undefined);
    expect(() => dispose()).not.toThrow();
  });

  test('TUI setters (setStatus/setWidget/setFooter/setHeader/setTitle) are no-ops', () => {
    const { ui, chunks } = mk();
    expect(() => ui.setStatus('k', 'v')).not.toThrow();
    expect(() => ui.setWidget('k', ['line'])).not.toThrow();
    expect(() => ui.setFooter(undefined)).not.toThrow();
    expect(() => ui.setHeader(undefined)).not.toThrow();
    expect(() => ui.setTitle('title')).not.toThrow();
    expect(() => ui.setWorkingMessage('working')).not.toThrow();
    expect(() => ui.setHiddenThinkingLabel('label')).not.toThrow();
    expect(() => ui.pasteToEditor('text')).not.toThrow();
    expect(() => ui.setEditorText('text')).not.toThrow();
    expect(() => ui.setEditorComponent(undefined)).not.toThrow();
    expect(() => ui.setToolsExpanded(true)).not.toThrow();
    expect(chunks).toEqual([]);
  });
});
