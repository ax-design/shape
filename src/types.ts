export type CornerShape = 'round' | 'bevel' | 'scoop' | 'notch';
export type EdgeKind = 'flat' | 'arc' | 'rect' | 'triangle' | 'trapezoid';

// Corner order: top-left, top-right, bottom-right, bottom-left.
// Side order: top, right, bottom, left. Side i runs from corner i to corner (i + 1) % 4.
export type Quad<T> = [T, T, T, T];

export interface CornerSpec {
    // Fillet radius in px. For bevel, scoop and notch it sets the same tangent points a round
    // corner of this radius would have.
    radius: number;
    shape: CornerShape;
    // Displacement of the corner point in px. Positive values point into the shape.
    shiftX: number;
    shiftY: number;
}

export interface EdgeSpec {
    kind: EdgeKind;
    // Signed, in px. Positive is outward, negative is inward.
    depth: number;
    // Base width in px.
    span: number;
    // Center of the base as a fraction of the edge length, 0 to 1.
    at: number;
    // Top width as a fraction of the base width. Read by `trapezoid` only.
    ratio: number;
    tipRadius: number;
    shoulderRadius: number;
}

export interface ShapeSpec {
    width: number;
    height: number;
    corners: Quad<CornerSpec>;
    edges: Quad<EdgeSpec>;
}

export interface Point {
    x: number;
    y: number;
}

// One vertex of the sharp contour, before rounding.
export interface Vertex extends Point {
    radius: number;
    // Side whose border width applies to the segment that leaves this vertex.
    side: number;
}

export interface LineSegment {
    type: 'line';
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    side: number;
}

export interface ArcSegment {
    type: 'arc';
    cx: number;
    cy: number;
    r: number;
    // Angles in radians, canvas convention (y down).
    start: number;
    end: number;
    // true when the arc runs counterclockwise on screen.
    anticlockwise: boolean;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    // Side at the start and at the end of the arc. Corner fillets span two sides and blend
    // their border widths.
    side: number;
    sideEnd: number;
}

export type Segment = LineSegment | ArcSegment;

// A closed path. Consecutive segments share endpoints.
export interface Contour {
    segments: Segment[];
}

export type ClampKind = 'corner-shift' | 'corner-radius' | 'edge-span' | 'edge-depth' | 'vertex-radius';

export interface Clamp {
    kind: ClampKind;
    index: number;
    // Ratio applied, below 1.
    factor: number;
}

export interface ResolvedShape {
    outline: Contour;
    // Sharp contour with per-vertex radii, kept for debugging and border computation.
    vertices: Vertex[];
    bounds: { left: number; top: number; right: number; bottom: number };
    clamps: Clamp[];
}
