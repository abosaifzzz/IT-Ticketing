import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {zipSync,strToU8} from 'fflate'
import {rosterRows} from '../src/administration/roster.js'
const sheet=rows=>'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows+'</sheetData></worksheet>'
const cell=(ref,text)=>'<c r="'+ref+'" t="inlineStr"><is><t>'+text+'</t></is></c>'
const header='<row r="1">'+cell('A1','م')+cell('B1','اسم الموظف')+cell('C1','القسم')+'</row>'

test('username roster accepts exact CSV/JSON/XLSX columns and rejects formulas and normalized duplicates',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'helpdesk-user-roster-test-'))
 try{
  const read=file=>JSON.parse(execFileSync(process.env.HELPDESK_PYTHON??'python',['scripts/read-user-roster.py',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
  const rows=[{username:'fictional.employee',fullName:'موظف خيالي'}]
  for(const ext of ['csv','json','xlsx']){
   const file=join(directory,'fictional.'+ext)
   const xml='<row r="1">'+cell('A1','username')+cell('B1','fullName')+'</row><row r="2">'+cell('A2',rows[0].username)+cell('B2',rows[0].fullName)+'</row>'
   await writeFile(file,ext==='json'?JSON.stringify(rows):ext==='csv'?'username,fullName\n'+rows[0].username+','+rows[0].fullName+'\n':zipSync({'xl/worksheets/sheet1.xml':strToU8(sheet(xml))}))
   assert.deepEqual(read(file),rows)
   if(ext==='xlsx'){
    const sourceHeaders=xml.replace('username','اسم المستخدم').replace('fullName','Full Name')
    await writeFile(file,zipSync({'xl/worksheets/sheet1.xml':strToU8(sheet(sourceHeaders))}));assert.deepEqual(read(file),rows)
    await writeFile(file,zipSync({'xl/worksheets/sheet1.xml':strToU8(sheet(xml.replace('<is><t>fictional.employee','<f>1+1</f><is><t>fictional.employee')))}));assert.throws(()=>read(file))
   }
  }
  assert.throws(()=>rosterRows([...rows,{...rows[0],username:'FICTIONAL.EMPLOYEE'}]))
  assert.throws(()=>rosterRows([{...rows[0],department:'unexpected'}]))
  assert.throws(()=>rosterRows([{username:'not/allowed',fullName:'Fictional'}]))
  assert.equal(rosterRows([{username:'Fictional First Last',fullName:'Fictional Person'}])[0].username,'fictional first last')
  assert.throws(()=>rosterRows([]))
 }finally{await rm(directory,{recursive:true,force:true})}
})
test('roster reader treats the workbook as data, requires columns, and never executes formulas',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'helpdesk-roster-test-'))
 try{
  const file=join(directory,'fictional.xlsx'),row='<row r="2">'+cell('A2','1')+cell('B2','موظف خيالي')+cell('C2','قسم خيالي')+'</row>'
  await writeFile(file,zipSync({'xl/worksheets/sheet1.xml':strToU8(sheet(header+row))}))
  const read=()=>execFileSync(process.env.HELPDESK_PYTHON??'python',['scripts/read-employee-roster.py',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
  assert.deepEqual(JSON.parse(read()),[{sourceRow:2,sequence:1,fullName:'موظف خيالي',department:'قسم خيالي'}])
  const formula=row.replace('<is>', '<f>HYPERLINK("https://example.invalid")</f><is>')
  await writeFile(file,zipSync({'xl/worksheets/sheet1.xml':strToU8(sheet(header+formula))}));assert.throws(read)
  await writeFile(file,zipSync({'xl/worksheets/sheet1.xml':strToU8(sheet(header.replace('اسم الموظف','Unknown')+row))}));assert.throws(read)
  const duplicate=row.replaceAll('r="2"','r="3"').replaceAll('A2','A3').replaceAll('B2','B3').replaceAll('C2','C3')
  await writeFile(file,zipSync({'xl/worksheets/sheet1.xml':strToU8(sheet(header+row+duplicate))}));assert.throws(read)
 }finally{await rm(directory,{recursive:true,force:true})}
})
