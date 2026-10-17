import * as THREE from "three";

export function createCollisionSystem() {
    // Collision footprints and surfaces used by item raycasts.
    const colliders = [];
    const surfaces = [];

    function addSolid(object, boxes = [new THREE.Box3().setFromObject(object)]) {
        colliders.push(...boxes);
        surfaces.push(object);
    }

    function collides(x, z, radius = 0.6) {
        return colliders.some(
            (box) =>
                x + radius > box.min.x &&
                x - radius < box.max.x &&
                z + radius > box.min.z &&
                z - radius < box.max.z,
        );
    }

    return { colliders, surfaces, addSolid, collides };
}
