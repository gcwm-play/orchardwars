import * as THREE from 'three';
import type { CollisionGrid } from './collision.ts';

// The player on foot: a chunky low-poly figure that walks or sprints, moving relative
// to the screen like a top-down classic, and slides along building walls.

export class Player {
  readonly object = new THREE.Group();
  readonly position = this.object.position;
  speed = 6; // m/s walking
  sprint = 13; // m/s sprinting
  radius = 0.6;
  private facing = 0;
  private bob = 0;
  private readonly body: THREE.Group;

  constructor(x: number, z: number) {
    this.body = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0x22232b, roughness: 0.6 });
    const neon = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xc6e03a, emissiveIntensity: 2.2 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.8 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4).translate(0, 0.45, 0), jacket);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.5).translate(0, 1.32, 0), jacket);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.52).translate(0, 1.5, 0), neon);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 2.0, 0), skin);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.2).translate(0, 2.05, 0.2), neon);
    for (const m of [legs, torso, head]) m.castShadow = true;
    this.body.add(legs, torso, stripe, head, visor);
    this.body.scale.setScalar(1.25);
    this.object.add(this.body);

    // A glowing ring on the ground so the player is easy to spot from far out.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.4, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xc6e03a, transparent: true, opacity: 0.85 }),
    );
    ring.position.y = 0.3;
    this.object.add(ring);
    this.position.set(x, 0, z);
  }

  /**
   * @param move screen-space input (x right, y down)
   * @param heading camera yaw, so "up" on screen is away from the camera
   */
  update(dt: number, move: { x: number; y: number }, running: boolean, heading: number, grid: CollisionGrid) {
    const amount = Math.hypot(move.x, move.y);
    if (amount < 0.05) {
      this.bob = 0;
      this.body.position.y = 0;
      return;
    }
    // Rotate screen input into world directions.
    const sin = Math.sin(heading), cos = Math.cos(heading);
    const fx = -sin, fz = -cos; // screen up
    const rx = cos, rz = -sin; // screen right
    const dx = rx * move.x - fx * move.y;
    const dz = rz * move.x - fz * move.y;
    const step = (running ? this.sprint : this.speed) * Math.min(1, amount) * dt;
    const nx = this.position.x + dx * step;
    const nz = this.position.z + dz * step;
    // Move each axis on its own so the player slides along walls.
    if (!grid.hits(nx, this.position.z, this.radius)) this.position.x = nx;
    if (!grid.hits(this.position.x, nz, this.radius)) this.position.z = nz;

    const target = Math.atan2(dx, dz);
    let diff = target - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * Math.min(1, dt * 14);
    this.body.rotation.y = this.facing;
    this.bob += dt * (running ? 16 : 10);
    this.body.position.y = Math.abs(Math.sin(this.bob)) * 0.15;
  }
}
