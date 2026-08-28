from pathlib import Path
import re
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/app.js")
s = path.read_text(encoding="utf-8")

helpers = r"""
function exportTabGroups(sectionFilter=''){
  const rows=allSelectionExportRows();
  const selectionNames=[...new Set(rows.map(r=>String(r.selection||'Selection')))];
  const groups=[],map=new Map();
  for(const row of rows){
    if(row.sectionRow) continue;
    const section=String(row.section||'').trim();
    if(sectionFilter && section!==sectionFilter) continue;
    const selection=String(row.selection||'Selection').trim()||'Selection';
    const key=selection+'\u0001'+section;
    if(!map.has(key)){
      const group={selection,section,rows:[]};
      map.set(key,group);groups.push(group);
    }
    map.get(key).rows.push(row);
  }
  return {groups,selectionCount:selectionNames.length};
}

function uniqueExcelSheetName(raw,used){
  let base=String(raw||'Selection').replace(/[\[\]\:\*\?\/\\]/g,' ').replace(/\s+/g,' ').trim()||'Selection';
  base=base.slice(0,31);
  let name=base,n=2;
  while(used.has(name.toLowerCase())){
    const suffix=' ('+n+++')';
    name=base.slice(0,Math.max(1,31-suffix.length))+suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

function exportSheetDefinitions(preset='standard',sectionFilter=''){
  const grouped=exportTabGroups(sectionFilter), used=new Set(), defs=[];
  for(const group of grouped.groups){
    const sectionLabel=group.section||'Unsectioned';
    const rawName=grouped.selectionCount>1 ? group.selection+' - '+sectionLabel : sectionLabel;
    const name=uniqueExcelSheetName(rawName,used);
    let data,imageRows=[];
    if(preset==='sku'){
      data=[['Selection','Section','SKU','Picture','Qty']];
      group.rows.forEach(r=>{data.push([r.selection,r.section,r.sku,'',r.qty]);imageRows.push({row:data.length,col:4,sku:r.sku});});
    }else if(preset==='purchasing'){
      data=[['Selection','Section','SKU','Picture','Description','Qty','Status','Replacement']];
      group.rows.forEach(r=>{data.push([r.selection,r.section,r.sku,'',r.description,r.qty,r.status,r.replacement||'']);imageRows.push({row:data.length,col:4,sku:r.sku});});
    }else if(preset==='technical'){
      data=[['Selection','Section','SKU','Picture','Description','Family','Finish','Parent / Concealed','Validation']];
      group.rows.forEach(r=>{data.push([r.selection,r.section,r.sku,'',r.description,r.family,r.finish,r.parentSku,r.warning]);imageRows.push({row:data.length,col:4,sku:r.sku});});
    }else{
      data=[['Selection','Section','SKU','Picture','Description','Family','Finish','Qty','Auto / Manual','Parent SKU','Status','Validation']];
      group.rows.forEach(r=>{data.push([r.selection,r.section,r.sku,'',r.description,r.family,r.finish,r.qty,r.mode,r.parentSku,r.status,r.warning]);imageRows.push({row:data.length,col:4,sku:r.sku});});
    }
    defs.push({name,data,sectionRows:[],imageRows});
  }
  if(!defs.length){
    defs.push({name:'Selection',data:[['Selection','Section','SKU','Picture','Description','Family','Finish','Qty','Auto / Manual','Parent SKU','Status','Validation']],sectionRows:[],imageRows:[]});
  }
  return defs;
}
"""

if "function exportTabGroups(" not in s:
    marker = "async function exportExcel(){"
    if marker not in s:
        raise SystemExit("Could not locate exportExcel")
    s = s.replace(marker, helpers + "\n" + marker, 1)

new_export_excel = r"""async function exportExcel(){
  if(!state.project){toast('Create or open a project first');return;}
  const sheets=exportSheetDefinitions('standard','');
  toast('Preparing Excel workbook with every break on its own tab…');
  const blob=await buildMultiSheetXlsx(sheets);
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=safeFilename(state.project.name)+' - All Selections.xlsx';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  toast(sheets.length+' Excel tab'+(sheets.length===1?'':'s')+' exported');
}"""
s, n = re.subn(
    r"async function exportExcel\(\)\{.*?\n\}\n\nasync function exportImageBytes",
    new_export_excel + "\n\nasync function exportImageBytes",
    s, count=1, flags=re.S
)
if n != 1:
    raise SystemExit("Could not replace exportExcel")

new_run = r"""async function runPresetExport(){
  const preset=document.querySelector('input[name="exportPreset"]:checked')?.value||'standard';
  const section=$('exportSection').value||'';
  const sheets=exportSheetDefinitions(preset,section);
  toast('Preparing Excel workbook with separate break tabs…');
  const blob=await buildMultiSheetXlsx(sheets),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=safeFilename(state.project.name)+' - All Selections.xlsx';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  $('exportDialog').close();
  toast(sheets.length+' Excel tab'+(sheets.length===1?'':'s')+' exported');
}"""
s, n = re.subn(
    r"async function runPresetExport\(\)\{.*?\n\}\n\n\nasync function createDatabaseBackup",
    new_run + "\n\n\nasync function createDatabaseBackup",
    s, count=1, flags=re.S
)
if n != 1:
    raise SystemExit("Could not replace runPresetExport")

