# Changelog

All notable changes to this package are documented in this file.

## 0.3.0

- A tilt turns about any origin, also one outside the shape, and can scale and move outside its perspective. `tiltMatrix()`, `multiplyMatrix()` and `planeHomography()` compose tilts as 3D matrices, and `projectContour()` projects an outline through one.

## 0.2.0

- The `cusp` side feature.
- `shoulderRadius` for corners.
- A corner next to a side feature with a shoulder no longer overlaps it. The outline used to run back along the side there, and the inner edge of the border shot out as a spike (the 4-sided cookie and the 4-leaf clover of the Material shapes).
- A shoulder between a side and an arc that is followed by another arc is rounded too; it used to stay sharp.
