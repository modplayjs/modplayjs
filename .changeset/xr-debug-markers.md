---
'@modplayjs/xr': patch
---

Fix the crash when the spatial source-marker switch is turned on.

`mesh://sphere` is a parameterised mesh, not a fixed primitive: Meta's 3D objects
page defines it as a "sphere mesh with a radius defined by the attached
`Sphere(radius: Float)` component". The markers had `Mesh`, `Material`, `Scale`
and `Visible` but no `Sphere`, and the toolkit's mesh creator throws when that
component is missing (`ToolkitFeature.createSphereMesh` reads it through
`requireComponentForMesh`), so every marker creation took the app down.

Markers now carry `Sphere(0.5f)`; `Scale` keeps the level-driven size, so a level
change still costs one component write instead of a mesh rebuild.

The marker entities are also created, moved and destroyed on the main thread,
with the azimuths and object list captured on the audio thread. Previously the
audio thread mutated the same lists while `applyPositions` iterated them, and
`applyMarkerLevels` wrote `markerSizes[i]` without the bounds check its read had.
