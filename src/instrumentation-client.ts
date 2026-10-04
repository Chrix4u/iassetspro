// Client-side interaction guard loaded by Next.js before React hydration.
//
// The Visual Explorer diagram supports drag-to-pan from its canvas. The pan
// container captures the pointer on pointerdown, which can retarget the
// subsequent click away from an SVG component node. When the pointer starts on
// a selectable diagram node, keep that pointerdown away from the pan container
// so the node's existing React onClick handler receives the click normally.
// Background pointerdown events are untouched, so drag-to-pan remains enabled.

const DIAGRAM_SELECTABLE_NODE =
  'svg[aria-label="Machine component engineering schematic"] g.cursor-pointer';

document.addEventListener(
  'pointerdown',
  (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(DIAGRAM_SELECTABLE_NODE)) return;

    event.stopPropagation();
  },
  true,
);
