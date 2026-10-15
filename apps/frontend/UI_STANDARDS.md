# FellowHire UI Standards

One app, one look. Use the shared classes in `src/index.css` instead of one-off Tailwind styles.
Applies to every signed-in screen (admin, superadmin, mentor, candidate, program room, sessions)
and to dialogs. Public marketing (`LandingPage`) and the printable certificate artwork are exempt.

## Text

| Use | Class |
| --- | --- |
| Page title | `heading-page` (DashboardLayout `title` already uses it) |
| Card / section title | `section-title` + `section-subtitle` inside `section-header` |
| Small heading inside a card | `card-title` (text-sm extrabold) |
| Eyebrow label (small caps) | `subsection-title` / `stat-label` |
| Paragraph | `text-sm text-slate-600` (dense UI: `text-xs text-slate-600`) |
| Helper / meta text | `meta-text` (text-2xs slate-500) |
| Tiny tags and counters only | `text-3xs` |

- Never use pixel sizes like `text-[10px]`.
- Weights: `font-extrabold` for titles and numbers, `font-bold` for buttons and emphasis,
  `font-semibold` for labels, `font-medium` sparingly. No `font-black`.
- Status (Accepted, Pending, Late…) is plain coloured text, never text inside a coloured pill/chip.

## Buttons

Always `btn` + a size + a variant. Never a hand-rolled `px-4 py-2 rounded-full bg-…` button.

- Size: `btn-sm` in dashboards, cards, toolbars and dialogs. `btn-md` only for a page's single
  main call to action or auth/public forms. `btn-lg` only on public/landing pages.
- Variant: `btn-primary` (the main action, one per area), `btn-outline` (secondary),
  `btn-ghost` (tertiary, e.g. "Cancel" in tight spots), `btn-danger` / `btn-danger-ghost`
  (destructive), `btn-success` (rare confirmations like "Mark present").
- Do not add custom colours to a `btn` (no `btn bg-emerald-600 …`). Pick a variant.
- Icon-only: `btn btn-icon-sm btn-ghost` (or `btn-outline`). Close (X) buttons use this too.
- Destructive icon-only buttons (trash, remove): `btn btn-icon-sm btn-ghost-danger` (grey, red on hover).
- Icons inside buttons: `w-3.5 h-3.5` for `btn-sm`, `w-4 h-4` for `btn-md`.
- Order: secondary/cancel first, primary last (rightmost).
- Not buttons-as-actions, so they keep their own style: tab pills (`tab-pill` / `tab-pill-active`),
  toggle switches, segmented controls, selectable list rows/cards, calendar cells.

## Forms

`field-label` for labels, `form-input` for inputs and selects, `form-textarea` for textareas,
`search-field` + `search-input` for search, `filter-select` for compact filters in toolbars.
Helper text under a field: `meta-text mt-1`.

## Surfaces

- Main card: `content-card` (rounded-3xl, border, shadow-sm, p-6 sm:p-8).
- Card header: `section-header` → title/subtitle left, `section-actions` right.
- Inner grouped block inside a card: `panel` (white) or `panel-muted` (slate-50).
- Metric tile: `content-card` with `stat-label` + `stat-value`.
- Tables: `data-table-wrap` + `data-table`, first column `cell-primary` / `cell-secondary`.

## Dialogs

```tsx
<div className="modal-backdrop" onClick={onClose}>
  <div className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
    <div className="section-header">
      <div>
        <h2 className="section-title">Title</h2>
        <p className="section-subtitle">One line of context</p>
      </div>
      <button className="btn btn-icon-sm btn-ghost" aria-label="Close"><X className="w-4 h-4" /></button>
    </div>
    …content…
    <div className="modal-footer">
      <button className="btn btn-sm btn-outline">Cancel</button>
      <button className="btn btn-sm btn-primary">Save</button>
    </div>
  </div>
</div>
```

Widths: `max-w-md` (confirm), `max-w-lg` (small form), `max-w-2xl` (form), `max-w-4xl` (sheet/table).
