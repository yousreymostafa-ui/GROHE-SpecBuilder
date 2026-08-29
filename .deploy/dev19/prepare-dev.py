from pathlib import Path

root=Path('dist/dev-19')
replacements={
    'grohe-product-selector-v1':'grohe-product-selector-dev19-v1',
    'GROHEPdfLibrary':'GROHEPdfLibraryDev19',
    'grohe-selection-text-size-v1':'grohe-selection-text-size-dev19-v1',
}
for name in ['app.js','settings-ui.js','data-sheet-viewer.js','ui-fixes.js']:
    p=root/name
    text=p.read_text(encoding='utf-8')
    for old,new in replacements.items():
        text=text.replace(old,new)
    p.write_text(text,encoding='utf-8')