multi_builder = r"""
async function buildMultiSheetXlsx(sheetDefs=[]){
  const xmlEsc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const colName=n=>{let out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;};
  const allImageRows=[];
  sheetDefs.forEach((sheet,si)=>(sheet.imageRows||[]).forEach(row=>allImageRows.push({...row,_sheetIndex:si})));
  const pictures=await loadExportPictures(allImageRows);
  const files={};
  let contentTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
  let workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
  let workbookRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  let mediaIndex=0;

  sheetDefs.forEach((def,si)=>{
    const sheetNo=si+1, data=def.data||[[]], sectionRows=def.sectionRows||[];
    const usable=(def.imageRows||[]).filter(x=>pictures.has(normalizeSku(x.sku)));
    const imageRowSet=new Set(usable.map(x=>x.row));
    const maxCols=Math.max(...data.map(r=>r.length),1);
    let sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
    for(let ci=1;ci<=maxCols;ci++){
      const header=String(data[0]?.[ci-1]||'');
      let width=16;
      if(header==='Selection')width=22; else if(header==='Section')width=22; else if(header==='SKU')width=16; else if(header==='Picture')width=14; else if(header==='Description')width=58; else if(header==='Family'||header==='Finish')width=24;
      sheet+='<col min="'+ci+'" max="'+ci+'" width="'+width+'" customWidth="1"/>';
    }
    sheet+='</cols><sheetData>';
    data.forEach((row,ri)=>{
      const rn=ri+1,style=ri===0?1:(sectionRows.includes(rn)?2:0),ht=imageRowSet.has(rn)?' ht="72" customHeight="1"':'';
      sheet+='<row r="'+rn+'"'+ht+'>';
      row.forEach((v,ci)=>{
        const ref=colName(ci+1)+rn;
        if(typeof v==='number')sheet+='<c r="'+ref+'" s="'+style+'"><v>'+v+'</v></c>';
        else sheet+='<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t>'+xmlEsc(v)+'</t></is></c>';
      });
      sheet+='</row>';
    });
    sheet+='</sheetData><autoFilter ref="A1:'+colName(maxCols)+'1"/>';
    if(usable.length)sheet+='<drawing r:id="rId1"/>';
    sheet+='</worksheet>';
    files['xl/worksheets/sheet'+sheetNo+'.xml']=sheet;
    contentTypes+='<Override PartName="/xl/worksheets/sheet'+sheetNo+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    workbook+='<sheet name="'+xmlEsc(def.name||('Sheet '+sheetNo))+'" sheetId="'+sheetNo+'" r:id="rId'+sheetNo+'"/>';
    workbookRels+='<Relationship Id="rId'+sheetNo+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+sheetNo+'.xml"/>';

    if(usable.length){
      contentTypes+='<Override PartName="/xl/drawings/drawing'+sheetNo+'.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
      let drawing='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
      let rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
      usable.forEach((item,i)=>{
        const sku=normalizeSku(item.sku),img=pictures.get(sku),relNo=i+1;
        mediaIndex++;
        const ext=img.type.includes('png')?'png':'jpg';
        files['xl/media/image'+mediaIndex+'.'+ext]=img.bytes;
        rels+='<Relationship Id="rId'+relNo+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image'+mediaIndex+'.'+ext+'"/>';
        const col=Math.max(0,(item.col||1)-1),row=Math.max(0,item.row-1),emu=64*9525;
        drawing+='<xdr:oneCellAnchor><xdr:from><xdr:col>'+col+'</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>'+row+'</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="'+emu+'" cy="'+emu+'"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="'+relNo+'" name="'+xmlEsc(sku)+'"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId'+relNo+'"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+emu+'" cy="'+emu+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
      });
      drawing+='</xdr:wsDr>';rels+='</Relationships>';
      files['xl/drawings/drawing'+sheetNo+'.xml']=drawing;
      files['xl/drawings/_rels/drawing'+sheetNo+'.xml.rels']=rels;
      files['xl/worksheets/_rels/sheet'+sheetNo+'.xml.rels']='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing'+sheetNo+'.xml"/></Relationships>';
    }
  });

  workbook+='</sheets></workbook>';
  workbookRels+='<Relationship Id="rId'+(sheetDefs.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  contentTypes+='</Types>';
  files['[Content_Types].xml']=contentTypes;
  files['_rels/.rels']='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  files['xl/workbook.xml']=workbook;
  files['xl/_rels/workbook.xml.rels']=workbookRels;
  files['xl/styles.xml']='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F2B4B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF356FD1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>';
  return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
"""

if "async function buildMultiSheetXlsx(" not in s:
    marker = "function zipStore(files){"
    if marker not in s:
        raise SystemExit("Could not locate zipStore")
    s = s.replace(marker, multi_builder + "\n" + marker, 1)

path.write_text(s,encoding="utf-8")
