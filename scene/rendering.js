import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Pass } from "three/addons/postprocessing/Pass.js";

// Held items are on this layer, drawn after everything else with fresh depth so they never sink
// into a wall the player stands close to
export const HELD_LAYER = 1;

class HeldItemPass extends Pass {
    constructor(scene, camera) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.needsSwap = false;
    }

    render(renderer, writeBuffer, readBuffer) {
        const { autoClear } = renderer;
        const background = this.scene.background;
        renderer.autoClear = false;
        this.scene.background = null;
        this.camera.layers.set(HELD_LAYER);

        renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
        renderer.clearDepth();
        renderer.render(this.scene, this.camera);

        this.camera.layers.set(0);
        this.scene.background = background;
        renderer.autoClear = autoClear;
    }
}

// Pixel-art shadows, filmic tone mapping, and a gentle pixelated glow around things brighter than
// white, like the ceiling lights (so white speech bubbles and signs don't glow)
const BLOOM = { strength: 0.16, radius: 0.25, threshold: 1.1 };
// The glow is worked out at this fraction of the screen's size, and drawn without smoothing, so it
// comes out in blocks of about twice this many pixels like the shadows
const GLOW_PIXEL = 4;

class PixelBloomPass extends UnrealBloomPass {
    constructor(...args) {
        super(...args);
        // The final glow image, stretched over the screen without smoothing
        const glow = this.renderTargetsHorizontal[0].texture;
        glow.minFilter = THREE.NearestFilter;
        glow.magFilter = THREE.NearestFilter;
    }

    setSize(width, height) {
        super.setSize(Math.ceil(width / GLOW_PIXEL), Math.ceil(height / GLOW_PIXEL));
    }
}
// Sharper isn't worth rendering four times the pixels on high-density screens
const MAX_PIXEL_RATIO = 1.5;

export function createRendering() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
    );
    camera.rotation.order = "YXZ";
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    // Unfiltered, so a low-resolution shadow map gives blocky pixel shadows
    renderer.shadowMap.type = THREE.BasicShadowMap;
    document.body.appendChild(renderer.domElement);

    // Renders the scene with bloom; the output pass applies the tone mapping and color space
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new HeldItemPass(scene, camera));
    composer.addPass(new PixelBloomPass(
        new THREE.Vector2(window.innerWidth / GLOW_PIXEL, window.innerHeight / GLOW_PIXEL),
        BLOOM.strength,
        BLOOM.radius,
        BLOOM.threshold,
    ));
    composer.addPass(new OutputPass());

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer, composer };
}
