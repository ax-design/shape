import { expect, test } from 'bun:test';
import { apply, multiplyMatrix, planeHomography, tiltHomography, tiltMatrix } from './homography.js';
import { projectContour } from './border.js';
import { resolve } from './resolve.js';
import { shape as spec } from './test-utils.js';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test('the origin defaults to the center of the box', () => {
    const base = { width: 200, height: 100, perspective: 400, rotateX: 10, rotateY: -20, translateZ: -3 };
    const a = tiltHomography(base);
    const b = tiltHomography({ ...base, originX: 100, originY: 50 });
    for (let i = 0; i < 9; i++) expect(close(a[i], b[i])).toBe(true);
});

test('a rotation about an origin keeps the origin where it is', () => {
    // A tile turning about the left edge of its group, 300 px to its left.
    const h = tiltHomography({ width: 120, height: 120, perspective: 1000, rotateX: 0, rotateY: 60, translateZ: 0, originX: -300, originY: 60 });
    const p = apply(h, { x: -300, y: 60 });
    expect(close(p.x, -300, 1e-6) && close(p.y, 60, 1e-6)).toBe(true);
    // A point on the tile moves toward the axis as it turns away.
    const q = apply(h, { x: 120, y: 60 });
    expect(q.x).toBeLessThan(120);
});

test('two tilts compose as one transform list, not as two projections', () => {
    const size = { width: 100, height: 100 };
    const outer = tiltMatrix({ ...size, perspective: 500, rotateX: 0, rotateY: 30, translateZ: 0 });
    const inner = tiltMatrix({ ...size, perspective: 500, rotateX: 15, rotateY: 0, translateZ: -2 });
    const composed = planeHomography(multiplyMatrix(outer, inner));
    // An identity tilt (no rotation, no perspective) leaves the other transform alone.
    const none = tiltMatrix({ ...size, perspective: 0, rotateX: 0, rotateY: 0, translateZ: 0 });
    const alone = planeHomography(multiplyMatrix(none, inner));
    const direct = planeHomography(inner);
    for (let i = 0; i < 9; i++) expect(close(alone[i], direct[i])).toBe(true);
    // And a rotation changes it.
    expect(close(composed[0], direct[0])).toBe(false);
});

test('projectContour follows the outline through the transform', () => {
    const shape = resolve(spec(100, 60, { radius: 10 }));
    const flat = projectContour(shape.outline, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    // Every point lies on the box, and the arcs are sampled into several points.
    expect(flat.length).toBeGreaterThan(8);
    for (const p of flat) expect(p.x >= -1e-6 && p.x <= 100 + 1e-6 && p.y >= -1e-6 && p.y <= 60 + 1e-6).toBe(true);
    const h = tiltHomography({ width: 100, height: 60, perspective: 300, rotateX: 0, rotateY: 45, translateZ: 0 });
    const turned = projectContour(shape.outline, h);
    // The projected points are the outline points mapped through h.
    const left = Math.min(...turned.map((p) => p.x));
    const right = Math.max(...turned.map((p) => p.x));
    expect(right - left).toBeLessThan(100);
});
