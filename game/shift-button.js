import * as THREE from "three";

export function shiftStartProblems({ delivery, messes, printer }) {
    const problems = [];
    if (delivery.unpacking) problems.push("Wait for the delivery to finish unpacking.");
    else if (delivery.remaining > 0) problems.push("Unpack the delivery carton in storage before starting the shift.");
    if (messes.count() > 0) problems.push("Clean the shop: mop spills and footprints, and put loose products back on shelves.");
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
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.2, 24), material);
    cap.position.set(0, 0.24, 0.15);
    button.add(cap);
    const light = new THREE.PointLight(0xff2424, 0, 3);
    light.position.set(0, 0.6, 0.15);
    button.add(light);

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f4f4ef";
    context.fillRect(0, 0, 256, 64);
    context.fillStyle = "#222";
    context.font = "bold 34px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("START SHIFT", 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.26),
        new THREE.MeshStandardMaterial({ map: texture }));
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.145, -0.32);
    button.add(label);

    counterLoaded.then((counter) => {
        const top = new THREE.Box3().setFromObject(counter).max.y;
        // Cashier's side wing, clear of the belt and its scanner. The counter is already raycastable.
        button.position.set(-1, top, -1);
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
