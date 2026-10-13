export { resolve } from './resolve.js';
export type { ResolveOptions } from './resolve.js';
export { traceContour, toSvgPath } from './emit.js';
export type { PathSink } from './emit.js';
export type {
    ArcSegment,
    Clamp,
    ClampKind,
    Contour,
    CornerShape,
    CornerSpec,
    EdgeKind,
    EdgeSpec,
    LineSegment,
    Point,
    Quad,
    ResolvedShape,
    Segment,
    ShapeSpec,
    Vertex,
} from './types.js';
export { borderInner, innerToSvgPath, traceInner } from './border.js';
export type { BorderOptions, BorderResult, RingSink } from './border.js';
export { IDENTITY, apply, invert, scaleAt, tiltHomography } from './homography.js';
export type { Homography, TiltParams } from './homography.js';
