import { requireEl } from './safeDom';

function el<T extends HTMLElement>(sel: string): T | null {
  return document.querySelector(sel) as T | null;
}

export type HudRefs = {
  app: HTMLElement;
  hud: HTMLElement;
  panel: HTMLElement;
  healthLayer: HTMLDivElement;

  startBtn: HTMLButtonElement;
  restartBtn: HTMLButtonElement;
  freezeEnemiesBtn: HTMLButtonElement;
  stopAttacksBtn: HTMLButtonElement;
  enterBuildingBtn: HTMLButtonElement;
  districtSel: HTMLSelectElement;
  vehicleSel: HTMLSelectElement;
  bloomToggle: HTMLInputElement | null;
  slowmoToggle: HTMLInputElement | null;
  enemyHeliToggle: HTMLInputElement | null;
  mouseAimChk: HTMLInputElement | null;
  mouseAimStatus: HTMLElement | null;
  modeSel: HTMLSelectElement;
  lapsSel: HTMLSelectElement;
  startHpSlider: HTMLInputElement | null;
  startHpLabel: HTMLSpanElement | null;

  minimap: HTMLCanvasElement;
  vrHelp: HTMLDivElement;
};

export function createHud(): HudRefs {
  const app = requireEl<HTMLElement>('#app');
  const hud = requireEl<HTMLElement>('#hud');
  const panel = requireEl<HTMLElement>('#panel');

  // Screen-space health bars for vehicles.
  const healthLayer = document.createElement('div');
  healthLayer.style.position = 'absolute';
  healthLayer.style.left = '0';
  healthLayer.style.top = '0';
  healthLayer.style.width = '100%';
  healthLayer.style.height = '100%';
  healthLayer.style.pointerEvents = 'none';
  healthLayer.style.zIndex = '8';
  app.appendChild(healthLayer);

  // UI elements
  const startBtn = requireEl<HTMLButtonElement>('#startBtn');
  const restartBtn = requireEl<HTMLButtonElement>('#btnRestart');
  const freezeEnemiesBtn = requireEl<HTMLButtonElement>('#btnFreezeEnemies');
  const stopAttacksBtn = requireEl<HTMLButtonElement>('#btnStopAttacks');
  const enterBuildingBtn = requireEl<HTMLButtonElement>('#btnEnterBuilding');
  const districtSel = requireEl<HTMLSelectElement>('#districtSel');
  const vehicleSel = requireEl<HTMLSelectElement>('#vehicleSel');
  const bloomToggle = el<HTMLInputElement>('#bloomToggle');
  const slowmoToggle = el<HTMLInputElement>('#slowmoToggle');
  const enemyHeliToggle = el<HTMLInputElement>('#enemyHeliToggle');
  const mouseAimChk = el<HTMLInputElement>('#mouseAimChk');
  const mouseAimStatus = el<HTMLElement>('#mouseAimStatus');
  const modeSel = requireEl<HTMLSelectElement>('#modeSel');
  const lapsSel = requireEl<HTMLSelectElement>('#lapsSel');
  const startHpSlider = el<HTMLInputElement>('#startHp');
  const startHpLabel = el<HTMLSpanElement>('#startHpLabel');

  // minimap is required for non-VR UX; fail early with a clear error if missing.
  const minimap = requireEl<HTMLCanvasElement>('#minimap');
  const vrHelp = requireEl<HTMLDivElement>('#vrHelp');

  return {
    app,
    hud,
    panel,
    healthLayer,
    startBtn,
    restartBtn,
    freezeEnemiesBtn,
    stopAttacksBtn,
    enterBuildingBtn,
    districtSel,
    vehicleSel,
    bloomToggle,
    slowmoToggle,
    enemyHeliToggle,
    mouseAimChk,
    mouseAimStatus,
    modeSel,
    lapsSel,
    startHpSlider,
    startHpLabel,
    minimap,
    vrHelp,
  };
}
