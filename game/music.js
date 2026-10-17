import { PARTITION_X } from "../scene/layout.js";

export function createMusicSystem() {
    // Both versions play in sync the whole time and only their volumes change, so switching rooms
    // never makes the song jump
    const audio = new AudioContext();
    const MUSIC = {
        shop: "music/ld60_generic_01.mp3",
        storage: "music/ld60_generic_01_storage_room.mp3",
    };
    const CROSSFADE = 0.3;

    let musicGains = null;
    let musicRoom = null;

    // Master volume from the settings menu
    const musicVolume = audio.createGain();
    musicVolume.connect(audio.destination);

    async function loadTrack(url) {
        const response = await fetch(url);
        return audio.decodeAudioData(await response.arrayBuffer());
    }

    async function startMusic() {
        const names = Object.keys(MUSIC);
        const buffers = await Promise.all(names.map((name) => loadTrack(MUSIC[name])));

        // Same start time and loop length for both, so decoding differences can't make them drift
        const startAt = audio.currentTime + 0.1;
        const loopEnd = Math.min(...buffers.map((buffer) => buffer.duration));

        const gains = {};
        names.forEach((name, i) => {
            const source = audio.createBufferSource();
            source.buffer = buffers[i];
            source.loop = true;
            source.loopEnd = loopEnd;

            const gain = audio.createGain();
            gain.gain.value = 0;
            source.connect(gain).connect(musicVolume);
            source.start(startAt);
            gains[name] = gain;
        });
        musicGains = gains;
    }

    startMusic();

    // Browsers keep audio suspended until the player interacts with the page
    for (const event of ["keydown", "click"]) {
        window.addEventListener(event, () => audio.resume());
    }

    function updateMusic(playerX) {
        const room = playerX < PARTITION_X ? "storage" : "shop";
        if (!musicGains || room === musicRoom) return;
        musicRoom = room;

        const now = audio.currentTime;
        for (const [name, gain] of Object.entries(musicGains)) {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(name === room ? 1 : 0, now + CROSSFADE);
        }
    }

    function setVolume(volume) {
        if (musicVolume.gain.value !== volume) musicVolume.gain.value = volume;
    }

    return { update: updateMusic, setVolume };
}
