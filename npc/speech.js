import * as THREE from "three";

export function createNPCSpeech() {
    let bubble;
    let remaining = 0;

    function clear() {
        if (!bubble) return;
        bubble.removeFromParent();
        bubble.material.map.dispose();
        bubble.material.dispose();
        bubble = undefined;
    }

    function say(npc, text) {
        clear();
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.beginPath();
        context.roundRect(4, 4, 248, 96, 18);
        context.fill();
        context.beginPath();
        context.moveTo(108, 98);
        context.lineTo(128, 124);
        context.lineTo(148, 98);
        context.fill();
        context.fillStyle = "#222";
        context.font = "bold 48px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, 128, 52);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
        bubble.position.set(0, 5.5, 0);
        bubble.scale.set(3, 1.5, 1);
        bubble.renderOrder = 10;
        npc.add(bubble);
        remaining = 4;
    }

    function update(dt) {
        remaining -= dt;
        if (remaining <= 0) clear();
    }

    return { say, update, dispose: clear };
}
