import * as THREE from "three";

// Memes from these subreddits, through meme-api.com. Both it and i.redd.it send CORS headers,
// which WebGL needs to use the images
const MEME_SUBREDDITS = ["ItalianBrainrot", "shitposting"];
const MEME_BATCH = 20;
let memeUrls = [];

async function nextMemeUrl() {
    if (memeUrls.length === 0) {
        const subreddit = MEME_SUBREDDITS[Math.floor(Math.random() * MEME_SUBREDDITS.length)];
        const response = await fetch(`https://meme-api.com/gimme/${subreddit}/${MEME_BATCH}`);
        const { memes } = await response.json();
        memeUrls = memes
            .filter((meme) => !meme.nsfw && !meme.spoiler && /\.(png|jpe?g)$/i.test(meme.url))
            .map((meme) => meme.url);
    }
    const url = memeUrls.pop();
    if (!url) throw new Error("No usable memes in batch");
    return url;
}

// A random meme fitted onto a white page, or a doodle if that doesn't load in time
export function randomImage() {
    const download = nextMemeUrl()
        .then((url) => new THREE.ImageLoader().loadAsync(url))
        .then(onPage);
    const timeout = new Promise((_, reject) => setTimeout(reject, 8000));

    return Promise.race([download, timeout])
        .catch(doodle)
        .then((texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        });
}

function onPage(image) {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 566;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f4f4ef";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const margin = 16;
    const scale = Math.min(
        (canvas.width - margin * 2) / image.width,
        (canvas.height - margin * 2) / image.height,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
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
