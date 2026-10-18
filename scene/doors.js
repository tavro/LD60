import * as THREE from "three";
import { wallMaterial, tileWall } from "./walls.js";
import { WALL_HEIGHT, WALL_THICKNESS, D, PARTITION_X, STORAGE_DOOR, FRONT_DOOR } from "./layout.js";

// Automatic sliding doors: a solid one into the storage room that opens for the player, and glass
// double doors at the customer entrance that open for anyone. The player can't walk out the front
const DOOR_HEIGHT = 7;
const OPEN_DISTANCE = 4;
const OPEN_TIME = 0.5;

export function createDoors(scene, { surfaces, setSolid, addBarrier }) {
    const doors = [];

    // Wall above the doorway
    function addLintel(x, z, width, depth) {
        const lintel = new THREE.Mesh(
            new THREE.BoxGeometry(width, WALL_HEIGHT - DOOR_HEIGHT, depth),
            wallMaterial(),
        );
        lintel.position.set(x, (WALL_HEIGHT + DOOR_HEIGHT) / 2, z);
        tileWall(lintel);
        scene.add(lintel);
    }

    function addPanel(geometry, material, closed, open) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(closed);
        scene.add(mesh);
        surfaces.push(mesh);
        return { mesh, closed, open };
    }

    // Storage door: one panel that slides into the partition wall towards the top of the room
    {
        const { z, width } = STORAGE_DOOR;
        const panelWidth = width - WALL_THICKNESS + 0.2;
        const material = new THREE.MeshStandardMaterial({ color: 0x7d8a96 });
        const geometry = new THREE.BoxGeometry(0.2, DOOR_HEIGHT, panelWidth);
        const closed = new THREE.Vector3(PARTITION_X, DOOR_HEIGHT / 2, z);
        addLintel(PARTITION_X, z, WALL_THICKNESS, width);
        doors.push({
            center: closed,
            playerOnly: true,
            panels: [addPanel(geometry, material, closed, closed.clone().setZ(z - panelWidth))],
            collider: new THREE.Box3(
                new THREE.Vector3(PARTITION_X - WALL_THICKNESS / 2, 0, z - width / 2),
                new THREE.Vector3(PARTITION_X + WALL_THICKNESS / 2, DOOR_HEIGHT, z + width / 2),
            ),
            progress: 0,
        });
    }

    // Front door: two glass panels sliding apart along the outside of the bottom wall
    {
        const { x, width } = FRONT_DOOR;
        const panelWidth = (width - WALL_THICKNESS) / 2 + 0.1;
        const z = D + WALL_THICKNESS / 2 + 0.1;
        const material = new THREE.MeshStandardMaterial({
            color: 0x9fc6d6,
            transparent: true,
            opacity: 0.35,
        });
        const geometry = new THREE.BoxGeometry(panelWidth, DOOR_HEIGHT, 0.1);
        const frame = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({ color: 0x222222 }),
        );
        addLintel(x, D, width, WALL_THICKNESS);

        const panels = [-1, 1].map((side) => {
            const closed = new THREE.Vector3(x + side * panelWidth / 2, DOOR_HEIGHT / 2, z);
            const panel = addPanel(geometry, material, closed, closed.clone().setX(closed.x + side * panelWidth));
            panel.mesh.add(frame.clone());
            return panel;
        });

        doors.push({
            center: new THREE.Vector3(x, 0, D),
            playerOnly: false,
            panels,
            collider: new THREE.Box3(
                new THREE.Vector3(x - width / 2, 0, D - WALL_THICKNESS / 2),
                new THREE.Vector3(x + width / 2, DOOR_HEIGHT, D + WALL_THICKNESS),
            ),
            progress: 0,
        });
        addBarrier(new THREE.Box3(
            new THREE.Vector3(x - width / 2, 0, D - WALL_THICKNESS / 2),
            new THREE.Vector3(x + width / 2, DOOR_HEIGHT, D + 1),
        ));
    }

    for (const door of doors) setSolid(door.collider, true);

    // `player` and each of `customers` are positions with x and z
    function update(dt, player, customers) {
        for (const door of doors) {
            const near = [player, ...(door.playerOnly ? [] : customers)].some(
                (p) => Math.hypot(p.x - door.center.x, p.z - door.center.z) < OPEN_DISTANCE,
            );
            door.progress = THREE.MathUtils.clamp(door.progress + (near ? dt : -dt) / OPEN_TIME, 0, 1);

            const t = THREE.MathUtils.smoothstep(door.progress, 0, 1);
            for (const panel of door.panels) panel.mesh.position.lerpVectors(panel.closed, panel.open, t);
            setSolid(door.collider, door.progress < 0.9);
        }
    }

    return { update };
}
