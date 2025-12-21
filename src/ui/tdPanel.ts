// UI helper for the tower defence RTS/FPS mode. This module defines a
// placeholder for a build menu and tech tree panel. It attaches simple
// buttons to the existing panel and wires callbacks when the user chooses
// to build a unit or research a tech. Real UI integration for VR and
// desktop should be developed further.

import { TechTree, Tech } from '../sim/techTree';
import { FriendlyType } from '../sim/friendly';

export interface BuildCallback {
  (type: FriendlyType): void;
}
export interface ResearchCallback {
  (techId: string): void;
}

/**
 * Initialize the tower defence panel. Creates simple buttons under the
 * existing panel (#panel) for building units and researching tech. When
 * clicked, each button invokes the corresponding callback. This stub is
 * intentionally minimal; in a full implementation, this would create a
 * separate floating panel with dynamic state and VR support.
 */
export function initTdPanel(techTree: TechTree, onBuild: BuildCallback, onResearch: ResearchCallback): void {
  const panel = document.getElementById('panel');
  if (!panel) return;
  // Container for TD controls
  let container = document.getElementById('tdPanel');
  if (!container) {
    container = document.createElement('div');
    container.id = 'tdPanel';
    container.style.marginTop = '12px';
    container.style.padding = '8px';
    container.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    panel.appendChild(container);
  }
  // Clear previous content
  container.innerHTML = '';
  const heading = document.createElement('h2');
  heading.style.fontSize = '13px';
  heading.style.margin = '0 0 6px 0';
  heading.textContent = 'TD Build & Research';
  container.appendChild(heading);
  const buildRow = document.createElement('div');
  buildRow.style.display = 'flex';
  buildRow.style.gap = '6px';
  buildRow.style.flexWrap = 'wrap';
  // Build buttons
  const unitTypes: { type: FriendlyType; label: string; }[] = [
    { type: 'auto', label: 'Auto Turret' },
    { type: 'sniper', label: 'Sniper Turret' },
    { type: 'emp', label: 'EMP Node' },
    { type: 'trooper', label: 'Trooper Squad' },
  ];
  for (const u of unitTypes) {
    const btn = document.createElement('button');
    btn.textContent = u.label;
    btn.style.margin = '2px';
    btn.onclick = () => onBuild(u.type);
    buildRow.appendChild(btn);
  }
  container.appendChild(buildRow);
  const techRow = document.createElement('div');
  techRow.style.display = 'flex';
  techRow.style.gap = '6px';
  techRow.style.flexWrap = 'wrap';
  // Research buttons for each tech; disable those that cannot be unlocked
  for (const tech of techTree.getAllTechs()) {
    const btn = document.createElement('button');
    btn.textContent = tech.name;
    btn.style.margin = '2px';
    const updateBtn = () => {
      btn.disabled = !techTree.canUnlock(tech.id);
    };
    updateBtn();
    btn.onclick = () => {
      if (techTree.unlock(tech.id)) {
        updateBtn();
        onResearch(tech.id);
      }
    };
    techRow.appendChild(btn);
  }
  container.appendChild(techRow);
}