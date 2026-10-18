import * as THREE from "three";
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
    scene.add(floor);
    surfaces.push(floor);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xbbbbaa });

    function addWall(x1, z1, x2, z2) {
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(
                Math.abs(x2 - x1) + WALL_THICKNESS,
                WALL_HEIGHT,
                Math.abs(z2 - z1) + WALL_THICKNESS,
            ),
            wallMaterial,
        );
        wall.position.set((x1 + x2) / 2, WALL_HEIGHT / 2, (z1 + z2) / 2);
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
