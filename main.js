import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Room is laid out top-down: +x is right, +z is towards the bottom of the sketch
const ROOM_WIDTH = 40;
const ROOM_DEPTH = 28;
const WALL_HEIGHT = 9;
const WALL_THICKNESS = 0.5;

const EYE_HEIGHT = 4.2;
const PLAYER_RADIUS = 0.6;
const MOVE_SPEED = 8;
const TURN_SPEED = 2;
const MOUSE_SENSITIVITY = 0.002;
const MAX_PITCH = 1.4;

const REACH = 6;
const DROP_DISTANCE = 1.5;
// Where held items sit relative to the camera. The mop is held head down, leaning away
const HOLD = {
    default: { position: new THREE.Vector3(1, -1.2, -2.5), rotation: new THREE.Euler() },
    mop: { position: new THREE.Vector3(0.9, -3.6, -3.5), rotation: new THREE.Euler(0.7, 0, 0) },
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
);
camera.rotation.order = "YXZ";
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(10, 20, 5);
scene.add(light);

// Boxes in the XZ plane the player can't walk into
const colliders = [];
// Static objects that items can rest on and that block line of sight
const surfaces = [];

function addSolid(object, boxes = [new THREE.Box3().setFromObject(object)]) {
    colliders.push(...boxes);
    surfaces.push(object);
}

// Room

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH),
    new THREE.MeshStandardMaterial({ color: 0x777777 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
surfaces.push(floor);

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xbbbbaa });

function addWall(x1, z1, x2, z2) {
    const wall = new THREE.Mesh(
        new THREE.BoxGeometry(
            Math.abs(x2 - x1) + WALL_THICKNESS,
            WALL_HEIGHT,
            Math.abs(z2 - z1) + WALL_THICKNESS,
        ),
        wallMaterial,
    );
    wall.position.set((x1 + x2) / 2, WALL_HEIGHT / 2, (z1 + z2) / 2);
    scene.add(wall);
    addSolid(wall);
}

const W = ROOM_WIDTH / 2;
const D = ROOM_DEPTH / 2;
addWall(-W, -D, W, -D);
addWall(-W, D, W, D);
addWall(-W, -D, -W, D);
addWall(W, -D, W, D);

// Partition between the printer/restocking area and the shop floor, with a doorway near the top
const PARTITION_X = -4;
addWall(PARTITION_X, -D, PARTITION_X, -9.5);
addWall(PARTITION_X, -6, PARTITION_X, D);

// Furniture

const loader = new GLTFLoader();
const models = {};

// Everything spawned so far, to wait for the room to be finished before scattering things in it
const loading = [];

function spawn(name, options) {
    const spawned = spawnModel(name, options);
    loading.push(spawned);
    return spawned;
}

// Wraps the model in a group so its footprint is centered on the origin and it stands on y = 0,
// since the models are offset in their files. `parts` replaces the bounding box for collision
// with [minX, minZ, maxX, maxZ] footprints in that centered space, for models that aren't boxy
async function spawnModel(name, { x, z, y = 0, rotation = 0, solid = true, parts }) {
    models[name] ??= loader.loadAsync(`models/${name}.glb`);
    const model = (await models[name]).scene.clone();

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);

    const group = new THREE.Group();
    group.add(model);
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    scene.add(group);
    group.updateMatrixWorld(true);

    const height = box.max.y - box.min.y;
    const boxes = parts?.map(([minX, minZ, maxX, maxZ]) =>
        new THREE.Box3(
            new THREE.Vector3(minX, 0, minZ),
            new THREE.Vector3(maxX, height, maxZ),
        ).applyMatrix4(group.matrixWorld),
    );

    if (solid) addSolid(group, boxes);
    return group;
}

// Shelves are open on their local +z side; these rotations point that side the given way
const FACE_UP = Math.PI;
const FACE_LEFT = -Math.PI / 2;
const FACE_RIGHT = Math.PI / 2;

const SHELF_LEVELS = [0.1, 1.6, 3.1, 4.6];
const INNER = D - WALL_THICKNESS / 2;

const SHELF_COLUMNS = [-1.2, 0, 1.2];

// Where items go on a shelf placed with the given spawn options
function shelfSlots({ x, z, rotation }) {
    const shelf = new THREE.Object3D();
    shelf.position.set(x, 0, z);
    shelf.rotation.y = rotation;
    shelf.updateMatrixWorld();

    return SHELF_LEVELS.flatMap((y) =>
        SHELF_COLUMNS.map((column) => ({
            position: shelf.localToWorld(new THREE.Vector3(column, y, 0)),
            rotation,
        })),
    );
}

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

