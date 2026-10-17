import * as THREE from "three";
import { W, D, PARTITION_X } from "../scene/layout.js";

// AI can also drive this animation by passing the distance moved each frame.
export function createWalkingAnimation(npc) {
    const leftLeg = npc.getObjectByName("left-leg");
    const rightLeg = npc.getObjectByName("right-leg");
    const leftArm = npc.getObjectByName("left-arm");
    const rightArm = npc.getObjectByName("right-arm");
    let phase = 0;
    let strength = 0;

    function reset() {
        phase = 0;
        strength = 0;
        for (const limb of [leftLeg, rightLeg, leftArm, rightArm]) limb.rotation.x = 0;
    }

    function update(dt, distance) {
        const moving = distance > 0.0001;
        phase += distance * Math.PI * 2 / 2.2;
        strength = THREE.MathUtils.damp(strength, moving ? 1 : 0, 12, dt);
        if (!moving && strength < 0.001) {
            reset();
            return;
        }

        const swing = Math.sin(phase) * 0.55 * strength;
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
        leftArm.rotation.x = -swing * 0.7;
        rightArm.rotation.x = swing * 0.7;
    }

    return { update, reset };
}

export function createNPCController({ npcs, collides, isPlaying, getShelf, getCounter, player, items, say = () => {} }) {
    const animations = new Map();
    const moveSpeed = 3;
    const radius = 1.05;
    let route = [];
    let facingTarget;
    let state = "idle";
    let carriedItem;
    let counterPosition;
    let replanTime = 0;

    function clearSegment(from, to) {
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.1));
        for (let i = 1; i <= steps; i++) {
            const x = from.x + (to.x - from.x) * i / steps;
            const z = from.z + (to.z - from.z) * i / steps;
            if (x < PARTITION_X + radius + 0.25 || x > W - radius ||
                Math.abs(z) > D - radius || collides(x, z, radius)) return false;
        }
        return true;
    }

    function shelfApproach(shelf) {
        const bounds = new THREE.Box3().setFromObject(shelf);
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(shelf.quaternion);
        const center = bounds.getCenter(new THREE.Vector3());
        const halfDepth = Math.abs(front.x) * (bounds.max.x - bounds.min.x) / 2 +
            Math.abs(front.z) * (bounds.max.z - bounds.min.z) / 2;
        return { target: center.clone().addScaledVector(front, halfDepth + radius + 0.25), center };
    }

    function findRoute(target, stopDistance = 0.5) {
        const npc = npcs[0];
        route = [];
        if (!npc) return false;

        // Search only the customer room, including when the staff doorway is open.
        const start = { x: npc.position.x, z: npc.position.z, parent: null };
        const queue = [start];
        const visited = new Set(["0,0"]);
        for (let index = 0; index < queue.length; index++) {
            const node = queue[index];
            const nearby = Math.hypot(node.x - target.x, node.z - target.z) <= stopDistance;
            if (nearby && (stopDistance > 0.5 ? canTalk(node, target) : clearSegment(node, target))) {
                if (stopDistance <= 0.5) route.push(target);
                for (let step = node; step.parent; step = step.parent) route.push(step);
                route.reverse();
                return true;
            }
            for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
                const next = { x: node.x + dx, z: node.z + dz, parent: node };
                const key = `${Math.round((next.x - start.x) * 2)},${Math.round((next.z - start.z) * 2)}`;
                if (visited.has(key)) continue;
                visited.add(key);
                if (clearSegment(node, next)) queue.push(next);
            }
        }
        return false;
    }

    function canTalk(from, to) {
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.1));
        for (let i = 1; i <= steps; i++) {
            if (collides(from.x + (to.x - from.x) * i / steps,
                from.z + (to.z - from.z) * i / steps, 0.1)) return false;
        }
        return true;
    }

    function moveToShelf() {
        if (state !== "idle") return;
        const shelf = getShelf?.();
        if (!shelf || !getCounter?.()) return;
        const { target, center } = shelfApproach(shelf);
        if (findRoute(target)) {
            facingTarget = center;
            state = "shelf";
        }
    }

    function checkShelf() {
        const item = items.findShelfItem(getShelf(), 2);
        if (item) {
            const counter = getCounter();
            // The room-facing counter spans local X and is on local +Z.
            const target = counter.localToWorld(new THREE.Vector3(0, 0, 2 + radius + 0.25));
            if (!findRoute(target)) return;
            if (items.takeForNPC(item, npcs[0])) {
                carriedItem = item;
                counterPosition = counter.localToWorld(new THREE.Vector3(0, 0, 1));
                counterPosition.y = new THREE.Box3().setFromObject(counter).max.y;
                facingTarget = counter.position;
                state = "counter";
                return;
            }
        }
        route = [];
        state = "player";
        replanTime = 0;
    }

    function reset() {
        for (const animation of animations.values()) animation.reset();
    }

    function onKeyDown(event) {
        if (!isPlaying() || event.code !== "Space") return;
        event.preventDefault();
        if (!event.repeat) moveToShelf();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", reset);

    function update(dt) {
        if (!isPlaying()) {
            reset();
            return;
        }
        const npc = npcs[0];
        if (!npc) return;
        if (!animations.has(npc)) animations.set(npc, createWalkingAnimation(npc));

        if (state === "player") {
            facingTarget = player;
            if (Math.hypot(npc.position.x - player.x, npc.position.z - player.z) <= 2.5 && canTalk(npc.position, player)) {
                route = [];
                state = "idle";
                say(npc, "fuck");
            } else {
                replanTime -= dt;
                if (replanTime <= 0) {
                    findRoute(player, 2.2);
                    replanTime = 0.75;
                }
            }
        }

        let dx = 0;
        let dz = 0;
        if (route.length) {
            const next = route[0];
            const remaining = Math.hypot(next.x - npc.position.x, next.z - npc.position.z);
            const step = Math.min(moveSpeed * dt, remaining);
            dx = remaining ? (next.x - npc.position.x) / remaining * step : 0;
            dz = remaining ? (next.z - npc.position.z) / remaining * step : 0;
            if (remaining > 0.0001) npc.rotation.y = Math.atan2(dx, dz);
            if (step >= remaining) route.shift();
        }
        const startX = npc.position.x;
        const startZ = npc.position.z;

        // Slide along obstacles using the same collision system as the player.
        if (!collides(startX + dx, startZ, radius)) npc.position.x += dx;
        if (!collides(npc.position.x, startZ + dz, radius)) npc.position.z += dz;

        const moved = Math.hypot(npc.position.x - startX, npc.position.z - startZ);
        animations.get(npc).update(dt, moved);
        if (!route.length && facingTarget) {
            npc.rotation.y = Math.atan2(facingTarget.x - npc.position.x, facingTarget.z - npc.position.z);
            facingTarget = undefined;
            if (state === "shelf") checkShelf();
            else if (state === "counter") {
                items.placeFromNPC(carriedItem, counterPosition);
                carriedItem = undefined;
                state = "idle";
            }
        }
    }

    function dispose() {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("blur", reset);
        reset();
        animations.clear();
    }

    return { update, reset, dispose };
}
