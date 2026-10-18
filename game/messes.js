import * as THREE from "three";
import { PARTITION_X } from "../scene/layout.js";

// Messes on the shop floor: drinks customers spill, ink footprints the player tracks out of the
// puddle by the printer, and loose boxes lying around. Each one makes customers lose patience
// faster. The mop cleans spills and footprints; boxes have to be put back
const FOOTPRINT_STEPS = 14;
const STRIDE = 1.3;
const SCRUB_RADIUS = 1.5;
const SCRUB_AMOUNT = 0.5;
const CLEAN_BELOW = 0.3;
// Footprints count as one mess per this many
const FOOTPRINTS_PER_MESS = 4;

export function createMesses({ scene, items, physics, tween }) {
    const spills = [];
    const footprints = [];

    const flat = { roughness: 0.1, polygonOffset: true, polygonOffsetFactor: -1 };
    const spillMaterial = new THREE.MeshStandardMaterial({ color: 0x7a4a1c, ...flat });
    const footprintMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0b2a, ...flat });
    const footprintGeometry = new THREE.CircleGeometry(0.2, 12).scale(1, 1.7, 1);

    function onFloor(mesh) {
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.012;
        return mesh;
    }

    // A few overlapping blobs, scaled with its size like the ink puddle
    function addSpill(position) {
        const spill = new THREE.Group();
        for (const [x, z, radius] of [[0, 0, 0.6], [0.4, 0.2, 0.4], [-0.3, 0.3, 0.35]]) {
            const blob = onFloor(new THREE.Mesh(new THREE.CircleGeometry(radius, 20), spillMaterial));
            blob.position.x = x;
            blob.position.z = z;
            spill.add(blob);
        }
        spill.position.set(position.x, 0, position.z);
        spill.userData.shadow = "receive";
        spill.rotation.y = Math.random() * Math.PI * 2;
        spill.userData.size = 1;
        scene.add(spill);
        spills.push(spill);
    }

    let inkSteps = 0;
    let lastStep = null;
    let side = 1;

    // Leaves alternating footprints a stride apart for a while after stepping in ink
    function update(player, inInk) {
        if (inInk) inkSteps = FOOTPRINT_STEPS;
        if (inkSteps <= 0) {
            lastStep = null;
            return;
        }
        if (!lastStep) {
            lastStep = { x: player.x, z: player.z };
            return;
        }

        const dx = player.x - lastStep.x;
        const dz = player.z - lastStep.z;
        const distance = Math.hypot(dx, dz);
        if (distance < STRIDE) return;

        const footprint = new THREE.Group();
        footprint.add(onFloor(new THREE.Mesh(footprintGeometry, footprintMaterial)));
        // To the side of the direction of travel, pointing along it
        footprint.position.set(
            player.x + (dz / distance) * 0.25 * side,
            0,
            player.z - (dx / distance) * 0.25 * side,
        );
        footprint.rotation.y = Math.atan2(dx, dz);
        footprint.userData.shadow = "receive";
        scene.add(footprint);
        footprints.push(footprint);

        side = -side;
        inkSteps--;
        lastStep = { x: player.x, z: player.z };
    }

    function inShop(object) {
        return object.position.x > PARTITION_X;
    }

    function count() {
        const floorBoxes = items.list().filter((item) =>
            item.userData.kind === "box" && physics.isLoose(item) && inShop(item),
        ).length;
        const shopFootprints = footprints.filter(inShop).length;
        return spills.filter(inShop).length + Math.ceil(shopFootprints / FOOTPRINTS_PER_MESS) + floorBoxes;
    }

    function remove(list, object) {
        list.splice(list.indexOf(object), 1);
        object.removeFromParent();
    }

    // Called with what the mop was used on; cleans footprints around it and shrinks a spill there
    function tryScrub(mop, hit) {
        if (!hit) return false;
        const near = (object, radius) =>
            Math.hypot(hit.point.x - object.position.x, hit.point.z - object.position.z) < radius;

        const scrubbed = footprints.filter((footprint) => near(footprint, SCRUB_RADIUS));
        for (const footprint of scrubbed) remove(footprints, footprint);

        const spill = spills.find((spill) => near(spill, spill.userData.size + SCRUB_RADIUS));
        if (spill) {
            spill.userData.size -= SCRUB_AMOUNT;
            if (spill.userData.size < CLEAN_BELOW) remove(spills, spill);
            else spill.scale.setScalar(spill.userData.size);
        }

        if (!scrubbed.length && !spill) return false;
        tween(0.25, (t) => {
            mop.rotation.z = Math.sin(t * Math.PI * 2) * 0.3;
        });
        return true;
    }

    return { addSpill, update, count, tryScrub, spillCount: () => spills.length };
}