// Label stickers on the front of boxes (their local +z side, which faces out of the shelf)
const LABEL_GEOMETRY = new THREE.PlaneGeometry(0.9, 0.34);
const labelTextures = {};

function labelTexture(text) {
    if (!labelTextures[text]) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 96;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f4f4ef";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
        ctx.fillStyle = "#222";
        ctx.font = "bold 52px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        labelTextures[text] = texture;
    }
    return labelTextures[text];
}

async function restock(slot) {
    const item = await spawn("placeholder", { ...slot.position, rotation: slot.rotation, solid: false });
    // Own materials so highlighting one item doesn't light up all of them
    item.traverse((child) => {
        if (!child.isMesh) return;
        child.material = Array.isArray(child.material)
            ? child.material.map((m) => m.clone())
            : child.material.clone();
    });

    const label = new THREE.Mesh(
        LABEL_GEOMETRY,
        new THREE.MeshStandardMaterial({ map: labelTexture(slot.label) }),
    );
    label.position.set(0, 0.5, 0.505);
    item.add(label);
    item.userData.label = slot.label;

    addItem(item, "box", () => restock(slot));
}

const PRINTER = { x: -12, z: -INNER + 1.2 };
const printerLoaded = spawn("printer", PRINTER);

// Restocking shelf, L-shaped in the bottom left corner. Always kept full, with each shelf holding
// its own item, numbered along the L starting from the left wall
const RESTOCK_SHELVES = [
    { x: -W + WALL_THICKNESS / 2 + 1, z: 9, rotation: FACE_RIGHT },
    ...[-16, -12, -8].map((x) => ({ x, z: INNER - 1, rotation: FACE_UP })),
];
RESTOCK_SHELVES.forEach((shelf, i) => {
    spawn("shelf", shelf);
    for (const slot of shelfSlots(shelf)) restock({ ...slot, label: `Item ${i + 1}` });
});

// Double-sided shelf island in the middle
for (const z of [-6, -2, 2, 6]) {
    spawn("shelf", { x: 3, z, rotation: FACE_LEFT });
    spawn("shelf", { x: 5, z, rotation: FACE_RIGHT });
}

// Shelf along the right wall
for (const z of [-9, -5]) {
    spawn("shelf", { x: W - WALL_THICKNESS / 2 - 1, z, rotation: FACE_LEFT });
}

// Desk in the bottom right corner: counter along the room side, with two legs reaching towards the
// right wall and a gap between them to stand in. Leaves a walkway to the walls behind it
spawn("desk", {
    x: 15.25,
    z: 7.25,
    rotation: -Math.PI / 2,
    parts: [
        [-4, 0, 4, 2], // counter, including the overhang at the end without a leg
        [-2, -2, 0, 0],
        [2, -2, 4, 0],
    ],
});

// Animation

const tweens = [];

// Calls `update` with progress from 0 to 1 over `duration` seconds, and resolves when done
function tween(duration, update) {
    return new Promise((resolve) => tweens.push({ duration, elapsed: 0, update, resolve }));
}

function updateTweens(dt) {
    for (const t of [...tweens]) {
        t.elapsed = Math.min(t.elapsed + dt, t.duration);
        t.update(t.elapsed / t.duration);
        if (t.elapsed === t.duration) {
            tweens.splice(tweens.indexOf(t), 1);
            t.resolve();
        }
    }
}

// Printer
//
// Paper dropped on the printer gets pulled in and comes out of the slot in the middle as a page
// with a random image. Every now and then the cartridge starts leaking ink onto the floor: the
// puddle is cleaned with the mop, and dropping a new cartridge (next to the printer) on the printer
// refills it and stops the leak. Without ink, pages come out blank

const PAPER_SIZE = [0.8, 0.02, 1.13];
const PAPER_COUNT = 10;

// Printer model space, after centering: the slot runs the full width at y 2-2.25, from z -0.6 to
// the front at z 1.1
const SLOT_Y = 2.0;
const SLOT_START_Z = -0.1;
const SLOT_END_Z = 1.35;
const PRINTER_TOP = new THREE.Vector3(-0.4, 3.25, 0);
const DRIP_FROM = new THREE.Vector3(0.8, 2.0, 1.1);
const PUDDLE_AT = new THREE.Vector3(0.8, 0.02, 1.6);

