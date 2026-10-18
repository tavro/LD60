import * as THREE from "three";
import * as CANNON from "cannon-es";
import { WALL_HEIGHT } from "../scene/layout.js";

// Loose items are simulated: things thrown on the floor tumble and bounce off walls and furniture,
// and a pile on the floor falls when something is pulled out from under the rest. Items on shelves,
// the belt, the counter or the printer aren't simulated and stay exactly where they're put. Walls
// and furniture are the collision system's footprints, kept in sync as doors open and close
const GRAVITY = 26;
const THROW_SPEED = 11;
const THROW_LIFT = 5;
const THROW_SPIN = 8;
// Thin things like paper get at least this half thickness, so they don't fall through the floor
const MIN_HALF_SIZE = 0.03;

// `footprints` returns the boxes to collide with
export function createPhysics({ footprints }) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
    world.allowSleep = true;
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.defaultContactMaterial.friction = 0.4;
    world.defaultContactMaterial.restitution = 0.25;

    for (const [y, angle] of [[0, -Math.PI / 2], [WALL_HEIGHT, Math.PI / 2]]) {
        const plane = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
        plane.position.y = y;
        plane.quaternion.setFromEuler(angle, 0, 0);
        world.addBody(plane);
    }

    // Footprint boxes, as static bodies
    const statics = new Map();

    function syncStatics() {
        const colliders = footprints();
        for (const box of colliders) {
            if (statics.has(box)) continue;
            const size = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
            const center = box.getCenter(new THREE.Vector3());
            const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(size.x, size.y, size.z)) });
            body.position.set(center.x, center.y, center.z);
            world.addBody(body);
            statics.set(box, body);
        }
        for (const [box, body] of statics) {
            if (colliders.includes(box)) continue;
            world.removeBody(body);
            statics.delete(box);
            wakeAll();
        }
    }

    // Items with bodies, and where each body's center is in the item's own space (items have their
    // origin at the bottom)
    const loose = new Map();

    function wakeAll() {
        for (const body of world.bodies) body.wakeUp();
    }

    // Starts simulating an item where it is now, optionally moving and spinning
    function addLoose(item, { velocity = null, spin = null } = {}) {
        release(item);

        // Measured unrotated, then put back
        const rotation = item.quaternion.clone();
        item.quaternion.identity();
        item.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(item);
        const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        const offset = box.getCenter(new THREE.Vector3()).sub(item.position);
        item.quaternion.copy(rotation);

        const body = new CANNON.Body({
            mass: 1,
            shape: new CANNON.Box(new CANNON.Vec3(
                Math.max(half.x, MIN_HALF_SIZE),
                Math.max(half.y, MIN_HALF_SIZE),
                Math.max(half.z, MIN_HALF_SIZE),
            )),
            linearDamping: 0.05,
            angularDamping: 0.1,
            sleepSpeedLimit: 0.3,
            sleepTimeLimit: 0.5,
        });
        const center = offset.clone().applyQuaternion(rotation).add(item.position);
        body.position.set(center.x, center.y, center.z);
        body.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        if (velocity) body.velocity.set(velocity.x, velocity.y, velocity.z);
        if (spin) body.angularVelocity.set(spin.x, spin.y, spin.z);
        world.addBody(body);
        loose.set(item, { body, offset });
    }

    // Throws an item from `from` in the direction the player is looking, tumbling
    function throwItem(item, from, direction) {
        item.position.copy(from);
        const velocity = direction.clone().multiplyScalar(THROW_SPEED);
        velocity.y += THROW_LIFT;
        const spin = new THREE.Vector3(
            (Math.random() * 2 - 1) * THROW_SPIN,
            (Math.random() * 2 - 1) * THROW_SPIN,
            (Math.random() * 2 - 1) * THROW_SPIN,
        );
        addLoose(item, { velocity, spin });
    }

    // Stops simulating an item, e.g. when it's picked up; whatever rested on it falls
    function release(item) {
        const entry = loose.get(item);
        if (!entry) return;
        world.removeBody(entry.body);
        loose.delete(item);
        wakeAll();
    }

    function update(dt) {
        syncStatics();
        world.step(1 / 60, dt, 5);

        for (const [item, { body, offset }] of loose) {
            // Anything that somehow got out of the room comes back from above
            if (body.position.y < -5) {
                body.position.y = 2;
                body.velocity.set(0, 0, 0);
            }
            item.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
            item.position.set(body.position.x, body.position.y, body.position.z)
                .sub(offset.clone().applyQuaternion(item.quaternion));
        }
    }

    return { addLoose, throwItem, release, update, isLoose: (item) => loose.has(item) };
}
