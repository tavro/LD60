import * as THREE from "three";

// Pixel-art puddles: a few overlapping round blobs drawn as square pixels PIXEL wide on the floor,
// redrawn as the puddle grows or shrinks so the pixels stay the same size. A darker rim, a few
// lighter pixels, and a little variation in between. Matte, so the lights don't shine off them
const PIXEL = 0.2;
// Redrawn when the size has changed by this much
const SIZE_STEP = 0.05;

function hash(x, y, seed) {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
}

// `blobs` are [x, z, radius] at size 1, and the puddle can grow to `maxSize`
export function createPixelPuddle({ color, blobs, maxSize }) {
    const extent = Math.max(...blobs.map(([x, z, radius]) => Math.hypot(x, z) + radius)) * maxSize;
    const pixels = Math.ceil((extent * 2) / PIXEL);
    const canvas = document.createElement("canvas");
    canvas.width = pixels;
    canvas.height = pixels;
    const ctx = canvas.getContext("2d");

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;

    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(pixels * PIXEL, pixels * PIXEL),
        new THREE.MeshStandardMaterial({
            map: texture,
            alphaTest: 0.5,
            roughness: 1,
            polygonOffset: true,
            polygonOffsetFactor: -1,
        }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012;

    const base = new THREE.Color(color);
    const seed = Math.random() * 100;
    const shade = (amount) => `#${base.clone().offsetHSL(0, 0, amount).getHexString()}`;
    let drawn = null;

    function inside(i, j, size) {
        const x = (i + 0.5) * PIXEL - extent;
        const z = (j + 0.5) * PIXEL - extent;
        return blobs.some(([bx, bz, radius]) => Math.hypot(x - bx * size, z - bz * size) < radius * size);
    }

    function setSize(size) {
        const step = Math.round(size / SIZE_STEP);
        if (step === drawn) return;
        drawn = step;

        ctx.clearRect(0, 0, pixels, pixels);
        for (let j = 0; j < pixels; j++) {
            for (let i = 0; i < pixels; i++) {
                if (!inside(i, j, size)) continue;
                const rim = !inside(i - 1, j, size) || !inside(i + 1, j, size) ||
                    !inside(i, j - 1, size) || !inside(i, j + 1, size);
                const roll = hash(i, j, seed);
                ctx.fillStyle = rim ? shade(-0.06) : roll > 0.93 ? shade(0.18) : shade((roll - 0.5) * 0.05);
                ctx.fillRect(i, j, 1, 1);
            }
        }
        texture.needsUpdate = true;
    }

    function dispose() {
        texture.dispose();
        mesh.material.dispose();
        mesh.geometry.dispose();
    }

    return { mesh, setSize, dispose };
}

// A shoe print, shared by all footprints: PIXELS_WIDE × PIXELS_LONG pixels, sole and heel
const FOOT_PIXEL = 0.08;
const FOOT = [
    ".XXX.",
    "XXXXX",
    "XXXXX",
    "XXXXX",
    ".XXX.",
    ".....",
    ".XXX.",
    ".XXX.",
    ".XXX.",
];

let footprintMaterial = null;

export function footprintMesh(color) {
    if (!footprintMaterial) {
        const canvas = document.createElement("canvas");
        canvas.width = FOOT[0].length;
        canvas.height = FOOT.length;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = color;
        FOOT.forEach((row, y) => [...row].forEach((pixel, x) => {
            if (pixel === "X") ctx.fillRect(x, y, 1, 1);
        }));
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        footprintMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            alphaTest: 0.5,
            roughness: 1,
            polygonOffset: true,
            polygonOffsetFactor: -1,
        });
    }
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(FOOT[0].length * FOOT_PIXEL, FOOT.length * FOOT_PIXEL),
        footprintMaterial,
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012;
    return mesh;
}
