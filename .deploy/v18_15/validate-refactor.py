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
