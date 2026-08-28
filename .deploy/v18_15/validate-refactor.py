from pathlib import Path

html=Path('dist/index.html').read_text(encoding='utf-8')
app=Path('dist/app.js').read_text(encoding='utf-8')

assert html.count('id="btnAutoBreaks"') == 1, 'Auto Breaks button must exist exactly once'
assert 'id="imageHoverPreview"' not in html, 'Floating image hover preview must not exist'
assert "$('btnAutoBreaks').onclick=autoCreateBreaks" in app, 'Auto Breaks event binding missing'

start=app.index('function setupImageHoverPreview()')
end=app.index('const RUNTIME_VERSION', start)
hover=app[start:end]
assert 'pointermove' not in hover and 'clientX' not in hover, 'Mouse-follow hover code still present'

head=html.split('</head>',1)[0]
links=[x.split('"')[0] for x in head.split('href="')[1:]]
assert links and links[-1].split('?')[0]=='ui-refactor.css', f'ui-refactor.css must be final stylesheet, got {links[-1] if links else "none"}'

css=Path('dist/ui-refactor.css').read_text(encoding='utf-8')
assert 'id="selectionTextSize"' in html, 'Native selection text-size control missing'
assert "state.selectionView.textSize=Number(e.target.value)" in app, 'Selection text-size event missing'
assert "state.selectionView.imageSize=Number(e.target.value)" in app, 'Selection image-size event missing'
assert "panel.style.setProperty('--selection-thumb-size'" in app, 'Selection image-size state is not applied'
assert "document.documentElement.style.setProperty('--product-thumb-size'" in app, 'Catalogue image-size state is not applied'
assert '.sequence-panel .seq-img' in css and 'width:var(--selection-thumb-size)!important' in css, 'Selection image CSS binding missing'
assert '.fast-card .product-img' in css and 'height:var(--product-thumb-size)!important' in css, 'Catalogue image CSS binding missing'
assert '--seq-sku-font' in app and '--seq-desc-font' in app, 'Selection text CSS variables missing'
assert "syncActiveOption(state.project)" in app[app.index('async function autoCreateBreaks()'):app.index('async function addSection()',app.index('async function autoCreateBreaks()'))], 'Auto Breaks must sync active selection'
