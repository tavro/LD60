export function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

export function isPartOf(object, ancestor) {
    for (; object; object = object.parent) {
        if (object === ancestor) return true;
    }
    return false;
}
