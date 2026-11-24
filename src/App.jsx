import Directory from './Directory.jsx'
import AttendanceSheet from './AttendanceSheet.jsx'
import {Login,Approvals,LibraryDesk,Principal} from './Accounts.jsx'
import Checker from './Checker.jsx'
import React,{useEffect,useState} from 'react'
import faculty from './faculty.json'
import './App.css'

const programs={CST:'Computer Science and Technology',ME:'Mechanical Engineering',CHE:'Chemical Engineering'}
const rooms=Object.keys(programs).flatMap(p=>Array.from({length:6},(_,i)=>p+'-'+(i+1)))
const services=[['Classroom','▤','Tasks, files and class discussions'],['Attendance','✓','Your subject attendance record'],['Library','▥','Find a book and reserve a copy']]
const maps='https://www.google.com/maps/search/?api=1&query=Uluberia+Government+Polytechnic+Boalia'
async function api(path,body){
 const response=await fetch('/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
 const value=await response.json().catch(()=>({}))
 if(!response.ok)throw Error(value.error||'Request failed. Please try again.')
 return value
}
function Footer(){
 const groups=[
   ['Campus services',[['Classroom','Classroom'],['Attendance','Attendance'],['Library','Library'],['Scholarship checker','Scholarship']]],
   ['College links',[['Home','Home'],['Institute','Institute'],['Faculty & staff','Faculty'],['Notices','Notice'],['Admission','Admission']]]
 ]
 return <footer className="campus-footer">
   <section><strong>Uluberia Government Polytechnic</strong>
     <address>Mouza–Barberia JL No-34 L.R.<br/>Khatian No-1, Boalia<br/>Uluberia, Howrah 711316</address>
     <a href="mailto:uluberiagovpoly@gmail.com">uluberiagovpoly@gmail.com</a>
     <a href={maps}>Open campus in Google Maps ↗</a>
   </section>
   {groups.map(([title,links])=><nav key={title} aria-label={'Footer '+title}>
     <strong>{title}</strong>
     {links.map(([label,page])=><a key={page} href={'#'+page}>{label}</a>)}
   </nav>)}
 </footer>
}
function Public({page,open,login}){
 if(page==='Home')return <><div className="hero"><div><small>ULUBERIA · HOWRAH</small><h1>Uluberia Government<br/>Polytechnic College</h1><p>Welcome to your campus portal.</p><button onClick={()=>login('student')}>Student sign in</button> <button className="light" onClick={()=>login('teacher')}>Teacher sign in</button></div></div><main><h2>Campus services</h2><div className="grid">{services.map(([name,icon,desc])=><button className="card" key={name} onClick={()=>open(name)}><b>{icon}</b><h3>{name==='Classroom'?'My classroom':name}</h3>{desc}</button>)}</div></main></>
 const pages={Institute:<><p>The institute began in the 2021–22 academic session and offers three-year diploma programmes.</p>{Object.values(programs).map(p=><article key={p}>{p}</article>)}<a href="#Faculty">Faculty &amp; staff</a> · <a href="#Alumni">Alumni</a></>,Faculty:faculty.map(f=><article key={f.name}><strong>{f.name}</strong><p>{f.role}</p></article>),Alumni:<p>For alumni enquiries, contact the college at <a href="mailto:uluberiagovpoly@gmail.com">uluberiagovpoly@gmail.com</a>.</p>,Admission:<><p>Explore diploma programmes in CST, Mechanical Engineering and Chemical Engineering.</p><a href="https://scvtwb.in/">Visit the West Bengal admission portal ↗</a></>,Scholarship:<><Checker/><p>Explore scholarship schemes listed by the college.</p>{[['SVMCM','https://svmcm.wb.gov.in/'],['OASIS','https://oasis.gov.in/'],['Aikyashree','https://wbmdfcscholarship.in/'],['National Scholarship Portal','https://scholarships.gov.in/']].map(([n,u])=><article key={n}><a href={u}>{n} ↗</a></article>)}</>,Notice:<p>There are no public notices in this edition.</p>,}
 return <main><a href="#Home">Home</a><h1>{page}</h1>{pages[page]||pages.Institute}</main>
}
function Room({value,change,department}){return <select value={value} onChange={e=>change(e.target.value)}>{rooms.filter(r=>!department||r.startsWith(department+'-')).map(r=><option value={r} key={r}>{r.replace('-',' · Semester ')}</option>)}</select>}
function Workspace({user,tab,logout}){
 const [room,R]=useState(user.room||(user.department||'CST')+'-1'),[data,D]=useState(null),[error,E]=useState(''),[rev,V]=useState(0),[search,S]=useState('')
 const [students,setStudents]=useState([])
 useEffect(()=>{if(['teacher','principal'].includes(user.role)&&tab==='Library')api('borrowers').then(setStudents).catch(e=>E(e.message))},[user,rev,tab])
 const path=tab==='Library'?'books':'rooms/'+room
 useEffect(()=>{let live=true;E('');api(path).then(d=>live&&D(d)).catch(e=>live&&E(e.message));return()=>{live=false}},[path,rev])
 useEffect(()=>{
   if(tab!=='Attendance')return
   const refresh=()=>{if(document.visibilityState==='visible')V(v=>v+1)}
   const timer=setInterval(refresh,15000)
   window.addEventListener('focus',refresh)
   return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}
 },[tab])
 async function save(url,body,form){try{await api(url,body);form?.reset();V(v=>v+1)}catch(e){E(e.message)}}
 function form(handler){return async e=>{e.preventDefault();const f=e.currentTarget;try{await handler(Object.fromEntries(new FormData(f)),f)}catch(err){E(err.message)}}}
 async function post(fields,f){const file=fields.upload;delete fields.upload
 if(file?.size>2*1024*1024)throw Error('Choose a file under 2 MB.')
 if(file?.size){fields.filename=file.name;fields.data=await new Promise((ok,no)=>{const reader=new FileReader();reader.onload=()=>ok(reader.result.split(',')[1]);reader.onerror=no;reader.readAsDataURL(file)})}
 await save(path+'/posts',fields,f)}
 const teacher=['teacher','principal'].includes(user.role),lib=teacher
 return <main><div className="bar"><small>{user.role==='student'?user.id:user.name}</small><button className="light" onClick={logout}>Sign out</button></div><div className="bar"><h1>{tab}</h1>{teacher&&tab!=='Library'?<Room department={user.department} value={room} change={next=>{D(null);R(next)}}/>:tab!=='Library'&&<strong>{room}</strong>}<button className="light" onClick={()=>V(v=>v+1)}>Refresh</button></div>{error&&<p role="alert">{error}</p>}{!data?(error?null:<p>Loading…</p>):tab==='Library'&&Array.isArray(data)?<><p>{data.length} copies · {data.filter(b=>b.status==='Available').length} available · {data.filter(b=>b.status==='Reserved').length} reserved · {data.filter(b=>b.status==='Issued').length} issued</p><input aria-label="Search books" placeholder="Search title, author or shelf" value={search} onChange={e=>S(e.target.value)}/>{lib&&<form onSubmit={form((v,f)=>save(path,v,f))}><h3>Add a library copy</h3>{['title','author','shelf'].map(n=><input key={n} required name={n} placeholder={n} aria-label={n}/>)}<button>Add book</button></form>}{data.filter(b=>(b.title+b.author+b.shelf).toLowerCase().includes(search.toLowerCase())).map(b=><article key={b.id}><strong>{b.title}</strong><p>{b.author} · {b.shelf} · Copy {b.id}</p>{lib&&<LibraryDesk key={[b.id,b.status,b.borrower].join('|')} students={students} book={b} save={body=>save(path+'/'+b.id,body)}/>} {b.status}  {b.borrower&&' · '+b.borrower} {b.due&&' · Due '+b.due}{(lib?(b.status==='Reserved'?['Issue']:b.status==='Issued'?['Return']:[]):user.role==='student'?(b.status==='Available'?['Reserve']:b.status==='Reserved'&&b.borrower===user.id?['Cancel']:[]):[]).map(action=><button key={action} onClick={()=>save(path+'/'+b.id,{action})}>{action}</button>)}</article>)}</>:tab==='Classroom'&&data.posts?<><form onSubmit={form(post)}><h3>Post to {room}</h3>{teacher ? <select aria-label="Post type" name="kind"><option>Message</option><option>Task</option></select> : <input type="hidden" name="kind" value="Message"/>}<input required name="subject" placeholder="Subject" aria-label="Subject"/><textarea required name="body" placeholder="Write to your class…" aria-label="Post text"/>{teacher&&<label>Attach a file (up to 2 MB)<input type="file" name="upload"/></label>}<button>Post to classroom</button></form>{!data.posts.length&&<p>No posts yet in this classroom.</p>}{data.posts.map(p=><article key={p.id}><small>{p.kind} · {p.author} · {p.date} UTC</small><h3>{p.subject}</h3><p className="message">{p.body}</p>{p.filename&&<a href={'/api/'+path+'/files/'+p.id}>Download {p.filename}</a>}</article>)}</>:tab==='Attendance'&&data.marks?<AttendanceSheet key={room} room={room} teacher={teacher} data={data} addSubject={async name=>{const saved=await api(path+'/subjects',{name});D(current=>current&&({...current,subjects:[...new Set([...current.subjects,saved.name])].sort()}));return saved.name}} promote={async body=>{await api(path+'/promote',body);V(v=>v+1)}} manage={async body=>{await api(path+'/terms',body);V(v=>v+1)}} record={async mark=>{
   await api(path+'/marks',mark)
   D(current=>current&&({...current,marks:[...current.marks.filter(m=>m.student!==mark.student||m.day!==mark.day||m.subject!==mark.subject),mark]}))
 }}/>:null}</main>
}
const sections = services.map(([name]) => name)
const readPage = () => location.hash.slice(1).replace(/%20/g,' ') || 'Home'

