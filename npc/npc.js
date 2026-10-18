import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Blocky customers: boxes with small pixel-art textures as skin, with the face, hair and clothing
// details painted in. Skin, hair and clothes vary, and some customer types (`look`) get a detail:
// a tie for businessmen, grey hair in a bun and glasses for grandmas, a cap for kids, sunglasses and
// a gold chain for VIPs. Shoplifters look like anyone else on purpose. The walking animation swings
// the parts named "left-leg", "right-arm" and so on
//
// To keep them cheap to draw, each customer's textures are painted as tiles of one small texture,
// and the boxes that move together are merged: the body with the head, and each leg and each arm.
// That's five meshes with one material, instead of a mesh and up to six materials per box
const SKIN_TONES = ["#f1c8a5", "#dca47d", "#c68863", "#9a6440", "#6e4529"];
const HAIR_COLORS = ["#2b1d14", "#4a2e1a", "#8a5a2b", "#d8b56a", "#1a1a1a", "#a0401f"];
const TROUSER_COLORS = ["#303b50", "#3a3a3a", "#5a4632", "#2c4a3a", "#6b6b72"];
const SHOE_COLORS = ["#252525", "#4a2e1a", "#e8e4dc"];
const HAIR_STYLES = ["short", "short", "long", "bald"];
// Size of each texture tile in pixels, and the tiles in the texture, in rows of COLUMNS
const PIXELS = 8;
const TILES = ["skin", "shirt", "chest", "trousers", "shoes", "hair", "face", "headSide", "headBack", "cap"];
const COLUMNS = 4;
const ROWS = Math.ceil(TILES.length / COLUMNS);
// Keeps texture lookups a hair inside each tile, so neighbouring tiles never bleed in
const INSET = 0.01;

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// The color a little lighter or darker, for pixel-to-pixel variation
function shade(hex, amount) {
    return `#${new THREE.Color(hex).offsetHSL(0, 0, (Math.random() - 0.5) * amount).getHexString()}`;
}

// A box of the given size at the given position, with each face showing a tile: `faces` names them
// in BoxGeometry's order, +x, -x, +y, -y, +z (front), -z (back)
function tiledBox([width, height, depth], [x, y, z], faces) {
    const geometry = new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
    const uv = geometry.attributes.uv;
    faces.forEach((tile, face) => {
        const index = TILES.indexOf(tile);
        const column = index % COLUMNS;
        const row = Math.floor(index / COLUMNS);
        for (let i = face * 4; i < face * 4 + 4; i++) {
            const u = uv.getX(i) * (1 - 2 * INSET) + INSET;
            const v = (1 - uv.getY(i)) * (1 - 2 * INSET) + INSET;
            uv.setXY(i, (column + u) / COLUMNS, 1 - (row + v) / ROWS);
        }
    });
    return geometry;
}

const all = (tile) => [tile, tile, tile, tile, tile, tile];
const geometries = {};

// The merged shapes, the same for every customer of the same build, so they're shared
function shapes(style, look) {
    const key = `${style}|${look === "kid"}`;
    if (geometries[key]) return geometries[key];

    const core = [
        tiledBox([1.2, 1.5, 0.65], [0, 2.65, 0], ["shirt", "shirt", "shirt", "shirt", "chest", "shirt"]),
        tiledBox([1.12, 0.3, 0.62], [0, 1.8, 0], all("trousers")),
        tiledBox([0.35, 0.25, 0.35], [0, 3.5, 0], all("skin")),
        tiledBox([0.95, 1, 0.9], [0, 4.1, 0], [
            "headSide", "headSide", style === "bald" ? "skin" : "hair", "skin", "face", "headBack",
        ]),
    ];
    if (style === "bun") core.push(tiledBox([0.42, 0.38, 0.4], [0, 4.65, -0.4], all("hair")));
    if (look === "kid") {
        core.push(tiledBox([1.02, 0.25, 0.98], [0, 4.6, 0], all("cap")));
        core.push(tiledBox([0.8, 0.06, 0.45], [0, 4.5, 0.6], all("cap")));
    }

    geometries[key] = {
        core: mergeGeometries(core),
        // In the swinging limbs' own space, pivoting at the hip or shoulder
        leg: mergeGeometries([
            tiledBox([0.44, 1.45, 0.48], [0, -0.72, 0], all("trousers")),
            tiledBox([0.48, 0.26, 0.72], [0, -1.55, 0.1], all("shoes")),
        ]),
        arm: mergeGeometries([
            tiledBox([0.34, 1.35, 0.38], [0, -0.62, 0], all("shirt")),
            tiledBox([0.3, 0.32, 0.32], [0, -1.42, 0], all("skin")),
        ]),
    };
    return geometries[key];
}

