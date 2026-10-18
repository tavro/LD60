import * as THREE from "three";
import "@fontsource/press-start-2p/400.css";

// The pixel font used for all text, in the menus and on things in the world: a plain 8 × 8 one.
// In-world text is drawn on small canvases at multiples of 8px and shown without smoothing, so the
// letters come out as crisp pixels
export const PIXEL_FONT = '"Press Start 2P", monospace';

// Resolves once the font can be drawn on canvases; text drawn before then would use a fallback
export const fontReady = document.fonts.load(`8px ${PIXEL_FONT}`);

// A canvas texture shown as crisp pixels
export function pixelCanvasTexture(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return texture;
}
