import type { CornerSpec, EdgeSpec, ShapeSpec } from './types.js';

export const corner = (over: Partial<CornerSpec> = {}): CornerSpec => ({
    radius: 0,
    shape: 'round',
    shiftX: 0,
    shiftY: 0,
    ...over,
});

export const edge = (over: Partial<EdgeSpec> = {}): EdgeSpec => ({
    kind: 'none',
    depth: 0,
    span: 0,
    at: 0.5,
    ratio: 0.5,
    tipRadius: 0,
    shoulderRadius: 0,
    ...over,
});

export function shape(
    width: number,
    height: number,
    corners: Partial<CornerSpec> | Partial<CornerSpec>[] = {},
    edges: Partial<EdgeSpec>[] = []
): ShapeSpec {
    const c = Array.isArray(corners) ? corners : [corners, corners, corners, corners];
    return {
        width,
        height,
        corners: [corner(c[0]), corner(c[1]), corner(c[2]), corner(c[3])],
        edges: [edge(edges[0]), edge(edges[1]), edge(edges[2]), edge(edges[3])],
    };
}
