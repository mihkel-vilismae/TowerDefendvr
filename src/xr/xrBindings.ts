import * as THREE from 'three';

/**
 * Centralized XR controller button bindings.
 *
 * Keeps main.ts smaller by isolating the wiring between XR controller events
 * and gameplay actions.
 */
export interface XrBindingsDeps {
  c1: THREE.Group;
  c2: THREE.Group;
  isHumanMode: () => boolean;
  firePrimary: () => void;
  fireBazooka: () => void;
  dropMine: () => void;
}

export function hookXRButtons(deps: XrBindingsDeps): void {
  const onSelect = () => deps.firePrimary();
  const onSqueeze = () => {
    // Human uses squeeze as bazooka; vehicles use squeeze as mine drop.
    if (deps.isHumanMode()) deps.fireBazooka();
    else deps.dropMine();
  };
  deps.c1.addEventListener('selectstart', onSelect);
  deps.c1.addEventListener('squeezestart', onSqueeze);
  deps.c2.addEventListener('selectstart', onSelect);
  deps.c2.addEventListener('squeezestart', onSqueeze);
}
