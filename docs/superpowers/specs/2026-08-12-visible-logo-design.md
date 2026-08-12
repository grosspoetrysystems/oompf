# Visible OOMPF logo design

Date: 2026-08-12
Status: Approved direction

## Problem

The supplied multicolor mark is deployed as favicon assets, but the visible site brand still uses the old orange diamond. A visitor can load `oompf.run` successfully and never see the new logo in the page itself.

## Approved treatment

Use the supplied multicolor mark beside the existing `OOMPF` wordmark in both persistent brand locations:

- header navigation: 24 px square mark, followed by the existing wordmark;
- footer: 28 px square mark, followed by the existing wordmark.

Keep the wordmark. The symbol has not yet earned enough recognition to identify the site alone. Preserve the logo's green, yellow, and coral colors rather than converting it to the site's orange accent.

## Implementation

Add the source SVG as `apps/web/public/oompf-logo.svg` and replace each decorative diamond in `Base.astro` with an image. The image is decorative because the adjacent `OOMPF` text already supplies the accessible name, so it uses an empty `alt` value. Existing brand links, wordmark typography, navigation behavior, footer structure, favicon declarations, and manifest remain unchanged.

Size the image through the existing brand styles. It must not shrink inside the flex row, distort, gain a background tile, or introduce layout shift. The header and footer may use separate sizes, but both use the same SVG.

## Responsive behavior

The mark and wordmark remain one non-wrapping brand lockup. The existing responsive navigation and search behavior stays authoritative; this change must not hide the wordmark or force navigation overflow at the existing mobile breakpoint.

## Verification

Verify the shipped result from the user's perspective:

1. desktop header shows the multicolor mark beside `OOMPF`;
2. footer shows the same lockup;
3. mobile navigation retains the mark and wordmark without overlap;
4. the SVG and all existing favicon/manifest assets return HTTP 200;
5. the browser tab continues to use the supplied favicon;
6. Astro typecheck and production build complete successfully.

## Non-goals

- no wordmark redesign;
- no logo animation;
- no recolored or monochrome variant;
- no hero-sized logo;
- no changes to the site's palette, spacing system, or navigation information architecture.
