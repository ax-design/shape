<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ax-design/shape/master/docs/logo-r.png">
    <img src="https://raw.githubusercontent.com/ax-design/shape/master/docs/logo.png" alt="Ax Pressure">
  </picture>
</h1>

<p align="center">
  The shapes system of the Axiom Design System.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ax-design/shape"><img src="https://img.shields.io/npm/v/@ax-design/shape.svg" alt="npm version"></a>
  <a href="https://github.com/ax-design/shape/actions/workflows/ci.yml"><img src="https://github.com/ax-design/shape/actions/workflows/ci.yml/badge.svg" alt="CI Status"></a>
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT Licence" />
</p>

## Installation

```bash
// with npm
npm install @ax-design/shape

// with bun
bun add @ax-design/shape
```

and import it:

```javascript
import { resolve, toSvgPath, traceContour } from '@ax-design/shape';
```

## Usage

A shape is a rectangle with decorations: rounded, beveled, scooped or notched corners, corners moved into the shape, and one feature on each side (an arc, a rectangle, a triangle, a trapezoid or a cusp, going in or out).
You describe it with numbers and `resolve` turns it into lines and arcs.
Here's an example:

```javascript
import { resolve, toSvgPath, traceContour } from '@ax-design/shape';

const corner = { radius: 12, shape: 'round', shiftX: 0, shiftY: 0 };
const flat = { kind: 'flat', depth: 0, span: 0, at: 0.5, ratio: 0.5, tipRadius: 0, shoulderRadius: 0 };
const notch = { ...flat, kind: 'arc', depth: -8, span: 30 };

const shape = resolve({
  width: 160,
  height: 48,
  corners: [corner, corner, corner, corner],
  edges: [flat, notch, flat, notch],
});

// SVG
path.setAttribute('d', toSvgPath(shape.outline));

// Canvas
ctx.beginPath();
traceContour(ctx, shape.outline);
ctx.fill();
```

A `cusp` is two arcs that leave the side smoothly at both ends of the span and meet in a point: inward it pinches the side (the Material bun and clover), outward it makes a pointed arch. `tipRadius` rounds the point.

A corner's `shoulderRadius` rounds the two points where a bevel, scoop or notch meets the sides. Scoops of 50% with a shoulder radius make a soft star:

```javascript
const soft = { radius: 80, shape: 'scoop', shiftX: 0, shiftY: 0, shoulderRadius: 8 };
resolve({ width: 160, height: 160, corners: [soft, soft, soft, soft], edges: [flat, flat, flat, flat] });
```

Values that do not fit are scaled down, the same way CSS does with `border-radius`. A corner and a side feature next to it share the straight part of the side and shrink together. `shape.clamps` tells you what was scaled and by how much. A side feature narrower than half a pixel is left out, so animating a span down to zero ends on a flat side.

A feature as wide as its side starts at the corners. Round those corners with the feature's `shoulderRadius` and give the corners a radius of 0: the shoulder then joins the next side in one arc, as in a hexagon (a triangle of full span on the top and the bottom side). With a corner radius as well, the outline turns twice, once around the corner and once more at the shoulder, and leaves a small ear at each corner.

```javascript
const sharp = { radius: 0, shape: 'round', shiftX: 0, shiftY: 0 };
const roof = { ...flat, kind: 'triangle', depth: 30, span: 104, tipRadius: 6, shoulderRadius: 6 };
resolve({ width: 104, height: 60, corners: [sharp, sharp, sharp, sharp], edges: [roof, flat, roof, flat] });
```

### Borders

`borderInner` gives you the inner edge of a border ring. Fill the outline together with the inner edge using the even-odd rule:

```javascript
import { borderInner, traceInner } from '@ax-design/shape';

const { inner } = borderInner(shape.outline, { widths: [2, 2, 2, 2] });
ctx.beginPath();
traceContour(ctx, shape.outline);
traceInner(ctx, inner);
ctx.fill('evenodd');
```

### Tilt

When the element is tilted with `perspective()` and `rotateX()` / `rotateY()`, pass the tilt and the border keeps the same thickness on screen everywhere:

```javascript
import { borderInner, tiltHomography } from '@ax-design/shape';

const transform = tiltHomography({ width: 160, height: 48, perspective: 25, rotateX: 3, rotateY: 5, translateZ: 0 });
const { inner } = borderInner(shape.outline, { widths: [2, 2, 2, 2], transform });
```

The tilt turns around the center of the box unless `originX` / `originY` say otherwise; the origin may lie outside the box, as for a row of tiles turning around the left edge of their group. `tiltMatrix()` gives the same tilt as a 3D matrix, and `multiplyMatrix(a, b)` composes two of them exactly as `transform: a b` does in CSS; `planeHomography()` turns the result back into the transform of a flat element.

To draw the tilted shape yourself rather than under a CSS transform (Firefox can't have a 3D transform above a backdrop-filter), `projectContour(outline, transform)` gives the outline as a polyline in screen coordinates, its arcs sampled within 0.1 px:

```javascript
import { projectContour, tiltHomography } from '@ax-design/shape';

const transform = tiltHomography({ width: 160, height: 48, perspective: 1000, rotateX: 0, rotateY: 60, translateZ: 0, originX: -200, originY: 24 });
const points = projectContour(shape.outline, transform);
```

Shape has no DOM dependency, so you can also use it on the server.

## Changes in 0.2

* The `cusp` side feature.
* `shoulderRadius` for corners.
* A corner next to a side feature with a shoulder no longer overlaps it. The outline used to run back along the side there, and the inner edge of the border shot out as a spike (the 4-sided cookie and the 4-leaf clover of the Material shapes).
* A shoulder between a side and an arc that is followed by another arc is rounded too; it used to stay sharp.

## Changes in 0.3

* A tilt turns about any origin, also one outside the shape, and can scale and move outside its perspective. `tiltMatrix()`, `multiplyMatrix()` and `planeHomography()` compose tilts as 3D matrices, and `projectContour()` projects an outline through one.
