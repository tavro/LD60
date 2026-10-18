// Pixel-art cursors, drawn from the patterns below ("W" white, "X" dark outline, anything else
// clear) and shown at SCALE screen pixels per pixel: the crosshair, corner brackets around it when
// aiming at something that can be picked up or used, and an arrow pointer for the menus
const SCALE = 2;

const CROSSHAIR = [
    ".....X.....",
    "....XWX....",
    "....XWX....",
    "....XWX....",
    ".XXXX.XXXX.",
    "XWWW...WWWX",
    ".XXXX.XXXX.",
    "....XWX....",
    "....XWX....",
    "....XWX....",
    ".....X.....",
];

const AIMING = [
    "XXXXX.....XXXXX",
    "XWWWX.....XWWWX",
    "XWXXX.....XXXWX",
    "XWX.........XWX",
    "XXX.........XXX",
    "...............",
    "...............",
    ".......X.......",
    "...............",
    "...............",
    "XXX.........XXX",
    "XWX.........XWX",
    "XWXXX.....XXXWX",
    "XWWWX.....XWWWX",
    "XXXXX.....XXXXX",
];

const POINTER = [
    "X..........",
    "XX.........",
    "XWX........",
    "XWWX.......",
    "XWWWX......",
    "XWWWWX.....",
    "XWWWWWX....",
    "XWWWWWWX...",
    "XWWWWWWWX..",
    "XWWWWWWWWX.",
    "XWWWWWXXXXX",
    "XWWXWWX....",
    "XWX.XWWX...",
    "XX..XWWX...",
    "X....XWWX..",
    ".....XXXX..",
];

const COLORS = { W: "#ffffff", X: "rgba(20, 16, 12, 0.85)" };

function draw(pattern) {
    const canvas = document.createElement("canvas");
    canvas.width = pattern[0].length * SCALE;
    canvas.height = pattern.length * SCALE;
    const ctx = canvas.getContext("2d");
    pattern.forEach((row, y) => {
        [...row].forEach((pixel, x) => {
            if (!COLORS[pixel]) return;
            ctx.fillStyle = COLORS[pixel];
            ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        });
    });
    return { url: canvas.toDataURL(), width: canvas.width, height: canvas.height };
}

const crosshair = draw(CROSSHAIR);
const aiming = draw(AIMING);
const pointer = draw(POINTER);

const style = document.createElement("style");
style.textContent = `
#crosshair {
  width: ${crosshair.width}px;
  height: ${crosshair.height}px;
  margin: ${-crosshair.height / 2}px 0 0 ${-crosshair.width / 2}px;
  background: url(${crosshair.url}) no-repeat;
  image-rendering: pixelated;
}
#crosshair.aiming {
  width: ${aiming.width}px;
  height: ${aiming.height}px;
  margin: ${-aiming.height / 2}px 0 0 ${-aiming.width / 2}px;
  background-image: url(${aiming.url});
}
.game-menu, .game-menu button, .game-menu input {
  cursor: url(${pointer.url}) 0 0, default;
}
`;
document.head.append(style);
