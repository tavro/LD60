import * as THREE from "three";
import { wallMaterial, tileWall } from "./walls.js";
import {
    ROOM_WIDTH, ROOM_DEPTH, WALL_HEIGHT, WALL_THICKNESS, W, D, PARTITION_X, STORAGE_DOOR, FRONT_DOOR,
} from "./layout.js";

export function createEnvironment(scene, { surfaces, addSolid }) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(10, 20, 5);
    scene.add(light);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH),
        new THREE.MeshStandardMaterial({ color: 0x777777 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.userData.isFloor = true;
    scene.add(floor);
    surfaces.push(floor);

    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH),
        // Faces away from the lights, so it glows a little as if lit by the panels
        new THREE.MeshStandardMaterial({ color: 0xd8d8d0, emissive: 0x6a6a64 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT;
    scene.add(ceiling);

    // Fluorescent light panels in a grid on the ceiling
    const panelGeometry = new THREE.BoxGeometry(3, 0.1, 1);
    const panelMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f4ea });
    for (const x of [-14, -8, 2, 10, 16]) {
        for (const z of [-8, 0, 8]) {
            const panel = new THREE.Mesh(panelGeometry, panelMaterial);
            panel.position.set(x, WALL_HEIGHT - 0.05, z);
            scene.add(panel);
        }
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

    addWall(-W, -D, W, -D);
    addWall(-W, D, FRONT_DOOR.x - FRONT_DOOR.width / 2, D);
    addWall(FRONT_DOOR.x + FRONT_DOOR.width / 2, D, W, D);
    addWall(-W, -D, -W, D);
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
    scene.add(sidewalk);
}
