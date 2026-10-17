import { settings } from "../settings.js";

export function applySettings(renderer, music) {
    music.setVolume(settings.volume);

    const filter = `brightness(${settings.brightness})`;
    if (renderer.domElement.style.filter !== filter) renderer.domElement.style.filter = filter;
}
