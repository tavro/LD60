import * as THREE from "three";

// Blocky customers: boxes with small pixel-art textures as skin, with the face, hair and clothing
// details painted in. Skin, hair and clothes vary, and some customer types (`look`) get a detail:
// a tie for businessmen, grey hair in a bun and glasses for grandmas, a cap for kids, sunglasses and
// a gold chain for VIPs. Shoplifters look like anyone else on purpose. The walking animation swings
// the parts named "left-leg", "right-arm" and so on
const SKIN_TONES = ["#f1c8a5", "#dca47d", "#c68863", "#9a6440", "#6e4529"];
const HAIR_COLORS = ["#2b1d14", "#4a2e1a", "#8a5a2b", "#d8b56a", "#1a1a1a", "#a0401f"];
const TROUSER_COLORS = ["#303b50", "#3a3a3a", "#5a4632", "#2c4a3a", "#6b6b72"];
const SHOE_COLORS = ["#252525", "#4a2e1a", "#e8e4dc"];
const HAIR_STYLES = ["short", "short", "long", "bald"];
// Texture size in pixels, for every face of every part
const PIXELS = 8;

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

const geometries = {};

function box(width, height, depth) {
    const key = `${width},${height},${depth}`;
    geometries[key] ??= new THREE.BoxGeometry(width, height, depth);
    return geometries[key];
}

// The color a little lighter or darker, for pixel-to-pixel variation
function shade(hex, amount) {
    return `#${new THREE.Color(hex).offsetHSL(0, 0, (Math.random() - 0.5) * amount).getHexString()}`;
}

// A PIXELS × PIXELS texture of `base` with a little noise, then `paint(set)` for details, where
// `set(x, y, color)` colors one pixel counted from the top left
function pixelTexture(base, paint = () => {}, noise = 0.06) {
    const canvas = document.createElement("canvas");
    canvas.width = PIXELS;
    canvas.height = PIXELS;
    const ctx = canvas.getContext("2d");
    const set = (x, y, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
    };
    for (let y = 0; y < PIXELS; y++) {
        for (let x = 0; x < PIXELS; x++) set(x, y, shade(base, noise));
    }
    paint(set);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
}

function material(texture) {
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
}

// Materials for a box's faces, in BoxGeometry's order: +x, -x, +y, -y, +z (front), -z (back)
function faces({ side, top, bottom = top, front = side, back = side }) {
    return [side, side, top, bottom, front, back].map((texture) => material(texture));
}

export function createNPC({ id = "npc-1", shirtColor = 0x447abb, look = null } = {}) {
    const npc = new THREE.Group();
    npc.name = id;
    npc.userData.id = id;
    // A little taller or shorter than average
    const body = new THREE.Group();
    body.scale.setScalar(0.94 + Math.random() * 0.12);
    npc.add(body);

    const skinColor = pick(SKIN_TONES);
    const hairColor = look === "grandma" ? "#d8d4cc" : pick(HAIR_COLORS);
    const shirtHex = `#${new THREE.Color(shirtColor).getHexString()}`;
    const style = look === "grandma" ? "bun" : look === "kid" ? "short" : pick(HAIR_STYLES);
    const hasHair = style !== "bald";

    const skin = pixelTexture(skinColor);
    const shirt = pixelTexture(shirtHex);
    const trousers = pixelTexture(pick(TROUSER_COLORS));
    const shoes = pixelTexture(pick(SHOE_COLORS));
    const hair = pixelTexture(hairColor, () => {}, 0.12);

    // Torso front: a collar, and the type's detail
    const chest = pixelTexture(shirtHex, (set) => {
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
    const face = pixelTexture(skinColor, (set) => {
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
    const headSide = pixelTexture(skinColor, (set) => {
        if (!hasHair) return;
        for (let y = 0; y < 3; y++) for (let x = 0; x < PIXELS; x++) set(x, y, shade(hairColor, 0.12));
        for (let y = 3; y < (style === "long" ? 7 : 5); y++) for (let x = 5; x < PIXELS; x++) set(x, y, shade(hairColor, 0.12));
    });
    const headBack = hasHair
        ? pixelTexture(hairColor, (set) => {
            if (style === "long") return;
            for (let y = 6; y < PIXELS; y++) for (let x = 0; x < PIXELS; x++) set(x, y, shade(skinColor, 0.06));
        }, 0.12)
        : skin;

    function add(name, [width, height, depth], [x, y, z], materials, parent = body) {
        const part = new THREE.Mesh(box(width, height, depth), materials);
        part.name = name;
        part.position.set(x, y, z);
        parent.add(part);
        return part;
    }

    const plain = (texture) => faces({ side: texture, top: texture });

    // The origin is at the feet. Move the group along X/Z to move the whole NPC
    add("torso", [1.2, 1.5, 0.65], [0, 2.65, 0], faces({ side: shirt, top: shirt, front: chest }));
    add("hips", [1.12, 0.3, 0.62], [0, 1.8, 0], plain(trousers));
    add("neck", [0.35, 0.25, 0.35], [0, 3.5, 0], plain(skin));

    for (const [side, direction] of [["left", -1], ["right", 1]]) {
        // Pivot at the hip/shoulder so shoes and hands follow the swinging limbs
        const leg = new THREE.Group();
        leg.name = `${side}-leg`;
        leg.position.set(direction * 0.3, 1.7, 0);
        body.add(leg);
        add(`${side}-leg-mesh`, [0.44, 1.45, 0.48], [0, -0.72, 0], plain(trousers), leg);
        add(`${side}-shoe`, [0.48, 0.26, 0.72], [0, -1.55, 0.1], plain(shoes), leg);

        const arm = new THREE.Group();
        arm.name = `${side}-arm`;
        arm.position.set(direction * 0.8, 3.3, 0);
        body.add(arm);
        add(`${side}-arm-mesh`, [0.34, 1.35, 0.38], [0, -0.62, 0], plain(shirt), arm);
        add(`${side}-hand`, [0.3, 0.32, 0.32], [0, -1.42, 0], plain(skin), arm);
    }

    // Head, facing +Z
    const head = new THREE.Group();
    head.name = "head";
    head.position.y = 4.1;
    body.add(head);
    add("skull", [0.95, 1, 0.9], [0, 0, 0], faces({
        side: headSide,
        top: hasHair ? hair : skin,
        bottom: skin,
        front: face,
        back: headBack,
    }), head);

    if (style === "bun") add("bun", [0.42, 0.38, 0.4], [0, 0.55, -0.4], plain(hair), head);
    if (look === "kid") {
        const cap = pixelTexture(pick(["#d83a3a", "#2f6fd0", "#2e9a48"]));
        add("cap", [1.02, 0.25, 0.98], [0, 0.5, 0], plain(cap), head);
        add("cap-brim", [0.8, 0.06, 0.45], [0, 0.4, 0.6], plain(cap), head);
    }

    return npc;
}

// Frees a customer's textures and materials once they've left (the box shapes are shared)
export function disposeNPC(npc) {
    npc.traverse((part) => {
        if (!part.isMesh) return;
        for (const mat of [part.material].flat()) {
            mat.map?.dispose();
            mat.dispose();
        }
    });
}
