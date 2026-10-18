import * as THREE from "three";
import { PIXEL_FONT, pixelCanvasTexture } from "./font.js";

export function shiftStartProblems({ delivery, messes, printer }) {
    const problems = [];
    if (delivery.unpacking) problems.push("Wait for the delivery to finish unpacking.");
    else if (delivery.remaining > 0) problems.push("Unpack the delivery carton in storage before starting the shift.");
    // Exactly what's left, so it can be found
    const { spills, footprints, looseProducts } = messes.breakdown();
    const left = [
        [spills, "spill", "spills"],
        [footprints, "footprint", "footprints"],
        [looseProducts, "loose product", "loose products"],
    ].filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
    if (left.length) {
        const list = left.length > 1 ? `${left.slice(0, -1).join(", ")} and ${left.at(-1)}` : left[0];
        problems.push(`Still in the shop: ${list}. Mop the floor and put products on shelves.`);
    }
    if (printer.puddle.visible) problems.push("Mop up the ink puddle by the printer.");
    return problems;
}

export function createShiftButton({ counterLoaded, onPress }) {
    const button = new THREE.Group();
    button.name = "start-shift-button";
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 1),
        new THREE.MeshStandardMaterial({ color: 0x333333 }));
    base.position.y = 0.07;
    button.add(base);
    const material = new THREE.MeshStandardMaterial({ color: 0xc91c1c, emissive: 0xff1818, emissiveIntensity: 0 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.1, 24), material);
    cap.position.set(0, 0.19, 0.15);
    button.add(cap);
    const light = new THREE.PointLight(0xff2424, 0, 3);
    light.position.set(0, 0.6, 0.15);
    button.add(light);

    // Small and in the pixel font, like the other signs
    const canvas = document.createElement("canvas");
    canvas.width = 104;
    canvas.height = 26;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f4f4ef";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#222";
    context.font = `8px ${PIXEL_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("START SHIFT", canvas.width / 2, canvas.height / 2);
    const texture = pixelCanvasTexture(canvas);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.26),
        new THREE.MeshStandardMaterial({ map: texture }));
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.145, -0.32);
    button.add(label);

    counterLoaded.then((counter) => {
        const top = new THREE.Box3().setFromObject(counter).max.y;
        // Cashier's side wing, clear of the belt and its scanner. The counter is already raycastable.
        button.position.set(-1, top, -1);
        // Turned so the label reads from the cashier's side
        button.rotation.y = Math.PI;
        counter.add(button);
    });

    let active = false;
    let time = 0;

    function setActive(value) {
        active = value;
        material.emissiveIntensity = active ? 0.8 : 0;
        light.intensity = active ? 0.8 : 0;
    }

    function update(dt) {
        if (!active) return;
        time += dt;
        const glow = 0.8 + 0.4 * Math.sin(time * 4);
        material.emissiveIntensity = glow;
        light.intensity = glow;
    }

    function use(hit) {
        let object = hit?.object;
        while (object && object !== button) object = object.parent;
        if (object !== button) return false;
        if (active) onPress();
        return true;
    }

    return { use, setActive, update };
}
