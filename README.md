# GROHE SpecBuilder

GROHE SpecBuilder is a professional product specification and selection workspace for building GROHE project selections.

## Web deployment

The web build is deployed automatically to GitHub Pages from `site.zip` using the workflow in `.github/workflows/pages.yml`.

### Current web scope
- Product catalogue and search
- Filters
- Selection tabs and breaks
- Product selection logic
- Concealed-body compatibility rules
- Hidden-item preferences stored in the browser
- Excel export where supported by the browser

### Desktop-only/local-service features
The original desktop build can access local folders such as `G:\My Drive\Images` and `G:\My Drive\Data Sheets` through its Python local server. GitHub Pages is static and cannot directly access a user's Windows drive. Product-image and Data Sheet hosting will be migrated to web/cloud storage separately for full online parity.
