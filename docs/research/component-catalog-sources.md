# Traveller component catalog: source reconnaissance

Research date: 2026-10-09. This is a source inventory and proposed review queue, not an approved component catalog. No assets were imported, geometry invented, or component dimensions established.

## Primary sources and available material

| Source | Author-described material | Relevance |
| --- | --- | --- |
| [Starship Symbols Book, Robert Pearce, 2020-08-01](https://travellerrpgblog.blogspot.com/2020/08/starship-symbols-book.html) | PDF of symbols and room blocks made in AutoCAD; accompanying DWG and CTB lineweight file. Updates specify R2004/R2000 DWG versions and an added DXF. | Closest source for editable components and a consistent drawing style; includes both symbols and larger room blocks. |
| [More Images!, Pearce, 2020-08-18](https://travellerrpgblog.blogspot.com/2020/08/more-images.html) | Community conversions in ZIP collections: JPG/PNG geomorph sets and 2,093 individual, edge-trimmed PNG images from the Symbols book. | Existing separated images could help identify candidates without manually extracting every symbol. Counts do not establish distinct semantic component types. |
| [Adventure Class Starship Geomorphs, Pearce, 2024-12-18](https://travellerrpgblog.blogspot.com/2024/12/adventure-class-starship-geomorphs.html) | Downloadable PDF, with smaller, more function-specific geomorphs intended to evoke smaller classic Traveller ships. Separate layers cover room text, shading and grid. | A source of room/ship-section assemblies, distinct from individual furniture or door symbols. |
| [Adventure Class individual images, Pearce, 2025-01-03](https://travellerrpgblog.blogspot.com/2025/01/adventure-class-starship-geomorph.html) | Eric Smith's gridless PNG conversions, with optional vehicle/cargo overlays and square/hex underlays; Pearce also links his modified ZIP with colors removed and orientation standardized. | Evidence that variation can be separated from the underlying assembly. |

The [Symbols source folder](https://drive.google.com/drive/folders/187mYl8Pyo-nxA8SI6D1WeJ9bnpJXNuDt) and [older image collections folder](https://drive.google.com/drive/folders/1VktZErlGTnyQg5Q0wjBfSAu4cMlQoc5j) are linked by Pearce. [Eric Smith's current conversion page](https://ericbsmith.no-ip.org/geomorphs/) was readable and lists standard/high-resolution archives, including Adventure Class and Symbols & Small Craft. It explicitly describes transparent individual symbol PNGs for composing furniture and machinery, and custom bridge/engineering tiles based on the Symbols book.

## Scale and inspection limits

Smith specifies 60 pixels per 5-foot square for standard-resolution exports and 300 pixels per 5-foot square for high-resolution exports. These are raster calibration statements, not dimensions for every component. A 5-foot square is 1.524 m, whereas RPGCAD uses exactly 1.5 m. Any later import needs an explicit calibration decision; these scales must not silently be treated as identical. The export descriptions also discuss image gutters and overlapping walls, so image bounds alone cannot establish usable footprints. [Smith's conversion documentation](https://ericbsmith.no-ip.org/geomorphs/)

The original PDF/CAD/ZIP contents were **not inspected**. Drive returned lightweight loading/sign-in pages; direct PDF links on Smith's page were inaccessible to the web reader. Pearce's Adventure Class post was available through indexed search text despite direct requests returning HTTP 429. Individual symbol names, exact sizes, hatch/door conventions and completeness remain unverified; the download listings are not a substitute for visual review.

## Authorship and stated license

These sources describe Pearce's own designs and Smith's conversions/custom additions. Treat them as community design references, not evidence that Traveller rules mandate particular geometry or symbols. Pearce says he created the Symbols assets and describes Adventure Class as evoking classic designs. [Symbols post](https://travellerrpgblog.blogspot.com/2020/08/starship-symbols-book.html), [Adventure Class post](https://travellerrpgblog.blogspot.com/2024/12/adventure-class-starship-geomorphs.html)

In his February 25, 2022 reply on the Symbols post, Pearce states that both books and accompanying CAD symbols were released under Creative Commons Attribution-NonCommercial 4.0 International. Smith identifies the same license for his archives. Record attribution and the license for any selected source; this note makes no conclusion about a particular future use. [Pearce's statement](https://travellerrpgblog.blogspot.com/2020/08/starship-symbols-book.html), [Smith's archive statement](https://ericbsmith.no-ip.org/geomorphs/)

## Proposed first review queue

Review a few examples before admitting assets to a catalog:

1. **Individual symbols:** one furniture example and one machinery example from the Symbols collection. These categories are explicitly described by Smith.
2. **Room assemblies:** one bridge and one engineering assembly, with any supported variants kept identifiable. Smith explicitly describes these source categories and modifications.
3. **Geomorphs:** one Adventure Class section, comparing the PDF with an optional cargo/vehicle overlay. Pearce documents these separately composable elements.
4. **User-priority follow-up:** locate and visually verify door and hatch candidates in the actual Symbols book. Their individual entries and dimensions have not been established in this research.

For each reviewed candidate, record source/page or filename, recognizable appearance, calibrated footprint, attachment/orientation requirements and whether it affects sight. Those are proposed review criteria, not properties inferred from raster art. Keep evidence and verification status explicit. Use of catalogue entries in a plan must follow the Referee's requested design.
