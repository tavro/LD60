import * as THREE from "three";
import { PARTITION_X } from "../scene/layout.js";
import { forDevice } from "./touch.js";
import { STOCK } from "./stock.js";

// Interactive tutorial: a training shift with no clock, where a card at the bottom of the screen
// gives one instruction at a time and moves on once the player has done it. Customers it brings in
// never run out of patience, and the shoplifter is slow
export function createTutorial({
    player, items, printer, customers, messes, placeBox, shelvesLoaded, counterLoaded, onFinish,
}) {
    const card = document.createElement("div");
    card.id = "tutorial-card";
    card.hidden = true;
    document.body.append(card);

    let shelves = [];
    let counter = null;
    shelvesLoaded.then((loaded) => { shelves = loaded; });
    counterLoaded.then((loaded) => { counter = loaded; });

    let active = false;
    let index = 0;
    let start = null;
    let dropped = null;
    // Counts when a step started, to tell when something has happened since
    let since = {};

    const patient = { patience: Infinity };
    const wrongTag = STOCK[1];

    function behindCounter() {
        if (!counter) return false;
        const local = counter.worldToLocal(new THREE.Vector3(player.x, 0, player.z));
        return local.z < 0 && Math.abs(local.x) < 4;
    }

    function droppedOnMatchingShelf() {
        if (!dropped) return false;
        const box = dropped;
        dropped = null;
        if (box.userData.kind !== "box") return false;

        const shelf = shelves.find((shelf) => items.isOnShelf(box, shelf));
        if (!shelf) return false;
        if (shelf.userData.stock === box.userData.label) return true;
        show(`That shelf's sign says ${shelf.userData.stock}, but this is ${box.userData.label}. ` +
            "Pick it up and find the matching sign.");
        return false;
    }

    const steps = [
        {
            text: "Move with WASD and look around with the mouse.",
            enter: () => { start = { x: player.x, z: player.z }; },
            done: () => Math.hypot(player.x - start.x, player.z - start.z) > 3,
        },
        {
            text: "New stock is kept in the storage room, behind the wall at the far end of the shop, opposite " +
                "the counter. Seen from the counter, its door is towards the right of that wall; walk up to it " +
                "and it opens by itself.",
            done: () => player.x < PARTITION_X,
        },
        {
            text: "Storage starts empty on day one; deliveries arrive after shifts. For practice, return " +
                "to the shop and click a product on a shelf to pick it up.",
            done: () => items.heldKind() === "box",
        },
        {
            text: "Find the shop shelf whose sign matches the box's sticker. " +
                "Look at the shelf and click to put the box in.",
            enter: () => { dropped = null; },
            done: droppedOnMatchingShelf,
        },
        {
            text: "Customers pay at the counter by the front door. Go and stand behind it.",
            done: behindCounter,
        },
        {
            text: "Here comes a customer. They put what they buy on the belt, which carries it to your left. " +
                "When it reaches the red SCAN zone at the end, click it to scan it.",
            enter: () => customers.spawnCustomer("regular", { ...patient, wants: [STOCK[0]] }),
            done: () => customers.stats.sold > since.sold,
        },
        {
            text: `Some stickers show the wrong price; the shelf signs are always right. The ` +
                `${wrongTag.label.toLowerCase()} behind you says $9, but it costs $${wrongTag.price}. Take it to the ` +
                "printer in the storage room and drop it on top to print a new sticker.",
            enter: () => {
                printer.refill();
                const position = counter.localToWorld(new THREE.Vector3(1, 0, -3.2));
                placeBox({ position, rotation: counter.rotation.y, stock: wrongTag, tagPrice: 9 });
            },
            done: () => printer.stats.retags > since.retags,
        },
        {
            text: "The printer prints pages too. Pick up a sheet of paper from the floor and drop it on the printer.",
            done: () => printer.stats.prints > since.prints,
        },
        {
            text: "This customer wants a print. Pick up the page, take it to them and click them while holding it.",
            enter: () => customers.spawnCustomer("printOrder", patient),
            done: () => customers.stats.printsGiven > since.printsGiven,
        },
        {
            text: "Someone spilled their drink! Messes make customers lose patience faster. " +
                "Get the mop from next to the printer and click the spill until it's gone.",
            enter: () => messes.addSpill({ x: 8, z: 8 }),
            done: () => messes.spillCount() === 0,
        },
        {
            text: "Watch out for shoplifters: they grab an item, hide it under their arm and head for the door. " +
                "Look at this one and click them before they get out!",
            enter: () => customers.spawnCustomer("thief", { speed: 0.6, wants: [STOCK[0]] }),
            update: () => {
                if (customers.stats.escaped <= since.escaped) return;
                since.escaped = customers.stats.escaped;
                show("They got away! Here comes another one. Click them before they reach the door.");
                customers.spawnCustomer("thief", { speed: 0.6, wants: [STOCK[0]] });
            },
            done: () => customers.stats.caught > since.caught,
        },
    ];

    function show(text) {
        card.replaceChildren();
        const progress = document.createElement("small");
        progress.textContent = `TRAINING · ${index + 1} OF ${steps.length}`;
        card.append(progress, forDevice(text));
    }

    function enterStep() {
        since = { ...customers.stats, ...printer.stats };
        steps[index].enter?.();
        show(steps[index].text);
    }

    function begin() {
        active = true;
        index = 0;
        card.hidden = false;
        enterStep();
    }

    function end(skipped) {
        active = false;
        card.hidden = true;
        onFinish({ skipped });
    }

    // Called with each item the player puts down
    function onDrop(item) {
        dropped = item;
    }

    function update() {
        if (!active) return;
        const step = steps[index];
        step.update?.();
        if (!step.done()) return;

        index++;
        if (index === steps.length) end(false);
        else enterStep();
    }

    return {
        begin, onDrop, update,
        skip: () => end(true),
        get active() { return active; },
    };
}
