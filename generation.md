# Generation record

Tool: built-in `image_gen` (not the CLI fallback).

Initial concept: two delicate graphite and watercolour wrens holding opposite ends of a single thread that cradles a tiny golden star, in earthy umber, blue-grey and ochre. The initial request asked for transparency; the returned opaque background was corrected with the same image tool. Only the corrected asset is used in the output.

Exact final edit prompt, applied to the first generated miniature:

> Edit this watercolor miniature asset. Preserve the two beautiful graphite and watercolor birds holding a single thread and the small golden star, their arrangement and handmade drawing. Replace the black background and ALL colored glows/halos with a clean pure white RGB 255 255 255 background. No shadow or halo outside the actual pencil and watercolor strokes. A natural-history watercolor illustration on completely white smooth paper with generous white margins on all sides. Keep fine graphite thread visible. No additional objects, no text, no signature, no border. Landscape 3:2.

The final full canvas was assembled deterministically with `scripts/compose.mjs`; the existing canvas was never passed through generative editing. The script removes near-white background noise, resamples the miniature, and multiplies its pigment onto the existing paper. It changes pixels only within the declared insertion box and preserves original alpha values.
