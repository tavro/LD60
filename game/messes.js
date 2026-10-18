import * as THREE from "three";
import { PARTITION_X } from "../scene/layout.js";
import { createPixelPuddle, footprintMesh } from "./puddles.js";

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

    // Pixel-art blobs of coffee, shrinking as they're mopped, like the ink puddle
    function addSpill(position) {
        const spill = new THREE.Group();
        const puddle = createPixelPuddle({
            color: 0x6b3f18,
            blobs: [[0, 0, 0.6], [0.4, 0.2, 0.4], [-0.3, 0.3, 0.35]],
            maxSize: 1,
        });
        puddle.setSize(1);
        spill.add(puddle.mesh);
        spill.userData.puddle = puddle;
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
        footprint.add(footprintMesh("#0b0b2a"));
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

    // What's messing up the shop, by kind
    function breakdown() {
        return {
            spills: spills.filter(inShop).length,
            footprints: footprints.filter(inShop).length,
            looseProducts: items.list().filter((item) =>
                item.userData.kind === "box" && physics.isLoose(item) && inShop(item),
            ).length,
        };
    }

    function count() {
        const { spills, footprints, looseProducts } = breakdown();
        return spills + Math.ceil(footprints / FOOTPRINTS_PER_MESS) + looseProducts;
    }

    function remove(list, object) {
        list.splice(list.indexOf(object), 1);
        object.removeFromParent();
        object.userData.puddle?.dispose();
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
            else spill.userData.puddle.setSize(spill.userData.size);
        }

        if (!scrubbed.length && !spill) return false;
        tween(0.25, (t) => {
            mop.rotation.z = Math.sin(t * Math.PI * 2) * 0.3;
        });
        return true;
    }

    return { addSpill, update, count, breakdown, tryScrub, spillCount: () => spills.length };
}
