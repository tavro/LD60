import * as THREE from "three";

export function createItemSystem({
    scene, camera, player, surfaces, slots, physics, getExtraTargets, onDrop, onMopUse, onUse, onGive,
}) {
    const REACH = 6;
    const DROP_DISTANCE = 1.5;
    // Items this close to the crosshair (in radians) count as aimed at, so they're easier to grab
    const AIM_ANGLE = 0.15;
    // Boxes put down within this distance of a free shelf spot snap into it, facing out
    const SNAP_DISTANCE = 1.5;
    // Up to this much random turn (in radians) on boxes put in a shelf, so rows don't look too neat
    const SLOT_TWIST = 0.2;
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
    let heldSize = new THREE.Vector3();

    // Outline showing where the held item will land
    const ghostGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const ghost = new THREE.Mesh(
        ghostGeometry,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, depthWrite: false }),
    );
    ghost.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(ghostGeometry),
        new THREE.LineBasicMaterial({ color: 0xffffff }),
    ));
    ghost.name = "drop-ghost";
    ghost.visible = false;
    scene.add(ghost);

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

    // The item under the crosshair, or failing that the one closest to it that isn't behind
    // whatever the crosshair is on
    function aimedItem() {
        const hit = lookHit();
        const direct = hit ? itemOf(hit.object) : null;
        if (direct) return direct;

        const { origin, direction } = raycaster.ray;
        const reach = Math.min(hit ? hit.distance + 1 : REACH, REACH);
        let best = null;
        let bestAngle = AIM_ANGLE;
        for (const item of items) {
            if (item.userData.carrier || !item.visible) continue;
            const toItem = new THREE.Box3().setFromObject(item).getCenter(new THREE.Vector3()).sub(origin);
            if (toItem.length() > reach) continue;
            const angle = toItem.angleTo(direction);
            if (angle < bestAngle) {
                best = item;
                bestAngle = angle;
            }
        }
        return best;
    }

    function updateTarget() {
        const item = held ? null : aimedItem();
        if (item === target) return;

        if (target) setHighlight(target, false);
        if (item) setHighlight(item, true);
        target = item;
    }

    function pickUp(item) {
        physics.release(item);
        setHighlight(item, false);
        target = null;

        item.userData.onTaken?.();
        item.userData.onTaken = null;

        // Measured unrotated, for the landing outline
        item.rotation.set(0, 0, 0);
        item.updateMatrixWorld(true);
        heldSize = new THREE.Box3().setFromObject(item).getSize(new THREE.Vector3());

        const hold = HOLD[item.userData.kind] ?? HOLD.default;
        camera.add(item);
        item.position.copy(hold.position);
        item.rotation.copy(hold.rotation);
        held = item;
    }

    // The free shelf spot nearest the point, for a held box
    function snapToSlot(point) {
        if (held.userData.kind !== "box") return null;
        const taken = items
            .filter((item) => item !== held && !item.userData.carrier)
            .map((item) => item.getWorldPosition(new THREE.Vector3()));

        let best = null;
        let bestDistance = SNAP_DISTANCE;
        for (const slot of slots) {
            const distance = slot.position.distanceTo(point);
            if (distance >= bestDistance) continue;
            if (taken.some((position) => position.distanceTo(slot.position) < 0.5)) continue;
            best = slot;
            bestDistance = distance;
        }
        return best && { point: best.position.clone(), rotation: best.rotation, slot: best };
    }

    // Where the held item ends up, as the point and optionally its rotation: in a shelf spot near
    // what's being looked at for boxes, on the surface being looked at if it faces up, otherwise it
    // falls straight down from just in front of what's being looked at (e.g. onto the board in front
    // of a shelf's back panel), or from a little in front of the player when looking at nothing in
    // reach
    // How the held item gets put down: thrown when aimed at the floor or at nothing, put gently on
    // top of loose items so they pile up, and placed exactly anywhere else
    function dropStyle(hit) {
        if (!hit || hit.object.userData.isFloor) return "throw";
        const item = itemOf(hit.object);
        return item && physics.isLoose(item) ? "pile" : "place";
    }

    function landing() {
        const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
        let above;

        const hit = lookHit();
        const snapped = hit && dropStyle(hit) === "place" && snapToSlot(hit.point);
        if (snapped) return snapped;
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
        const style = dropStyle(aimed);
        // Worked out while still holding the item, since where it lands depends on what it is
        const landed = style === "throw" ? null : landing();
        const item = held;
        held = null;

        if (style === "throw") {
            const direction = camera.getWorldDirection(new THREE.Vector3());
            const from = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, 1);
            from.y -= 0.5;
            scene.add(item);
            item.rotation.set(0, player.yaw, 0);
            physics.throwItem(item, from, direction);
            onDrop(item, aimed);
            return;
        }

        const { point, rotation = player.yaw, slot } = landed;
        scene.add(item);
        item.position.copy(point);
        const twist = slot ? (Math.random() * 2 - 1) * SLOT_TWIST : 0;
        item.rotation.set(0, rotation + twist, 0);
        // Anything ending up on the floor or a pile is loose, so it can topple and be knocked over
        if (style === "pile" || point.y < 0.05) physics.addLoose(item);

        onDrop(item, aimed);
    }

    function interact() {
        if (held?.userData.kind === "mop") {
            const hit = lookHit();
            if (onMopUse(held, hit)) return;
        }

        // Handing the held item to someone, like a print to the customer who ordered it. They
        // can also refuse it, which keeps it in hand
        const given = held && onGive(held);
        if (given === "given") {
            held.removeFromParent();
            removeItem(held);
            held = null;
        }
        if (given) return;

        // Clicking something that isn't picked up, like a customer's box on the counter
        if (!held && onUse(target ? { object: target } : lookHit())) return;

        if (held) drop();
        else if (target) pickUp(target);
    }

    function isOnShelf(item, shelf) {
        shelf.updateWorldMatrix(true, false);
        const { x: width, y: height, z: depth } = shelf.userData.size;
        const local = shelf.worldToLocal(item.getWorldPosition(new THREE.Vector3()));
        return Math.abs(local.x) <= width / 2 && Math.abs(local.z) <= depth / 2 &&
            local.y >= 0 && local.y <= height;
    }

    // A box with the given label (or any box, for null) standing on the shelf, that nobody has
    // claimed
    function findShelfItem(shelf, label) {
        return items.find((item) => {
            if (item === held || item.userData.carrier || item.userData.forSale) return false;
            if (item.userData.kind !== "box" || !item.visible) return false;
            if (label !== null && item.userData.label !== label) return false;
            return isOnShelf(item, shelf);
        });
    }

    function takeForNPC(item, npc) {
        if (!items.includes(item) || item === held || item.userData.carrier) return false;
        physics.release(item);
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

    function updateGhost() {
        ghost.visible = held !== null && held.userData.kind !== "mop" && dropStyle(lookHit()) !== "throw";
        if (!ghost.visible) return;
        const { point, rotation = player.yaw } = landing();
        ghost.position.copy(point);
        ghost.rotation.set(0, rotation, 0);
        ghost.scale.copy(heldSize);
    }

    function update() {
        updateTarget();
        updateGhost();
    }

    return {
        addItem, removeItem, firstHit, interact, update, findShelfItem, isOnShelf, takeForNPC, placeFromNPC,
        list: () => items,
        heldKind: () => held?.userData.kind ?? null,
    };
}
