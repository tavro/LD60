import * as THREE from "three";

export function createNPC({ id = "npc-1" } = {}) {
    const npc = new THREE.Group();
    npc.name = id;
    npc.userData.id = id;

    const skin = new THREE.MeshStandardMaterial({ color: 0xdca47d });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x447abb });
    const trousers = new THREE.MeshStandardMaterial({ color: 0x303b50 });
    const shoes = new THREE.MeshStandardMaterial({ color: 0x252525 });
    const eyes = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const box = new THREE.BoxGeometry(1, 1, 1);

    function addBox(name, width, height, depth, x, y, z, material, parent = npc) {
        const part = new THREE.Mesh(box, material);
        part.name = name;
        part.scale.set(width, height, depth);
        part.position.set(x, y, z);
        parent.add(part);
    }

    // The origin is at the feet. Move the group along X/Z to move the whole NPC.
    addBox("torso", 1.2, 1.5, 0.65, 0, 2.65, 0, shirt);
    addBox("hips", 1.1, 0.25, 0.6, 0, 1.775, 0, trousers);
    addBox("neck", 0.35, 0.2, 0.35, 0, 3.5, 0, skin);

    for (const [side, direction] of [["left", -1], ["right", 1]]) {
        // Pivot at the hip/shoulder so shoes and hands follow the swinging limbs.
        const leg = new THREE.Group();
        leg.name = `${side}-leg`;
        leg.position.set(direction * 0.31, 1.65, 0);
        npc.add(leg);
        addBox(`${side}-leg-mesh`, 0.42, 1.4, 0.45, 0, -0.7, 0, trousers, leg);
        addBox(`${side}-shoe`, 0.46, 0.25, 0.7, 0, -1.525, 0.1, shoes, leg);

        const arm = new THREE.Group();
        arm.name = `${side}-arm`;
        arm.position.set(direction * 0.82, 3.4, 0);
        npc.add(arm);
        addBox(`${side}-arm-mesh`, 0.35, 1.5, 0.4, 0, -0.75, 0, shirt, arm);
        addBox(`${side}-hand`, 0.32, 0.3, 0.35, 0, -1.65, 0, skin, arm);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), skin);
    head.name = "head";
    head.position.y = 4;
    npc.add(head);

    // Eyes mark the forward direction (+Z).
    const eyeGeometry = new THREE.SphereGeometry(0.055, 8, 6);
    for (const [side, direction] of [["left", -1], ["right", 1]]) {
        const eye = new THREE.Mesh(eyeGeometry, eyes);
        eye.name = `${side}-eye`;
        eye.position.set(direction * 0.17, 4.08, 0.46);
        npc.add(eye);
    }

    return npc;
}

export function addNPCs(scene) {
    const npc = createNPC();
    // Open aisle between the central shelves and checkout, facing the player's start.
    npc.position.set(10, 0, 3);
    scene.add(npc);
    return [npc];
}
