import * as THREE from "three";

export function createCollisionSystem() {
    // Collision footprints and surfaces used by item raycasts.
    const colliders = [];
    const surfaces = [];
    // Footprints only the player can't pass, like the front doorway
    const barriers = [];

    function addSolid(object, boxes = [new THREE.Box3().setFromObject(object)]) {
        colliders.push(...boxes);
        surfaces.push(object);
    }

    // For colliders that come and go, like doors
    function setSolid(box, solid) {
        const index = colliders.indexOf(box);
        if (solid && index === -1) colliders.push(box);
        else if (!solid && index !== -1) colliders.splice(index, 1);
    }

    function addBarrier(box) {
        barriers.push(box);
    }

    function collides(x, z, radius = 0.6, { player = false } = {}) {
        const overlaps = (box) =>
            x + radius > box.min.x &&
            x - radius < box.max.x &&
            z + radius > box.min.z &&
            z - radius < box.max.z;
        return colliders.some(overlaps) || (player && barriers.some(overlaps));
    }

    return { colliders, surfaces, addSolid, setSolid, addBarrier, collides };
}
