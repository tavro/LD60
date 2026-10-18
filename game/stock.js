import * as THREE from "three";
import { PIXEL_FONT, pixelCanvasTexture } from "./font.js";

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// The items that get restocked, each with a color shared by its box stickers and shelf signs
export const STOCK = [
    // `model` and `scale` are the item's model, if it isn't a placeholder box
    { label: "Mouse", color: "#c8322a", price: 3, model: "mouse", scale: 2 },
    { label: "Item 2", color: "#2a6fc8", price: 5 },
    { label: "Item 3", color: "#2e9a48", price: 8 },
    { label: "Item 4", color: "#e09a12", price: 12 },
];

// Some boxes come with the wrong price on their sticker, off by one of these amounts. The shelf
// signs always show the real price, and the printer reprints a box's sticker
const WRONG_TAG_CHANCE = 0.15;
const WRONG_TAG_OFFSETS = [-2, -1, 1, 2, 3];

export function stockFor(label) {
    return STOCK.find((stock) => stock.label === label);
}

// `slots` collects every spot on every shelf, for boxes to snap to when put down
export function createStockSystem({ spawn, addItem, slots }) {
    const SHELF_LEVELS = [0.1, 1.6, 3.1, 4.6];
    const SHELF_COLUMNS = [-1.2, 0, 1.2];

    // Where items go on a shelf placed with the given spawn options
    function shelfSlots({ x, z, rotation }) {
        const shelf = new THREE.Object3D();
        shelf.position.set(x, 0, z);
        shelf.rotation.y = rotation;
        shelf.updateMatrixWorld();

        return SHELF_LEVELS.flatMap((y, level) =>
            SHELF_COLUMNS.map((column) => ({
                position: shelf.localToWorld(new THREE.Vector3(column, y, 0)),
                rotation,
                level,
            })),
        );
    }

    // Label stickers on the front of boxes (their local +z side, which faces out of the shelf)
    const LABEL_GEOMETRY = new THREE.PlaneGeometry(0.9, 0.34);
    const labelTextures = {};

    // The item's name and a price, in a border of its color
    function labelTexture({ label, color }, price) {
        const key = `${label} $${price}`;
        if (!labelTextures[key]) {
            // Small, so the pixel font's pixels show
            const canvas = document.createElement("canvas");
            canvas.width = 96;
            canvas.height = 36;
            // Bars of the item's color around the edge
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#f4f4ef";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.width, 4);
            ctx.fillRect(0, canvas.height - 4, canvas.width, 4);
            ctx.fillRect(0, 0, 4, canvas.height);
            ctx.fillRect(canvas.width - 4, 0, 4, canvas.height);
            ctx.fillStyle = "#222";
            ctx.font = `8px ${PIXEL_FONT}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(key, canvas.width / 2, canvas.height / 2, canvas.width - 10);

            labelTextures[key] = pixelCanvasTexture(canvas);
        }
        return labelTextures[key];
    }

    // Sign on top of a shelf, at the front of its open side, saying which item belongs there
    const SIGN_SIZE = [2.4, 0.9, 0.1];

    async function spawnShelf(options, stock) {
        slots.push(...shelfSlots(options));
        const shelf = await spawn("shelf", options);
        shelf.userData.stock = stock.label;

        const back = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const front = new THREE.MeshStandardMaterial({ map: labelTexture(stock, stock.price) });
        // BoxGeometry faces are +x, -x, +y, -y, +z, -z; the label goes on the front
        const sign = new THREE.Mesh(new THREE.BoxGeometry(...SIGN_SIZE), [back, back, back, back, front, back]);
        const { y: height, z: depth } = shelf.userData.size;
        sign.position.set(0, height + SIGN_SIZE[1] / 2, depth / 2 - SIGN_SIZE[2]);
        shelf.add(sign);
        return shelf;
    }

    async function placeBox(slot, onTaken = null) {
        const { stock } = slot;
        const item = await spawn(stock.model ?? "placeholder", {
            ...slot.position,
            rotation: slot.rotation,
            scale: stock.scale ?? 1,
            solid: false,
        });
        // Own materials so highlighting one item doesn't light up all of them
        item.traverse((child) => {
            if (!child.isMesh) return;
            child.material = Array.isArray(child.material)
                ? child.material.map((m) => m.clone())
                : child.material.clone();
        });

        // `slot.tagPrice` sets the sticker's price instead of leaving it to chance
        const wrong = Math.random() < WRONG_TAG_CHANCE;
        const tagPrice = slot.tagPrice ?? (wrong ? Math.max(1, stock.price + pick(WRONG_TAG_OFFSETS)) : stock.price);

        const label = new THREE.Mesh(
            LABEL_GEOMETRY,
            new THREE.MeshStandardMaterial({ map: labelTexture(stock, tagPrice) }),
        );
        // On the front of boxes, or lying on top of flat things like the mouse, tilted towards the
        // front, sized to fit
        const size = item.userData.size;
        if (size.y >= 0.6) {
            label.position.set(0, size.y / 2, size.z / 2 + 0.005);
        } else {
            label.position.set(0, size.y + 0.02, 0);
            label.rotation.x = -Math.PI / 2 + 0.6;
            label.scale.setScalar(Math.min(1, size.x / 0.9));
        }
        item.add(label);
        item.userData.label = stock.label;
        item.userData.tagPrice = tagPrice;
        item.userData.sticker = label;

        return addItem(item, "box", onTaken);
    }

    // Gives the box a sticker with the right price
    function retag(item) {
        const stock = stockFor(item.userData.label);
        item.userData.tagPrice = stock.price;
        item.userData.sticker.material.map = labelTexture(stock, stock.price);
    }

    return { shelfSlots, placeBox, spawnShelf, retag };
}
