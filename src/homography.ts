import type { Point } from './types.js';

// Row-major 3x3 matrix mapping local (x, y, 1) on the z = 0 plane to screen (X * w, Y * w, w).
export type Homography = [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Homography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface TiltParams {
    width: number;
    height: number;
    // CSS perspective() distance in px. 0 or Infinity means no perspective.
    perspective: number;
    // Degrees, as in CSS rotateX() and rotateY().
    rotateX: number;
    rotateY: number;
    translateZ: number;
    // The point the rotation turns around, in local px. Default: the center of the box, as the
    // default transform-origin of CSS. It may lie outside the box (a row of tiles turning around
    // the left edge of their group).
    originX?: number;
    originY?: number;
}

// A 4x4 matrix in row-major storage, for column vectors, as CSS composes a transform list.
export type Matrix4 = number[];
type Mat4 = Matrix4;

// Column-vector 4x4 matrices in row-major storage, multiplied left to right like a CSS
// transform list: multiplyMatrix(a, b) is `transform: a b`.
export function multiplyMatrix(a: Mat4, b: Mat4): Mat4 {
    const out = new Array<number>(16).fill(0);
    for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) sum += a[r * 4 + k] * b[k * 4 + c];
            out[r * 4 + c] = sum;
        }
    return out;
}

function translate3d(x: number, y: number, z: number): Mat4 {
    return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
}

// The matrix of `perspective(p) rotateX(ax) rotateY(ay) translateZ(z)` around the origin (the
// center of a width x height box unless originX / originY say otherwise), in 3D. Two of them
// compose with multiplyMatrix exactly as two transforms in one CSS transform list do, which
// projecting each one alone would not.
export function tiltMatrix(t: TiltParams): Mat4 {
    const ax = (t.rotateX * Math.PI) / 180;
    const ay = (t.rotateY * Math.PI) / 180;
    const p = t.perspective > 0 && isFinite(t.perspective) ? -1 / t.perspective : 0;
    const perspective = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, p, 1];
    const rx = [1, 0, 0, 0, 0, Math.cos(ax), -Math.sin(ax), 0, 0, Math.sin(ax), Math.cos(ax), 0, 0, 0, 0, 1];
    const ry = [Math.cos(ay), 0, Math.sin(ay), 0, 0, 1, 0, 0, -Math.sin(ay), 0, Math.cos(ay), 0, 0, 0, 0, 1];
    const ox = t.originX === undefined ? t.width / 2 : t.originX;
    const oy = t.originY === undefined ? t.height / 2 : t.originY;
    let m = translate3d(ox, oy, 0);
    for (const step of [perspective, rx, ry, translate3d(0, 0, t.translateZ), translate3d(-ox, -oy, 0)]) m = multiplyMatrix(m, step);
    return m;
}

// A 3D matrix restricted to the z = 0 plane: what it does to a flat element.
export function planeHomography(m: Mat4): Homography {
    // Keep columns x, y and w of rows x, y and w.
    return [m[0], m[1], m[3], m[4], m[5], m[7], m[12], m[13], m[15]];
}

// tiltMatrix restricted to the plane.
export function tiltHomography(t: TiltParams): Homography {
    return planeHomography(tiltMatrix(t));
}

export function apply(h: Homography, p: Point): Point {
    const w = h[6] * p.x + h[7] * p.y + h[8];
    return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export function invert(h: Homography): Homography {
    const [a, b, c, d, e, f, g, i, j] = h;
    const A = e * j - f * i;
    const B = -(d * j - f * g);
    const C = d * i - e * g;
    const det = a * A + b * B + c * C;
    const k = 1 / det;
    return [
        A * k,
        -(b * j - c * i) * k,
        (b * f - c * e) * k,
        B * k,
        (a * j - c * g) * k,
        -(a * f - c * d) * k,
        C * k,
        -(a * i - b * g) * k,
        (a * e - b * d) * k,
    ];
}

// Square root of the local area scale at p: how much one local px grows on screen there.
export function scaleAt(h: Homography, p: Point): number {
    const w = h[6] * p.x + h[7] * p.y + h[8];
    const u = h[0] * p.x + h[1] * p.y + h[2];
    const v = h[3] * p.x + h[4] * p.y + h[5];
    const dXdx = (h[0] * w - u * h[6]) / (w * w);
    const dXdy = (h[1] * w - u * h[7]) / (w * w);
    const dYdx = (h[3] * w - v * h[6]) / (w * w);
    const dYdy = (h[4] * w - v * h[7]) / (w * w);
    return Math.sqrt(Math.abs(dXdx * dYdy - dXdy * dYdx));
}

export function isIdentity(h: Homography): boolean {
    for (let i = 0; i < 9; i++) if (Math.abs(h[i] - IDENTITY[i]) > 1e-12) return false;
    return true;
}
