import { W, INNER, WALL_THICKNESS, PARTITION_X } from "./layout.js";
import { STOCK } from "../game/stock.js";

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

    return {
        printerLoaded, shopShelvesLoaded: Promise.all(shopShelves), counterLoaded, addExtraShelf,
        stockCapacity: (label) => capacity[label] ?? 0,
    };
}
