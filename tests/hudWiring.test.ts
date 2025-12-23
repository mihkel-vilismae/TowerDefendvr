import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { createHud } from '../src/ui/createHud';

describe('HUD wiring contract', () => {
  beforeEach(() => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div id="app"></div>
      <div id="hud"></div>
      <div id="panel"></div>

      <button id="startBtn"></button>
      <button id="btnRestart"></button>
      <button id="btnFreezeEnemies"></button>
      <button id="btnStopAttacks"></button>
      <button id="btnEnterBuilding"></button>

      <select id="districtSel"></select>
      <select id="vehicleSel"></select>
      <select id="modeSel"></select>
      <select id="lapsSel"></select>

      <canvas id="minimap"></canvas>
      <div id="vrHelp"></div>
    </body></html>`);
    // @ts-expect-error test-only global override
    globalThis.document = dom.window.document;
  });

  it('returns non-null refs for required elements and allows optional controls to be missing', () => {
    const hud = createHud();
    expect(hud.app.id).toBe('app');
    expect(hud.hud.id).toBe('hud');
    expect(hud.panel.id).toBe('panel');
    expect(hud.startBtn.id).toBe('startBtn');
    expect(hud.restartBtn.id).toBe('btnRestart');
    expect(hud.minimap.id).toBe('minimap');
    expect(hud.vrHelp.id).toBe('vrHelp');

    // Optional controls are allowed to be absent.
    expect(hud.slowmoToggle).toBe(null);
    expect(hud.enemyHeliToggle).toBe(null);
    expect(hud.startHpLabel).toBe(null);
  });

  it('throws a clear error when a required element is missing', () => {
    // Remove a required element.
    const el = document.querySelector('#minimap');
    el?.remove();
    expect(() => createHud()).toThrow(/Missing required element/i);
  });
});
