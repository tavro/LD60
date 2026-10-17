import * as THREE from "three";

export function createStockSystem({ spawn, addItem }) {
    const SHELF_LEVELS = [0.1, 1.6, 3.1, 4.6];
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

    return { shelfSlots, restock };
}
