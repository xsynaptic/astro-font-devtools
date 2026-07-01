---
'@xsynaptic/astro-font-devtools': patch
---

Fix non-Latin font handling across the toolbar.

- The script filter no longer hides multi-script fonts: selecting a script keeps any font that supports it, instead of only fonts built exclusively for the selected scripts. Fonts like Victor Mono that also ship Cyrillic or Greek now appear under a Latin selection.
- The toolbar now opens with no script filter applied, showing the full catalog; picking a script narrows the list from there.
- Font previews no longer load Latin glyphs only. The resolve handler requests the selected font's actual subset coverage, so Cyrillic, Greek, and other scripts render correctly when previewed (the browser still lazily downloads only the subset files a page uses).