// The customer's texture: every tile painted with its colors and details
function paint({ skinColor, hairColor, shirtHex, trousers, shoes, cap, style, look }) {
    const canvas = document.createElement("canvas");
    canvas.width = COLUMNS * PIXELS;
    canvas.height = ROWS * PIXELS;
    const ctx = canvas.getContext("2d");
    const hasHair = style !== "bald";

    // A tile of `base` with a little noise, then `details(set)`, where `set(x, y, color)` colors
    // one of its pixels counted from the top left
    function tile(name, base, details = () => {}, noise = 0.06) {
        const index = TILES.indexOf(name);
        const left = (index % COLUMNS) * PIXELS;
        const top = Math.floor(index / COLUMNS) * PIXELS;
        const set = (x, y, color) => {
            ctx.fillStyle = color;
            ctx.fillRect(left + x, top + y, 1, 1);
        };
        for (let y = 0; y < PIXELS; y++) {
            for (let x = 0; x < PIXELS; x++) set(x, y, shade(base, noise));
        }
        details(set);
    }

    tile("skin", skinColor);
    tile("shirt", shirtHex);
    tile("trousers", trousers);
    tile("shoes", shoes);
    tile("hair", hairColor, () => {}, 0.12);
    tile("cap", cap ?? shirtHex);

    // Torso front: a collar, and the type's detail
    tile("chest", shirtHex, (set) => {
        set(3, 0, skinColor);
        set(4, 0, skinColor);
        if (look === "business") {
            set(2, 0, "#f6f4ef");
            set(5, 0, "#f6f4ef");
            for (let y = 1; y < 7; y++) {
                set(3, y, "#a02020");
                set(4, y, "#a02020");
            }
        } else if (look === "vip") {
            for (const [x, y] of [[1, 0], [2, 1], [3, 2], [4, 2], [5, 1], [6, 0]]) set(x, y, "#e8c040");
        } else {
            set(4, 3, shade(shirtHex, 0.3));
            set(4, 5, shade(shirtHex, 0.3));
        }
    });

    // The face: hair along the top, brows, eyes, nose and mouth, and glasses or sunglasses
    tile("face", skinColor, (set) => {
        if (hasHair) {
            for (let x = 0; x < PIXELS; x++) set(x, 0, hairColor);
            set(0, 1, hairColor);
            set(7, 1, hairColor);
        }
        for (const x of [1, 2, 5, 6]) set(x, 2, look === "grandma" ? "#9a9590" : shade(hairColor, 0.1));
        for (const x of [1, 5]) set(x, 3, "#f6f4ef");
        for (const x of [2, 6]) set(x, 3, "#1c1c1c");
        set(3, 4, shade(skinColor, -0.15));
        set(4, 4, shade(skinColor, -0.15));
        for (let x = 2; x < 6; x++) set(x, 6, "#7a2a2a");
        if (look === "vip") {
            for (let x = 1; x < 7; x++) set(x, 3, "#111111");
        } else if (look === "grandma") {
            for (const x of [0, 3, 4, 7]) set(x, 3, "#b0b6ba");
        }
    });

    // Sides and back of the head: hair down to the ears, or the whole back for long hair
    tile("headSide", skinColor, (set) => {
        if (!hasHair) return;
        for (let y = 0; y < 3; y++) for (let x = 0; x < PIXELS; x++) set(x, y, shade(hairColor, 0.12));
        for (let y = 3; y < (style === "long" ? 7 : 5); y++) for (let x = 5; x < PIXELS; x++) set(x, y, shade(hairColor, 0.12));
    });
    tile("headBack", hasHair ? hairColor : skinColor, (set) => {
        if (!hasHair || style === "long") return;
        for (let y = 6; y < PIXELS; y++) for (let x = 0; x < PIXELS; x++) set(x, y, shade(skinColor, 0.06));
    }, hasHair ? 0.12 : 0.06);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return texture;
}

export function createNPC({ id = "npc-1", shirtColor = 0x447abb, look = null } = {}) {
    const npc = new THREE.Group();
    npc.name = id;
    npc.userData.id = id;
    // A little taller or shorter than average
    const body = new THREE.Group();
    body.scale.setScalar(0.94 + Math.random() * 0.12);
    npc.add(body);

    const style = look === "grandma" ? "bun" : look === "kid" ? "short" : pick(HAIR_STYLES);
    const material = new THREE.MeshStandardMaterial({
        roughness: 0.9,
        map: paint({
            skinColor: pick(SKIN_TONES),
            hairColor: look === "grandma" ? "#d8d4cc" : pick(HAIR_COLORS),
            shirtHex: `#${new THREE.Color(shirtColor).getHexString()}`,
            trousers: pick(TROUSER_COLORS),
            shoes: pick(SHOE_COLORS),
            cap: look === "kid" ? pick(["#d83a3a", "#2f6fd0", "#2e9a48"]) : null,
            style,
            look,
        }),
    });
    const { core, leg, arm } = shapes(style, look);

    // The origin is at the feet. Move the group along X/Z to move the whole NPC
    body.add(new THREE.Mesh(core, material));
    for (const [side, direction] of [["left", -1], ["right", 1]]) {
        // Pivot at the hip/shoulder so shoes and hands follow the swinging limbs
        const legGroup = new THREE.Group();
        legGroup.name = `${side}-leg`;
        legGroup.position.set(direction * 0.3, 1.7, 0);
        legGroup.add(new THREE.Mesh(leg, material));
        body.add(legGroup);

        const armGroup = new THREE.Group();
        armGroup.name = `${side}-arm`;
        armGroup.position.set(direction * 0.8, 3.3, 0);
        armGroup.add(new THREE.Mesh(arm, material));
        body.add(armGroup);
    }

    npc.userData.material = material;
    return npc;
}

// Frees a customer's texture and material once they've left (the shapes are shared)
export function disposeNPC(npc) {
    const material = npc.userData.material;
    material.map.dispose();
    material.dispose();
}
