// Room coordinates: +X is right, +Z is towards the bottom of the floor plan.
export const ROOM_WIDTH = 40;
export const ROOM_DEPTH = 28;
export const WALL_HEIGHT = 9;
export const WALL_THICKNESS = 0.5;
export const W = ROOM_WIDTH / 2;
export const D = ROOM_DEPTH / 2;
export const INNER = D - WALL_THICKNESS / 2;
export const PARTITION_X = -4;

// Doorways: one in the partition into the storage room, and the customer entrance in the bottom wall
// by the desk. Wall ends reach WALL_THICKNESS / 2 into the opening, so the clear gap is a bit narrower
export const STORAGE_DOOR = { z: -7.75, width: 3.5 };
export const FRONT_DOOR = { x: 10, width: 5 };

// Ceiling light panels, by their x and z; each one also shines a light down into the room
export const LIGHT_PANELS = [-14, -8, 2, 10, 16].flatMap((x) => [-8, 0, 8].map((z) => [x, z]));
