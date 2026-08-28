from pathlib import Path
import re
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/app.js")
s = path.read_text(encoding="utf-8")

helper = r"""
function allSelectionExportRows(){
  if(!state.project)return [];
  syncActiveOption(state.project);
  const original=state.project;
  const options=(Array.isArray(original.options)&&original.options.length?original.options:[activeSelectionOption(original)]).filter(Boolean);
  const rows=[];
  try{
    for(const option of options){
      const selectionName=String(option.name||'Selection').trim()||'Selection';
      state.project={...original,activeOptionId:option.id,items:Array.isArray(option.items)?option.items:[],finish:String(option.finish||'')};
      projectExportRows().forEach(row=>rows.push({...row,selection:selectionName,selectionId:option.id||''}));
    }
  }finally{
    state.project=original;
  }
  return rows;
}
"""

if "function allSelectionExportRows()" not in s:
    pattern = r'(function projectExportRows\(\)\{.*?\n\})\n\n  // ===== 70_export_templates\.js ====='
    s, n = re.subn(pattern, lambda m: m.group(1) + "\n" + helper + "\n  // ===== 70_export_templates.js =====", s, count=1, flags=re.S)
    if n != 1:
        raise SystemExit("Could not insert all-selection export helper")

new_export_excel = r"""async function exportExcel(){
  if(!state.project){toast('Create or open a project first');return;}
  const rows=allSelectionExportRows();
  const data=[['Selection','Section','SKU','Picture','Description','Family','Finish','Qty','Auto / Manual','Parent SKU','Status','Validation']];
  const sectionRows=[],imageRows=[];
  rows.forEach(r=>{
    if(r.sectionRow){sectionRows.push(data.length+1);data.push([r.selection,r.section,'','','','','','','','','','']);}
    else {data.push([r.selection,r.section,r.sku,'',r.description,r.family,r.finish,r.qty,r.mode,r.parentSku,r.status,r.warning]);imageRows.push({row:data.length,col:4,sku:r.sku});}
  });
  toast('Preparing Excel with all selections and product pictures…');
  const blob=await buildXlsx(data,sectionRows,imageRows);
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeFilename(state.project.name)+' - All Selections.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('All selections exported to Excel');
}"""

s, n = re.subn(
    r'async function exportExcel\(\)\{.*?\n\}\n\nasync function exportImageBytes',
    new_export_excel + "\n\nasync function exportImageBytes",
    s, count=1, flags=re.S
)
if n != 1:
    raise SystemExit("Could not replace exportExcel")

if "function allExportSectionNames()" not in s:
    target = """function currentSectionNames(){
  return state.project?[...new Set((state.project.items||[]).filter(x=>x.type==='section').map(x=>x.title))]:[];
}"""
    replacement = target + """
function allExportSectionNames(){
  return [...new Set(allSelectionExportRows().filter(x=>x.sectionRow&&x.section).map(x=>x.section))];
}"""
    if target not in s:
        raise SystemExit("Could not find currentSectionNames")
    s = s.replace(target, replacement, 1)

if "currentSectionNames().map" not in s:
    raise SystemExit("Could not update export section list")
s = s.replace("currentSectionNames().map", "allExportSectionNames().map", 1)

new_export_rows = r"""function exportRowsForSection(sectionName=''){
  const rows=allSelectionExportRows(); if(!sectionName) return rows;
  return rows.filter(r=>r.section===sectionName || (r.sectionRow&&r.section===sectionName));
}"""
s, n = re.subn(
    r"function exportRowsForSection\(sectionName=''\)\{.*?\n\}",
    new_export_rows,
    s, count=1, flags=re.S
)
if n != 1:
    raise SystemExit("Could not replace exportRowsForSection")

new_run = r"""async function runPresetExport(){
  const preset=document.querySelector('input[name="exportPreset"]:checked')?.value||'standard';
  const section=$('exportSection').value||''; const rows=exportRowsForSection(section);
  let data, sectionRows=[], imageRows=[];
  if(preset==='sku'){
    data=[['Selection','SKU','Picture','Qty']];
    rows.filter(r=>!r.sectionRow).forEach(r=>{data.push([r.selection,r.sku,'',r.qty]);imageRows.push({row:data.length,col:3,sku:r.sku});});
  }else if(preset==='purchasing'){
    data=[['Selection','Section','SKU','Picture','Description','Qty','Status','Replacement']];
    rows.filter(r=>!r.sectionRow).forEach(r=>{data.push([r.selection,r.section,r.sku,'',r.description,r.qty,r.status,r.replacement||'']);imageRows.push({row:data.length,col:4,sku:r.sku});});
  }else if(preset==='technical'){
    data=[['Selection','Section','SKU','Picture','Description','Family','Finish','Parent / Concealed','Validation']];
    rows.filter(r=>!r.sectionRow).forEach(r=>{data.push([r.selection,r.section,r.sku,'',r.description,r.family,r.finish,r.parentSku,r.warning]);imageRows.push({row:data.length,col:4,sku:r.sku});});
  }else{
    data=[['Selection','Section','SKU','Picture','Description','Family','Finish','Qty','Auto / Manual','Parent SKU','Status','Validation']];
    rows.forEach(r=>{if(r.sectionRow){sectionRows.push(data.length+1);data.push([r.selection,r.section,'','','','','','','','','','']);}else{data.push([r.selection,r.section,r.sku,'',r.description,r.family,r.finish,r.qty,r.mode,r.parentSku,r.status,r.warning]);imageRows.push({row:data.length,col:4,sku:r.sku});}});
  }
  toast('Preparing Excel with all selections and product pictures…');
  const blob=await buildXlsx(data,sectionRows,imageRows),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeFilename(state.project.name)+' - All Selections.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);$('exportDialog').close();toast('All selections exported to Excel');
}"""
s, n = re.subn(
    r'async function runPresetExport\(\)\{.*?\n\}\n\n\nasync function createDatabaseBackup',
    new_run + "\n\n\nasync function createDatabaseBackup",
    s, count=1, flags=re.S
)
if n != 1:
    raise SystemExit("Could not replace runPresetExport")

s = s.replace('<sheet name="Selection" sheetId="1" r:id="rId1"/>','<sheet name="Selections" sheetId="1" r:id="rId1"/>',1)

path.write_text(s, encoding="utf-8")
