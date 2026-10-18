import { showMenu, hideMenu } from "../menu/menu.js";
import { playSfx } from "./sfx.js";

export function createControls({ renderer, player, interact, onPlay = () => {}, onPause = () => {} }) {
    const { keys, moveKeys: MOVE_KEYS } = player;

    // Menu
    //
    // The world is built and rendered behind the menu from the start, but only runs while playing

    let playing = false;
    // Between shifts, when the shift screen is up instead of the menu
    let stopped = false;

    function resume() {
		playSfx("click");
        stopped = false;
        hideMenu();
        playing = true;
        renderer.domElement.requestPointerLock();
    }

    document.querySelector("#play").addEventListener("click", (event) => {
        event.currentTarget.textContent = "▶ Back to work";
        onPlay();
        resume();
    });

    // Pauses without the menu, for the caller to show something else
    function stop() {
        stopped = true;
        playing = false;
        keys.clear();
        onPause();
        if (document.pointerLockElement) document.exitPointerLock();
    }

    function openMenu() {
        if (stopped) return;
        playing = false;
        keys.clear();
        onPause();
        showMenu();
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") openMenu();
    });
    // Escape while the mouse is captured only releases it, without the key press reaching the page
    document.addEventListener("pointerlockchange", () => {
        if (!document.pointerLockElement && playing) openMenu();
    });

    window.addEventListener("keydown", (e) => {
        if (!playing) return;
        if (MOVE_KEYS.includes(e.code)) {
            keys.add(e.code);
        }
    });
    window.addEventListener("keyup", (e) => keys.delete(e.code));
    window.addEventListener("blur", () => keys.clear());

    // The first click only captures the mouse; after that left click interacts
    renderer.domElement.addEventListener("mousedown", (e) => {
        if (e.button !== 0 || !playing) return;
        if (document.pointerLockElement === renderer.domElement) interact();
        else renderer.domElement.requestPointerLock();
    });
    window.addEventListener("mousemove", (e) => {
        if (document.pointerLockElement !== renderer.domElement) return;
        player.look(e.movementX, e.movementY);
    });

    return { stop, resume, get playing() { return playing; } };
}
