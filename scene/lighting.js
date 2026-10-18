import * as THREE from "three";
import { W, D, WALL_HEIGHT, LIGHT_PANELS } from "./layout.js";
import { HELD_LAYER } from "./rendering.js";

// Warm, cozy light: a soft warm fill, an overhead key light casting pixel shadows across the whole
// room, and a spotlight shining straight down from each ceiling panel, so the light comes from the
// fixtures and doesn't light up the ceiling around them
const FILL = { sky: 0xfff1dd, ground: 0x3a2f28, intensity: 0.8 };
// Straight down, so each shadow pixel lands on the floor as a clean square instead of a streak
const KEY = { color: 0xffe8c8, intensity: 0.9, position: [0, 30, 0] };
// Wide, soft-edged cones, so neighbouring panels' light blends together on the floor
const PANEL_LIGHT = { color: 0xfff0dc, intensity: 28, distance: 16, angle: 1.0, penumbra: 0.8 };
// Size of a shadow pixel on the floor, in units, and the area the shadows cover: the room and a
// little more, a whole number of shadow pixels across each way so they stay square
const SHADOW_PIXEL = 0.25;
const SHADOW_AREA = { width: 2 * W + 4, depth: 2 * D + 4 };
// How often new meshes (boxes, customers, prints) get their shadows switched on, and how often the
// shadows are redrawn (every frame costs about a millisecond and blocky shadows don't need it)
const SHADOW_CHECK_EVERY = 0.5;
let shadowRedrawEvery = 1 / 20;

export function createLighting(scene) {
    const fill = new THREE.HemisphereLight(FILL.sky, FILL.ground, FILL.intensity);
    scene.add(fill);

    // Its shadow camera covers the whole room
    const key = new THREE.DirectionalLight(KEY.color, KEY.intensity);
    key.position.set(...KEY.position);
    key.castShadow = true;
    key.shadow.mapSize.set(SHADOW_AREA.width / SHADOW_PIXEL, SHADOW_AREA.depth / SHADOW_PIXEL);
    Object.assign(key.shadow.camera, {
        left: -SHADOW_AREA.width / 2,
        right: SHADOW_AREA.width / 2,
        top: SHADOW_AREA.depth / 2,
        bottom: -SHADOW_AREA.depth / 2,
        near: 1,
        far: 60,
    });
    // Looking straight down, so "up" for the shadow camera is along the floor
    key.shadow.camera.up.set(0, 0, -1);
    key.shadow.autoUpdate = false;
    key.shadow.needsUpdate = true;
    // About one shadow pixel, so surfaces don't shadow themselves in stripes
    key.shadow.bias = -0.001;
    key.shadow.normalBias = SHADOW_PIXEL;
    scene.add(key, key.target);

    const panelLights = LIGHT_PANELS.map(([x, z]) => {
        const { color, intensity, distance, angle, penumbra } = PANEL_LIGHT;
        const light = new THREE.SpotLight(color, intensity, distance, angle, penumbra, 2);
        light.position.set(x, WALL_HEIGHT - 0.15, z);
        light.target.position.set(x, 0, z);
        scene.add(light, light.target);
        return light;
    });

    // Lights also light held items, which are drawn on their own layer
    for (const light of [fill, key, ...panelLights]) {
        light.layers.enable(HELD_LAYER);
    }

    // Shadows on every mesh, including ones added later, except those marked otherwise:
    // `userData.shadow` is "none" for things like glass and the ceiling, and "receive" for decals
    // lying on the floor
    let checkIn = 0;
    let redrawIn = 0;

    function update(dt) {
        redrawIn -= dt;
        if (redrawIn <= 0) {
            key.shadow.needsUpdate = true;
            redrawIn = shadowRedrawEvery;
        }

        checkIn -= dt;
        if (checkIn > 0) return;
        checkIn = SHADOW_CHECK_EVERY;

        scene.traverse((object) => {
            // Every light, including ones added later like the shift button's, also lights the held
            // item's pass. If the two passes saw different lights, every material would be set up
            // again for each, every frame
            if (object.isLight) object.layers.enable(HELD_LAYER);
            if (!object.isMesh || object.userData.shadowSet) return;
            let mode = "both";
            for (let o = object; o; o = o.parent) {
                if (o.userData.shadow) {
                    mode = o.userData.shadow;
                    break;
                }
            }
            object.castShadow = mode === "both";
            object.receiveShadow = mode !== "none";
            object.userData.shadowSet = true;
        });
    }

    // For the graphics setting: which panels shine light down ("all", "half" or "none", with the
    // fill brighter to make up for them), and how many times a second shadows are redrawn
    function setQuality({ panels, shadowRate }) {
        panelLights.forEach((light, i) => {
            light.visible = panels === "all" || (panels === "half" && i % 2 === 0);
        });
        fill.intensity = FILL.intensity * (panels === "none" ? 1.8 : panels === "half" ? 1.2 : 1);
        shadowRedrawEvery = 1 / shadowRate;
    }

    return { update, setQuality };
}
