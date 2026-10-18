import * as THREE from "three";

export function createItemSystem({ scene, camera, player, surfaces, getExtraTargets, onDrop, onMopUse, onUse }) {
    const REACH = 6;
    const DROP_DISTANCE = 1.5;
    // Where held items sit relative to the camera. The mop is held head down, leaning away
    const HOLD = {
        default: { position: new THREE.Vector3(1, -1.2, -2.5), rotation: new THREE.Euler() },
        mop: { position: new THREE.Vector3(0.9, -3.6, -3.5), rotation: new THREE.Euler(0.7, 0, 0) },
    };
    const items = [];

    function materialsOf(mesh) {
        return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    }

    // `onTaken` runs the first time the item is picked up, e.g. to put a new one in its place
    function addItem(object, kind, onTaken = null) {
        object.userData.isItem = true;
        object.userData.kind = kind;
        object.userData.onTaken = onTaken;
        items.push(object);
        return object;
    }

    function removeItem(item) {
        items.splice(items.indexOf(item), 1);
    }

    const raycaster = new THREE.Raycaster();
    const SCREEN_CENTER = new THREE.Vector2(0, 0);
    const DOWN = new THREE.Vector3(0, -1, 0);

    let held = null;
    let target = null;

    function itemOf(object) {
        while (object && !object.userData.isItem) object = object.parent;
        return object;
    }

    function firstHit(origin, direction, far) {
        raycaster.set(origin, direction);
        raycaster.far = far;
        const targets = [...surfaces, ...items.filter((item) => item !== held && !item.userData.carrier)];
        targets.push(...getExtraTargets());
        return raycaster.intersectObjects(targets, true)[0];
    }

    function lookHit() {
        raycaster.setFromCamera(SCREEN_CENTER, camera);
        return firstHit(raycaster.ray.origin, raycaster.ray.direction, REACH);
    }

    function setHighlight(item, on) {
        item.traverse((child) => {
            if (!child.isMesh) return;
            for (const material of materialsOf(child)) material.emissive.setHex(on ? 0x555555 : 0x000000);
        });
    }

    function updateTarget() {
        const hit = held ? null : lookHit();
        const item = hit ? itemOf(hit.object) : null;
        if (item === target) return;

        if (target) setHighlight(target, false);
        if (item) setHighlight(item, true);
        target = item;
    }

    function pickUp(item) {
        setHighlight(item, false);
        target = null;

        item.userData.onTaken?.();
        item.userData.onTaken = null;

        const hold = HOLD[item.userData.kind] ?? HOLD.default;
        camera.add(item);
        item.position.copy(hold.position);
        item.rotation.copy(hold.rotation);
        held = item;
    }

    // Where the held item ends up (a hit with the point and the object it lands on): on the surface
    // being looked at if it faces up, otherwise it falls straight down from just in front of what's
    // being looked at (e.g. onto the board in front of a shelf's back panel), or from a little in
    // front of the player when looking at nothing in reach
    function landing() {
        const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
        let above;

        const hit = lookHit();
        if (hit) {
            // The face's own normal, since the interpolated one is tilted on bevelled edges
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
            if (normal.y > 0.7) return hit;
            above = hit.point.clone().addScaledVector(forward, -0.6);
        } else {
            const eye = camera.getWorldPosition(new THREE.Vector3());
            const blocker = firstHit(eye, forward, DROP_DISTANCE + 0.6);
            const distance = blocker ? Math.max(blocker.distance - 0.6, 0) : DROP_DISTANCE;
            above = eye.addScaledVector(forward, distance);
        }

        return firstHit(above, DOWN, Infinity) ?? { point: new THREE.Vector3(above.x, 0, above.z) };
    }

    function drop() {
        const aimed = lookHit();
        const { point } = landing();
        const item = held;
        held = null;

        scene.add(item);
        item.position.copy(point);
        item.rotation.set(0, player.yaw, 0);

        onDrop(item, aimed);
    }

    function interact() {
        if (held?.userData.kind === "mop") {
            const hit = lookHit();
            if (onMopUse(held, hit)) return;
        }

        // Clicking something that isn't picked up, like a customer's box on the counter
        if (!held && onUse(lookHit())) return;

        if (held) drop();
        else if (target) pickUp(target);
    }

    // A box with the given label standing on the shelf, that nobody has claimed
    function findShelfItem(shelf, label) {
        shelf.updateWorldMatrix(true, false);
        const { x: width, y: height, z: depth } = shelf.userData.size;
        return items.find((item) => {
            if (item === held || item.userData.carrier || item.userData.forSale) return false;
            if (item.userData.label !== label || !item.visible) return false;
            const local = shelf.worldToLocal(item.getWorldPosition(new THREE.Vector3()));
            return Math.abs(local.x) <= width / 2 && Math.abs(local.z) <= depth / 2 &&
                local.y >= 0 && local.y <= height;
        });
    }

    function takeForNPC(item, npc) {
        if (!items.includes(item) || item === held || item.userData.carrier) return false;
        setHighlight(item, false);
        if (target === item) target = null;
        item.userData.onTaken?.();
        item.userData.onTaken = null;
        item.userData.carrier = npc;
        npc.add(item);
        item.position.set(0, 2, 1.1);
        item.rotation.set(0, 0, 0);
        return true;
    }

    function placeFromNPC(item, position) {
        scene.add(item);
        item.position.copy(position);
        item.rotation.set(0, 0, 0);
        delete item.userData.carrier;
    }

    return { addItem, removeItem, firstHit, interact, update: updateTarget, findShelfItem, takeForNPC, placeFromNPC };
}
