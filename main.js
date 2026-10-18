import * as THREE from "three";
import { fontReady } from "./game/font.js";
import "./game/cursors.js";
import { createRendering } from "./scene/rendering.js";
import { createEnvironment } from "./scene/environment.js";
import { createModelSpawner } from "./scene/models.js";
import { createFurniture } from "./scene/furniture.js";
import { createDoors } from "./scene/doors.js";
import { createLighting } from "./scene/lighting.js";
import { createGraphics } from "./game/graphics.js";
import { createCollisionSystem } from "./game/collisions.js";
import { createPlayer } from "./game/player.js";
import { createControls } from "./game/controls.js";
import { createItemSystem } from "./game/items.js";
import { createStockSystem } from "./game/stock.js";
import { createDeliverySystem } from "./game/delivery.js";
import { createShiftButton, shiftStartProblems } from "./game/shift-button.js";
import { createAnimationSystem } from "./game/animation.js";
import { createPrinterSystem } from "./game/printer.js";
import { createMusicSystem } from "./game/music.js";
import { applySettings } from "./game/settings.js";
import { createRegister } from "./game/register.js";
import { createShift } from "./game/shift.js";
import { createMesses } from "./game/messes.js";
import { createPhysics } from "./game/physics.js";
import { createTutorial } from "./game/tutorial.js";
import { createBelt } from "./game/belt.js";
import { createCustomerController } from "./npc/controller.js";
import { createNPCSpeech } from "./npc/speech.js";
import { showShiftPanel, setMenuOptions } from "./menu/menu.js";

// Text on boxes, signs and menus is drawn in the pixel font, so it has to be loaded first
await fontReady;

const { scene, camera, renderer, composer, bloom, heldPass } = createRendering();
const lighting = createLighting(scene);
const graphics = createGraphics({ scene, renderer, composer, bloom, lighting });
const collisions = createCollisionSystem();
createEnvironment(scene, collisions);
const doors = createDoors(scene, collisions);
const physics = createPhysics({ footprints: () => collisions.colliders.concat(collisions.barriers) });

const models = createModelSpawner(scene, collisions);
const player = createPlayer(camera, collisions);
const animations = createAnimationSystem();

// Shelf spots, filled in as the shelves are made, for boxes to snap to
const shelfSlots = [];

// Callbacks connect item interactions to the printer and customers without module import cycles.
let printer;
let customers;
let delivery;
let shiftButton;
const items = createItemSystem({
    scene,
    camera,
    player: player.state,
    surfaces: collisions.surfaces,
    slots: shelfSlots,
    physics,
    collides: collisions.collides,
    getExtraTargets: () => printer?.puddle.visible ? [printer.puddle] : [],
    onDrop: (item, hit) => {
        printer.handleDrop(item, hit);
        belt.handleDrop(item);
        tutorial.onDrop(item);
    },
    onMopUse: (mop, hit) => printer.tryScrub(mop, hit) || messes.tryScrub(mop, hit),
    onWorldUse: (hit) => shiftButton.use(hit),
    onUse: (hit) => delivery.use(hit) || customers.use(hit),
    onGive: (item) => customers.give(item),
});
const stock = createStockSystem({ spawn: models.spawn, addItem: items.addItem, slots: shelfSlots });
const { printerLoaded, shopShelvesLoaded, counterLoaded, addExtraShelf, stockCapacity } = createFurniture({
    spawn: models.spawn,
    ...stock,
});
delivery = createDeliverySystem({
    scene, items, physics, placeBox: stock.placeBox, collides: collisions.collides, stockCapacity,
});
printer = createPrinterSystem({
    scene,
    items,
    collides: collisions.collides,
    tween: animations.tween,
    printerLoaded,
    retag: stock.retag,
});
const messes = createMesses({ scene, items, physics, tween: animations.tween });

// Scatter paper after the furniture loads. The mop and cartridge already exist independently.
models.ready().then(() => printer.initialize()).catch((error) => {
    console.warn("Could not scatter printer paper:", error);
});

const npcSpeech = createNPCSpeech();
const register = createRegister(scene, counterLoaded);
const belt = createBelt(scene, counterLoaded);
const shift = createShift({ register, onEnd: endShift });
customers = createCustomerController({
    scene,
    camera,
    collides: collisions.collides,
    bump: collisions.bump,
    collisionBodies: collisions.bodies,
    items,
    physics,
    shift,
    belt,
    messes,
    speech: npcSpeech,
    shelvesLoaded: shopShelvesLoaded,
    counterLoaded,
});
// Customers shove loose items out of their way
physics.setMovers(() => customers.bodies().map(({ x, z, radius, customer }) => ({
    key: customer,
    x,
    z,
    radius,
    height: 4 * (customer.type.scale ?? 1),
})));

// Customers and the player bump into each other
collisions.setBodies(() => [
    { x: player.state.x, z: player.state.z, radius: player.radius, player: true },
    ...customers.bodies(),
]);

const controls = createControls({
    renderer,
    player,
    interact: items.interact,
    onPlay: () => {
        if (tutorial.active || shift.day !== 0 || nextDay !== null) return;
        beginShift(1);
    },
    onPause: customers.reset,
});

let nextDay = null;
let preparationError = "";
let startWarning = "";
let warningTime = 0;
const preparationCard = document.createElement("div");
preparationCard.id = "preparation-card";
preparationCard.hidden = true;
document.body.append(preparationCard);

