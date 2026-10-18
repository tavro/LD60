import * as THREE from "three";
import { settings } from "../settings.js";
import { W, D, INNER, PARTITION_X } from "../scene/layout.js";
import { randomBetween, isPartOf } from "./utils.js";
import { randomImage } from "./print-images.js";
import { playSfx } from "./sfx.js";
import { createPixelPuddle } from "./puddles.js";
import { PIXEL_FONT, pixelCanvasTexture } from "./font.js";
import { stockFor } from "./stock.js";

export function createPrinterSystem({ scene, items, collides, tween, printerLoaded, retag, speech }) {
    const { addItem, removeItem, firstHit } = items;
    const DOWN = new THREE.Vector3(0, -1, 0);

    const PAPER_SIZE = [0.8, 0.02, 1.13];
    const PAPER_COUNT = 10;
    // Height difference between sheets lying on the floor, too small to see
    const PAPER_LIFT = 0.003;
    // Papers lie around the printer, this far from it
    const PAPER_SPREAD = [1.5, 5];

    // Printer model space, after centering: the slot runs the full width at y 2-2.25, from z -0.6 to
    // the front at z 1.1
    const SLOT_Y = 2.0;
    const SLOT_START_Z = -0.1;
    const SLOT_END_Z = 1.35;
    const PRINTER_TOP = new THREE.Vector3(-0.45, 3.25, 0.25);
    // The ink display standing at the back of the raised left part of the top, behind where things
    // are put, facing the front, and where the printer's speech bubbles come from
    const DISPLAY_AT = new THREE.Vector3(-0.45, 3.25, -0.75);
    const BUBBLE_AT = new THREE.Vector3(0, 4.2, 0.5);
    const DRIP_FROM = new THREE.Vector3(0.8, 2.0, 1.1);
    const PUDDLE_AT = new THREE.Vector3(0.8, 0.02, 1.6);

    const INK_PER_PRINT = 0.1;
    const INK_PER_STICKER = 0.05;
    const LEAK_RATE = 0.008;
    const LEAK_DELAY = [90, 150];
    const DRIP_INTERVAL = 0.3;
    const PUDDLE_GROWTH = 0.03;
    const MAX_PUDDLE = 3;
    const SCRUB_AMOUNT = 0.5;
    // How far past the puddle's edge the mop still reaches, and the size below which it's gone
    const SCRUB_MARGIN = 2;
    const CLEAN_BELOW = 0.3;

    // Dropped from above onto whatever is there, so it lands on top if something was left on the spot
    const CARTRIDGE_SPOT = new THREE.Vector3(-8, 10, -INNER + 0.8);
    const MOP_SPOT = new THREE.Vector3(-15.5, 0, -INNER + 1);

    const printer = { group: null, ink: 1, leaking: false, leakIn: randomBetween(...LEAK_DELAY) };
    let printJobs = Promise.resolve();
    // Running totals, for the tutorial to follow along
    const stats = { prints: 0, retags: 0 };
    let dripTimer = 0;

    //printer sound effect
    const printerSound = new Audio("sound_effects/printer.ogg");
    printerSound.type = 'audio/ogg';
    printerSound.preload = "auto";
    printerSound.volume = 0.6;

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

    // Puddle: pixel-art blobs that grow with its size

    const inkMaterial = new THREE.MeshStandardMaterial({
        color: 0x0b0b2a,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
    });
    const puddle = new THREE.Group();
    const pixelPuddle = createPixelPuddle({
        color: 0x0b0b2a,
        blobs: [[0, 0, 1], [0.5, 0.3, 0.7], [-0.4, 0.5, 0.6], [0.2, -0.5, 0.55]],
        maxSize: MAX_PUDDLE,
    });
    puddle.add(pixelPuddle.mesh);
    puddle.userData.shadow = "receive";
    scene.add(puddle);

    let puddleSize = 0;

    function setPuddleSize(size) {
        puddleSize = THREE.MathUtils.clamp(size, 0, MAX_PUDDLE);
        pixelPuddle.setSize(puddleSize);
        puddle.visible = puddleSize > 0.15;
    }
    setPuddleSize(0);

    function spawnCartridge() {
        // Supplies can spawn before the first render; apply floor transforms before raycasting.
        scene.updateMatrixWorld(true);
        const cartridge = makeCartridge();
        cartridge.position.copy(firstHit(CARTRIDGE_SPOT, DOWN, Infinity).point);
        scene.add(cartridge);
        addItem(cartridge, "cartridge", spawnCartridge);
    }

    // On the storage room floor around the printer
    function scatterPapers() {
        const { x: printerX, z: printerZ } = printer.group.position;
        for (let i = 0; i < PAPER_COUNT; i++) {
            let x, z;
            do {
                const angle = randomBetween(0, Math.PI * 2);
                const distance = randomBetween(...PAPER_SPREAD);
                x = printerX + Math.cos(angle) * distance;
                z = printerZ + Math.sin(angle) * distance;
            } while (x < -W + 1.5 || x > PARTITION_X - 1.5 || Math.abs(z) > D - 1.5 || collides(x, z));

            // Each a hair higher than the last, so overlapping sheets don't flicker
            const paper = makePaper();
            paper.position.set(x, i * PAPER_LIFT, z);
            paper.rotation.y = randomBetween(0, Math.PI * 2);
            scene.add(paper);
            addItem(paper, "paper");
        }
    }

    // Ink display: a little screen with the ink level as a bar of pixels, flashing a warning when
    // the cartridge is leaking or empty

    const DISPLAY_PIXELS = [64, 24];
    const displayCanvas = document.createElement("canvas");
    [displayCanvas.width, displayCanvas.height] = DISPLAY_PIXELS;
    const displayContext = displayCanvas.getContext("2d");
    const displayTexture = pixelCanvasTexture(displayCanvas);
    let displayShows = "";
    let blink = 0;

    function makeDisplay() {
        const display = new THREE.Group();
        const casing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.12).translate(0, 0.25, 0),
            new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
        // Lit up, so it can be read in the dark corner
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.36),
            new THREE.MeshBasicMaterial({ map: displayTexture, toneMapped: false }));
        screen.position.set(0, 0.25, 0.061);
        display.add(casing, screen);
        display.position.copy(DISPLAY_AT);
        display.rotation.x = -0.25;
        return display;
    }

    function drawDisplay(dt) {
        blink = (blink + dt) % 1;
        const empty = printer.ink < INK_PER_STICKER;
        const flash = blink < 0.5;
        const text = empty ? (flash ? "NO INK" : "") : printer.leaking && flash ? "LEAK!" : "INK";
        const bars = Math.ceil(printer.ink * 10);
        const shows = `${text}|${bars}`;
        if (shows === displayShows) return;
        displayShows = shows;

        const [width, height] = DISPLAY_PIXELS;
        const ctx = displayContext;
        ctx.fillStyle = empty ? "#3a0c0c" : "#0f2a12";
        ctx.fillRect(0, 0, width, height);
        ctx.font = `8px ${PIXEL_FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = empty || printer.leaking ? "#ff5a4a" : "#8cf27a";
        ctx.fillText(text, width / 2, 3);
        // Ten bars, lit for the ink that's left
        for (let i = 0; i < 10; i++) {
            ctx.fillStyle = i < bars ? (bars <= 2 ? "#ff5a4a" : "#8cf27a") : "#26402a";
            ctx.fillRect(4 + i * 6, 14, 4, 6);
        }
        displayTexture.needsUpdate = true;
    }

    // Says something in a speech bubble over the printer
    const bubbleAnchor = new THREE.Object3D();
    scene.add(bubbleAnchor);

    function say(text) {
        speech.say(bubbleAnchor, text, 3, 0);
    }

    printerLoaded.then((group) => {
        printer.group = group;
        puddle.position.copy(group.localToWorld(PUDDLE_AT.clone()));
        group.add(makeDisplay());
        bubbleAnchor.position.copy(group.localToWorld(BUBBLE_AT.clone()));
        drawDisplay(0);
    });

    function initialize() {
        scatterPapers();
        spawnCartridge();

        const mop = makeMop();
        mop.position.copy(MOP_SPOT);
        scene.add(mop);
        addItem(mop, "mop");
    }

    // Shrinks the item into the printer and removes it
    async function swallow(item) {
		playSfx("electricPress");
        removeItem(item);
        await tween(0.5, (t) => item.scale.setScalar(1 - 0.95 * t));
        item.removeFromParent();
    }

    async function printPage() {
        const inked = printer.ink >= INK_PER_PRINT;
        if (inked) printer.ink -= INK_PER_PRINT;

        if (!inked) say("NO INK! Blank page");
        const image = inked ? await randomImage() : null;

        //printer sound
        if (inked) {
            printerSound.currentTime = 0;
            printerSound.volume = 0.6 * settings.sfxVolume;
            printerSound.play().catch((err) => console.warn("Printer sound failed to play:", err));
        }

        const page = makePaper(image);
        page.position.set(0, SLOT_Y, SLOT_START_Z);
        printer.group.add(page);
        await tween(1.5, (t) => {
            page.position.z = THREE.MathUtils.lerp(SLOT_START_Z, SLOT_END_Z, t);
        });

        // Then it slips off the end and flutters down to the floor in front of the printer
        const landX = randomBetween(-0.4, 0.4);
        const landZ = SLOT_END_Z + randomBetween(0.4, 0.9);
        const spin = randomBetween(-0.8, 0.8);
        // Slightly off the floor by a random hair, so it doesn't flicker against a page under it
        const landY = randomBetween(1, 10) * PAPER_LIFT;
        await tween(0.7, (t) => {
            page.position.set(landX * t, THREE.MathUtils.lerp(SLOT_Y, landY, t * t), THREE.MathUtils.lerp(SLOT_END_Z, landZ, t));
            page.rotation.set(Math.sin(t * Math.PI) * 0.4, spin * t, 0);
        });

		playSfx("electricSuccess");
        scene.attach(page);
        addItem(page, inked ? "print" : "paper");
        if (inked) stats.prints++;
    }

    // Called with an item that was just dropped while looking at the printer. Boxes get a new
    // sticker with the right price, when there's ink for it, and stay on top
    function feedPrinter(item) {
        const kind = item.userData.kind;
        if (kind === "box") retagBox(item);
        if (kind === "paper" || kind === "cartridge") {
            item.position.copy(printer.group.localToWorld(PRINTER_TOP.clone()));
        }

        if (kind === "paper") {
            swallow(item);
            printJobs = printJobs.then(printPage);
        } else if (kind === "cartridge") {
            swallow(item);
            refill();
            say("Ink full!");
        }
    }

    // A new sticker with the right price, if it needs one and there's ink for it. It stays on top
    function retagBox(item) {
        const { price } = stockFor(item.userData.label);
        if (item.userData.tagPrice === price) {
            say(`Tag OK: $${price}`);
            return;
        }
        if (printer.ink < INK_PER_STICKER) {
            say("NO INK! Can't print tag");
            playSfx("electricError");
            return;
        }
        // Swelling a little as the new sticker goes on
        const scale = item.scale.x;
        item.position.copy(printer.group.localToWorld(PRINTER_TOP.clone()));
        printer.ink -= INK_PER_STICKER;
        retag(item);
        stats.retags++;
        say(`Relabeled: $${price}`);
        playSfx("electricSuccess");
        tween(0.3, (t) => item.scale.setScalar(scale * (1 + Math.sin(t * Math.PI) * 0.15)));
    }

    function drip() {
        // A little cube, like a pixel of ink
        const drop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), inkMaterial);
        const from = printer.group.localToWorld(DRIP_FROM.clone());
        drop.position.copy(from);
        scene.add(drop);
        tween(0.6, (t) => {
            drop.position.y = from.y * (1 - t * t);
        }).then(() => drop.removeFromParent());
    }

    function updatePrinter(dt) {
        if (!printer.group) return;
        drawDisplay(dt);

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

    }

    function scrub() {
        const size = puddleSize - SCRUB_AMOUNT;
        setPuddleSize(size < CLEAN_BELOW ? 0 : size);
    }

    function handleDrop(item, hit) {
        if (printer.group && isPartOf(hit?.object, printer.group)) feedPrinter(item);
    }

    // Anywhere on or near the puddle; its blobs reach about 1.5 times its size from the middle
    function tryScrub(hit) {
        if (!hit || !puddle.visible) return false;
        const distance = Math.hypot(hit.point.x - puddle.position.x, hit.point.z - puddle.position.z);
        if (distance > puddleSize * 1.5 + SCRUB_MARGIN) return false;
        scrub();
        return true;
    }

    // Whether that spot on the floor is in the ink puddle
    function inInk(x, z) {
        return puddle.visible && Math.hypot(x - puddle.position.x, z - puddle.position.z) < puddleSize * 1.3;
    }

    // A full cartridge with no leak for a while, as if one was just put in
    function refill() {
        printer.ink = 1;
        printer.leaking = false;
        printer.leakIn = randomBetween(...LEAK_DELAY);
    }

    return { initialize, update: updatePrinter, puddle, handleDrop, tryScrub, inInk, refill, stats };
}
