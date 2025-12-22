import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ShockwavePool } from '../src/render/shockwaves';

describe('ShockwavePool', () => {
  it('spawns and expires shockwaves', () => {
    const root = new THREE.Group();
    const pool = new ShockwavePool(root);
    expect(root.children.length).toBe(1); // group container
    pool.spawn(new THREE.Vector3(0, 0, 0), 0xffffff, 1);
    // Group should now contain one shock mesh
    const container = root.children[0] as THREE.Group;
    expect(container.children.length).toBe(1);
    for (let i = 0; i < 60; i++) pool.update(1 / 60);
    // By now it should have expired
    expect(container.children.length).toBe(0);
  });
});
