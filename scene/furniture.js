import { W, INNER, WALL_THICKNESS, PARTITION_X } from "./layout.js";
import * as THREE from "three";
import { STOCK } from "../game/stock.js";
import { pixelateLighting } from "./lighting.js";

// Shelves are open on local +Z; rotate that side towards the aisle.
const FACE_UP = Math.PI;
const FACE_LEFT = -Math.PI / 2;
const FACE_RIGHT = Math.PI / 2;

// Shop shelves start with this many boxes each, in random spots, turned by up to SLOT_TWIST (radians)
const START_STOCK = [2, 6];
const SLOT_TWIST = 0.2;

function shuffled(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// The desk's pixel-art look, in pixels PIXEL units across, the size of the light and shadow pixels:
// a light speckled laminate top, and dark panels PANEL_WIDTH wide around the sides
const PIXEL = 0.25;
const PANEL_WIDTH = 4;

function pixelTexture(width, height, paint) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            ctx.fillStyle = paint(x, y);
            ctx.fillRect(x, y, 1, 1);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

const shade = (hex, amount) => `#${new THREE.Color(hex).offsetHSL(0, 0, amount).getHexString()}`;

function laminateTexture() {
    return pixelTexture(16, 16, () => {
        const roll = Math.random();
        return roll > 0.9 ? "#9c9a94" : roll > 0.8 ? "#e2dfd8" : shade("#c9c6bf", (Math.random() - 0.5) * 0.02);
    });
}

// A panel as tall as the desk, with a lighter edge along the top, a groove down one side and a
// dark kick plate along the floor
function panelTexture(height) {
    const pixels = Math.round(height / PIXEL);
    return pixelTexture(PANEL_WIDTH / PIXEL, pixels, (x, y) => {
        if (y === 0) return "#8a9098";
        if (y === pixels - 1) return "#3a3e44";
        if (x === 0) return "#4a5057";
        return shade("#646b74", (Math.random() - 0.5) * 0.03);
    });
}

// Faces looking up get the laminate, and the rest the panels, laid out by where each face is so the
// pixels are the same size all over. Unless the model comes with a texture of its own
function dressDesk(desk) {
    desk.traverse((mesh) => {
        if (!mesh.isMesh || mesh.material.map) return;
        // Split into separate triangles, sorted so the ones facing up come first and can have the
        // laminate while the rest have the panels
        const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        flat.computeBoundingBox();
        const { min, max } = flat.boundingBox;
        const height = max.y - min.y;
        const triangles = [];
        for (let i = 0; i < flat.attributes.position.count; i += 3) triangles.push(i);
        const facesUp = (i) => flat.attributes.normal.getY(i) > 0.5;
        triangles.sort((a, b) => facesUp(b) - facesUp(a));

        const geometry = new THREE.BufferGeometry();
        for (const name of ["position", "normal", "uv"]) {
            const source = flat.attributes[name];
            const attribute = new THREE.BufferAttribute(new Float32Array(source.array.length), source.itemSize);
            triangles.forEach((from, to) => {
                for (let k = 0; k < 3; k++) attribute.copyAt(to * 3 + k, source, from + k);
            });
            geometry.setAttribute(name, attribute);
        }

        // Texture coordinates from where each corner is: across the top, and along and up the sides
        // with the panels' top edge at the top of the desk
        const { position, normal, uv } = geometry.attributes;
        for (let i = 0; i < position.count; i++) {
            const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
            const [nx, ny] = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i))];
            if (ny > 0.5) uv.setXY(i, x / 4, z / 4);
            else uv.setXY(i, (nx > 0.5 ? z : x) / PANEL_WIDTH, (y - min.y) / height);
        }
        const up = triangles.filter(facesUp).length * 3;
        geometry.addGroup(0, up, 0);
        geometry.addGroup(up, position.count - up, 1);

        mesh.geometry = geometry;
        mesh.material = [
            pixelateLighting(new THREE.MeshStandardMaterial({ map: laminateTexture(), roughness: 0.7 })),
            pixelateLighting(new THREE.MeshStandardMaterial({ map: panelTexture(height), roughness: 0.85 })),
        ];
    });
}

