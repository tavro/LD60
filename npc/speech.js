import * as THREE from "three";
import { PIXEL_FONT, pixelCanvasTexture } from "../game/font.js";

// Pixel-art speech bubbles over NPCs' heads, one per NPC, that go away after a few seconds: a white
// box with a dark outline and stepped corners, a stepped tail pointing down at the speaker, and the
// text in the pixel font
const FONT = `8px ${PIXEL_FONT}`;
const TEXT_HEIGHT = 8;
const PADDING = 4;
const TAIL = 4;
// Size of one bubble pixel in the world
const PIXEL_SIZE = 0.045;
const OUTLINE = "#222";
const FILL = "#fdfcf8";

export function createNPCSpeech() {
    const bubbles = new Map();

    function clear(npc) {
        const bubble = bubbles.get(npc);
        if (!bubble) return;
        bubble.sprite.removeFromParent();
        bubble.sprite.material.map.dispose();
        bubble.sprite.material.dispose();
        bubbles.delete(npc);
    }

    function draw(text) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.font = FONT;
        const width = Math.ceil(ctx.measureText(text).width) + PADDING * 2 + 4;
        const boxHeight = TEXT_HEIGHT + PADDING * 2 + 2;
        canvas.width = width;
        canvas.height = boxHeight + TAIL;

        const rect = (x, y, w, h, color) => {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
        };
        // Outline and fill, each as two overlapping rectangles, which leaves the corners stepped
        rect(1, 0, width - 2, boxHeight, OUTLINE);
        rect(0, 1, width, boxHeight - 2, OUTLINE);
        rect(2, 1, width - 4, boxHeight - 2, FILL);
        rect(1, 2, width - 2, boxHeight - 4, FILL);

        // Tail, narrowing a pixel each row
        const middle = Math.floor(width / 2);
        for (let row = 0; row < TAIL; row++) {
            const half = TAIL - 1 - row;
            rect(middle - half - 1, boxHeight - 1 + row, half * 2 + 3, 1, OUTLINE);
            if (half > 0) rect(middle - half, boxHeight - 1 + row, half * 2 + 1, 1, FILL);
        }

        ctx.font = FONT;
        ctx.fillStyle = OUTLINE;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, width / 2, boxHeight / 2 + 1);
        return canvas;
    }

    // Over an NPC's head, or `height` above anything else
    function say(npc, text, duration = 4, height = 5.5) {
        clear(npc);
        const canvas = draw(text);
        // Kept out of the tone mapping, so it stays crisp white
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: pixelCanvasTexture(canvas),
            depthTest: false,
            toneMapped: false,
        }));
        sprite.position.set(0, height, 0);
        sprite.scale.set(canvas.width * PIXEL_SIZE, canvas.height * PIXEL_SIZE, 1);
        sprite.renderOrder = 10;
        npc.add(sprite);
        bubbles.set(npc, { sprite, remaining: duration });
    }

    function update(dt) {
        for (const [npc, bubble] of bubbles) {
            bubble.remaining -= dt;
            if (bubble.remaining <= 0) clear(npc);
        }
    }

    return { say, update, clear };
}
