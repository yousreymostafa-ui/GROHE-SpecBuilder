from pathlib import Path
import re
import sys

path=Path(sys.argv[1] if len(sys.argv)>1 else "dist/app.js")
s=path.read_text(encoding="utf-8")

new_finish = """function inferFinish(p){
  const sku=normalizeSku(p.sku||'');
  const explicit=String(p.finish||'').trim();
  let encoded='';
  if(/243[0-9A-Z]$/i.test(sku)) encoded='Matte Black';
  if(!encoded){
    for(const [code,name] of FINISH_CODE_PAIRS){
      if(new RegExp(code+'[0-9A-Z]{1,2}$','i').test(sku)){encoded=name;break;}
    }
  }
  if(!encoded && (/00[0-9A-Z]{1,2}$/i.test(sku) || /^\\d{6,10}0{2,4}$/.test(sku))) encoded='Chrome';
  // Strong GROHE article finish suffixes are more reliable than imported text
  // when the two disagree. Preserve technical/non-colour components.
  if(encoded && explicit && !/^no colour(?: \\/ technical)?$/i.test(explicit) && encoded!==explicit) return encoded;
  if(explicit) return explicit;
  if(encoded) return encoded;
  const hay=normalizeText([p.description,p.fullText].join(' '));
  if(/\\bmatte black\\b/.test(hay)) return 'Matte Black';
  if(/\\bchrome\\b/.test(hay)) return 'Chrome';
  return 'No colour / technical';
}"""

s,n=re.subn(r"function inferFinish\\(p\\)\\{.*?\\n\\}\\n\\nfunction inferSize",new_finish+"\n\nfunction inferSize",s,count=1,flags=re.S)
if n!=1:
    raise SystemExit("Could not replace inferFinish")

pattern=r"""  if\(!skuPrefixMode\)\{
    for\(const \[key,raw\] of Object\.entries\(state\.filters\)\)\{
      const vals=Array\.isArray\(raw\)\?raw\.filter\(Boolean\):\(raw\?\[raw\]:\[\]\);
      if\(key!==ignoreKey&&vals\.length\) list=list\.filter\(p=>vals\.includes\(String\(p\[key\]\|\|''\)\)\);
    \}
  \}
  if\(state\.showMissingImagesOnly && state\.imageFolderConnected\) list=list\.filter\(p=>!getImageFile\(p\.sku\)\);
  if\(!skuPrefixMode&&state\.viewFilter==='favorites'\) list=list\.filter\(p=>state\.favorites\.has\(p\.sku\)\);
  else if\(!skuPrefixMode&&state\.viewFilter==='recent'\)\{"""

replacement="""  // SKU searches narrow the current filtered catalogue; they must not silently
  // bypass Finish, Category or any other active facet.
  for(const [key,raw] of Object.entries(state.filters)){
    const vals=Array.isArray(raw)?raw.filter(Boolean):(raw?[raw]:[]);
    if(key!==ignoreKey&&vals.length) list=list.filter(p=>vals.includes(String(p[key]||'')));
  }
  if(state.showMissingImagesOnly && state.imageFolderConnected) list=list.filter(p=>!getImageFile(p.sku));
  if(state.viewFilter==='favorites') list=list.filter(p=>state.favorites.has(p.sku));
  else if(state.viewFilter==='recent'){"""

s,n=re.subn(pattern,replacement,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit("Could not replace SKU filter bypass")

path.write_text(s,encoding="utf-8")
