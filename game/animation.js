export function createAnimationSystem() {
    const tweens = [];

    // Calls `update` with progress from 0 to 1 over `duration` seconds, and resolves when done
    function tween(duration, update) {
        return new Promise((resolve) => tweens.push({ duration, elapsed: 0, update, resolve }));
    }

    function updateTweens(dt) {
        for (const t of [...tweens]) {
            t.elapsed = Math.min(t.elapsed + dt, t.duration);
            t.update(t.elapsed / t.duration);
            if (t.elapsed === t.duration) {
                tweens.splice(tweens.indexOf(t), 1);
                t.resolve();
            }
        }
    }

    return { tween, update: updateTweens };
}
