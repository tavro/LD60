import * as THREE from "three";
import { wallMaterial, tileWall } from "./walls.js";
import { pixelateLighting } from "./lighting.js";
import {
    ROOM_WIDTH, ROOM_DEPTH, WALL_HEIGHT, WALL_THICKNESS, W, D, PARTITION_X, STORAGE_DOOR, FRONT_DOOR,
    STORAGE_LEFT, LIGHT_PANELS,
} from "./layout.js";

export function createEnvironment(scene, { surfaces, addSolid }) {
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH),
        pixelateLighting(new THREE.MeshStandardMaterial({ color: 0x777777 })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.userData.isFloor = true;
    floor.userData.shadow = "receive";
    scene.add(floor);
    surfaces.push(floor);

    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH),
        // Faces away from the lights, so it glows a little as if lit by the panels
        new THREE.MeshStandardMaterial({ color: 0xb8b0a4, emissive: 0x2a241e }),
    );
    // Casting a shadow, it would block the key light above and put the whole room in shade
    ceiling.userData.shadow = "none";
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT;
    scene.add(ceiling);

    // Fluorescent light panels in a grid on the ceiling, bright enough for a gentle glow
    const panelGeometry = new THREE.BoxGeometry(3, 0.1, 1);
    const panelMaterial = new THREE.MeshStandardMaterial({ color: 0xf2e8d8, emissive: 0xf2e6d2, emissiveIntensity: 1.6 });
    for (const [x, z] of LIGHT_PANELS) {
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        panel.position.set(x, WALL_HEIGHT - 0.05, z);
        panel.userData.shadow = "none";
        scene.add(panel);
    }


    function addWall(x1, z1, x2, z2) {
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(
                Math.abs(x2 - x1) + WALL_THICKNESS,
                WALL_HEIGHT,
                Math.abs(z2 - z1) + WALL_THICKNESS,
            ),
            wallMaterial(),
        );
        wall.position.set((x1 + x2) / 2, WALL_HEIGHT / 2, (z1 + z2) / 2);
        tileWall(wall);
        scene.add(wall);
        addSolid(wall);
    }

    addWall(STORAGE_LEFT, -D, W, -D);
    addWall(STORAGE_LEFT, D, FRONT_DOOR.x - FRONT_DOOR.width / 2, D);
    addWall(FRONT_DOOR.x + FRONT_DOOR.width / 2, D, W, D);
    addWall(STORAGE_LEFT, -D, STORAGE_LEFT, D);
    addWall(W, -D, W, D);

    // Partition between the printer/restocking area and the shop floor, with a doorway near the top
    addWall(PARTITION_X, -D, PARTITION_X, STORAGE_DOOR.z - STORAGE_DOOR.width / 2);
    addWall(PARTITION_X, STORAGE_DOOR.z + STORAGE_DOOR.width / 2, PARTITION_X, D);

    // Sidewalk outside the front door, where customers come from
    const sidewalk = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a4a4a }),
    );
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(FRONT_DOOR.x, 0, D + 4);
    sidewalk.userData.shadow = "receive";
    scene.add(sidewalk);
}
