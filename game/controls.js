import { showMenu, hideMenu } from "../menu/menu.js";

export function createControls({ renderer, player, interact, onPause = () => {} }) {
    const { keys, moveKeys: MOVE_KEYS } = player;

    // Menu
    //
    // The world is built and rendered behind the menu from the start, but only runs while playing

    let playing = false;

    document.querySelector("#play").addEventListener("click", () => {
        hideMenu();
        playing = true;
        renderer.domElement.requestPointerLock();
    });

    function openMenu() {
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

    return { get playing() { return playing; } };
}