function prepareShift(day) {
    if (nextDay !== null) return;
    nextDay = day;
    preparationError = "";
    startWarning = "";
    shiftButton.setActive(true);
    // The carton is built from geometry, with no asset download or printer initialization to await.
    try {
        delivery.arrive();
    } catch (error) {
        preparationError = "Delivery could not be created. Reload the game to try again.";
        console.warn("Delivery arrival failed:", error);
    }
    register.show({ day: 0, time: "Restocking" });
    setMenuOptions({ play: "Back to preparation", tutorial: false, skip: false });
    preparationCard.hidden = false;
}

function startPreparedShift() {
    if (!controls.playing || nextDay === null) return;
    const problems = preparationError ? [preparationError] : shiftStartProblems({ delivery, messes, printer });
    if (problems.length) {
        startWarning = problems.join("\n");
        warningTime = 8;
        return;
    }
    beginShift(nextDay);
}

function beginShift(day) {
    shift.start(day);
    nextDay = null;
    shiftButton.setActive(false);
    preparationCard.hidden = true;
    setMenuOptions({ play: "Back to work", tutorial: false, skip: false });
}

shiftButton = createShiftButton({ counterLoaded, onPress: startPreparedShift });

// Tutorial, from the menu before the first shift

register.show({ day: 0, time: "Welcome!" });

const tutorial = createTutorial({
    player: player.state,
    items,
    printer,
    customers,
    messes,
    placeBox: stock.placeBox,
    shelvesLoaded: shopShelvesLoaded,
    counterLoaded,
    onFinish: ({ skipped }) => {
        customers.clear();
        setMenuOptions({ play: "Back to work", tutorial: false, skip: false });
        if (skipped) {
            beginShift(1);
            controls.resume();
            return;
        }
        controls.stop();
        showShiftPanel({
            title: "You're ready!",
            lines: [
                "Each shift has a money target: sell enough before closing time.",
                "Five walkouts end the shift early.",
                "Keep shelves stocked, the floor clean and the line moving.",
                "Hit the target to bank the money and buy upgrades.",
            ],
            button: "Start day 1",
            onContinue: () => {
                beginShift(1);
                controls.resume();
            },
        });
    },
});

document.querySelector("#tutorial").addEventListener("click", () => {
    register.show({ day: 0, time: "Training" });
    setMenuOptions({ play: "Back to work", tutorial: false, skip: true });
    tutorial.begin();
    controls.resume();
});
document.querySelector("#skip-tutorial").addEventListener("click", () => tutorial.skip());

// Between shifts: the result, and upgrades to buy after a good one

function applyUpgrade(id, level) {
    if (id === "belt") belt.setSpeed(1 + 0.5 * level);
    else if (id === "shelf") addExtraShelf(level - 1).then(customers.addShelf);
    else if (id === "alarm") customers.setAlarm(true);
}

// Show the results first; the player collects and unpacks the next delivery during preparation.
function endShift(result) {
    shiftButton.setActive(true);
    controls.stop();
    customers.clear();
    showShiftResult(result);
}

function showShiftResult(result) {
    const { day, success, takings, target, walkouts, maxWalkouts } = result;
    const failedBy = walkouts >= maxWalkouts ? "Too many walkouts." : `Missed the $${target} target.`;
    const upgrades = success
        ? shift.upgradeOffers().map((upgrade) => ({
            label: upgrade.price === null ? `${upgrade.name} — owned` : `${upgrade.name} — $${upgrade.price}`,
            description: upgrade.description,
            available: upgrade.price !== null && upgrade.price <= shift.bank,
            onBuy: () => {
                const level = shift.buy(upgrade.id);
                if (level) applyUpgrade(upgrade.id, level);
                showShiftResult(result);
            },
        }))
        : [];

    showShiftPanel({
        title: success ? `Day ${day} done!` : "Shift failed",
        lines: [
            `Takings: $${takings} of $${target}`,
            `Walkouts: ${walkouts} of ${maxWalkouts}`,
            success ? `Bank: $${shift.bank}` : failedBy,
            "Collect the next delivery at the front door during preparation.",
        ],
        upgrades,
        button: success ? `Prepare day ${day + 1}` : "Prepare to try again",
        onContinue: () => {
            prepareShift(success ? day + 1 : day);
            controls.resume();
        },
    });
}
const music = createMusicSystem();
const timer = new THREE.Timer();

function animate(time) {
    timer.update(time);
    const frameTime = timer.getDelta();
    const dt = Math.min(frameTime, 0.1);
    // Only judged while playing, since the menus barely cost anything
    graphics.update(controls.playing ? frameTime : 0);

    // Place the camera even while paused, so the world remains behind the menu.
    player.update(controls.playing ? dt : 0);
    if (controls.playing) {
        doors.update(dt, player.state, customers.positions());
        customers.update(dt);
        shift.update(dt, customers.count());
        tutorial.update();
        messes.update(player.state, printer.inInk(player.state.x, player.state.z));
        belt.update(dt);
        npcSpeech.update(dt);
        items.update(dt);
        animations.update(dt);
        physics.update(dt);
        printer.update(dt);
        if (nextDay !== null) {
            warningTime = Math.max(0, warningTime - dt);
            const warning = warningTime > 0 ? `\n${startWarning}` : "";
            const status = preparationError || delivery.message;
            const text = `PREPARING DAY ${nextDay}\n${status}${warning}\nClean the shop, then click the glowing red button at the counter to start.`;
            if (preparationCard.textContent !== text) preparationCard.textContent = text;
        }
    }
    shiftButton.update(dt);
    music.update(player.state.x);
    applySettings(renderer, music);
    lighting.update(dt);
    // Only drawn when there's something in hand
    heldPass.enabled = items.heldKind() !== null;
    composer.render();
}

renderer.setAnimationLoop(animate);
