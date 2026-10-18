import * as THREE from "three";
import { WALL_HEIGHT } from "./layout.js";
import { pixelateLighting } from "./lighting.js";

// The wall texture covers the full wall height and repeats along the wall every TILE_WIDTH
const TILE_WIDTH = 2;

let material = null;

// Shared by every wall and the strips above doorways
export function wallMaterial() {
    if (!material) {
        const texture = new THREE.TextureLoader().load("textures/wall.png");
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // Pixel art, so it stays crisp up close
        texture.magFilter = THREE.NearestFilter;
        material = pixelateLighting(new THREE.MeshStandardMaterial({ map: texture }));
    }
    return material;
}

// Texture coordinates from where each corner is in the room, so the pattern is the same scale on
// every wall, lines up across separate pieces, and puts the top of the texture at the top of the
// wall. Call once the mesh is in place
export function tileWall(mesh) {
    mesh.updateMatrixWorld();
    const { geometry } = mesh;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const corner = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
        corner.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        // Faces looking along x run along z, and the rest along x
        const along = Math.abs(normal.getX(i)) > 0.5 ? corner.z : corner.x;
        uv.setXY(i, along / TILE_WIDTH, corner.y / WALL_HEIGHT);
    }
    uv.needsUpdate = true;
}
