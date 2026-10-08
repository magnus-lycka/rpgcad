# Traveller symbol source catalogue

Open [the visual catalogue](index.html) or [the CAD block index](cad.html). For a local browser server, run from the repository root:

```sh
uv run python -m http.server 8770 --bind 127.0.0.1 --directory catalog/pearce-symbols
```

Then open http://127.0.0.1:8770/. Category links and browser Find locate entries; click a thumbnail for the unchanged source image.

## Coverage

- All **2,185 PNG files under `Symbols/`**, across 34 source categories, from the high-resolution archive. The archive's 242 Small Craft images are excluded.
- **29 door/hatch exports** individually matched against the book's page 44 legend. Their annotations are in `annotations.json` and `inventory.json`.
- **2,004 named DXF blocks**, indexed in `cad-blocks.json`. This includes CAD helpers and general-purpose blocks, not just usable components. Anonymous blocks are excluded.
- [59 identifiable component families](../../docs/research/component-inventory.md), with source page/location references and inspection limits.

These are source references, not yet reusable RPGCAD model instances. Most images have not been individually classified. No automatic physical footprint, attachment rule or sight-blocking behavior is assigned. UP/DOWN means vertical access direction, not open/closed state.

## Provenance and attribution

Original drawings: **Robert Pearce / Pearce Design Studio, LLC**. Raster conversions and additions: **Eric B. Smith**. Source material is distributed under [Creative Commons Attribution-NonCommercial 4.0 International](https://creativecommons.org/licenses/by-nc/4.0/). RPGCAD adds the inventory, descriptive annotations, catalogue pages and reduced-size preview images. Original PNG files are unchanged; the original DXF is compressed losslessly with gzip.

- [Pearce's Starship Symbols announcement and source links](https://travellerrpgblog.blogspot.com/2020/08/starship-symbols-book.html).
- [Smith's conversion documentation and archives](https://ericbsmith.no-ip.org/geomorphs/).
- [Downloaded PNG archive](https://ericbsmith.no-ip.org/zip/Geomorphs/SymbolsHighRes.zip).
- [Original CAD source folder](https://drive.google.com/drive/folders/187mYl8Pyo-nxA8SI6D1WeJ9bnpJXNuDt).
- Local [55-page source book](sources/Starship_Symbols.pdf), [compressed DXF](sources/Starship_Symbols.dxf.gz) and [original archive readme](sources/Archive%20Read%20Me.txt).

`inventory.json` records the archive checksum, each image's original archive path and SHA-256, and the uncompressed CAD checksum. Asset filenames are the first 16 hexadecimal characters of SHA-256 of the original archive path; these are catalogue identifiers, not a production component ID scheme.

PDF SHA-256: `628145567988943b902dc602b56e6b903ce23a4dcd955cf99e5cd2d276dd05cb`.

## Scale and geometry

Smith describes high-resolution exports as 300 pixels per 5-foot square. Five feet is 1.524 m; RPGCAD's grid is exactly 1.5 m. Image gutters, rotation and inconsistent filename labels prevent treating image dimensions or bracketed filenames as verified physical footprints.

The DXF declares inches (`$INSUNITS=1`), architectural length formatting and English measurement. Its indexed bounds are drawing/ink extents, including attached details, not nominal room sizes or required clearance. Text bounds may be approximate; unsupported geometry may be omitted. Each usable component still needs deliberate calibration and semantic modeling before import.

See [research findings](../../docs/research/component-catalog-sources.md) for inspected pages, primary source references and remaining gaps.
