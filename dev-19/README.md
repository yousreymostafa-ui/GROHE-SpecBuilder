# GROHE SpecBuilder DEV 19

This route is intentionally isolated from the production `/multi-user/` application.

- Route: `/dev-19/`
- Baseline: deployed SpecBuilder v20260829-3
- Project/product/settings IndexedDB: DEV-specific database names
- PDF folder memory: DEV-specific browser database
- Cloud project writes: disabled in DEV baseline
- Production files are not replaced by this route.

Future DEV 19 changes should target the DEV route only until the user explicitly approves production release.
