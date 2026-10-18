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
import { createBelt } from "./game/belt.js";
import { createCustomerController } from "./npc/controller.js";
import { createNPCSpeech } from "./npc/speech.js";

const { scene, camera, renderer } = createRendering();
const collisions = createCollisionSystem();
createEnvironment(scene, collisions);
const doors = createDoors(scene, collisions);

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
    getExtraTargets: () => printer?.puddle.visible ? [printer.puddle] : [],
    onDrop: (item, hit) => {
        printer.handleDrop(item, hit);
        belt.handleDrop(item);
    },
    onMopUse: (mop, hit) => printer.tryScrub(mop, hit),
    onUse: (hit) => customers?.trySell(hit) ?? false,
});
const stock = createStockSystem({ spawn: models.spawn, addItem: items.addItem, slots: shelfSlots });
const { printerLoaded, shopShelvesLoaded, counterLoaded } = createFurniture({ spawn: models.spawn, ...stock });
printer = createPrinterSystem({
    scene,
    items,
    collides: collisions.collides,
    tween: animations.tween,
    printerLoaded,
});

// Place loose items after the furniture and initial stock have loaded.
models.ready().then(() => printer.initialize());

const npcSpeech = createNPCSpeech();
const register = createRegister(scene, counterLoaded);
const belt = createBelt(scene, counterLoaded);
customers = createCustomerController({
    scene,
    collides: collisions.collides,
    items,
    register,
    belt,
    speech: npcSpeech,
    shelvesLoaded: shopShelvesLoaded,
    counterLoaded,
});
const controls = createControls({
    renderer,
    player,
    interact: items.interact,
    onPause: customers.reset,
});
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
        belt.update(dt);
        npcSpeech.update(dt);
        items.update(dt);
        animations.update(dt);
        printer.update(dt);
    }
    music.update(player.state.x);
    applySettings(renderer, music);
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
