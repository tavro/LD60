import * as THREE from "three";
import { createRendering } from "./scene/rendering.js";
import { createEnvironment } from "./scene/environment.js";
import { createModelSpawner } from "./scene/models.js";
import { createFurniture } from "./scene/furniture.js";
import { createCollisionSystem } from "./game/collisions.js";
import { createPlayer } from "./game/player.js";
import { createControls } from "./game/controls.js";
import { createItemSystem } from "./game/items.js";
import { createStockSystem } from "./game/stock.js";
import { createAnimationSystem } from "./game/animation.js";
import { createPrinterSystem } from "./game/printer.js";
import { createMusicSystem } from "./game/music.js";
import { applySettings } from "./game/settings.js";

const { scene, camera, renderer } = createRendering();
const collisions = createCollisionSystem();
createEnvironment(scene, collisions);

const models = createModelSpawner(scene, collisions);
const player = createPlayer(camera, collisions);
const animations = createAnimationSystem();

// Callbacks connect item interactions to the printer without module import cycles.
let printer;
const items = createItemSystem({
    scene,
    camera,
    player: player.state,
    surfaces: collisions.surfaces,
    getExtraTargets: () => printer?.puddle.visible ? [printer.puddle] : [],
    onDrop: (item, hit) => printer.handleDrop(item, hit),
    onMopUse: (mop, hit) => printer.tryScrub(mop, hit),
});
const stock = createStockSystem({ spawn: models.spawn, addItem: items.addItem });
const { printerLoaded } = createFurniture({ spawn: models.spawn, ...stock });
printer = createPrinterSystem({
    scene,
    items,
    collides: collisions.collides,
    tween: animations.tween,
    printerLoaded,
    hud: document.getElementById("hud"),
});

// Place loose items only after the furniture and initial stock have loaded.
models.ready().then(() => printer.initialize());

const controls = createControls({ renderer, player, interact: items.interact });
const music = createMusicSystem();
const timer = new THREE.Timer();

function animate(time) {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);

    // Place the camera even while paused, so the world remains behind the menu.
    player.update(controls.playing ? dt : 0);
    if (controls.playing) {
        items.update(dt);
        animations.update(dt);
        printer.update(dt);
    }
    music.update(player.state.x);
    applySettings(renderer, music);
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
