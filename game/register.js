import * as THREE from "three";
import { PIXEL_FONT, pixelCanvasTexture } from "./font.js";
import { settings } from "../settings.js";

// Sign hanging over the counter with how the shift is going, readable from the shop floor and from
// behind the counter
export function createRegister(scene, counterLoaded) {
    const moneySound = new Audio("sound_effects/money.ogg");
    moneySound.preload = "auto";
    moneySound.volume = 0.6;

    // Small, so the pixel font's pixels show
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 80;
    const texture = pixelCanvasTexture(canvas);
    let shown = "";

    // `status` has the day, the time left as text, takings and target, walkouts and the most allowed,
    // and whether it's rush hour. On day 0 it just shows `time` as a message
    function show({ day, time, takings, target, walkouts, maxWalkouts, rush }) {
        const text = JSON.stringify([day, time, takings, target, walkouts, maxWalkouts, rush]);
        if (text === shown) return;
        shown = text;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f4f4ef";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = rush ? "#c8322a" : "#222";
        ctx.fillRect(0, 0, canvas.width, 4);
        ctx.fillRect(0, canvas.height - 4, canvas.width, 4);
        ctx.fillRect(0, 0, 4, canvas.height);
        ctx.fillRect(canvas.width - 4, 0, 4, canvas.height);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const middle = canvas.width / 2;
        const fit = canvas.width - 14;

        // Day 0 is before the first shift, or training
        if (day === 0) {
            ctx.fillStyle = "#222";
            ctx.font = `16px ${PIXEL_FONT}`;
            if (ctx.measureText(time).width > fit) ctx.font = `8px ${PIXEL_FONT}`;
            ctx.fillText(time, middle, canvas.height / 2 + 2, fit);
            texture.needsUpdate = true;
            return;
        }

        ctx.font = `8px ${PIXEL_FONT}`;
        ctx.fillStyle = rush ? "#c8322a" : "#222";
        ctx.fillText(rush ? `RUSH HOUR · ${time}` : `Day ${day} · ${time}`, middle, 17, fit);
        ctx.font = `16px ${PIXEL_FONT}`;
        ctx.fillStyle = takings >= target ? "#2e9a48" : "#222";
        ctx.fillText(`$${takings} / $${target}`, middle, 42, fit);
        ctx.font = `8px ${PIXEL_FONT}`;
        ctx.fillStyle = walkouts ? "#c8322a" : "#222";
        ctx.fillText(`Walkouts: ${walkouts} / ${maxWalkouts}`, middle, 66, fit);
        texture.needsUpdate = true;
    }

    const face = new THREE.MeshStandardMaterial({ map: texture });
    const edge = new THREE.MeshStandardMaterial({ color: 0x222222 });
    // BoxGeometry faces are +x, -x, +y, -y, +z, -z; the text goes on both big faces
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.1), [edge, edge, edge, edge, face, face]);

    counterLoaded.then((counter) => {
        // Over the middle of the counter top, which is on the desk's local +z side
        sign.position.copy(counter.localToWorld(new THREE.Vector3(0, 7.2, 1)));
        sign.rotation.y = counter.rotation.y;
        scene.add(sign);
    });

    function playMoneySound() {
        moneySound.currentTime = 0;
        moneySound.volume = 0.6 * settings.sfxVolume;
        moneySound.play().catch((error) => console.warn("Money sound failed to play:", error));
    }

    return { show, playMoneySound };
}