export function createFurniture({ spawn, shelfSlots, placeBox, spawnShelf }) {
    const PRINTER = { x: -12, z: -INNER + 1.2 };
    const printerLoaded = spawn("printer", PRINTER);

    // Restocking shelf, L-shaped in the bottom left corner, with each shelf holding its own item,
    // numbered along the L starting from the left wall. They start empty; deliveries must be
    // unpacked and shelved by the player after shifts.
    const RESTOCK_SHELVES = [
        { x: -W + WALL_THICKNESS / 2 + 1, z: 9, rotation: FACE_RIGHT },
        ...[-16, -12, -8].map((x) => ({ x, z: INNER - 1, rotation: FACE_UP })),
    ];
    const storageSlots = RESTOCK_SHELVES.flatMap((shelf, i) => {
        spawnShelf(shelf, STOCK[i]);
        return shelfSlots(shelf).map((slot) => ({ ...slot, stock: STOCK[i] }));
    });
    const capacity = Object.fromEntries(STOCK.map(({ label }) => [label,
        storageSlots.filter((slot) => slot.stock.label === label).length,
    ]));

    // Shop shelves, where customers take what they buy. Each starts with a few boxes of its item
    const shopShelves = [];

    function spawnShopShelf(options, stock) {
        capacity[stock.label] += shelfSlots(options).length;
        const count = START_STOCK[0] + Math.floor(Math.random() * (START_STOCK[1] - START_STOCK[0] + 1));
        for (const slot of shuffled(shelfSlots(options)).slice(0, count)) {
            const twist = (Math.random() * 2 - 1) * SLOT_TWIST;
            placeBox({ ...slot, rotation: slot.rotation + twist, stock });
        }
        shopShelves.push(spawnShelf(options, stock));
    }

    // Double-sided shelf island in the middle, where each row holds one item on both sides, from
    // Item 1 at the top
    [-6, -2, 2, 6].forEach((z, i) => {
        spawnShopShelf({ x: 3, z, rotation: FACE_LEFT }, STOCK[i]);
        spawnShopShelf({ x: 5, z, rotation: FACE_RIGHT }, STOCK[i]);
    });

    // Shelf along the right wall, for Item 1 and 2 again
    [-9, -5].forEach((z, i) => {
        spawnShopShelf({ x: W - WALL_THICKNESS / 2 - 1, z, rotation: FACE_LEFT }, STOCK[i]);
    });

    // Bought as upgrades: shelves along the shop side of the partition
    const EXTRA_SHELVES = [
        { x: PARTITION_X + WALL_THICKNESS / 2 + 1, z: 3, rotation: FACE_RIGHT, stock: STOCK[2] },
        { x: PARTITION_X + WALL_THICKNESS / 2 + 1, z: 8, rotation: FACE_RIGHT, stock: STOCK[3] },
    ];

    function addExtraShelf(index) {
        const { stock, ...options } = EXTRA_SHELVES[index];
        spawnShopShelf(options, stock);
        return shopShelves.at(-1);
    }

    // Desk in the bottom right corner: counter along the room side, with two legs reaching towards the
    // right wall and a gap between them to stand in. Leaves a walkway to the walls behind it
    const counterLoaded = spawn("desk", {
        x: 15.25,
        z: 7.25,
        rotation: -Math.PI / 2,
        parts: [
            [-4, 0, 4, 2], // counter, including the overhang at the end without a leg
            [-2, -2, 0, 0],
            [2, -2, 4, 0],
        ],
    });
    counterLoaded.then(dressDesk);

    return {
        printerLoaded, shopShelvesLoaded: Promise.all(shopShelves), counterLoaded, addExtraShelf,
        stockCapacity: (label) => capacity[label] ?? 0,
    };
}
