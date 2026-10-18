import * as THREE from "three";
import { createRendering } from "./scene/rendering.js";
import { createEnvironment } from "./scene/environment.js";
import { createModelSpawner } from "./scene/models.js";
import { createFurniture } from "./scene/furniture.js";
import { createDoors } from "./scene/doors.js";
import { createCollisionSystem } from "./game/collisions.js";
import { createPlayer } from "./game/player.js";
import { createControls } from "./game/controls.js";
import { createItemSystem } from "./game/items.js";
import { createStockSystem } from "./game/stock.js";
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

const { scene, camera, renderer } = createRendering();
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
const items = createItemSystem({
    scene,
    camera,
    player: player.state,
    surfaces: collisions.surfaces,
    slots: shelfSlots,
    physics,
    getExtraTargets: () => printer?.puddle.visible ? [printer.puddle] : [],
    onDrop: (item, hit) => {
        printer.handleDrop(item, hit);
        belt.handleDrop(item);
        tutorial.onDrop(item);
    },
    onMopUse: (mop, hit) => printer.tryScrub(mop, hit) || messes.tryScrub(mop, hit),
    onUse: (hit) => customers.use(hit),
    onGive: (item) => customers.give(item),
});
const stock = createStockSystem({ spawn: models.spawn, addItem: items.addItem, slots: shelfSlots });
const { printerLoaded, shopShelvesLoaded, counterLoaded, addExtraShelf } = createFurniture({ spawn: models.spawn, ...stock });
printer = createPrinterSystem({
    scene,
    items,
    collides: collisions.collides,
    tween: animations.tween,
    printerLoaded,
    retag: stock.retag,
});
const messes = createMesses({ scene, items, physics, tween: animations.tween });

// Place loose items after the furniture and initial stock have loaded.
models.ready().then(() => printer.initialize());

const npcSpeech = createNPCSpeech();
const register = createRegister(scene, counterLoaded);
const belt = createBelt(scene, counterLoaded);
const shift = createShift({ register, onEnd: endShift });
customers = createCustomerController({
    scene,
    camera,
    collides: collisions.collides,
    bump: collisions.bump,
    items,
    physics,
    shift,
    belt,
    messes,
    speech: npcSpeech,
    shelvesLoaded: shopShelvesLoaded,
    counterLoaded,
});
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
        if (tutorial.active || shift.day !== 0) return;
        shift.start(1);
        setMenuOptions({ play: "▶ Back to work", tutorial: false, skip: false });
    },
    onPause: customers.reset,
});

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
        setMenuOptions({ play: "▶ Back to work", tutorial: false, skip: false });
        if (skipped) {
            shift.start(1);
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
            button: "▶ Start day 1",
            onContinue: () => {
                shift.start(1);
                controls.resume();
            },
        });
    },
});

document.querySelector("#tutorial").addEventListener("click", () => {
    register.show({ day: 0, time: "Training" });
    setMenuOptions({ play: "▶ Back to work", tutorial: false, skip: true });
    tutorial.begin();
    controls.resume();
});
document.querySelector("#skip-tutorial").addEventListener("click", () => tutorial.skip());

// Between shifts: the result, and upgrades to buy after a good one

function applyUpgrade(id, level) {
    if (id === "belt") belt.setSpeed(1 + 0.5 * level);
    else if (id === "coffee") customers.setPatienceBoost(1 + 0.25 * level);
    else if (id === "shelf") addExtraShelf(level - 1).then(customers.addShelf);
    else if (id === "alarm") customers.setAlarm(true);
}

function endShift(result) {
    controls.stop();
    customers.clear();
    showShiftResult(result);
}

function showShiftResult({ day, success, takings, target, walkouts, maxWalkouts }) {
    const failedBy = walkouts >= maxWalkouts ? "Too many walkouts." : `Missed the $${target} target.`;
    const upgrades = success
        ? shift.upgradeOffers().map((upgrade) => ({
            label: upgrade.price === null ? `${upgrade.name} — owned` : `${upgrade.name} — $${upgrade.price}`,
            description: upgrade.description,
            available: upgrade.price !== null && upgrade.price <= shift.bank,
            onBuy: () => {
                const level = shift.buy(upgrade.id);
                if (level) applyUpgrade(upgrade.id, level);
                showShiftResult({ day, success, takings, target, walkouts, maxWalkouts });
            },
        }))
        : [];

    showShiftPanel({
        title: success ? `Day ${day} done!` : "Shift failed",
        lines: [
            `Takings: $${takings} of $${target}`,
            `Walkouts: ${walkouts} of ${maxWalkouts}`,
            success ? `Bank: $${shift.bank}` : failedBy,
        ],
        upgrades,
        button: success ? `▶ Start day ${day + 1}` : "▶ Try again",
        onContinue: () => {
            shift.start(success ? day + 1 : day);
            controls.resume();
        },
    });
}
const music = createMusicSystem();
const timer = new THREE.Timer();

function animate(time) {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);

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
    }
    music.update(player.state.x);
    applySettings(renderer, music);
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
