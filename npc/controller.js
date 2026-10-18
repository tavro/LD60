import * as THREE from "three";
import { W, D, PARTITION_X, FRONT_DOOR } from "../scene/layout.js";
import { STOCK } from "../game/stock.js";
import { createNPC } from "./npc.js";

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

// Customers come in through the front door, each wanting one item. They take a box of it from a
// shop shelf whose sign matches, queue at the counter and put it down for the player to ring up by
// clicking it. If it's out of stock or the wait gets too long they walk out instead
const MOVE_SPEED = 3;
const RADIUS = 1.05;
const MAX_CUSTOMERS = 3;
const FIRST_CUSTOMER = 8;
// Seconds between customers at the start, and once RAMP_TIME seconds have been played
const SPAWN_INTERVAL = [25, 10];
const RAMP_TIME = 300;
// How long a customer waits for an empty shelf to be restocked, and in the queue until they're served
const STOCK_PATIENCE = 25;
const QUEUE_PATIENCE = 50;
const HURRY_AT = 10;
const QUEUE_SPACING = 2.2;
const SHIRTS = [0x447abb, 0xbb4444, 0x44aa66, 0xaa66bb, 0xd08a2a, 0x555555];

const OUTSIDE = new THREE.Vector3(FRONT_DOOR.x, 0, D + 6);
const INSIDE = new THREE.Vector3(FRONT_DOOR.x, 0, D - 2.5);

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

