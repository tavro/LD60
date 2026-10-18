import * as THREE from "three";
import { PIXEL_FONT, pixelCanvasTexture } from "./font.js";
import { FRONT_DOOR, PARTITION_X, W, D } from "../scene/layout.js";
import { STOCK } from "./stock.js";

const MAX_PER_PRODUCT = 4;
const PRODUCT_RADIUS = 0.65;

// Counts loose and carried stock as well as shelved stock, so deliveries cannot overfill the shop.
export function deliveryContents(capacity, items) {
    return STOCK.flatMap((stock) => {
        const existing = items.filter((item) =>
            item.userData.kind === "box" && item.userData.label === stock.label).length;
        const count = Math.min(MAX_PER_PRODUCT, Math.max(0, capacity(stock.label) - existing));
        return Array(count).fill(stock);
    });
}

export function createDeliverySystem({ scene, items, physics, placeBox, collides, stockCapacity }) {
    let carton = null;
    let contents = [];
    let unpacking = false;
    let message = "";

    function arrive() {
        // A carton left over from the previous preparation is still the same delivery.
        if (carton) return contents.length;
        contents = deliveryContents(stockCapacity, items.list());
        if (!contents.length) {
            message = "There is enough stock already; no delivery needed.";
            return 0;
        }

        carton = new THREE.Group();
        carton.name = "delivery-carton";
        const cardboard = new THREE.MeshStandardMaterial({ color: 0xb98853 });
        const tape = new THREE.MeshStandardMaterial({ color: 0xe2c391 });
        carton.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.6).translate(0, 0.8, 0), cardboard));
        carton.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 1.62).translate(0, 1.61, 0), tape));
        // Small and in the pixel font, like the other signs
        const canvas = document.createElement("canvas");
        canvas.width = 80;
        canvas.height = 40;
        const context = canvas.getContext("2d");
        context.fillStyle = "#f4f4ef";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#222";
        context.font = `8px ${PIXEL_FONT}`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("DELIVERY", canvas.width / 2, 14);
        context.fillText("STOCK", canvas.width / 2, 27);
        const texture = pixelCanvasTexture(canvas);
        // Face into the shop from just inside the entrance, beside the doorway.
        const label = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65),
            new THREE.MeshStandardMaterial({ map: texture }));
        label.position.set(0, 0.9, -0.81);
        label.rotation.y = Math.PI;
        carton.add(label);
        carton.position.set(FRONT_DOOR.x - 2.2, 0, D - 2.5);
        scene.add(carton);
        items.addItem(carton, "delivery");
        physics.addLoose(carton);
        message = "Delivery by the front door. Carry it into storage, put it down, then click it to unpack.";
        return contents.length;
    }

    function freePositions() {
        const origin = carton.getWorldPosition(new THREE.Vector3());
        const occupied = items.list().map((item) =>
            new THREE.Box3().setFromObject(item).expandByScalar(PRODUCT_RADIUS));
        const positions = [];
        for (let x = -W + 1.5; x < PARTITION_X - 1; x += 1.4) {
            for (let z = -D + 1.5; z < D - 1; z += 1.4) {
                const point = new THREE.Vector3(x, 0, z);
                if (Math.hypot(x - origin.x, z - origin.z) > 4) continue;
                if (collides(x, z, PRODUCT_RADIUS)) continue;
                const center = point.clone().setY(0.5);
                if (occupied.some((box) => box.containsPoint(center))) continue;
                positions.push(point);
            }
        }
        return positions.sort((a, b) => a.distanceToSquared(origin) - b.distanceToSquared(origin));
    }

    async function unpack(positions) {
        unpacking = true;
        message = "Unpacking delivery…";
        physics.release(carton);
        try {
            for (const position of positions.slice(0, contents.length)) {
                const item = await placeBox({ position, rotation: 0, stock: contents[0] });
                contents.shift();
                physics.addLoose(item);
            }
            if (!contents.length) {
                items.removeItem(carton);
                carton.removeFromParent();
                carton.traverse((child) => {
                    child.geometry?.dispose();
                    child.material?.map?.dispose();
                    child.material?.dispose();
                });
                carton = null;
                message = "Delivery unpacked. Pick up the products to price or shelve them.";
            } else {
                message = `${contents.length} products left in the carton. Clear floor space nearby, then click it again.`;
                physics.addLoose(carton);
            }
        } catch (error) {
            message = "Could not unpack the delivery. Click the carton to try again.";
            physics.addLoose(carton);
            console.warn("Delivery unpacking failed:", error);
        } finally {
            unpacking = false;
        }
    }

    function use(hit) {
        let object = hit?.object;
        while (object && object !== carton) object = object.parent;
        if (!carton || object !== carton) return false;
        if (unpacking) return true;
        const position = carton.getWorldPosition(new THREE.Vector3());
        if (position.x >= PARTITION_X - 1) return false;
        const positions = freePositions();
        if (!positions.length) {
            message = "No clear floor space nearby. Click to carry the carton to a clearer spot in storage.";
            return false;
        }
        void unpack(positions);
        return true;
    }

    return {
        arrive, use,
        get message() { return message; },
        get unpacking() { return unpacking; },
        get remaining() { return contents.length; },
    };
}
