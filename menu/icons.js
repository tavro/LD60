// Pixel-art icons for menu buttons, from the patterns below ("X" filled), shown at SCALE screen
// pixels per pixel before a button's label. A button gets one with `data-icon="play"` and so on.
// They're masks filled with the text color, so they invert with the button on hover
const SCALE = 2;

const ICONS = {
    play: [
        "X.....",
        "XXX...",
        "XXXXX.",
        "XXXXXX",
        "XXXXX.",
        "XXX...",
        "X.....",
    ],
    back: [
        ".....X",
        "...XXX",
        ".XXXXX",
        "XXXXXX",
        ".XXXXX",
        "...XXX",
        ".....X",
    ],
    help: [
        ".XXXX.",
        "XX..XX",
        "....XX",
        "..XXX.",
        "..XX..",
        "......",
        "..XX..",
    ],
    skip: [
        "X...X..X",
        "XX..XX.X",
        "XXX.XXXX",
        "XXXXXXXX",
        "XXX.XXXX",
        "XX..XX.X",
        "X...X..X",
    ],
    settings: [
        "..X..X..",
        ".XXXXXX.",
        "XXX..XXX",
        ".X....X.",
        ".X....X.",
        "XXX..XXX",
        ".XXXXXX.",
        "..X..X..",
    ],
};

function draw(pattern) {
    const canvas = document.createElement("canvas");
    canvas.width = pattern[0].length * SCALE;
    canvas.height = pattern.length * SCALE;
    const ctx = canvas.getContext("2d");
    pattern.forEach((row, y) => [...row].forEach((pixel, x) => {
        if (pixel === "X") ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }));
    return { url: canvas.toDataURL(), width: canvas.width, height: canvas.height };
}

const style = document.createElement("style");
style.textContent = `
[data-icon]::before {
  content: "";
  display: inline-block;
  margin-right: 12px;
  vertical-align: middle;
  background-color: currentColor;
}
${Object.entries(ICONS).map(([name, pattern]) => {
    const { url, width, height } = draw(pattern);
    return `[data-icon="${name}"]::before {
  width: ${width}px;
  height: ${height}px;
  -webkit-mask: url(${url}) no-repeat;
  mask: url(${url}) no-repeat;
}`;
}).join("\n")}
`;
document.head.append(style);