export function createCustomerController({ scene, collides, items, register, speech, shelvesLoaded, counterLoaded }) {
    const { say } = speech;
    const customers = [];
    // Customers holding their item, in line for the counter; the first one is being served
    const queue = [];
    let shelves = [];
    let counter = null;
    let played = 0;
    let spawnIn = FIRST_CUSTOMER;
    let spawned = 0;

    Promise.all([shelvesLoaded, counterLoaded]).then(([loadedShelves, loadedCounter]) => {
        shelves = loadedShelves;
        counter = loadedCounter;
    });

    // Customers stay on the shop floor, out of the storage room
    function clearSegment(from, to) {
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.1));
        for (let i = 1; i <= steps; i++) {
            const x = from.x + (to.x - from.x) * i / steps;
            const z = from.z + (to.z - from.z) * i / steps;
            if (x < PARTITION_X + RADIUS + 0.25 || x > W - RADIUS ||
                Math.abs(z) > D - RADIUS || collides(x, z, RADIUS)) return false;
        }
        return true;
    }

    // Breadth-first search over a half-unit grid; null when the target can't be reached
    function findRoute(from, target) {
        const start = { x: from.x, z: from.z, parent: null };
        const queue = [start];
        const visited = new Set(["0,0"]);
        for (let index = 0; index < queue.length; index++) {
            const node = queue[index];
            if (Math.hypot(node.x - target.x, node.z - target.z) <= 0.5 && clearSegment(node, target)) {
                const route = [target];
                for (let step = node; step.parent; step = step.parent) route.push(step);
                return route.reverse();
            }
            for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
                const next = { x: node.x + dx, z: node.z + dz, parent: node };
                const key = `${Math.round((next.x - start.x) * 2)},${Math.round((next.z - start.z) * 2)}`;
                if (visited.has(key)) continue;
                visited.add(key);
                if (clearSegment(node, next)) queue.push(next);
            }
        }
        return null;
    }

    // Walks there, sliding along whatever's in the way if there's no route, then calls `arrive`
    function go(customer, target, facing = null) {
        customer.route = findRoute(customer.npc.position, target) ?? [target];
        customer.facing = facing;
        customer.moving = true;
    }

    function shelfApproach(shelf) {
        const bounds = new THREE.Box3().setFromObject(shelf);
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(shelf.quaternion);
        const center = bounds.getCenter(new THREE.Vector3());
        const halfDepth = Math.abs(front.x) * (bounds.max.x - bounds.min.x) / 2 +
            Math.abs(front.z) * (bounds.max.z - bounds.min.z) / 2;
        return { target: center.clone().addScaledVector(front, halfDepth + RADIUS + 0.25), center };
    }

    // In front of the counter, with the line growing away from it
    function queueSpot(index) {
        return counter.localToWorld(new THREE.Vector3(0, 0, 2 + RADIUS + 0.25 + index * QUEUE_SPACING));
    }

    function matchingShelves(customer) {
        return shelves.filter((shelf) => shelf.userData.stock === customer.wanted.label);
    }

    function stockedShelf(customer) {
        return matchingShelves(customer).find((shelf) => items.findShelfItem(shelf, customer.wanted.label));
    }

    function spawn() {
        const npc = createNPC({ id: `customer-${++spawned}`, shirtColor: pick(SHIRTS) });
        npc.position.copy(OUTSIDE);
        scene.add(npc);
        customers.push({
            npc,
            walk: createWalkingAnimation(npc),
            wanted: pick(STOCK),
            state: "entering",
            route: [INSIDE.clone()],
            moving: true,
            facing: null,
            shelf: null,
            item: null,
            patience: 0,
            recheck: 0,
            hurried: false,
        });
    }

    function goToShelf(customer, shelf = stockedShelf(customer) ?? pick(matchingShelves(customer))) {
        const { target, center } = shelfApproach(shelf);
        customer.shelf = shelf;
        customer.state = "shelf";
        go(customer, target, center);
    }

    function takeFromShelf(customer) {
        const item = items.findShelfItem(customer.shelf, customer.wanted.label);
        if (item && items.takeForNPC(item, customer.npc)) {
            customer.item = item;
            joinQueue(customer);
            return;
        }

        const elsewhere = stockedShelf(customer);
        if (elsewhere) {
            goToShelf(customer, elsewhere);
        } else if (customer.state !== "waiting") {
            customer.state = "waiting";
            customer.patience = STOCK_PATIENCE;
            customer.hurried = false;
            say(customer.npc, `Out of ${customer.wanted.label}?`);
        }
    }

    function joinQueue(customer) {
        queue.push(customer);
        customer.state = "queue";
        customer.patience = QUEUE_PATIENCE;
        customer.hurried = false;
        moveUp(customer);
    }

    function moveUp(customer) {
        customer.spot = queue.indexOf(customer);
        go(customer, queueSpot(customer.spot), counter.position);
    }

    // Puts the item down on the counter, facing the player behind it
    function putOnCounter(customer) {
        const position = counter.localToWorld(new THREE.Vector3(0, 0, 1));
        position.y = new THREE.Box3().setFromObject(counter).max.y;
        items.placeFromNPC(customer.item, position);
        customer.item.rotation.y = counter.rotation.y + Math.PI;
        customer.item.userData.forSale = customer;
        customer.state = "paying";
        say(customer.npc, `$${customer.wanted.price}`);
    }

    function leave(customer) {
        if (customer.item) {
            // A box still being carried is dropped on the spot, one on the counter stays there
            if (customer.state !== "paying") {
                const { x, z } = customer.npc.position;
                items.placeFromNPC(customer.item, new THREE.Vector3(x, 0, z));
            }
            delete customer.item.userData.forSale;
            customer.item = null;
        }

        const index = queue.indexOf(customer);
        if (index !== -1) {
            queue.splice(index, 1);
            for (const waiting of queue.slice(index)) {
                if (waiting.state === "queue") moveUp(waiting);
            }
        }

        customer.state = "leaving";
        customer.route = [...(findRoute(customer.npc.position, INSIDE) ?? [INSIDE.clone()]), OUTSIDE.clone()];
        customer.moving = true;
        customer.facing = null;
    }

    function walkOut(customer, line) {
        say(customer.npc, line);
        register.walkout();
        leave(customer);
    }

    function arrive(customer) {
        if (customer.state === "entering") {
            say(customer.npc, `${customer.wanted.label}, please!`);
            goToShelf(customer);
        } else if (customer.state === "shelf") {
            takeFromShelf(customer);
        } else if (customer.state === "queue" && customer.spot === 0) {
            putOnCounter(customer);
        } else if (customer.state === "leaving") {
            speech.clear(customer.npc);
            customer.npc.removeFromParent();
            customers.splice(customers.indexOf(customer), 1);
        }
    }

    // Called with what the player clicked; rings up a customer's item on the counter
    function trySell(hit) {
        let item = hit?.object;
        while (item && !item.userData.forSale) item = item.parent;
        if (!item) return false;

        const customer = item.userData.forSale;
        items.removeItem(item);
        item.removeFromParent();
        customer.item = null;
        register.sell(customer.wanted.price);
        say(customer.npc, "Thanks!");
        leave(customer);
        return true;
    }

    function updatePatience(customer, dt) {
        customer.patience -= dt;
        if (customer.state === "waiting") {
            customer.recheck -= dt;
            if (customer.recheck <= 0) {
                customer.recheck = 1;
                const stocked = stockedShelf(customer);
                if (stocked === customer.shelf) takeFromShelf(customer);
                else if (stocked) goToShelf(customer, stocked);
            }
        }
        if (customer.state !== "waiting" && customer.state !== "queue" && customer.state !== "paying") return;

        if (customer.patience <= 0) {
            walkOut(customer, customer.state === "waiting" ? "Forget it!" : "I'm leaving!");
        } else if (customer.patience <= HURRY_AT && !customer.hurried) {
            customer.hurried = true;
            say(customer.npc, customer.state === "waiting" ? "Any more coming?" : "Hurry up!");
        }
    }

    function updateCustomer(customer, dt) {
        const { npc } = customer;
        updatePatience(customer, dt);

        let dx = 0;
        let dz = 0;
        if (customer.route.length) {
            const next = customer.route[0];
            const remaining = Math.hypot(next.x - npc.position.x, next.z - npc.position.z);
            const step = Math.min(MOVE_SPEED * dt, remaining);
            dx = remaining ? (next.x - npc.position.x) / remaining * step : 0;
            dz = remaining ? (next.z - npc.position.z) / remaining * step : 0;
            if (remaining > 0.0001) npc.rotation.y = Math.atan2(dx, dz);
            if (step >= remaining) customer.route.shift();
        }
        const startX = npc.position.x;
        const startZ = npc.position.z;

        // Slide along obstacles using the same collision system as the player
        if (!collides(startX + dx, startZ, RADIUS)) npc.position.x += dx;
        if (!collides(npc.position.x, startZ + dz, RADIUS)) npc.position.z += dz;

        customer.walk.update(dt, Math.hypot(npc.position.x - startX, npc.position.z - startZ));

        if (!customer.route.length && customer.moving) {
            customer.moving = false;
            if (customer.facing) {
                npc.rotation.y = Math.atan2(customer.facing.x - npc.position.x, customer.facing.z - npc.position.z);
            }
            arrive(customer);
        }
    }

    function update(dt) {
        if (!counter) return;

        played += dt;
        spawnIn -= dt;
        if (spawnIn <= 0) {
            if (customers.length < MAX_CUSTOMERS) spawn();
            const ramp = Math.min(played / RAMP_TIME, 1);
            spawnIn = THREE.MathUtils.lerp(...SPAWN_INTERVAL, ramp);
        }

        for (const customer of [...customers]) updateCustomer(customer, dt);
    }

    function reset() {
        for (const customer of customers) customer.walk.reset();
    }

    return { update, reset, trySell, positions: () => customers.map((customer) => customer.npc.position) };
}
