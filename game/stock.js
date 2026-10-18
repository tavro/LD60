import * as THREE from "three";
import { PIXEL_FONT, pixelCanvasTexture } from "./font.js";

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// The items that get restocked, each with a color shared by its box stickers and shelf signs
export const STOCK = [
    // `model` and `scale` are the item's model, if it isn't a placeholder box. `sticker: "top"` puts
    // the price sticker on top even on taller items, where the front has something to show
    { label: "Mouse", color: "#c8322a", price: 3, model: "mouse", scale: 2 },
    { label: "Tape recorder", color: "#2a6fc8", price: 5, model: "tape_recorder", scale: 2.5 },
    { label: "Phone", color: "#2e9a48", price: 8, model: "phone", scale: 2.5 },
    { label: "Camera", color: "#e09a12", price: 12, model: "camera", scale: 0.75, sticker: "top" },
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
    const LABEL_WIDTH = 0.9;
    const LABEL_GEOMETRY = new THREE.PlaneGeometry(LABEL_WIDTH, 0.34);
    // Sticker texture width in pixels for a short name
    const LABEL_PIXELS = 96;
    const labelTextures = {};

    // The item's name and a price, in a border of its color
    function labelTexture({ label, color }, price) {
        const key = `${label} $${price}`;
        if (!labelTextures[key]) {
            // Small, so the pixel font's pixels show, and wider than LABEL_PIXELS for long names
            // rather than squeezing the text
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            ctx.font = `8px ${PIXEL_FONT}`;
            canvas.width = Math.max(LABEL_PIXELS, Math.ceil(ctx.measureText(key).width / 2) * 2 + 16);
            canvas.height = 36;
            // Bars of the item's color around the edge
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
            ctx.fillText(key, canvas.width / 2, canvas.height / 2);

            const texture = pixelCanvasTexture(canvas);
            // How much wider than usual it is, for the sticker or sign to widen with it
            texture.userData.widthScale = canvas.width / LABEL_PIXELS;
            labelTextures[key] = texture;
        }
        return labelTextures[key];
    }

    // Puts the texture on a sticker, widened for long names but no wider than `maxWidth`, shrinking
    // it all over if needed
    function fitSticker(sticker, texture, maxWidth) {
        sticker.material.map = texture;
        const widthScale = texture.userData.widthScale;
        const scale = Math.min(1, maxWidth / (LABEL_WIDTH * widthScale));
        sticker.scale.set(scale * widthScale, scale, scale);
        sticker.userData.maxWidth = maxWidth;
    }

    // Sign on top of a shelf, at the front of its open side, saying which item belongs there
    const SIGN_SIZE = [2.4, 0.9, 0.1];

    async function spawnShelf(options, stock) {
        slots.push(...shelfSlots(options));
        const shelf = await spawn("shelf", options);
        shelf.userData.stock = stock.label;

        const back = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const texture = labelTexture(stock, stock.price);
        const front = new THREE.MeshStandardMaterial({ map: texture });
        // BoxGeometry faces are +x, -x, +y, -y, +z, -z; the label goes on the front. Wider for long names
        const sign = new THREE.Mesh(new THREE.BoxGeometry(...SIGN_SIZE), [back, back, back, back, front, back]);
        sign.scale.x = texture.userData.widthScale;
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

        const label = new THREE.Mesh(LABEL_GEOMETRY, new THREE.MeshStandardMaterial());
        // On the front of boxes, or lying on top of flat things like the mouse, tilted towards the
        // front, sized to fit
        const size = item.userData.size;
        if (size.y >= 0.6 && stock.sticker !== "top") {
            label.position.set(0, size.y / 2, size.z / 2 + 0.005);
        } else {
            label.position.set(0, size.y + 0.02, 0);
            label.rotation.x = -Math.PI / 2 + 0.6;
        }
        fitSticker(label, labelTexture(stock, tagPrice), size.x * 1.05);
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
        const sticker = item.userData.sticker;
        fitSticker(sticker, labelTexture(stock, stock.price), sticker.userData.maxWidth);
    }

    return { shelfSlots, placeBox, spawnShelf, retag };
}
