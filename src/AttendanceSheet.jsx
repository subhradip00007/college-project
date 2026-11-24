import {useState} from 'react'

const pad = value => String(value).padStart(2,'0')
export default function AttendanceSheet({room,data,teacher,record,manage,promote,addSubject}){
  const today=new Date()
  const [month,setMonth]=useState(today.getFullYear()+'-'+pad(today.getMonth()+1))
  const subjects=data.subjects
  const [subject,setSubject]=useState(subjects[0]||'')
  const [adding,setAdding]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [termId,setTermId]=useState('')
  const [start,setStart]=useState(today.getFullYear()+'-'+pad(today.getMonth()+1)+'-'+pad(today.getDate()))
  const term=termId ? data.terms.find(t=>t.start===termId) : data.terms.find(t=>!t.closed)
  const roster=term?.closed?data.roll.filter(row=>row.start===term.start):data.roster
  const [held,setHeld]=useState([])
  const eligible=roster.filter(row=>data.roster.some(s=>s.id===row.id))
  const chosen=eligible.filter(row=>!held.includes(row.id)).map(row=>row.id)
  const next=Number(room.split('-')[1])+1
  async function advance(){
    setBusy(true);setError('')
    try{await promote({start:term.start,selected:chosen});setHeld([])}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const termMarks=data.marks.filter(m=>term && m.day>=term.start && m.day<=term.finish)
  const total=id=>termMarks.filter(m=>m.student===id && m.status==='Present').length
  async function update(action){
    if(action==='end'&&!confirm('End this semester and lock its attendance records?'))return
    setBusy(true);setError('')
    try{await manage({action,start:action==='start'?start:term.start});if(action==='start'){setTermId(start);setMonth(start.slice(0,7))}}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  function download(){
    const rows=[['Registration','Name','Room','Semester start','Semester end','Date','Subject','Status','Semester present (all subjects)']]
    for(const {id,name} of roster){
      const marks=termMarks.filter(m=>m.student===id)
      for(const m of marks.length?marks:[{}])rows.push([id,name||'',room,term.start,term.finish,m.day||'',m.subject||'',m.status||'',total(id)])
    }
    const quote=value=>'"'+String(value).replace(/^[=+@\-\t\r]/,c=>"'"+c).replaceAll('"','""')+'"'
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}))
    const a=document.createElement('a');a.href=url;a.download=room+'-'+term.start+'-attendance.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  const [year,number]=month.split('-').map(Number)
  const days=Array.from({length:new Date(year,number,0).getDate()},(_,i)=>i+1)
  const label=new Date(year,number-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'})
  const selected=subject.trim()
  const marks=new Map(termMarks.filter(m=>m.subject===selected&&m.day.startsWith(month+'-')).map(m=>[m.student+'|'+m.day,m.status]))
  async function change(student,day,current){
    setBusy(true);setError('')
    try{await record({student,day,subject:selected,status:current==='Present'?'Absent':'Present'})}
    catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  return <section className="sheet">
    <h2>Attendance sheet · {label}</h2>
        <div className="sheet-controls">
      {teacher&&!data.terms.some(t=>!t.closed)&&<><label>Semester start date<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><button disabled={busy||!start} onClick={()=>update('start')}>Start six-month semester</button></>}
      {data.terms.length>0&&<><label>Roster<select value={term?.start||''} onChange={e=>{setTermId(e.target.value);if(e.target.value)setMonth(e.target.value.slice(0,7))}}>{!data.terms.some(t=>!t.closed)&&<option value="">Current approved students</option>}{data.terms.map(t=><option key={t.start} value={t.start}>{t.start} to {t.finish} · {t.closed?'Ended':'Open'}</option>)}</select></label>{teacher&&term&&<><button onClick={download}>Download semester CSV</button>{!term.closed&&<button disabled={busy} onClick={()=>update('end')}>End semester</button>}</>}</>}
    </div>
    {!term&&<p>Showing current approved students in {room}. Attendance marking opens when a semester starts.</p>}
    {error&&<p role="alert">{error}</p>}
        {teacher&&term?.closed===1&&term.start===data.terms[0].start&&next<=6&&
      (data.promotions.some(p=>p.start===term.start)?<p role="status">Promotion completed. The ended semester register is archived.</p>:
      <details className="promotion"><summary>Promote class to semester {next}</summary>
      <p>Uncheck any student who should repeat this semester.</p>
      {eligible.map(({id})=><label key={id}><input type="checkbox" checked={!held.includes(id)} onChange={e=>setHeld(prev=>e.target.checked?prev.filter(x=>x!==id):[...prev,id])}/> {id}</label>)}
      <button disabled={busy||!eligible.length} onClick={advance}>Confirm promotion · {chosen.length} advance, {eligible.length-chosen.length} stay</button></details>)}
    <div className="sheet-controls"><label>Month<input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value)}}/></label>
    <label>Subject<select value={subject} onChange={e=>setSubject(e.target.value)}><option value="">Choose subject</option>{subjects.map(s=><option key={s}>{s}</option>)}</select></label>
    {teacher&&<button type="button" className="light" onClick={()=>setAdding(!adding)}>{adding?'Cancel':'Add subject'}</button>}</div>
    {teacher&&adding&&<form onSubmit={async e=>{
      e.preventDefault()
      const name=new FormData(e.currentTarget).get('name')
      setBusy(true);setError('')
      try{setSubject(await addSubject(name));setAdding(false)}catch(err){setError(err.message)}finally{setBusy(false)}
    }}><label>New subject for {room}<input name="name" required maxLength="100" autoFocus/></label><button disabled={busy}>Save subject</button></form>}
    <p>{teacher?'Select a subject, then click a day to mark present. Click a marked day to switch between present and absent.':'Your marks for the selected subject and month.'} ✓ Present · × Absent · Blank = unmarked</p>
    <div className="sheet-scroll" tabIndex="0" aria-label="Scrollable monthly attendance"><table aria-label={room+' attendance for '+label}><thead><tr><th scope="col">Registration no.</th><th scope="col">Name</th>{days.map(day=><th key={day} scope="col">{day}</th>)}<th scope="col">Month present</th><th scope="col">Semester present · all subjects</th></tr></thead>
    <tbody>{roster.map(({id,name})=>{
      let present=0
      const cells=days.map(n=>{
        const date=month+'-'+pad(n),status=marks.get(id+'|'+date)
        if(status==='Present')present++
        const symbol=status==='Present'?'✓':status==='Absent'?'×':''
        const description=id+', '+date+', '+(status||'Unmarked')
        return <td key={date} className={status?.toLowerCase()}>{teacher?<button disabled={!selected||busy||!term||term.closed===1||date<term.start||date>term.finish} aria-label={description} title={description} onClick={()=>change(id,date,status)}>{symbol}</button>:<span aria-label={description} title={description}>{symbol}</span>}</td>
      })
      return <tr key={id}><th scope="row">{id}</th><td>{name||'—'}</td>{cells}<td className="total">{present}</td><td className="total">{term?total(id):'—'}</td></tr>
    })}{!roster.length&&<tr><td colSpan={days.length+4}>{term?.closed ? "No student rows in this archived semester." : "No approved students in this classroom yet."}</td></tr>}</tbody></table></div>
  </section>
}








