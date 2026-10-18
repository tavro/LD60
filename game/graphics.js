import { settings } from "../settings.js";
import { likelyTouch } from "./touch.js";

// The graphics setting. Each level trades looks for speed: the glow, shadows (and how often they're
// redrawn), light from the ceiling panels, and how many pixels are rendered. "auto" starts at high
// (medium on phones) and steps down a level whenever the game runs under AUTO_MIN_FPS for a while
const LEVELS = {
    high: { bloom: true, shadows: true, shadowRate: 20, panels: "all", pixelRatio: 1.5 },
    medium: { bloom: false, shadows: true, shadowRate: 10, panels: "half", pixelRatio: 1 },
    low: { bloom: false, shadows: false, shadowRate: 10, panels: "none", pixelRatio: 0.75 },
};
const ORDER = ["high", "medium", "low"];
const AUTO_MIN_FPS = 45;
// Seconds of play averaged before deciding, and to wait after a change before measuring again
const AUTO_WINDOW = 2;
const AUTO_SETTLE = 3;

export function createGraphics({ scene, renderer, composer, bloom, lighting }) {
    let applied = null;
    // Phones start a step down
    let autoLevel = likelyTouch ? "medium" : "high";
    let measured = 0;
    let frames = 0;
    let settle = AUTO_SETTLE;

    function apply(name) {
        if (name === applied) return;
        applied = name;
        const level = LEVELS[name];

        bloom.enabled = level.bloom;
        lighting.setQuality(level);
        const pixelRatio = Math.min(window.devicePixelRatio, level.pixelRatio);
        renderer.setPixelRatio(pixelRatio);
        composer.setPixelRatio(pixelRatio);
        if (renderer.shadowMap.enabled !== level.shadows) {
            renderer.shadowMap.enabled = level.shadows;
            // Materials are rebuilt with or without shadows
            scene.traverse((object) => {
                for (const material of [object.material ?? []].flat()) material.needsUpdate = true;
            });
        }
    }

    // `seconds` is how long the frame actually took, while playing
    function update(seconds) {
        if (settings.graphics !== "auto") {
            apply(settings.graphics);
            return;
        }
        apply(autoLevel);

        settle -= seconds;
        if (settle > 0 || autoLevel === "low") return;
        measured += seconds;
        frames++;
        if (measured < AUTO_WINDOW) return;

        const fps = frames / measured;
        measured = 0;
        frames = 0;
        if (fps < AUTO_MIN_FPS) {
            autoLevel = ORDER[ORDER.indexOf(autoLevel) + 1];
            settle = AUTO_SETTLE;
        }
    }

    return { update, get level() { return applied; } };
}