function ActivityLog({department}){
 const [rows,load]=useState([]),[revision,refresh]=useState(0),[state,status]=useState('loading'),[query,search]=useState('')
 useEffect(()=>{
   let live=true
   status('loading')
   api('activity').then(entries=>{if(live){load(entries);status('ready')}}).catch(()=>{if(live)status('error')})
   return ()=>{live=false}
 },[revision])
 const groups=new Map()
 for(const row of rows){
   if(!(row.actor+' '+row.message).toLowerCase().includes(query.trim().toLowerCase()))continue
   const date=new Date(row.created.replace(' ','T')+'Z')
   const day=date.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
   if(!groups.has(day))groups.set(day,[])
   groups.get(day).push({...row,date})
 }
 return <main className="activity"><div className="activity-head"><div><small>{department?department+' department':'All departments'}</small><h1>Teacher activity log</h1></div><button className="light" disabled={state==='loading'} onClick={()=>refresh(v=>v+1)}>Refresh</button></div>
 <label className="activity-search">Search recent activity<input type="search" value={query} onChange={e=>search(e.target.value)} placeholder="Search by action, teacher or registration number"/></label>
 {state==='loading'?<p role="status">Loading activity…</p>:state==='error'?<p role="alert">Could not load activity. Select Refresh to try again.</p>:groups.size===0?<p>{query?'No matching entries.':'No activity recorded for this department yet.'}</p>:
 [...groups].map(([day,entries])=><section key={day}><h2>{day}</h2><ol>{entries.map(entry=><li key={entry.id}><time dateTime={entry.date.toISOString()}>{entry.date.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</time><div><strong>{entry.message}</strong><small>{entry.actor}</small></div></li>)}</ol></section>)}</main>
}
export default function App(){
 const [menu,setMenu]=useState(false)
 const [page,setPage]=useState(readPage)
 const [user,setUser]=useState(null)
 const [ready,setReady]=useState(false)
 useEffect(()=>{
   api('me').then(setUser).catch(()=>{}).finally(()=>setReady(true))
   const change=()=>setPage(readPage())
   addEventListener('hashchange',change)
   return ()=>removeEventListener('hashchange',change)
 },[])
 const go=name=>{location.hash=name}
 const protectedPage=sections.includes(page)
 const loginPage=page.startsWith('Login-')
 const role=loginPage?page.slice(6):'student'
 function signedIn(account){
   setUser(account)
   go(account.role==='principal'?'Teacher assignments':protectedPage?page:'Classroom')
 }
 async function logout(){await api('logout',{});setUser(null);go('Home')}
 const links=['Home','Institute','Notice','Admission','Scholarship',...sections,...(user?.role==='teacher'?['Account directory','Student approvals','Activity log']:user?.role==='principal'?['Teacher assignments','Account directory','Student approvals','Activity log']:[])]
 let content
 if(!ready && (protectedPage||loginPage||page==='Activity log')) content=<main>Loading…</main>
 else if((protectedPage&&!user)||loginPage) content=<Login rooms={rooms} api={api} key={page} role={role} done={signedIn} close={()=>go('Home')}/>
 else if(page==='Account directory') content=['principal','teacher'].includes(user?.role)?<Directory api={api} principal={user.role==='principal'}/>:<main><a href='#Login-teacher'>Staff sign in</a></main>
 else if(page==='Teacher assignments') content=user?.role==='principal'?<Principal api={api} logout={logout}/>:<main><a href='#Login-principal'>Principal sign in</a></main>
 else if(page==='Student approvals') content=['teacher','principal'].includes(user?.role)?<Approvals api={api} department={user.department}/>:<main><a href='#Login-teacher'>Teacher sign in</a></main>
 else if(page==='Activity log') content=['teacher','principal'].includes(user?.role)?<ActivityLog department={user.department}/>:<Public page='Home' open={go} login={r=>go('Login-'+r)}/>
 else if(protectedPage) content=<Workspace key={page} tab={page} user={user} logout={logout}/>
 else content=<Public page={page} open={go} login={r=>go(user?'Classroom':'Login-'+r)}/>
 return <><header><a className="brand" href="#Home"><img src="/logo.png" alt=""/>Uluberia Government Polytechnic College</a>
 <button className="menu-toggle light" aria-controls="main-nav" aria-expanded={menu} onClick={()=>setMenu(!menu)}>Menu</button><nav id="main-nav" className={menu?'expanded':'closed'} onClick={e=>{if(e.target.closest('a'))setMenu(false)}} aria-label="Main navigation">{links.map(n=>n==='Institute'?<details key={n}><summary>Institute</summary><aside>{['Institute','Faculty','Alumni'].map(i=><a key={i} href={'#'+i} onClick={e=>e.currentTarget.closest('details').open=false}>{i==='Faculty'?'Faculty & staff':i}</a>)}</aside></details>:<a href={'#'+n} aria-current={page===n?'page':undefined} key={n}>{n}</a>)}</nav></header>{content}<Footer/></>
}















