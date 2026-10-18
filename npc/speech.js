import * as THREE from "three";

// Speech bubbles over NPCs' heads, one per NPC, that fade after a few seconds
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

    function say(npc, text, duration = 4) {
        clear(npc);
        const font = "bold 48px sans-serif";
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        context.font = font;
        canvas.width = Math.max(160, Math.ceil(context.measureText(text).width) + 56);
        canvas.height = 128;

        const middle = canvas.width / 2;
        context.fillStyle = "white";
        context.beginPath();
        context.roundRect(4, 4, canvas.width - 8, 96, 18);
        context.fill();
        context.beginPath();
        context.moveTo(middle - 20, 98);
        context.lineTo(middle, 124);
        context.lineTo(middle + 20, 98);
        context.fill();
        context.fillStyle = "#222";
        context.font = font;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, middle, 52);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
        sprite.position.set(0, 5.5, 0);
        sprite.scale.set(3 * canvas.width / 256, 1.5, 1);
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
