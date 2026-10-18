import { playSfx } from "./sfx.js";

// Touch controls for phones and tablets: a joystick that appears under the left thumb to walk,
// dragging anywhere on the right half to look around, and a USE button (or a quick tap on the right
// half) for what the mouse button does. A pause button opens the menu. They switch on with the first
// touch, so touchscreen laptops played with a mouse don't get them
//
// Touch looks this many times faster than the mouse per pixel, since a thumb moves fewer pixels
const LOOK_SPEED = 2.5;
// How far the joystick's knob can move from where the thumb came down, in pixels
const STICK_RADIUS = 56;
// A touch this short and still counts as a tap
const TAP_TIME = 250;
const TAP_DISTANCE = 12;

// Whether the game is being played by touch, set by the first touch
export const touch = { active: false };

// Phones and tablets, whose controls aren't known until the first touch but are likely touch
export const likelyTouch = window.matchMedia("(pointer: coarse)").matches;

// On-screen text, with the mouse and keyboard parts reworded for touch
export function forDevice(text) {
    if (!touch.active) return text;
    return text
        .replace("Move with WASD and look around with the mouse.",
            "Walk with your left thumb and look around by dragging on the right.")
        .replace(/\bclick/g, "tap")
        .replace(/\bClick/g, "Tap");
}

export function createTouchControls({ renderer, player, interact, isPlaying, openMenu }) {
    const layer = document.createElement("div");
    layer.id = "touch-controls";
    layer.hidden = true;
    layer.innerHTML = `
        <div class="touch-stick" hidden><div class="touch-knob"></div></div>
        <button class="touch-button touch-use" type="button">USE</button>
        <button class="touch-button touch-pause" type="button" aria-label="Pause">II</button>
    `;
    document.body.append(layer);
    const stick = layer.querySelector(".touch-stick");
    const knob = layer.querySelector(".touch-knob");

    let moveTouch = null;
    let lookTouch = null;

    function activate() {
        if (touch.active) return;
        touch.active = true;
        document.body.classList.add("touch");
        setPlaying(isPlaying());
    }

    // Shown only while playing
    function setPlaying(playing) {
        layer.hidden = !(touch.active && playing);
        if (!playing) release();
    }

    function release() {
        moveTouch = null;
        lookTouch = null;
        stick.hidden = true;
        player.stick.set(0, 0);
    }

    // Any touch, like on the menu's play button, before that button starts the game
    document.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch") activate();
    }, { capture: true });

    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "touch") return;
        // Keeps the browser from also sending mouse clicks for the touch
        event.preventDefault();
        if (!isPlaying()) return;
        canvas.setPointerCapture(event.pointerId);

        const start = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
        if (event.clientX < window.innerWidth / 2 && !moveTouch) {
            moveTouch = start;
            stick.hidden = false;
            stick.style.left = `${start.x}px`;
            stick.style.top = `${start.y}px`;
            knob.style.transform = "";
        } else if (!lookTouch) {
            lookTouch = { ...start, lastX: start.x, lastY: start.y, moved: 0 };
        }
    });

    canvas.addEventListener("pointermove", (event) => {
        if (event.pointerType !== "touch") return;
        if (moveTouch?.id === event.pointerId) {
            let dx = event.clientX - moveTouch.x;
            let dy = event.clientY - moveTouch.y;
            const distance = Math.hypot(dx, dy);
            if (distance > STICK_RADIUS) {
                dx *= STICK_RADIUS / distance;
                dy *= STICK_RADIUS / distance;
            }
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
            // Forward is up the screen
            player.stick.set(dx / STICK_RADIUS, -dy / STICK_RADIUS);
        } else if (lookTouch?.id === event.pointerId) {
            const dx = event.clientX - lookTouch.lastX;
            const dy = event.clientY - lookTouch.lastY;
            lookTouch.lastX = event.clientX;
            lookTouch.lastY = event.clientY;
            lookTouch.moved += Math.hypot(dx, dy);
            player.look(dx * LOOK_SPEED, dy * LOOK_SPEED);
        }
    });

    function end(event) {
        if (event.pointerType !== "touch") return;
        if (moveTouch?.id === event.pointerId) {
            moveTouch = null;
            stick.hidden = true;
            player.stick.set(0, 0);
        } else if (lookTouch?.id === event.pointerId) {
            const tap = event.type === "pointerup" && lookTouch.moved < TAP_DISTANCE &&
                performance.now() - lookTouch.time < TAP_TIME;
            lookTouch = null;
            if (tap && isPlaying()) interact();
        }
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    function onTap(button, action) {
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isPlaying()) action();
        });
    }
    onTap(layer.querySelector(".touch-use"), interact);
    onTap(layer.querySelector(".touch-pause"), () => {
        playSfx("click");
        openMenu();
    });

    // Fullscreen and turned sideways when starting to play, where the browser allows it
    function enterFullscreen() {
        if (!touch.active && !likelyTouch) return;
        const root = document.documentElement;
        if (!document.fullscreenElement && root.requestFullscreen) {
            root.requestFullscreen({ navigationUI: "hide" })
                .then(() => screen.orientation?.lock?.("landscape"))
                .catch(() => {});
        }
    }

    // Phones in portrait get a hint to turn sideways, from the stylesheet
    const hint = document.createElement("div");
    hint.id = "rotate-hint";
    hint.textContent = "Turn your phone sideways to play";
    document.body.append(hint);

    // Never zoomed by pinching or double tapping
    document.addEventListener("gesturestart", (event) => event.preventDefault());
    document.addEventListener("dblclick", (event) => event.preventDefault());

    return { setPlaying, enterFullscreen };
}
