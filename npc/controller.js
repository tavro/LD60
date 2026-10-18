import * as THREE from "three";
import { W, D, PARTITION_X, FRONT_DOOR } from "../scene/layout.js";
import { STOCK } from "../game/stock.js";
import { randomBetween } from "../game/utils.js";
import { BELT_START } from "../game/belt.js";
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

// Customers come in through the front door and shop for one or more items: they take boxes from
// shop shelves whose signs match, line up at the start of the belt on the counter and put them down
// there, then wait by the cashier, who scans each box as it reaches the end of the belt. They pay
// once everything's scanned. Some want a print instead, which the player hands over, and some are
// shoplifters who head for the door with a box hidden. If something's out of stock or the wait
// gets too long they walk out. Messes in the shop make everyone lose patience faster
const MOVE_SPEED = 3;
const RADIUS = 1.05;
const REACH = 6;
// How long a customer waits for an empty shelf to be restocked, and in line until they're served
const STOCK_PATIENCE = 25;
const QUEUE_PATIENCE = 50;
const HURRY_AT = 10;
const QUEUE_SPACING = 2.2;
// Patience drains this much faster per mess in the shop, up to MAX_GRUMPINESS times as fast
const GRUMPINESS_PER_MESS = 0.1;
const MAX_GRUMPINESS = 2;
const MESSY = 3;
// What being overcharged or accused of stealing costs a customer in patience
const OVERCHARGE_PENALTY = 15;
const ACCUSE_PENALTY = 10;
const PRINT_PRICE = 10;
// Customers keep this far apart from each other and the player, and step aside at these angles (in
// radians) when someone's in the way. Two customers stuck on each other for SQUEEZE_AFTER seconds
// squeeze past for SQUEEZE_TIME, so a jam never lasts; the player has to step aside themselves
const BODY_RADIUS = 0.8;
const SIDESTEPS = [0, 0.6, -0.6, 1.2, -1.2];
const SQUEEZE_AFTER = 1.5;
const SQUEEZE_TIME = 1;
const EXCUSE_EVERY = 4;
const CATCH_REWARD = 3;
const SHIRTS = [0x447abb, 0xbb4444, 0x44aa66, 0xaa66bb, 0xd08a2a, 0x555555];

// Kinds of customer. `speed`, `patience` and `pays` scale the defaults; `weight` is how often they
// come compared to the others, from `fromDay` on
const TYPES = {
    regular: { weight: 6, speed: 1, patience: 1, pays: 1, items: 1, knock: 0.08, spill: 0.1 },
    business: {
        weight: 2, shirt: 0x2b2f3a, speed: 1.25, patience: 0.55, pays: 1.5, items: 1, knock: 0.05, spill: 0.05,
        greeting: (wants) => `${wants}. Quickly.`,
    },
    grandma: {
        weight: 2, shirt: 0xb58fc9, speed: 0.5, patience: 1.6, pays: 1, items: 1, knock: 0.05, spill: 0.1,
        greeting: (wants) => `Any ${wants}, dear?`,
    },
    kid: {
        weight: 2, shirt: 0xf2c94c, scale: 0.65, speed: 1.15, patience: 0.8, pays: 1, items: 1, knock: 0.5, spill: 0.3,
        wanders: 2, greeting: (wants) => `${wants}!!`,
    },
    vip: {
        weight: 1, fromDay: 2, shirt: 0xd4af37, speed: 0.9, patience: 1.3, pays: 2, items: 3, knock: 0, spill: 0,
        greeting: (wants) => `I need ${wants}.`,
    },
    printOrder: {
        weight: 1.5, speed: 1, patience: 1.8, pays: 1, items: 0, knock: 0, spill: 0.1,
        greeting: () => "Can you print me something?",
    },
    thief: {
        weight: 1.5, fromDay: 2, speed: 1.1, patience: 1, pays: 0, items: 1, knock: 0, spill: 0, steals: true,
        greeting: () => "Just looking...",
    },
};

const OUTSIDE = new THREE.Vector3(FRONT_DOOR.x, 0, D + 6);
const INSIDE = new THREE.Vector3(FRONT_DOOR.x, 0, D - 2.5);

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function pickType(day) {
    const types = Object.entries(TYPES).filter(([, type]) => (type.fromDay ?? 1) <= day);
    let roll = Math.random() * types.reduce((sum, [, type]) => sum + type.weight, 0);
    for (const [name, type] of types) {
        roll -= type.weight;
        if (roll <= 0) return { name, ...type };
    }
    return { name: types[0][0], ...types[0][1] };
}

