import { showMenu, hideMenu } from "../menu/menu.js";
import { playSfx } from "./sfx.js";
import { createTouchControls, touch } from "./touch.js";

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
        touchControls.setPlaying(true);
        touchControls.enterFullscreen();
        // Touch has no mouse to capture
        if (!touch.active) lockPointer();
    }

    document.querySelector("#play").addEventListener("click", () => {
        onPlay();
        resume();
    });

    // Pauses without the menu, for the caller to show something else
    function stop() {
        stopped = true;
        playing = false;
        touchControls.setPlaying(false);
        keys.clear();
        onPause();
        if (document.pointerLockElement) document.exitPointerLock();
    }

    function openMenu() {
        if (stopped) return;
        playing = false;
        touchControls.setPlaying(false);
        keys.clear();
        onPause();
        showMenu();
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") openMenu();
    });
    // Switching to another app or tab pauses
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && playing) openMenu();
    });

    const touchControls = createTouchControls({ renderer, player, interact, isPlaying: () => playing, openMenu });
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
        if (e.button !== 0 || !playing || touch.active) return;
        if (document.pointerLockElement === renderer.domElement) interact();
        else lockPointer();
    });

    // Other buttons do nothing in the game. Left to the browser, a right click opens its menu and a
    // middle click starts scrolling, and either releases the mouse, which opens the pause menu
    for (const event of ["contextmenu", "auxclick"]) {
        document.addEventListener(event, (e) => {
            if (playing) e.preventDefault();
        });
    }
    document.addEventListener("mousedown", (e) => {
        if (playing && e.button !== 0) e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
        if (document.pointerLockElement !== renderer.domElement) return;
        player.look(e.movementX, e.movementY);
    });

	// Raw mouse input avoids Chrome/Edge on Windows occasionally reporting huge fake movements
	function lockPointer() {
		const canvas = renderer.domElement;
		let request;
		try {
			request = canvas.requestPointerLock({ unadjustedMovement: true });
		} catch {
			request = null;
		}
		if (!request) return; // Browser doesn't return a promise; nothing more to do
		request.catch((error) => {
			// Raw input not supported here, so fall back to a normal lock
			if (error.name === "NotSupportedError") {
				canvas.requestPointerLock()?.catch?.(() => {});
			}
			// Any other failure (e.g. clicking again right after Escape) is harmless; ignore it
		});
	}

    return { stop, resume, get playing() { return playing; } };
}
