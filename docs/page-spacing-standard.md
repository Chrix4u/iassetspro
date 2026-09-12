# iAssetsPro Page Spacing Standard

All authenticated module pages inherit their horizontal page gutter from the application shell rather than defining independent outer left/right padding.

## Contract

- Phone viewport: `1rem` (16px) left/right gutter.
- `sm` viewport and larger: `1.5rem` (24px) left/right gutter.
- The active page root has only its horizontal padding neutralized. Existing vertical page spacing and all nested card/form/table padding remain page-owned.
- Full page content must remain `min-width: 0` so grids, tables and long text cannot push the shell wider than the viewport.
- Sticky/full-width page headers may use `-mx-4 sm:-mx-6` together with `px-4 sm:px-6` to visually align their contents with the shared gutter while allowing the border/background to extend to the page frame edge.

The implementation is in `src/app/page-layout.css` and is loaded after `globals.css` from the root layout.
