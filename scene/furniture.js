import { W, INNER, WALL_THICKNESS } from "./layout.js";
import { STOCK } from "../game/stock.js";

// Shelves are open on local +Z; rotate that side towards the aisle.
const FACE_UP = Math.PI;
const FACE_LEFT = -Math.PI / 2;
const FACE_RIGHT = Math.PI / 2;

export function createFurniture({ spawn, shelfSlots, restock, spawnShelf }) {
    const PRINTER = { x: -12, z: -INNER + 1.2 };
    const printerLoaded = spawn("printer", PRINTER);

    // Restocking shelf, L-shaped in the bottom left corner. Always kept full, with each shelf holding
    // its own item, numbered along the L starting from the left wall
    const RESTOCK_SHELVES = [
        { x: -W + WALL_THICKNESS / 2 + 1, z: 9, rotation: FACE_RIGHT },
        ...[-16, -12, -8].map((x) => ({ x, z: INNER - 1, rotation: FACE_UP })),
    ];
    RESTOCK_SHELVES.forEach((shelf, i) => {
        spawnShelf(shelf, STOCK[i]);
        for (const slot of shelfSlots(shelf)) restock({ ...slot, stock: STOCK[i] });
    });

    // Double-sided shelf island in the middle, where each row holds one item on both sides, from
    // Item 1 at the top
    let firstCustomerShelfLoaded;
    [-6, -2, 2, 6].forEach((z, i) => {
        const shelfLoaded = spawnShelf({ x: 3, z, rotation: FACE_LEFT }, STOCK[i]);
        firstCustomerShelfLoaded ??= shelfLoaded;
        spawnShelf({ x: 5, z, rotation: FACE_RIGHT }, STOCK[i]);
    });

    // Shelf along the right wall, for Item 1 and 2 again
    [-9, -5].forEach((z, i) => {
        spawnShelf({ x: W - WALL_THICKNESS / 2 - 1, z, rotation: FACE_LEFT }, STOCK[i]);
    });

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

    return { printerLoaded, firstCustomerShelfLoaded, counterLoaded };
}