const INK_PER_PRINT = 0.1;
const LEAK_RATE = 0.02;
const LEAK_DELAY = [20, 45];
const DRIP_INTERVAL = 0.3;
const PUDDLE_GROWTH = 0.08;
const MAX_PUDDLE = 3;
const SCRUB_AMOUNT = 0.5;

// Dropped from above onto whatever is there, so it lands on top if something was left on the spot
const CARTRIDGE_SPOT = new THREE.Vector3(-8, 10, -INNER + 0.8);
const MOP_SPOT = new THREE.Vector3(-15.5, 0, -INNER + 1);

const printer = { group: null, ink: 1, leaking: false, leakIn: randomBetween(...LEAK_DELAY) };
let printJobs = Promise.resolve();
let dripTimer = 0;

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function isPartOf(object, ancestor) {
    for (; object; object = object.parent) {
        if (object === ancestor) return true;
    }
    return false;
}

function makePaper(image = null) {
    const geometry = new THREE.BoxGeometry(...PAPER_SIZE).translate(0, PAPER_SIZE[1] / 2, 0);
    const blank = () => new THREE.MeshStandardMaterial({ color: 0xf4f4ef });
    const top = image ? new THREE.MeshStandardMaterial({ map: image }) : blank();
    // BoxGeometry faces are +x, -x, +y, -y, +z, -z; the image goes on top
    return new THREE.Mesh(geometry, [blank(), blank(), top, blank(), blank(), blank()]);
}

function makeCartridge() {
    const geometry = new THREE.BoxGeometry(0.7, 0.35, 0.35).translate(0, 0.175, 0);
    const body = () => new THREE.MeshStandardMaterial({ color: 0x222222 });
    const label = new THREE.MeshStandardMaterial({ color: 0xd01f8c });
    return new THREE.Mesh(geometry, [body(), body(), label, body(), label, label]);
}

function makeMop() {
    const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 4.4).translate(0, 2.4, 0),
        new THREE.MeshStandardMaterial({ color: 0x8a5a2b }),
    );
    const head = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.2, 0.4).translate(0, 0.1, 0),
        new THREE.MeshStandardMaterial({ color: 0x3d6fb5 }),
    );
    const mop = new THREE.Group();
    mop.add(stick, head);
    return mop;
}

// Memes from these subreddits, through meme-api.com. Both it and i.redd.it send CORS headers,
// which WebGL needs to use the images
const MEME_SUBREDDITS = ["ItalianBrainrot", "shitposting"];
const MEME_BATCH = 20;
let memeUrls = [];

async function nextMemeUrl() {
    if (memeUrls.length === 0) {
        const subreddit = MEME_SUBREDDITS[Math.floor(Math.random() * MEME_SUBREDDITS.length)];
        const response = await fetch(`https://meme-api.com/gimme/${subreddit}/${MEME_BATCH}`);
        const { memes } = await response.json();
        memeUrls = memes
            .filter((meme) => !meme.nsfw && !meme.spoiler && /\.(png|jpe?g)$/i.test(meme.url))
            .map((meme) => meme.url);
    }
    const url = memeUrls.pop();
    if (!url) throw new Error("No usable memes in batch");
    return url;
}

// A random meme fitted onto a white page, or a doodle if that doesn't load in time
function randomImage() {
    const download = nextMemeUrl()
        .then((url) => new THREE.ImageLoader().loadAsync(url))
        .then(onPage);
    const timeout = new Promise((_, reject) => setTimeout(reject, 8000));

    return Promise.race([download, timeout])
        .catch(doodle)
        .then((texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        });
}

