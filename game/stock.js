import * as THREE from "three";

// The items that get restocked, each with a color shared by its box stickers and shelf signs
export const STOCK = [
    { label: "Item 1", color: "#c8322a", price: 3 },
    { label: "Item 2", color: "#2a6fc8", price: 5 },
    { label: "Item 3", color: "#2e9a48", price: 8 },
    { label: "Item 4", color: "#e09a12", price: 12 },
];

export function createStockSystem({ spawn, addItem }) {
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

    function labelTexture({ label, color }) {
        if (!labelTextures[label]) {
            const canvas = document.createElement("canvas");
            canvas.width = 512;
            canvas.height = 192;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#f4f4ef";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = color;
            ctx.lineWidth = 24;
            ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
            ctx.fillStyle = "#222";
            ctx.font = "bold 104px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, canvas.width / 2, canvas.height / 2);

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            labelTextures[label] = texture;
        }
        return labelTextures[label];
    }

    // Sign on top of a shelf, at the front of its open side, saying which item belongs there
    const SIGN_SIZE = [2.4, 0.9, 0.1];

    async function spawnShelf(options, stock) {
        const shelf = await spawn("shelf", options);
        shelf.userData.stock = stock.label;

        const back = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const front = new THREE.MeshStandardMaterial({ map: labelTexture(stock) });
        // BoxGeometry faces are +x, -x, +y, -y, +z, -z; the label goes on the front
        const sign = new THREE.Mesh(new THREE.BoxGeometry(...SIGN_SIZE), [back, back, back, back, front, back]);
        const { y: height, z: depth } = shelf.userData.size;
        sign.position.set(0, height + SIGN_SIZE[1] / 2, depth / 2 - SIGN_SIZE[2]);
        shelf.add(sign);
        return shelf;
    }

    async function placeBox(slot, onTaken = null) {
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
            new THREE.MeshStandardMaterial({ map: labelTexture(slot.stock) }),
        );
        label.position.set(0, 0.5, 0.505);
        item.add(label);
        item.userData.label = slot.stock.label;

        return addItem(item, "box", onTaken);
    }

    // A box that gets replaced as soon as it's taken, for the storage shelves
    function restock(slot) {
        return placeBox(slot, () => restock(slot));
    }

    return { shelfSlots, placeBox, restock, spawnShelf };
}
