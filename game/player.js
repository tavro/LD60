import * as THREE from "three";

export function createPlayer(camera, { collides }) {
    const EYE_HEIGHT = 4.2;
    const PLAYER_RADIUS = 0.6;
    const MOVE_SPEED = 8;
    const MOUSE_SENSITIVITY = 0.002;
    const MAX_PITCH = 1.4;
    const player = { x: 10, z: 10, yaw: 0, pitch: 0 };
    const keys = new Set();

    const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD"];

    function look(dx, dy) {
        player.yaw -= dx * MOUSE_SENSITIVITY;
        player.pitch -= dy * MOUSE_SENSITIVITY;
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
        if (!collides(player.x + dx, player.z, PLAYER_RADIUS)) player.x += dx;
        if (!collides(player.x, player.z + dz, PLAYER_RADIUS)) player.z += dz;

        camera.position.set(player.x, EYE_HEIGHT, player.z);
        camera.rotation.y = player.yaw;
        camera.rotation.x = player.pitch;
    }

    return { state: player, keys, moveKeys: MOVE_KEYS, look, update: updatePlayer };
}
