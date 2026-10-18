import { settings } from "../settings.js";

// One-shot sound effects. Kept separate from music.js so the music code stays untouched
const audio = new AudioContext();

// A list of files means variants, one is picked at random each time
const SFX = {
    click: "sfx/ld60_sfx_menu_click.mp3",
    hover: "sfx/ld60_sfx_menu_on_hover.mp3",
    pickup: "sfx/ld60_sfx_pickup.mp3",
    paper: [
        "sfx/ld60_sfx_paper_1.mp3",
        "sfx/ld60_sfx_paper_2.mp3",
        "sfx/ld60_sfx_paper_3.mp3",
    ],
    electricPress: "sfx/ld60_sfx_electric_press.mp3",
    electricSuccess: "sfx/ld60_sfx_electric_success.mp3",
    electricError: "sfx/ld60_sfx_electric_error.mp3",
    electricFail: "sfx/ld60_sfx_electric_fail.mp3",
    electricNotification: "sfx/ld60_sfx_electric_notification.mp3",
};

// Volume from the settings menu, read every time a sound plays
const sfxVolume = audio.createGain();
sfxVolume.connect(audio.destination);

const buffers = {};

async function loadSound(url) {
    const response = await fetch(url);
    return audio.decodeAudioData(await response.arrayBuffer());
}

for (const [name, urls] of Object.entries(SFX)) {
    Promise.all([urls].flat().map(loadSound)).then((loaded) => {
        buffers[name] = loaded;
    });
}

// Browsers keep audio suspended until the player interacts with the page
for (const event of ["keydown", "click"]) {
    window.addEventListener(event, () => audio.resume());
}

export function play(name) {
    const variants = buffers[name];
    // Skip instead of queueing, so sounds triggered before the first click don't all burst out at once
    if (!variants || audio.state !== "running") return;

    sfxVolume.gain.value = settings.sfxVolume ?? 1;

    // A buffer source can only be started once, so every play gets a new one
    const source = audio.createBufferSource();
    source.buffer = variants[Math.floor(Math.random() * variants.length)];
    source.connect(sfxVolume);
    source.start();
}
