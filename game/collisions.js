import * as THREE from "three";

export function createCollisionSystem() {
    // Collision footprints and surfaces used by item raycasts.
    const colliders = [];
    const surfaces = [];
    // Footprints only the player can't pass, like the front doorway
    const barriers = [];
    // Moving bodies as circles ({ x, z, radius }), like customers; set once they exist
    let bodies = () => [];

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

    // The body a step from `from` to `to` would push into: one it would overlap and get closer to.
    // Moving away from an overlap is always allowed, so nothing gets stuck inside something else
    function bump(from, to, radius, ignore = () => false) {
        return bodies().find((body) => {
            if (ignore(body)) return false;
            const after = Math.hypot(to.x - body.x, to.z - body.z);
            return after < radius + body.radius && after < Math.hypot(from.x - body.x, from.z - body.z);
        }) ?? null;
    }

    function setBodies(list) {
        bodies = list;
    }

    return { colliders, barriers, surfaces, addSolid, setSolid, addBarrier, collides, bump, setBodies };
}
