import * as THREE from "three";

// Sign hanging over the counter with the takings and how many customers walked out, readable from
// the shop floor and from behind the counter
export function createRegister(scene, counterLoaded) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    let money = 0;
    let walkouts = 0;

    function draw() {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f4f4ef";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 24;
        ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
        ctx.fillStyle = "#222";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 120px sans-serif";
        ctx.fillText(`$${money}`, canvas.width / 2, 110);
        ctx.font = "bold 40px sans-serif";
        ctx.fillStyle = walkouts ? "#c8322a" : "#222";
        ctx.fillText(`Walkouts: ${walkouts}`, canvas.width / 2, 200);
        texture.needsUpdate = true;
    }
    draw();

    const face = new THREE.MeshStandardMaterial({ map: texture });
    const edge = new THREE.MeshStandardMaterial({ color: 0x222222 });
    // BoxGeometry faces are +x, -x, +y, -y, +z, -z; the text goes on both big faces
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.1), [edge, edge, edge, edge, face, face]);

    counterLoaded.then((counter) => {
        // Over the middle of the counter top, which is on the desk's local +z side
        sign.position.copy(counter.localToWorld(new THREE.Vector3(0, 7.2, 1)));
        sign.rotation.y = counter.rotation.y;
        scene.add(sign);
    });

    function sell(price) {
        money += price;
        draw();
    }

    function walkout() {
        walkouts++;
        draw();
    }

    return { sell, walkout };
}
