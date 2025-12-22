import { TechTree, defaultTechs } from '../sim/techTree';

export type MainMenuMode = 'td_rts_fps' | 'arena';

export interface MainMenuOptions {
  /** Start the game in the chosen mode. */
  onStart: (mode: MainMenuMode) => void;
  /** Returns the current live tech tree, or null if not in TD. */
  getTechTree: () => TechTree | null;
}

export interface MainMenu {
  show(): void;
  hide(): void;
}

/**
 * Create the start-gate main menu overlay.
 * Kept as a small DOM module to keep main.ts focused on orchestration.
 */
export function createMainMenu(opts: MainMenuOptions): MainMenu {
  let overlay: HTMLDivElement | null = null;

  function mkBtn(label: string) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.padding = '12px 14px';
    b.style.borderRadius = '10px';
    b.style.border = '1px solid rgba(255,255,255,0.12)';
    b.style.background = 'rgba(255,255,255,0.06)';
    b.style.color = '#fff';
    b.style.fontSize = '16px';
    b.style.cursor = 'pointer';
    b.onmouseenter = () => (b.style.background = 'rgba(255,255,255,0.10)');
    b.onmouseleave = () => (b.style.background = 'rgba(255,255,255,0.06)');
    return b;
  }

  function showTechTreeModal() {
    const existing = document.getElementById('techTreeModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'techTreeModal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.zIndex = '10000';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.background = 'rgba(0,0,0,0.6)';

    const panel = document.createElement('div');
    panel.style.width = 'min(780px, 94vw)';
    panel.style.maxHeight = 'min(80vh, 720px)';
    panel.style.overflow = 'auto';
    panel.style.padding = '18px';
    panel.style.borderRadius = '14px';
    panel.style.background = 'rgba(18, 22, 30, 0.96)';
    panel.style.border = '1px solid rgba(255,255,255,0.10)';
    panel.style.color = '#fff';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    head.style.marginBottom = '12px';
    const h = document.createElement('div');
    h.textContent = 'Tech Tree (Preview)';
    h.style.fontWeight = '700';
    h.style.fontSize = '18px';
    const close = mkBtn('Close');
    close.style.padding = '8px 10px';
    close.style.fontSize = '14px';
    close.onclick = () => modal.remove();
    head.appendChild(h);
    head.appendChild(close);

    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gridTemplateColumns = '1fr';
    list.style.gap = '8px';

    // Use live tech tree when available, otherwise show default definitions.
    const tmpTree = opts.getTechTree() ?? new TechTree(defaultTechs);
    for (const t of tmpTree.getAllTechs()) {
      const row = document.createElement('div');
      row.style.padding = '10px 12px';
      row.style.borderRadius = '10px';
      row.style.border = '1px solid rgba(255,255,255,0.08)';
      row.style.background = 'rgba(255,255,255,0.04)';

      const name = document.createElement('div');
      name.textContent = `${t.name}  (cost: ${t.cost})`;
      name.style.fontWeight = '600';

      const prereq = document.createElement('div');
      prereq.style.opacity = '0.75';
      prereq.style.fontSize = '12px';
      prereq.textContent = t.prereqs.length ? `Requires: ${t.prereqs.join(', ')}` : 'Requires: —';

      row.appendChild(name);
      row.appendChild(prereq);
      list.appendChild(row);
    }

    panel.appendChild(head);
    panel.appendChild(list);
    modal.appendChild(panel);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
  }

  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'mainMenuOverlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(10, 12, 16, 0.92)';
    overlay.style.backdropFilter = 'blur(6px)';

    const card = document.createElement('div');
    card.style.width = 'min(560px, 92vw)';
    card.style.padding = '22px';
    card.style.borderRadius = '14px';
    card.style.background = 'rgba(18, 22, 30, 0.92)';
    card.style.border = '1px solid rgba(255,255,255,0.08)';
    card.style.boxShadow = '0 18px 60px rgba(0,0,0,0.45)';
    card.style.color = '#fff';
    card.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    const title = document.createElement('div');
    title.textContent = 'Death Rally';
    title.style.fontSize = '28px';
    title.style.fontWeight = '700';
    title.style.letterSpacing = '0.4px';
    title.style.marginBottom = '8px';

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Choose a mode to start';
    subtitle.style.opacity = '0.8';
    subtitle.style.marginBottom = '18px';

    const btnRow = document.createElement('div');
    btnRow.style.display = 'grid';
    btnRow.style.gridTemplateColumns = '1fr';
    btnRow.style.gap = '10px';

    const startTd = mkBtn('Start Tower Defence');
    const startDefault = mkBtn('Start Default Mode');
    const showTech = mkBtn('Show Tech Tree');

    startTd.onclick = () => opts.onStart('td_rts_fps');
    startDefault.onclick = () => opts.onStart('arena');
    showTech.onclick = () => showTechTreeModal();

    btnRow.appendChild(startTd);
    btnRow.appendChild(startDefault);
    btnRow.appendChild(showTech);

    const footer = document.createElement('div');
    footer.style.marginTop = '14px';
    footer.style.opacity = '0.65';
    footer.style.fontSize = '12px';
    footer.textContent = 'Tip: You can still use the in-game panel after starting.';

    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(btnRow);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    return overlay;
  }

  return {
    show() {
      const o = ensure();
      o.style.display = 'flex';
    },
    hide() {
      const o = ensure();
      o.style.display = 'none';
    },
  };
}
