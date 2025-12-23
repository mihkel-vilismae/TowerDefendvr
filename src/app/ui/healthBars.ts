import * as THREE from 'three';
import type { Entity, Enemy } from '../../sim/entities';

export type HealthBarsDeps = {
  healthLayer: HTMLElement;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  getVisual: (e: Entity) => THREE.Object3D | undefined;
  getEntityBaseY: (e: Entity) => number;
};

export type HealthBarsManager = {
  removeAll(): void;
  remove(ent: Entity): void;
  update(enemies: Enemy[] | null): void;
};

export function createHealthBarsManager(deps: HealthBarsDeps): HealthBarsManager {
  const { healthLayer, camera, renderer, getVisual, getEntityBaseY } = deps;

  const healthBars = new Map<Entity, HTMLDivElement>();

  function ensureHealthBar(ent: Entity): HTMLDivElement {
    let el = healthBars.get(ent);
    if (el) return el;
    el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.width = '64px';
    el.style.height = '6px';
    el.style.borderRadius = '999px';
    el.style.background = 'rgba(255,255,255,0.14)';
    el.style.border = '1px solid rgba(255,255,255,0.14)';
    el.style.boxShadow = '0 6px 14px rgba(0,0,0,0.35)';
    const fill = document.createElement('div');
    fill.style.height = '100%';
    fill.style.width = '100%';
    fill.style.borderRadius = '999px';
    fill.style.background = 'rgba(120,255,160,0.85)';
    fill.dataset['role'] = 'fill';
    el.appendChild(fill);
    healthLayer.appendChild(el);
    healthBars.set(ent, el);
    return el;
  }

  function removeHealthBar(ent: Entity): void {
    const el = healthBars.get(ent);
    if (!el) return;
    el.remove();
    healthBars.delete(ent);
  }

  function worldToScreen(pos: THREE.Vector3): { x: number; y: number; onScreen: boolean } {
    const v = pos.clone().project(camera);
    const onScreen = v.z >= -1 && v.z <= 1;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    return { x, y, onScreen };
  }

  function list<K, V>(m: Map<K, V>): [K, V][] { return Array.from(m.entries()); }

  function updateHealthBars(enemies: Enemy[] | null): void {
    if (!enemies) {
      for (const [e] of healthBars) removeHealthBar(e);
      return;
    }

    const ents = enemies.filter(e => e.alive);
    const alive = new Set<Entity>();
    for (const e of ents) {
      const r = e.maxHP > 0 ? (e.hp / e.maxHP) : 0;

      // Hide health bars for enemies that have not been hurt yet (full HP).
      // This keeps the screen clean until combat starts.
      if (r >= 0.999) {
        removeHealthBar(e);
        continue;
      }

      alive.add(e);
      const bar = ensureHealthBar(e);
      const fill = bar.querySelector('[data-role="fill"]') as HTMLDivElement | null;
      if (fill) {
        fill.style.width = `${Math.max(0, Math.min(1, r)) * 100}%`;
        // color shift: green -> yellow -> red
        if (r > 0.55) fill.style.background = 'rgba(120,255,160,0.85)';
        else if (r > 0.25) fill.style.background = 'rgba(255,210,120,0.88)';
        else fill.style.background = 'rgba(255,120,120,0.9)';
      }

      const mesh = getVisual(e);
      if (!mesh) continue;
      const yOff = getEntityBaseY(e) + (e.hovering ? 2.15 : 1.25);
      const p3 = new THREE.Vector3(e.car.position.x, yOff, e.car.position.y);
      const { x, y, onScreen } = worldToScreen(p3);
      const visible = onScreen && !renderer.xr.isPresenting;
      bar.style.display = visible ? 'block' : 'none';
      if (visible) {
        bar.style.transform = `translate(${Math.round(x - 32)}px, ${Math.round(y)}px)`;
      }
    }

    // cleanup
    for (const [e] of list(healthBars)) {
      if (!alive.has(e)) removeHealthBar(e);
    }
  }

  return {
    removeAll: () => updateHealthBars(null),
    remove: (ent) => removeHealthBar(ent),
    update: (enemies) => updateHealthBars(enemies),
  };
}
