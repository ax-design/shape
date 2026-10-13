import type { Point } from './types.js';

export const EPSILON = 1e-9;
const TAU = Math.PI * 2;

export function sub(a: Point, b: Point): Point {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Point, b: Point): Point {
    return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(a: Point, k: number): Point {
    return { x: a.x * k, y: a.y * k };
}

export function length(a: Point): number {
    return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function distance(a: Point, b: Point): number {
    return length(sub(a, b));
}

export function normalize(a: Point): Point {
    const l = length(a);
    return l < EPSILON ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function dot(a: Point, b: Point): number {
    return a.x * b.x + a.y * b.y;
}

export function cross(a: Point, b: Point): number {
    return a.x * b.y - a.y * b.x;
}

// Angle in [0, 2 pi).
export function normalizeAngle(a: number): number {
    const r = a % TAU;
    return r < 0 ? r + TAU : r;
}

export function angleOf(center: Point, p: Point): number {
    return Math.atan2(p.y - center.y, p.x - center.x);
}

// Direction flag for an arc from p0 to p1 around `center` that passes through `through`.
export function arcDirection(center: Point, p0: Point, p1: Point, through: Point): boolean {
    const a0 = angleOf(center, p0);
    const clockwiseSweep = normalizeAngle(angleOf(center, p1) - a0);
    const toThrough = normalizeAngle(angleOf(center, through) - a0);
    // Canvas angles grow clockwise on screen (y down). The arc is anticlockwise when the
    // through point is not inside the clockwise sweep.
    return !(toThrough <= clockwiseSweep);
}

// Signed sweep of an arc in radians, positive when clockwise on screen.
export function arcSweep(start: number, end: number, anticlockwise: boolean): number {
    return anticlockwise ? -normalizeAngle(start - end) : normalizeAngle(end - start);
}