function listOf(wants) {
    const labels = wants.map((stock) => stock.label);
    return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0];
}

export function createCustomerController({
    scene, camera, collides, bump, items, physics, shift, belt, messes, speech, shelvesLoaded, counterLoaded,
}) {
    const { say } = speech;
    const customers = [];
    // Customers with everything they came for, in line for the counter; the first one is being
    // served. Once all their items are on the belt they wait by the cashier, and the next one steps
    // up to the belt
    const queue = [];
    const raycaster = new THREE.Raycaster();
    let shelves = [];
    let counter = null;
    let spawned = 0;
    let patienceBoost = 1;
    let alarm = false;
    let grumpiness = 1;
    // Running totals, for the tutorial to follow along
    const stats = { sold: 0, printsGiven: 0, caught: 0, escaped: 0 };

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

    // Out through the front door, then gone
    function goOutside(customer) {
        customer.route = [...(findRoute(customer.npc.position, INSIDE) ?? [INSIDE.clone()]), OUTSIDE.clone()];
        customer.moving = true;
        customer.facing = null;
    }

    function shelfApproach(shelf) {
        const bounds = new THREE.Box3().setFromObject(shelf);
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(shelf.quaternion);
        const center = bounds.getCenter(new THREE.Vector3());
        const halfDepth = Math.abs(front.x) * (bounds.max.x - bounds.min.x) / 2 +
            Math.abs(front.z) * (bounds.max.z - bounds.min.z) / 2;
        return { target: center.clone().addScaledVector(front, halfDepth + RADIUS + 0.25), center };
    }

    // A spot in front of the counter at the given position along it, and the point to face there
    function counterSpot(alongX, out = 0) {
        return {
            target: counter.localToWorld(new THREE.Vector3(alongX, 0, 2 + RADIUS + 0.25 + out)),
            facing: counter.localToWorld(new THREE.Vector3(alongX, 0, 0)),
        };
    }

    // Opposite the gap between the desk legs, where the cashier stands
    function paySpot() {
        return counterSpot(1);
    }

    // At the start of the belt, with the line growing away from the counter and then turning
    // alongside the shelf island when it gets long
    function lineSpot(index) {
        const step = Math.max(index - 1, 0);
        return counterSpot(BELT_START - Math.max(step - 2, 0) * QUEUE_SPACING, Math.min(step, 2) * QUEUE_SPACING);
    }

    // What they're looking for next, or null once they have everything
    function nextWanted(customer) {
        return customer.wants[customer.items.length] ?? null;
    }

    function matchingShelves(label) {
        return shelves.filter((shelf) => shelf.userData.stock === label);
    }

    function stockedShelf(label) {
        return matchingShelves(label).find((shelf) => items.findShelfItem(shelf, label));
    }

    function spawn(type = pickType(shift.day), wants = Array.from({ length: type.items }, () => pick(STOCK))) {
        const npc = createNPC({ id: `customer-${++spawned}`, shirtColor: type.shirt ?? pick(SHIRTS) });
        npc.scale.setScalar(type.scale ?? 1);
        npc.position.copy(OUTSIDE);
        scene.add(npc);
        customers.push({
            npc,
            type,
            walk: createWalkingAnimation(npc),
            wants,
            state: "entering",
            route: [INSIDE.clone()],
            moving: true,
            facing: null,
            shelf: null,
            // Boxes they took, carried until they're put on the belt, in the order they were taken
            items: [],
            placed: 0,
            scanned: 0,
            bill: 0,
            wandersLeft: type.wanders ?? 0,
            spillIn: Math.random() < type.spill ? randomBetween(4, 20) : null,
            spot: null,
            patience: 0,
            recheck: 0,
            hurried: false,
            blocked: 0,
            squeezing: 0,
            excuseIn: 0,
        });
    }

    function setPatience(customer, seconds) {
        customer.patience = seconds * customer.type.patience * patienceBoost;
        customer.hurried = false;
    }

    // Kids go and look at a couple of random shelves first
    function wander(customer) {
        customer.shelf = pick(shelves);
        const { target, center } = shelfApproach(customer.shelf);
        customer.state = "wander";
        go(customer, target, center);
    }

    function goToShelf(customer, shelf) {
        const label = nextWanted(customer).label;
        shelf ??= stockedShelf(label) ?? pick(matchingShelves(label));
        const { target, center } = shelfApproach(shelf);
        customer.shelf = shelf;
        customer.state = "shelf";
        go(customer, target, center);
    }

    // Sometimes a box gets knocked off the shelf and tumbles onto the floor in front of it
    function maybeKnock(customer, shelf) {
        if (Math.random() >= customer.type.knock) return;
        const box = items.findShelfItem(shelf, null);
        if (!box) return;
        // Just outside the shelf's front, so it doesn't start inside the shelf's collision box
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(shelf.quaternion);
        const depth = shelf.userData.size.z;
        box.position.addScaledVector(front, depth / 2 + 0.6 - front.dot(box.position.clone().sub(shelf.position)));
        physics.addLoose(box, {
            velocity: front.clone().multiplyScalar(randomBetween(2, 4)).setY(2),
            spin: new THREE.Vector3(randomBetween(-4, 4), randomBetween(-4, 4), randomBetween(-4, 4)),
        });
        say(customer.npc, "Oops!");
    }

    function shopOrQueue(customer) {
        if (nextWanted(customer)) goToShelf(customer);
        else if (customer.type.steals) escape(customer);
        else joinQueue(customer);
    }

    function takeFromShelf(customer) {
        const label = nextWanted(customer).label;
        const item = items.findShelfItem(customer.shelf, label);
        if (item && items.takeForNPC(item, customer.npc)) {
            // Stacked in their arms, or tucked under the arm by shoplifters
            if (customer.type.steals) {
                item.scale.setScalar(0.5);
                item.position.set(0.75, 1.7, 0.1);
            } else {
                item.position.y += customer.items.length;
            }
            customer.items.push(item);
            shopOrQueue(customer);
            return;
        }

        const elsewhere = stockedShelf(label);
        if (elsewhere) {
            goToShelf(customer, elsewhere);
        } else if (customer.state !== "waiting") {
            customer.state = "waiting";
            setPatience(customer, STOCK_PATIENCE);
            say(customer.npc, `Out of ${label}?`);
        }
    }

    function joinQueue(customer) {
        queue.push(customer);
        customer.state = "queue";
        setPatience(customer, QUEUE_PATIENCE);
        arrangeQueue();
    }

    // Whether everything they're buying is on the belt; print orders have nothing to put down
    function allPlaced(customer) {
        return customer.placed === customer.wants.length;
    }

    // Sends everyone in line to where they should stand, if that changed: the first one by the
    // cashier once their things are on the belt, and the rest in line from the start of the belt
    function arrangeQueue() {
        const paying = queue.length > 0 && allPlaced(queue[0]);
        queue.forEach((customer, index) => {
            const { target, facing } = index === 0 && paying ? paySpot() : lineSpot(index + (paying ? 0 : 1));
            if (customer.spot?.distanceTo(target) < 0.01) return;
            customer.spot = target;
            go(customer, target, facing);
        });
    }

    // Puts the next box on the belt when at the front of the line (or next, once the first one has
    // put everything down) and the start of the belt is clear
    function tryPlaceOnBelt(customer) {
        const index = queue.indexOf(customer);
        if (allPlaced(customer) || customer.moving || !belt.hasRoom()) return;
        if (index > 1 || (index === 1 && !allPlaced(queue[0]))) return;

        const item = customer.items[customer.placed++];
        items.placeFromNPC(item, customer.npc.position);
        belt.place(item);
        item.userData.forSale = customer;
        if (allPlaced(customer)) arrangeQueue();
    }

    // Shoplifters make for the door with the box hidden
    function escape(customer) {
        customer.state = "escaping";
        goOutside(customer);
    }

    function dropCarried(customer) {
        customer.items.forEach((item, i) => {
            if (item.userData.beltX !== undefined) {
                // Already on the belt: set aside on the counter for the player to put back, so it
                // doesn't block the scanner
                delete item.userData.forSale;
                belt.putAside(item);
                return;
            }
            // Dropped from their arms, falling onto the floor
            const { x, z } = customer.npc.position;
            items.placeFromNPC(item, new THREE.Vector3(x + i * 0.4, 1.5 + i, z + i * 0.4));
            item.scale.setScalar(1);
            physics.addLoose(item);
        });
        customer.items = [];
    }

    function leave(customer) {
        dropCarried(customer);
        const index = queue.indexOf(customer);
        if (index !== -1) {
            queue.splice(index, 1);
            arrangeQueue();
        }
        customer.state = "leaving";
        goOutside(customer);
    }

    function walkOut(customer, line) {
        say(customer.npc, line);
        shift.walkout();
        leave(customer);
    }

    function despawn(customer) {
        for (const item of customer.items) {
            items.removeItem(item);
            item.removeFromParent();
        }
        speech.clear(customer.npc);
        customer.npc.removeFromParent();
        customers.splice(customers.indexOf(customer), 1);
    }

    function arrive(customer) {
        if (customer.state === "entering") {
            const line = customer.type.greeting?.(listOf(customer.wants)) ?? `${listOf(customer.wants)}, please!`;
            say(customer.npc, messes.count() >= MESSY ? "What a mess..." : line);
            if (customer.type.items === 0) joinQueue(customer);
            else if (customer.wandersLeft > 0) wander(customer);
            else goToShelf(customer);
        } else if (customer.state === "wander") {
            maybeKnock(customer, customer.shelf);
            if (--customer.wandersLeft > 0) wander(customer);
            else goToShelf(customer);
        } else if (customer.state === "shelf") {
            maybeKnock(customer, customer.shelf);
            takeFromShelf(customer);
        } else if (customer.state === "escaping") {
            // Got away with it
            stats.escaped++;
            shift.walkout();
            despawn(customer);
        } else if (customer.state === "leaving") {
            despawn(customer);
        }
    }

    // The customer under the crosshair, in front of whatever was hit
    function aimedCustomer(hit) {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        raycaster.far = hit?.distance ?? REACH;
        const npcs = customers.map((customer) => customer.npc);
        const [first] = raycaster.intersectObjects(npcs, true);
        if (!first) return null;
        return customers.find((customer) => customer.npc.getObjectById(first.object.id));
    }

    // Scans a customer's box that has reached the end of the belt. A wrong sticker gets charged as
    // is when it's cheaper, and makes the customer complain when it's dearer
    function tryScan(hit) {
        let item = hit?.object;
        while (item && !item.userData.forSale) item = item.parent;
        if (!item) return false;
        // Theirs to buy, but not at the scanner yet
        if (!belt.atEnd(item)) {
            belt.flashScanner();
            return true;
        }

        const customer = item.userData.forSale;
        const { price } = STOCK.find((stock) => stock.label === item.userData.label);
        const tagPrice = item.userData.tagPrice;
        belt.remove(item);
        items.removeItem(item);
        item.removeFromParent();
        customer.items.splice(customer.items.indexOf(item), 1);
        customer.scanned++;

        if (tagPrice > price) {
            customer.bill += price;
            customer.patience -= OVERCHARGE_PENALTY;
            say(customer.npc, `It said $${price} on the shelf!`);
        } else {
            customer.bill += tagPrice;
            say(customer.npc, tagPrice < price ? "What a bargain!" : `$${tagPrice}`);
        }

        if (customer.scanned === customer.wants.length) pay(customer, customer.bill);
        return true;
    }

    // Pays, with a tip from those who pay extra, and leaves
    function pay(customer, amount) {
        if (customer.type.name === "printOrder") stats.printsGiven++;
        else stats.sold++;
        const total = Math.round(amount * customer.type.pays);
        shift.earn(total);
        say(customer.npc, `Thanks! $${total}`);
        leave(customer);
    }

    // Clicking a customer: catches a shoplifter, and offends anyone else
    function tryAccuse(hit) {
        const customer = aimedCustomer(hit);
        if (!customer || customer.state === "leaving") return false;

        if (customer.type.steals && customer.items.length) {
            say(customer.npc, "Sorry...");
            shift.earn(CATCH_REWARD);
            stats.caught++;
            leave(customer);
        } else if (customer.state !== "escaping") {
            say(customer.npc, "How rude!");
            customer.patience -= ACCUSE_PENALTY;
        }
        return true;
    }

    // Called with what the player clicked with empty hands
    function use(hit) {
        return tryScan(hit) || tryAccuse(hit);
    }

    // Called with what the player is holding when they click: a print for a customer who ordered
    // one. Returns "given", "refused" or null
    function give(item) {
        const customer = aimedCustomer(null);
        if (customer?.type.name !== "printOrder" || customer.state !== "queue") return null;
        if (item.userData.kind === "paper") {
            say(customer.npc, "It's blank!");
            return "refused";
        }
        if (item.userData.kind !== "print") return null;
        pay(customer, PRINT_PRICE);
        return "given";
    }

    function updatePatience(customer, dt) {
        if (customer.state === "waiting") {
            customer.recheck -= dt;
            if (customer.recheck <= 0) {
                customer.recheck = 1;
                const stocked = stockedShelf(nextWanted(customer).label);
                if (stocked === customer.shelf) takeFromShelf(customer);
                else if (stocked) goToShelf(customer, stocked);
            }
        }
        if (customer.state !== "waiting" && customer.state !== "queue") return;

        customer.patience -= dt * grumpiness;
        if (customer.patience <= 0) {
            walkOut(customer, customer.state === "waiting" ? "Forget it!" : "I'm leaving!");
        } else if (customer.patience <= HURRY_AT && !customer.hurried) {
            customer.hurried = true;
            say(customer.npc, customer.state === "waiting" ? "Any more coming?" : "Hurry up!");
        }
    }

    // A spilled drink on the way, at some point while they're in the shop
    function updateSpill(customer, dt) {
        if (customer.spillIn === null || customer.state === "entering") return;
        customer.spillIn -= dt;
        if (customer.spillIn > 0) return;
        customer.spillIn = null;
        messes.addSpill(customer.npc.position);
        say(customer.npc, "Oops!");
    }

    function updateCustomer(customer, dt) {
        const { npc } = customer;
        updatePatience(customer, dt);
        updateSpill(customer, dt);
        if (customer.state === "queue") tryPlaceOnBelt(customer);

        // With the door alarm, shoplifters get caught on the way out
        if (customer.state === "escaping" && alarm && customer.route.length === 1) {
            say(npc, "Busted!");
            leave(customer);
        }

        const { dx, dz } = customer.route.length ? stepAlongRoute(customer, dt) : { dx: 0, dz: 0 };
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

    function bodyRadius(customer) {
        return BODY_RADIUS * (customer.type.scale ?? 1);
    }

    // Towards the next point on the route, or around whoever's in the way
    function stepAlongRoute(customer, dt) {
        const { npc } = customer;
        const next = customer.route[0];
        const remaining = Math.hypot(next.x - npc.position.x, next.z - npc.position.z);
        const step = Math.min(MOVE_SPEED * customer.type.speed * dt, remaining);
        const towardX = remaining ? (next.x - npc.position.x) / remaining * step : 0;
        const towardZ = remaining ? (next.z - npc.position.z) / remaining * step : 0;
        customer.squeezing = Math.max(customer.squeezing - dt, 0);
        customer.excuseIn -= dt;

        const ignore = (body) => body.customer === customer || (customer.squeezing > 0 && !body.player);
        let blocker = null;
        for (const angle of SIDESTEPS) {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const dx = towardX * cos - towardZ * sin;
            const dz = towardX * sin + towardZ * cos;
            const to = { x: npc.position.x + dx, z: npc.position.z + dz };
            blocker = bump(npc.position, to, bodyRadius(customer), ignore);
            if (blocker) continue;

            customer.blocked = 0;
            if (remaining > 0.0001) npc.rotation.y = Math.atan2(dx, dz);
            // Only a straight step can reach the point; a step aside leaves it for later
            if (angle === 0 && step >= remaining) customer.route.shift();
            return { dx, dz };
        }

        customer.blocked += dt;
        if (blocker.player && customer.blocked > 0.5 && customer.excuseIn <= 0) {
            say(npc, "Excuse me!");
            customer.excuseIn = EXCUSE_EVERY;
        } else if (!blocker.player && customer.blocked > SQUEEZE_AFTER) {
            customer.squeezing = SQUEEZE_TIME;
        }
        return { dx: 0, dz: 0 };
    }

    function update(dt) {
        if (!counter) return;
        if (shift.wantsCustomer(dt, customers.length)) spawn();

        grumpiness = Math.min(1 + messes.count() * GRUMPINESS_PER_MESS, MAX_GRUMPINESS);
        for (const customer of [...customers]) updateCustomer(customer, dt);
    }

    function reset() {
        for (const customer of customers) customer.walk.reset();
    }

    // Everyone gone at once, with what they were carrying, between shifts
    function clear() {
        for (const customer of [...customers]) {
            for (const item of customer.items) belt.remove(item);
            despawn(customer);
        }
        queue.length = 0;
    }

    // A customer of the given type, with `overrides` for its type settings and `wants` for what it
    // buys, e.g. a patient one for the tutorial
    function spawnCustomer(name, { wants, ...overrides } = {}) {
        const type = { name, ...TYPES[name], ...overrides };
        spawn(type, wants);
    }

    return {
        update, reset, clear, use, give, spawnCustomer, stats,
        addShelf: (shelf) => shelves.push(shelf),
        setPatienceBoost: (boost) => { patienceBoost = boost; },
        setAlarm: (on) => { alarm = on; },
        count: () => customers.length,
        bodies: () => customers.map((customer) => ({
            x: customer.npc.position.x,
            z: customer.npc.position.z,
            radius: bodyRadius(customer),
            customer,
        })),
        positions: () => customers.map((customer) => customer.npc.position),
    };
}
