import type { GameSimulation } from '../../sim/game';
import type { Entity } from '../../sim/entities';

export type Point2 = { x: number; y: number };

export type DrawMinimapArgs = {
  minimap: HTMLCanvasElement;
  sim: GameSimulation | null;
  player: Entity | null;
  targeting: { getTarget(): Entity | null } | null;
  gameMode: string;
  raceLoopPts: Point2[];
  raceFinishA: Point2;
  raceFinishB: Point2;
};

export function drawMinimap(args: DrawMinimapArgs): void {
  const { minimap, sim, player, targeting, gameMode, raceLoopPts, raceFinishA, raceFinishB } = args;

  // `minimap` is required (validated at startup via requireEl).
  const ctx = minimap.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, minimap.width, minimap.height);
  if (!sim || !player) {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#e6eaf5';
    ctx.font = '14px system-ui';
    ctx.fillText('Press Start', 56, 104);
    ctx.globalAlpha = 1;
    return;
  }
  const w = minimap.width;
  const h = minimap.height;
  const cx = w * 0.5;
  const cy = h * 0.5;
  // world extent (match arena size roughly)
  const worldHalf = 55;
  const s = (Math.min(w, h) * 0.42) / worldHalf;

  const toPx = (x: number, y: number) => ({
    x: cx + x * s,
    y: cy + y * s,
  });

  // border
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.44, 0, Math.PI * 2);
  ctx.stroke();

  // Race overlay (centerline + finish)
  if (gameMode === 'race') {
    ctx.strokeStyle = 'rgba(77,243,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const p0 = toPx(raceLoopPts[0].x, raceLoopPts[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < raceLoopPts.length; i++) {
      const p = toPx(raceLoopPts[i].x, raceLoopPts[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();

    // finish line
    ctx.strokeStyle = 'rgba(156,244,255,0.8)';
    ctx.lineWidth = 3;
    const fa = toPx(raceFinishA.x, raceFinishA.y);
    const fb = toPx(raceFinishB.x, raceFinishB.y);
    ctx.beginPath();
    ctx.moveTo(fa.x, fa.y);
    ctx.lineTo(fb.x, fb.y);
    ctx.stroke();
  }

  // pickups
  ctx.fillStyle = 'rgba(77,243,255,0.85)';
  for (const p of sim.pickups) {
    const pt = toPx(p.position.x, p.position.y);
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }

  // onlookers
  ctx.fillStyle = 'rgba(185,193,217,0.65)';
  for (const o of sim.onlookers) {
    if (!o.alive) continue;
    const pt = toPx(o.car.position.x, o.car.position.y);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // enemies
  ctx.fillStyle = 'rgba(255,124,255,0.95)';
  for (const e of sim.enemies) {
    if (!e.alive) continue;
    const pt = toPx(e.car.position.x, e.car.position.y);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // player
  ctx.fillStyle = 'rgba(77,243,255,1)';
  const pp = toPx(player.car.position.x, player.car.position.y);
  ctx.beginPath();
  ctx.arc(pp.x, pp.y, 5.5, 0, Math.PI * 2);
  ctx.fill();

  // target reticle
  const tgt = targeting?.getTarget();
  if (tgt && (tgt as any).alive) {
    const tp = toPx((tgt as any).car.position.x, (tgt as any).car.position.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
}
