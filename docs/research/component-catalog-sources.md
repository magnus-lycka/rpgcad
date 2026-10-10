# Traveller component catalog: source reconnaissance

Research date: 2026-10-09. This records inspected source material for a reusable component catalog. The accompanying [component inventory](component-inventory.md) identifies actual symbol families, variants, source pages and limitations. Catalogued references are not automatic approval to place objects in the Referee's plans.

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

### Actual source inspection

The initial web reader failed to expose the downloads. A direct public download succeeded: [Starship Symbols PDF](https://ericbsmith.no-ip.org/zip/Geomorphs/PDF/Starship_Symbols.pdf), 7,796,924 bytes, 55 pages, SHA-256 `628145567988943b902dc602b56e6b903ce23a4dcd955cf99e5cd2d276dd05cb`. Text extraction with `pdftotext` produced only page separators; its drawings and labels were inspected visually after rendering. No claim is made that every PDF object is raster geometry. Pages **2, 3, 7, 9, 10, 13, 19, 24, 31, 37, 43, 44, 45, 46, 54 and 55** were read as complete pages. Page 2 supplies a navigation map for the remaining sections; those remaining pages are not claimed individually inspected.

The downloaded [Symbols High Resolution ZIP](https://ericbsmith.no-ip.org/zip/Geomorphs/SymbolsHighRes.zip) contains separate PNG assets with retained filenames. A contact sheet of all ten Door and nineteen Iris Valves exports was visually compared with page 44. Important finding: the Iris Valves filename group also contains open-access symbols, floor hatches and enclosed ladder wells. Filename grouping is therefore insufficient for semantic classification. The inventory records the exact mapping rather than assigning all nineteen files the same type.

Physical dimensions explicitly labelled on the PDF were established for three cargo footprints: 10×20 ft, 10×10 ft and 5×5 ft (page 3). Other inventory dimensions remain unverified. Archive filename brackets are nominal source labels; they must not be promoted to measured footprints without checking the asset. The Adventure Class PDF and CAD source geometry were not inspected as part of this PDF inventory; they are separate source sets.

## Authorship and stated license

These sources describe Pearce's own designs and Smith's conversions/custom additions. Treat them as community design references, not evidence that Traveller rules mandate particular geometry or symbols. Pearce says he created the Symbols assets and describes Adventure Class as evoking classic designs. [Symbols post](https://travellerrpgblog.blogspot.com/2020/08/starship-symbols-book.html), [Adventure Class post](https://travellerrpgblog.blogspot.com/2024/12/adventure-class-starship-geomorphs.html)

In his February 25, 2022 reply on the Symbols post, Pearce states that both books and accompanying CAD symbols were released under Creative Commons Attribution-NonCommercial 4.0 International. Smith identifies the same license for his archives. Record attribution and the license for any selected source; this note makes no conclusion about a particular future use. [Pearce's statement](https://travellerrpgblog.blogspot.com/2020/08/starship-symbols-book.html), [Smith's archive statement](https://ericbsmith.no-ip.org/geomorphs/)

## Catalog result and next verification

The [inspected inventory](component-inventory.md) now covers furniture and medical fixtures, doors/hatches, stairs/lifts, cargo/machinery, landscape/robots and room assemblies. Each family has a source-page/location reference; the door/hatch exports additionally have exact filename mappings. The full contents navigation map prevents overlooked categories from being mistaken for absent material.

Before using a reference as a model component, verify the particular asset's physical footprint, attachment/orientation requirements and sight behavior. Keep sourced appearance, measured geometry and interactive semantics distinct. Multiple visual variants can preserve the same recognizable meaning without the agent inventing a fresh depiction on every plan.

## Local browsable source catalogue

The [visual catalogue](../../catalog/pearce-symbols/index.html) contains all 2,185 Symbols PNG exports with original files and compact previews. Its [provenance notes](../../catalog/pearce-symbols/README.md) record coverage and calibration limits. A separate [CAD index](../../catalog/pearce-symbols/cad.html) lists all 2,004 named blocks from the actual DXF, which declares inches. Drawing bounds and entity types were extracted; these include helpers and are not verified component footprints. The original DXF is retained losslessly compressed. The catalogue does not change the current building or implement component insertion.

## Referee-supplied classic examples

Two photographed classic layouts provide additional visual references: [observations and design implications](classic-traveller-layout-examples.md). Their symbol legends and drawing hierarchies are recorded separately from the Pearce/Smith source catalogue; their provenance and reuse permissions are not assumed to match it.
