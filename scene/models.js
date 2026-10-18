import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Models exported without a material get the glTF default, which is fully metallic and so renders
// black without reflections to show. Those get a plain matte one instead
function giveMaterial(object) {
    if (!object.isMesh) return;
    const material = object.material;
    if (material.name || material.map || material.metalness < 1) return;
    object.material = new THREE.MeshStandardMaterial({ color: material.color, roughness: 0.8 });
}

export function createModelSpawner(scene, { addSolid }) {
    const loader = new GLTFLoader();
    const models = {};

    // Everything spawned so far, to wait for the room to be finished before scattering things in it
    const loading = [];

    function spawn(name, options) {
        const spawned = spawnModel(name, options);
        loading.push(spawned);
        return spawned;
    }

    // Wraps the model in a group so its footprint is centered on the origin and it stands on y = 0,
    // since the models are offset in their files. `parts` replaces the bounding box for collision
    // with [minX, minZ, maxX, maxZ] footprints in that centered space, for models that aren't boxy
    async function spawnModel(name, { x, z, y = 0, rotation = 0, scale = 1, solid = true, parts }) {
        models[name] ??= loader.loadAsync(`models/${name}.glb`);
        const model = (await models[name]).scene.clone();
        model.scale.multiplyScalar(scale);
        model.traverse(giveMaterial);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -box.min.y, -center.z);

        const group = new THREE.Group();
        group.add(model);
        group.position.set(x, y, z);
        group.rotation.y = rotation;
        scene.add(group);
        group.updateMatrixWorld(true);

        const height = box.max.y - box.min.y;
        const boxes = parts?.map(([minX, minZ, maxX, maxZ]) =>
            new THREE.Box3(
                new THREE.Vector3(minX, 0, minZ),
                new THREE.Vector3(maxX, height, maxZ),
            ).applyMatrix4(group.matrixWorld),
        );

        group.userData.size = box.getSize(new THREE.Vector3());

        if (solid) addSolid(group, boxes);
        return group;
    }

    return { spawn, ready: () => Promise.all(loading) };
}
