# GROHE SpecBuilder

**Deployed version: GROHE Products Builder v18.4.6**

GROHE SpecBuilder is a professional product specification and selection workspace for building GROHE project selections.

## Live site

GitHub Pages deployment target:

https://yousreymostafa-ui.github.io/GROHE-SpecBuilder/

The site is built automatically by `.github/workflows/pages.yml` from the packaged v18.4.6 browser runtime stored under `.deploy/v18_4_6/`.

## Included in the web runtime

- Product catalogue and SKU/keyword search
- Product/category/finish filtering
- Product selection workspace
- Selection tabs and Breaks
- Concealed-body and compatibility logic from v18.4.6
- Product database bundled with the v18.4.6 release
- Browser-side saved preferences and selection state
- Excel export where supported by the browser

## Local-only limitation

The desktop release can directly access Windows folders such as `G:\My Drive\Images` and `G:\My Drive\Data Sheets` using its local Python service. GitHub Pages is a static web host and cannot read a visitor's local Windows drive. Therefore local-folder image loading and local Data Sheet preview require a later cloud-storage/backend migration for full online parity.

## Deployment source

This repository intentionally deploys **v18.4.6**, not v18.4.7. The compressed runtime is reconstructed by GitHub Actions and published through GitHub Pages.
