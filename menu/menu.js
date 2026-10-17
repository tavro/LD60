import menuHtml from "./menu.html?raw";
import { settings } from "../settings.js";
import "./menu.css";

document.body.insertAdjacentHTML("beforeend", menuHtml);

const menu = document.querySelector(".game-menu");
const mainPanel = document.querySelector("#main-panel");
const settingsPanel = document.querySelector("#settings-panel");
const volume = document.querySelector("#volume");
const brightness = document.querySelector("#brightness");

export function showMenu() {
    mainPanel.hidden = false;
    settingsPanel.hidden = true;
    menu.style.display = "flex";
}

export function hideMenu() {
    menu.style.display = "none";
}


volume.value = settings.volume;
brightness.value = settings.brightness;

document.querySelector("#settings").addEventListener("click", () => {
  mainPanel.hidden = true;
  settingsPanel.hidden = false;
});

document.querySelector("#settings-back").addEventListener("click", () => {
  settingsPanel.hidden = true;
  mainPanel.hidden = false;
});

volume.addEventListener("input", () => {
  settings.volume = Number(volume.value);
  // Apply settings.volume to your audio system here.
});

brightness.addEventListener("input", () => {
  settings.brightness = Number(brightness.value);
});
