import * as THREE from "three";

// Conveyor belt in the channel along the desk's counter top. Customers put their item down at the
// end on the cashier's right, and the belt carries it and anything else put on it to the left,
// until it reaches the far end or the item in front. Positions are along the desk's local x axis;
// the cashier stands on its local -z side
// The channel in desk.glb: x -3.8 to 3.8, z 0.2 to 1.8, sunk 0.1 into the top
const CHANNEL_LENGTH = 7.6;
const CHANNEL_WIDTH = 1.6;
const CHANNEL_DEPTH = 0.1;
const BELT_Z = 1;
// Where items' centers start and stop, half a box in from the ends
export const BELT_START = -CHANNEL_LENGTH / 2 + 0.5;
const BELT_END = CHANNEL_LENGTH / 2 - 0.5;
const BASE_SPEED = 0.6;
const GAP = 1.2;

export function createBelt(scene, counterLoaded) {
    // Items on the belt, the one furthest along first
    const onBelt = [];
    let counter = null;
    let top = 0;
    let speed = BASE_SPEED;

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#444";
    ctx.fillRect(0, 0, 8, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(12, 1);

    const belt = new THREE.Mesh(
        new THREE.BoxGeometry(CHANNEL_LENGTH, CHANNEL_DEPTH, CHANNEL_WIDTH),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }),
    );

    counterLoaded.then((desk) => {
        counter = desk;
        // Flush with the counter top
        top = new THREE.Box3().setFromObject(desk).max.y;
        belt.position.set(0, top - CHANNEL_DEPTH / 2, BELT_Z);
        // Part of the desk, so it blocks items and they can be put down on it
        desk.add(belt);
    });

    function positionAt(x) {
        return counter.localToWorld(new THREE.Vector3(x, top, BELT_Z));
    }

    // Whether the start of the belt is clear for another item
    function hasRoom() {
        const last = onBelt.at(-1);
        return !last || last.userData.beltX >= BELT_START + GAP;
    }

    function place(item) {
        item.userData.beltX = BELT_START;
        item.position.copy(positionAt(BELT_START));
        // Label towards the cashier
        item.rotation.set(0, counter.rotation.y + Math.PI, 0);
        onBelt.push(item);
    }

    // Picks up an item the player put down, if it landed on the belt
    function handleDrop(item) {
        if (!counter) return;
        const local = counter.worldToLocal(item.position.clone());
        const onTop = Math.abs(local.y - top) < 0.05 &&
            Math.abs(local.x) <= CHANNEL_LENGTH / 2 && Math.abs(local.z - BELT_Z) <= CHANNEL_WIDTH / 2;
        if (!onTop) return;

        item.userData.beltX = THREE.MathUtils.clamp(local.x, BELT_START, BELT_END);
        const index = onBelt.findIndex((other) => other.userData.beltX < item.userData.beltX);
        onBelt.splice(index === -1 ? onBelt.length : index, 0, item);
    }

    function remove(item) {
        const index = onBelt.indexOf(item);
        if (index !== -1) onBelt.splice(index, 1);
        delete item.userData.beltX;
    }

    function update(dt) {
        if (!counter) return;
        texture.offset.x -= speed * dt * texture.repeat.x / CHANNEL_LENGTH;

        // Items the player picked back up are off the belt
        for (const item of onBelt.filter((item) => item.parent !== scene)) remove(item);

        let limit = BELT_END;
        for (const item of onBelt) {
            // Never pushed backwards when put down too close to the item in front
            const x = item.userData.beltX;
            item.userData.beltX = Math.max(x, Math.min(x + speed * dt, limit));
            item.position.copy(positionAt(item.userData.beltX));
            limit = item.userData.beltX - GAP;
        }
    }

    // Whether the item has reached the cashier's end, where it can be scanned
    function atEnd(item) {
        return onBelt.includes(item) && item.userData.beltX >= BELT_END - 0.05;
    }

    function setSpeed(multiplier) {
        speed = BASE_SPEED * multiplier;
    }

    return { hasRoom, place, remove, handleDrop, atEnd, setSpeed, update };
}