function onPage(image) {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 566;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f4f4ef";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const margin = 16;
    const scale = Math.min(
        (canvas.width - margin * 2) / image.width,
        (canvas.height - margin * 2) / image.height,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return new THREE.CanvasTexture(canvas);
}

function doodle() {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 283;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = `hsl(${Math.random() * 360} 60% 85%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `hsl(${Math.random() * 360} 70% 50%)`;
        ctx.beginPath();
        ctx.arc(
            Math.random() * canvas.width,
            Math.random() * canvas.height,
            10 + Math.random() * 50,
            0,
            Math.PI * 2,
        );
        ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}

// Puddle: a few overlapping blobs, scaled with its size

const inkMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b0b2a,
    roughness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
});
const puddle = new THREE.Group();
for (const [x, z, radius] of [
    [0, 0, 1],
    [0.5, 0.3, 0.7],
    [-0.4, 0.5, 0.6],
    [0.2, -0.5, 0.55],
]) {
    const blob = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), inkMaterial);
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(x, 0, z);
    puddle.add(blob);
}
scene.add(puddle);

let puddleSize = 0;

function setPuddleSize(size) {
    puddleSize = THREE.MathUtils.clamp(size, 0, MAX_PUDDLE);
    puddle.scale.setScalar(Math.max(puddleSize, 0.001));
    puddle.visible = puddleSize > 0.15;
}
setPuddleSize(0);

const hud = document.getElementById("hud");

function spawnCartridge() {
    const cartridge = makeCartridge();
    cartridge.position.copy(firstHit(CARTRIDGE_SPOT, DOWN, Infinity).point);
    scene.add(cartridge);
    addItem(cartridge, "cartridge", spawnCartridge);
}

function scatterPapers() {
    for (let i = 0; i < PAPER_COUNT; i++) {
        let x, z;
        do {
            x = randomBetween(-W + 1.5, W - 1.5);
            z = randomBetween(-D + 1.5, D - 1.5);
        } while (collides(x, z));

        const paper = makePaper();
        paper.position.set(x, 0, z);
        paper.rotation.y = randomBetween(0, Math.PI * 2);
        scene.add(paper);
        addItem(paper, "paper");
    }
}

printerLoaded.then((group) => {
    printer.group = group;
    puddle.position.copy(group.localToWorld(PUDDLE_AT.clone()));
});

Promise.all(loading).then(() => {
    scatterPapers();
    spawnCartridge();

    const mop = makeMop();
    mop.position.copy(MOP_SPOT);
    scene.add(mop);
    addItem(mop, "mop");
});

// Shrinks the item into the printer and removes it
async function swallow(item) {
    removeItem(item);
    await tween(0.5, (t) => item.scale.setScalar(1 - 0.95 * t));
    item.removeFromParent();
}

async function printPage() {
    const inked = printer.ink >= INK_PER_PRINT;
    if (inked) printer.ink -= INK_PER_PRINT;

    const image = inked ? await randomImage() : null;

    const page = makePaper(image);
    page.position.set(0, SLOT_Y, SLOT_START_Z);
    printer.group.add(page);
    await tween(1.5, (t) => {
        page.position.z = THREE.MathUtils.lerp(SLOT_START_Z, SLOT_END_Z, t);
    });

    scene.attach(page);
    addItem(page, inked ? "print" : "paper");
}

// Called with an item that was just dropped while looking at the printer
function feedPrinter(item) {
    const kind = item.userData.kind;
    if (kind === "paper" || kind === "cartridge") {
        item.position.copy(printer.group.localToWorld(PRINTER_TOP.clone()));
    }

    if (kind === "paper") {
        swallow(item);
        printJobs = printJobs.then(printPage);
    } else if (kind === "cartridge") {
        swallow(item);
        printer.ink = 1;
        printer.leaking = false;
        printer.leakIn = randomBetween(...LEAK_DELAY);
    }
}

function drip() {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), inkMaterial);
    const from = printer.group.localToWorld(DRIP_FROM.clone());
    drop.position.copy(from);
    scene.add(drop);
    tween(0.6, (t) => {
        drop.position.y = from.y * (1 - t * t);
    }).then(() => drop.removeFromParent());
}

function updatePrinter(dt) {
    if (!printer.group) return;

    if (!printer.leaking) {
        printer.leakIn -= dt;
        if (printer.leakIn <= 0) printer.leaking = true;
    } else if (printer.ink > 0) {
        printer.ink = Math.max(printer.ink - LEAK_RATE * dt, 0);
        setPuddleSize(puddleSize + PUDDLE_GROWTH * dt);

        dripTimer -= dt;
        if (dripTimer <= 0) {
            drip();
            dripTimer = DRIP_INTERVAL;
        }
    }

    const status = `Printer ink ${Math.round(printer.ink * 100)}%${printer.leaking ? " — leaking!" : ""}`;
    if (hud.textContent !== status) {
        hud.textContent = status;
        hud.classList.toggle("alert", printer.leaking);
    }
}

function scrub() {
    setPuddleSize(puddleSize - SCRUB_AMOUNT);
    const mop = held;
    tween(0.25, (t) => {
        mop.rotation.z = Math.sin(t * Math.PI * 2) * 0.3;
    });
}

// Player

const player = { x: 10, z: 10, yaw: 0, pitch: 0 };
const keys = new Set();

const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD"];

window.addEventListener("keydown", (e) => {
    if (e.code.startsWith("Arrow")) {
        keys.add(e.code);
        e.preventDefault();
    } else if (MOVE_KEYS.includes(e.code)) {
        keys.add(e.code);
    }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

// The first click only captures the mouse; after that left click interacts
renderer.domElement.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (document.pointerLockElement === renderer.domElement) interact();
    else renderer.domElement.requestPointerLock();
});
window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    player.yaw -= e.movementX * MOUSE_SENSITIVITY;
    player.pitch -= e.movementY * MOUSE_SENSITIVITY;
    player.pitch = THREE.MathUtils.clamp(player.pitch, -MAX_PITCH, MAX_PITCH);
});

function collides(x, z) {
    return colliders.some(
        (box) =>
            x + PLAYER_RADIUS > box.min.x &&
            x - PLAYER_RADIUS < box.max.x &&
            z + PLAYER_RADIUS > box.min.z &&
            z - PLAYER_RADIUS < box.max.z,
    );
}

function updatePlayer(dt) {
    if (keys.has("ArrowLeft")) player.yaw += TURN_SPEED * dt;
    if (keys.has("ArrowRight")) player.yaw -= TURN_SPEED * dt;

    const move = new THREE.Vector2();
    if (keys.has("ArrowUp") || keys.has("KeyW")) move.y += 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) move.y -= 1;
    if (keys.has("KeyD")) move.x += 1;
    if (keys.has("KeyA")) move.x -= 1;
    move.normalize().multiplyScalar(MOVE_SPEED * dt);

    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const dx = -sin * move.y + cos * move.x;
    const dz = -cos * move.y - sin * move.x;

    // Resolve each axis separately so the player slides along walls instead of sticking
    if (!collides(player.x + dx, player.z)) player.x += dx;
    if (!collides(player.x, player.z + dz)) player.z += dz;

    camera.position.set(player.x, EYE_HEIGHT, player.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
}

// Items

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
    const targets = [...surfaces, ...items.filter((item) => item !== held)];
    if (puddle.visible) targets.push(puddle);
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

    if (printer.group && isPartOf(aimed?.object, printer.group)) feedPrinter(item);
}

function interact() {
    if (held?.userData.kind === "mop") {
        const hit = lookHit();
        if (hit && isPartOf(hit.object, puddle)) return scrub();
    }

    if (held) drop();
    else if (target) pickUp(target);
}

// Music

// Both versions play in sync the whole time and only their volumes change, so switching rooms
// never makes the song jump
const audio = new AudioContext();
const MUSIC = {
    shop: "music/ld60_generic_01.mp3",
    storage: "music/ld60_generic_01_storage_room.mp3",
};
const CROSSFADE = 0.3;

let musicGains = null;
let musicRoom = null;

async function loadTrack(url) {
    const response = await fetch(url);
    return audio.decodeAudioData(await response.arrayBuffer());
}

async function startMusic() {
    const names = Object.keys(MUSIC);
    const buffers = await Promise.all(names.map((name) => loadTrack(MUSIC[name])));

    // Same start time and loop length for both, so decoding differences can't make them drift
    const startAt = audio.currentTime + 0.1;
    const loopEnd = Math.min(...buffers.map((buffer) => buffer.duration));

    const gains = {};
    names.forEach((name, i) => {
        const source = audio.createBufferSource();
        source.buffer = buffers[i];
        source.loop = true;
        source.loopEnd = loopEnd;

        const gain = audio.createGain();
        gain.gain.value = 0;
        source.connect(gain).connect(audio.destination);
        source.start(startAt);
        gains[name] = gain;
    });
    musicGains = gains;
}

startMusic();

// Browsers keep audio suspended until the player interacts with the page
for (const event of ["keydown", "click"]) {
    window.addEventListener(event, () => audio.resume());
}

function updateMusic() {
    const room = player.x < PARTITION_X ? "storage" : "shop";
    if (!musicGains || room === musicRoom) return;
    musicRoom = room;

    const now = audio.currentTime;
    for (const [name, gain] of Object.entries(musicGains)) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(name === room ? 1 : 0, now + CROSSFADE);
    }
}

const timer = new THREE.Timer();

function animate(time) {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    updatePlayer(dt);
    updateTarget();
    updateTweens(dt);
    updatePrinter(dt);
    updateMusic();
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
