import {useEffect,useState} from 'react'
export default function Directory({api,principal}){
 const [rows,load]=useState([]),[query,search]=useState(''),[kind,filter]=useState('Student'),[notice,show]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{api('directory').then(load).catch(err=>show(err.message))},[api])
 async function issue(id){
   if(!confirm('Issue a recovery code for '+id+'? Any earlier code will expire.'))return
   setBusy(true)
   try{const {code}=await api('directory/reset',{id});show(id+' · '+code+' · Valid for 15 minutes. Share privately.')}catch(err){show(err.message)}finally{setBusy(false)}
 }
 async function removeStudent(row){
   if(!confirm('Delete student '+row.id+' from '+row.groupName+'? This disables sign-in and removes them from the active attendance list.'))return
   setBusy(true)
   try{await api('directory/delete-student',{id:row.id});load(list=>list.filter(s=>s.id!==row.id));show(row.id+' removed from the active register.')}catch(err){show(err.message)}finally{setBusy(false)}
 }
 return <main><h1>Account directory</h1>{principal&&<label>Accounts<select value={kind} onChange={e=>{filter(e.target.value);show('')}}><option>Student</option><option>Teacher</option></select></label>}
 <label>Search by ID or classroom<input type="search" value={query} onChange={e=>search(e.target.value)}/></label>
 {notice&&<article role="status">{notice} <button onClick={()=>show('')}>Dismiss</button></article>}
 {rows.filter(r=>r.kind===kind&&(r.id+' '+r.groupName).toLowerCase().includes(query.toLowerCase())).map(r=><article key={r.id}><strong>{r.id}</strong><p>{r.groupName} · {r.approved?'Active':'Awaiting approval'}</p><button disabled={busy} onClick={()=>issue(r.id)}>Issue recovery code</button>{r.kind==='Student'&&<button className="light" disabled={busy} onClick={()=>removeStudent(r)}>Delete student</button>}</article>)}</main>
}

