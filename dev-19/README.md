# GROHE SpecBuilder DEV 19

Repository-native isolated development route.

- Production remains at /multi-user/
- Development is /dev-19/
- DEV uses separate IndexedDB/local storage namespaces
- No production project database is shared
- Shared product seed is read-only from ../seed-products.js
- PDF Kit redirects safely to ../../pdf-kit-pro/
- DEV files are committed directly so both GitHub Pages deployment paths can serve them.
