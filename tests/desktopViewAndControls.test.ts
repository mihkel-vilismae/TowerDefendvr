import { describe, it, expect } from 'vitest';

import { Car } from '../src/game/car';
import { computeDesktopCamera, cycleDesktopCameraMode } from '../src/render/cameraMath';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('desktop view modes', () => {
  it('cycles camera modes top -> chase -> rear -> top', () => {
    expect(cycleDesktopCameraMode('top')).toBe('chase');
    expect(cycleDesktopCameraMode('chase')).toBe('rear');
    expect(cycleDesktopCameraMode('rear')).toBe('top');
  });

  it('rear mode places camera behind the car heading', () => {
    const heading = 0; // facing +X
    const { position, target } = computeDesktopCamera(10, 20, heading, 'rear', 80);
    // Behind when heading=0 means camera x should be < player x.
    expect(position.x).toBeLessThan(10);
    // Rear mode looks slightly ahead
    expect(target.x).toBeGreaterThan(10);
  });

  it('chase mode places camera behind but higher than rear mode', () => {
    const heading = Math.PI / 2; // facing +Z
    const chase = computeDesktopCamera(0, 0, heading, 'chase', 80);
    const rear = computeDesktopCamera(0, 0, heading, 'rear', 80);
    expect(chase.position.y).toBeGreaterThan(rear.position.y);
    // Behind when heading=+Z means z should be < player z.
    expect(chase.position.z).toBeLessThan(0);
  });
});

describe('WASD driving semantics', () => {
  it('S reverses from standstill (brake produces negative forward velocity)', () => {
    const c = new Car();
    c.heading = 0; // +X forward
    c.update(0.1, { accelerate: false, brake: true, left: false, right: false });
    expect(c.velocity.x).toBeLessThan(0);
  });

  it('main.ts maps W forward, S reverse, A left, D right', () => {
    const mainPath = path.resolve(__dirname, '../src/main.ts');
    const txt = fs.readFileSync(mainPath, 'utf8');
    expect(txt).toMatch(/KeyW.*accelerate|accelerate.*KeyW/s);
    expect(txt).toMatch(/KeyS.*brake|brake.*KeyS/s);
    expect(txt).toMatch(/KeyA.*left|left.*KeyA/s);
    expect(txt).toMatch(/KeyD.*right|right.*KeyD/s);
  });
});
