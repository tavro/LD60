import * as THREE from "three";

// Character memes with little text, picked from r/ItalianBrainrot and r/Bossfight and bundled with
// the game, so printing works offline and wherever the game is hosted. They're dealt out in a
// random order, all of them before any repeats
const PRINTS = Object.values(import.meta.glob("./prints/*.jpg", { eager: true, query: "?url", import: "default" }));
let deck = [];

function nextPrintUrl() {
    if (deck.length === 0) deck = [...PRINTS].sort(() => Math.random() - 0.5);
    return deck.pop();
}

// A random meme stretched over a whole page, or a doodle if it can't be loaded
export function randomImage() {
    return new THREE.ImageLoader().loadAsync(nextPrintUrl())
        .then(onPage)
        .catch(doodle)
        .then((texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        });
}

// Stretched to cover the whole page, edge to edge
function onPage(image) {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 566;
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return new THREE.CanvasTexture(canvas);
}

function doodle() {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 283;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = `hsl(${Math.random() * 360} 60% 85%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `hsl(${Math.random() * 360} 70% 50%)`;
        ctx.beginPath();
        ctx.arc(
            Math.random() * canvas.width,
            Math.random() * canvas.height,
            10 + Math.random() * 50,
            0,
            Math.PI * 2,
        );
        ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}
