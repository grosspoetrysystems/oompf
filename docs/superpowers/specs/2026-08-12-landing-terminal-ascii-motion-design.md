# Landing Terminal and ASCII Pi Motion

## Status

Approved visual direction. The landing hero uses the currently empty desktop width for a textured, animated ASCII pi symbol beside the command transcript. The supplied reference establishes the shape: a chunky geometric pi silhouette on a dark technical grid. The treatment is grayscale only. At smaller widths, the transcript becomes the full-width focal point and the decorative panel disappears.

## Problem

The landing content area is `76rem`, but the transcript stops at `60rem`. The resulting right-side gap reads as unfinished rather than intentional. Stretching the existing transcript would remove the gap, but would also make short command lines float in an unnecessarily wide terminal.

## Goals

- Turn the unused desktop width into an intentional, product-specific moment.
- Connect OOMPF visually to Oh My Pi without adding explanatory copy.
- Translate the supplied pi reference into the site's terminal-instrument language.
- Add restrained motion without JavaScript, layout shift, or input delay.
- Preserve a clear, full-width transcript on tablet and mobile.
- Make the decorative panel silent to assistive technology and static under reduced-motion preferences.

## Non-goals

- Change hero copy, navigation, index results, or documentation cards.
- Embed the supplied raster image directly.
- Add color to the pi or its background texture.
- Build a canvas, WebGL, video, or client-side animation runtime.
- Add controls, sound, pointer interaction, or a second call to action.
- Mix this UI change with GPS-80/81 publish behavior.

## Desktop composition

Below the heading and lede, a `.hero-demo` grid spans the available content width:

- the existing transcript occupies approximately two thirds;
- a new ASCII pi panel occupies approximately one third;
- both panels share the existing terminal-instrument visual language: raised title bar, hairline border, warm dark surface, and mono type;
- panel heights align, so the pair reads as one composed demonstration rather than a terminal plus an unrelated card.

The transcript loses its `60rem` cap inside this grid and fills its column. Its content and command order remain unchanged.

## ASCII pi panel

The panel is labeled `oh my pi`. Its center contains one oversized pi symbol drawn from dense monospace block characters. The character rows reproduce the reference's broad top bar, shorter left stem, and longer right stem. The silhouette must read immediately as the same chunky geometric pi rather than a mathematical glyph in an ordinary font.

The symbol carries a graphite-to-silver-to-off-white gradient. The gradient is clipped through the block-character text and contains no hue. The contrast should be luminous enough to separate the mark from the field without reading as glossy chrome.

Behind it, a low-contrast procedural grid and dither texture is built from grayscale CSS gradients. The texture follows the reference's dark technical field while using existing background and line values. It may extend behind the symbol but must keep the pi silhouette immediately recognizable.

Motion is restrained:

- the luminance gradient shifts slowly across the pi;
- a soft light band scans through the silhouette;
- the background grid/texture drifts by only a few pixels over a long cycle;
- animation uses CSS transforms and background-position only;
- the panel has a fixed height before animation starts, preventing layout shift;
- the complete cycle lasts several seconds and never flashes, bounces, or rotates.

The panel is decorative and wrapped in `aria-hidden="true"`; the adjacent transcript already communicates the product workflow.

## Responsive behavior

At viewport widths of `900px` or less:

- `.hero-demo` becomes a single column;
- the ASCII pi panel is hidden;
- the transcript fills the available content width.

This keeps the current information hierarchy and avoids placing a decorative panel above the profile index on narrow screens.

## Reduced motion

Under `prefers-reduced-motion: reduce`:

- the luminance shift, scan, and texture drift are disabled explicitly;
- the static grayscale pi and texture remain visible on desktop;
- the existing global reduced-motion rule continues to neutralize the cursor blink.

## Accessibility and performance

- The pi panel is decorative and is not exposed in the accessibility tree.
- The panel cannot receive focus and introduces no controls.
- No new font, image, external request, dependency, or hydrated component is added.
- The treatment is HTML and CSS only.

## Verification

Browser verification will cover:

1. desktop at `1440 × 1000`: two aligned panels fill the hero content width, with no accidental right-side gap;
2. visual comparison: the pi retains the reference's broad cap and asymmetric stems while remaining strictly grayscale;
3. tablet at `900px`: pi panel hidden and transcript full width;
4. mobile at `390px`: transcript remains readable without horizontal overflow;
5. reduced motion: static pi and texture, with no scan or drift;
6. console: no runtime errors;
7. accessibility snapshot: decorative pi content absent.
