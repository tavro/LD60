import menuHtml from "./menu.html?raw";
import { settings } from "../settings.js";
import { playSfx } from "../game/sfx.js";
import "./menu.css";

document.body.insertAdjacentHTML("beforeend", menuHtml);

const menu = document.querySelector(".game-menu");
const mainPanel = document.querySelector("#main-panel");
const settingsPanel = document.querySelector("#settings-panel");
const shiftPanel = document.querySelector("#shift-panel");
const volume = document.querySelector("#volume");
const sfxVolume = document.querySelector("#sfx-volume");
const brightness = document.querySelector("#brightness");

export function showMenu() {
    mainPanel.hidden = false;
    settingsPanel.hidden = true;
    shiftPanel.hidden = true;
    menu.style.display = "flex";
}

// The screen between shifts. `upgrades` are buttons with a label, a description, whether they can
// be bought and what happens when they are
export function showShiftPanel({ title, lines, upgrades = [], button, onContinue }) {
    mainPanel.hidden = true;
    settingsPanel.hidden = true;
    shiftPanel.hidden = false;
    menu.style.display = "flex";

    document.querySelector("#shift-title").textContent = title;
    document.querySelector("#shift-summary").replaceChildren(...lines.map((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        return item;
    }));
    document.querySelector("#shift-upgrades").replaceChildren(...upgrades.map((upgrade) => {
        const option = document.createElement("button");
        option.textContent = upgrade.label;
        const description = document.createElement("small");
        description.textContent = upgrade.description;
        option.append(description);
        option.disabled = !upgrade.available;
        option.addEventListener("click", upgrade.onBuy);
		option.addEventListener("click", () => playSfx("click"));
        return option;
    }));

    const next = document.querySelector("#shift-continue");
    next.textContent = button;
    next.onclick = onContinue;
}

export function hideMenu() {
    menu.style.display = "none";
}


volume.value = settings.volume;
sfxVolume.value = settings.sfxVolume;
brightness.value = settings.brightness;

document.querySelector("#settings").addEventListener("click", () => {
  mainPanel.hidden = true;
  settingsPanel.hidden = false;
  playSfx("click");
});

document.querySelector("#settings-back").addEventListener("click", () => {
  settingsPanel.hidden = true;
  mainPanel.hidden = false;
  playSfx("click");
});

volume.addEventListener("input", () => {
  settings.volume = Number(volume.value);
  // Apply settings.volume to your audio system here.
});

sfxVolume.addEventListener("input", () => {
  settings.sfxVolume = Number(sfxVolume.value);
  // Apply settings.sfxVolume to your audio system here.
});

brightness.addEventListener("input", () => {
  settings.brightness = Number(brightness.value);
});
