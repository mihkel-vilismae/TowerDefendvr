import { checkedOr } from '../../ui/safeDom';
import type { Entity } from '../../sim/entities';
import type { GameSimulation } from '../../sim/game';

export type UiBindingsDeps = {
  // Buttons
  startBtn: HTMLButtonElement;
  restartBtn: HTMLButtonElement;
  freezeEnemiesBtn: HTMLButtonElement;
  stopAttacksBtn: HTMLButtonElement;
  enterBuildingBtn: HTMLButtonElement;

  // Selects
  vehicleSel: HTMLSelectElement;

  // Toggles / sliders (optional in HUD)
  bloomToggle: HTMLInputElement | null;
  slowmoToggle: HTMLInputElement | null;
  enemyHeliToggle: HTMLInputElement | null;
  mouseAimChk: HTMLInputElement | null;
  mouseAimStatus: HTMLElement | null;
  startHpSlider: HTMLInputElement | null;
  startHpLabel: HTMLElement | null;

  // Runtime deps
  rendererDomElement: HTMLElement;
  setBloom(enabled: boolean): void;

  // Callbacks / state access
  onResetWorld(): void;
  getSim(): GameSimulation | null;
  getPlayer(): Entity | null;
  getVehicleChoice(): string;
  tryEnterBuildingRoof(): void;
  setEnemyHelicoptersEnabled(enabled: boolean): void;
};

export type UiBindings = {
  getTimeScale(): number;
  isMouseAimEnabled(): boolean;
  syncMouseAimUi(): void;
  dispose(): void;
};


export function wireUiBindings(deps: UiBindingsDeps): UiBindings {
  let timeScale = 1;

  const disposers: Array<() => void> = [];

  const onChange = (el: HTMLElement | null, listener: () => void) => {
    if (!el) return;
    el.addEventListener('change', listener);
    disposers.push(() => el.removeEventListener('change', listener));
  };

  // ---- Postprocessing toggles ----
  if (deps.bloomToggle) {
    deps.setBloom(checkedOr(deps.bloomToggle, true));
    onChange(deps.bloomToggle, () => deps.setBloom(checkedOr(deps.bloomToggle!, true)));
  } else {
    // Preserve previous default if toggle missing
    deps.setBloom(true);
  }

  // ---- Slowmo ----
  const syncTimeScale = () => {
    timeScale = deps.slowmoToggle && checkedOr(deps.slowmoToggle, false) ? 0.35 : 1;
  };
  syncTimeScale();
  if (deps.slowmoToggle) {
    onChange(deps.slowmoToggle, syncTimeScale);
  }

  // ---- Mouse aim ----
  const syncMouseAimUi = () => {
    if (!deps.mouseAimStatus) return;
    deps.mouseAimStatus.textContent = deps.mouseAimChk && checkedOr(deps.mouseAimChk, false)
      ? 'Mouse aiming: ON'
      : 'Mouse aiming: OFF';
  };
  syncMouseAimUi();
  if (deps.mouseAimChk) {
    onChange(deps.mouseAimChk, () => {
      syncMouseAimUi();
      // If disabled while pointer-locked, exit pointer lock.
      if (!checkedOr(deps.mouseAimChk!, false) && document.pointerLockElement === deps.rendererDomElement) {
        document.exitPointerLock().catch(() => {});
      }
    });
  }

  // ---- Start HP slider ----
  if (deps.startHpSlider && deps.startHpLabel) {
    const sync = () => {
      deps.startHpLabel!.textContent = String(deps.startHpSlider!.value);
    };
    sync();
    const handler = () => sync();
    deps.startHpSlider.addEventListener('input', handler);
    disposers.push(() => deps.startHpSlider!.removeEventListener('input', handler));
  }

  // ---- Main buttons ----
  const onReset = () => deps.onResetWorld();
  deps.startBtn.addEventListener('click', onReset);
  deps.restartBtn.addEventListener('click', onReset);
  disposers.push(() => deps.startBtn.removeEventListener('click', onReset));
  disposers.push(() => deps.restartBtn.removeEventListener('click', onReset));

  // Freeze enemies movement
  const onFreeze = () => {
    const sim = deps.getSim();
    if (!sim) return;
    sim.freezeEnemiesMovement = !sim.freezeEnemiesMovement;
    deps.freezeEnemiesBtn.textContent = sim.freezeEnemiesMovement ? 'Unfreeze' : 'Freeze';
  };
  deps.freezeEnemiesBtn.addEventListener('click', onFreeze);
  disposers.push(() => deps.freezeEnemiesBtn.removeEventListener('click', onFreeze));

  // Stop enemy attacks
  const onStopAttacks = () => {
    const sim = deps.getSim();
    if (!sim) return;
    sim.disableEnemyAttacks = !sim.disableEnemyAttacks;
    deps.stopAttacksBtn.textContent = sim.disableEnemyAttacks ? 'Attack ON' : 'No-Attack';
  };
  deps.stopAttacksBtn.addEventListener('click', onStopAttacks);
  disposers.push(() => deps.stopAttacksBtn.removeEventListener('click', onStopAttacks));

  // Enter building (human only)
  const onEnterBuilding = () => {
    const player = deps.getPlayer();
    if (!player) return;
    if (deps.getVehicleChoice() !== 'human') return;
    deps.tryEnterBuildingRoof();
  };
  deps.enterBuildingBtn.addEventListener('click', onEnterBuilding);
  disposers.push(() => deps.enterBuildingBtn.removeEventListener('click', onEnterBuilding));

  // Enemy helicopter toggle
  if (deps.enemyHeliToggle) {
    onChange(deps.enemyHeliToggle, () => {
      const sim = deps.getSim();
      if (!sim) return;
      deps.setEnemyHelicoptersEnabled(checkedOr(deps.enemyHeliToggle!, true));
    });
  }

  return {
    getTimeScale: () => timeScale,
    isMouseAimEnabled: () => (deps.mouseAimChk ? checkedOr(deps.mouseAimChk, false) : false),
    syncMouseAimUi,
    dispose: () => disposers.forEach((d) => d()),
  };
}
