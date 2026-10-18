import * as THREE from "three";
import { settings } from "../settings.js";

export function createPlayer(camera, { collides, bump }) {
    const EYE_HEIGHT = 4.2;
    const PLAYER_RADIUS = 0.6;
    const MOVE_SPEED = 8;
    const MOUSE_SENSITIVITY = 0.002;
    const MAX_PITCH = 1.4;
    // Head bob while walking: how high it bobs, how far apart steps are, and how quickly it settles
    // when standing still
    const BOB_HEIGHT = 0.08;
    const STRIDE = 2.6;
    const BOB_SETTLE = 10;
    // Starts behind the counter, facing the shop. `bob` is the step's sway, -1 to 1 side to side
    // and 0 to 1 up and down, scaled by how much they're walking, for the held item to follow
    const player = { x: 16.25, z: 8.25, yaw: Math.PI / 2, pitch: 0, bob: { x: 0, y: 0 } };
    let stepPhase = 0;
    let walking = 0;
    const keys = new Set();

    const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD"];

    function look(dx, dy) {
        const sensitivity = MOUSE_SENSITIVITY * settings.mouseSensitivity;
        player.yaw -= dx * sensitivity;
        player.pitch -= dy * sensitivity;
        player.pitch = THREE.MathUtils.clamp(player.pitch, -MAX_PITCH, MAX_PITCH);
    }

    function updatePlayer(dt) {
        const move = new THREE.Vector2();
        if (keys.has("KeyW")) move.y += 1;
        if (keys.has("KeyS")) move.y -= 1;
        if (keys.has("KeyD")) move.x += 1;
        if (keys.has("KeyA")) move.x -= 1;
        move.normalize().multiplyScalar(MOVE_SPEED * dt);

        const sin = Math.sin(player.yaw);
        const cos = Math.cos(player.yaw);
        const dx = -sin * move.y + cos * move.x;
        const dz = -cos * move.y - sin * move.x;

        // Resolve each axis separately so the player slides along walls instead of sticking
        // Blocked by walls and furniture, and by customers
        const blocked = (x, z) => collides(x, z, PLAYER_RADIUS, { player: true }) ||
            bump(player, { x, z }, PLAYER_RADIUS, (body) => body.player) !== null;
        const startX = player.x;
        const startZ = player.z;
        if (!blocked(player.x + dx, player.z)) player.x += dx;
        if (!blocked(player.x, player.z + dz)) player.z += dz;

        // Two bobs per stride, one per foot, swaying from side to side over the stride
        const moved = Math.hypot(player.x - startX, player.z - startZ);
        stepPhase += (moved / STRIDE) * Math.PI * 2;
        walking = THREE.MathUtils.damp(walking, moved > 0.0001 ? 1 : 0, BOB_SETTLE, dt);
        player.bob.x = Math.sin(stepPhase) * walking;
        player.bob.y = Math.abs(Math.sin(stepPhase)) * walking;

        camera.position.set(player.x, EYE_HEIGHT + player.bob.y * BOB_HEIGHT, player.z);
        camera.rotation.y = player.yaw;
        camera.rotation.x = player.pitch;
    }

    return { state: player, radius: PLAYER_RADIUS, keys, moveKeys: MOVE_KEYS, look, update: updatePlayer };
}
