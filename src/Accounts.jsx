import {useEffect,useState} from 'react'
export function Login({role,done,close,api,rooms}){
 const staff=role==='teacher'||role==='principal'
 const [type,T]=useState(staff?role:'student'),[register,R]=useState(false),[message,M]=useState('')
 const [recover,setRecover]=useState(false)
 async function submit(e){
   e.preventDefault()
   const f=e.currentTarget, fields=Object.fromEntries(new FormData(f))
   try{
     if(recover){await api('recover',{...fields,id:type==='teacher'?fields.teacher:fields.id});setRecover(false);f.reset();M('Password changed. Sign in with your new password.');return}
     if(register && type==='student'){await api('register',fields);R(false);f.reset();M('Application saved. Sign in after a teacher approves your registration.')}
     else done(await api('login',{id:type==='teacher'?fields.teacher:type==='student'?fields.id:type,password:fields.password}))
   }catch(err){M(err.message)}
 }
 return <main className="narrow"><button className="light" onClick={close}>Back to college</button><h1>{register?'Student registration':type==='student'?'Student sign in':type==='principal'?'Principal sign in':'Teacher sign in'}</h1><form onSubmit={submit}>{staff&&<label>Staff account type<select value={type} onChange={e=>{T(e.target.value);setRecover(false);R(false);M('')}}>{['teacher','principal'].map(r=><option key={r} value={r}>{r==='teacher'?'Teacher':'Principal'}</option>)}</select></label>}
 {type==='teacher'&&<label>Teacher ID<input required name="teacher" autoComplete="username" list="staff-ids" placeholder="Enter your assigned teacher ID"/><datalist id="staff-ids">{['teacher-cst','teacher-me','teacher-che'].map(id=><option key={id} value={id}/>)}</datalist></label>}{type==='student'&&<label>Registration number<input required name="id" maxLength="40" autoComplete="username"/></label>}
 {register&&<><label>Student name (optional)<input name="name" maxLength="100" autoComplete="name"/></label><label>Program and semester<select name="room">{rooms.map(r=><option key={r}>{r}</option>)}</select></label></>}
 {recover&&<label>Recovery code<input name='code' required/></label>}<label>{recover?'New password':register?'Create password':'Password'}<input required type="password" name="password" minLength={register||recover?8:1} maxLength="128" autoComplete={register?'new-password':'current-password'}/></label><button>{recover?'Save new password':register?'Submit for teacher approval':'Sign in'}</button>
 {type!=='principal'&&!register&&<button type='button' className='light' onClick={()=>{setRecover(!recover);M('')}}>{recover?'Back to sign in':'Use a recovery code'}</button>}{type==='student'&&!recover&&<button className="light" type="button" onClick={()=>{R(!register);M('')}}>{register?'Already registered? Sign in':'Register a student account'}</button>}</form><p role="status">{message}</p></main>
}
export function Approvals({api,department:assigned}){
 const [filter,setFilter]=useState('CST')
 const department=assigned||filter
 const [rows,setRows]=useState([]),[message,setMessage]=useState(''),[rev,update]=useState(0)
 useEffect(()=>{api('registrations').then(setRows).catch(e=>setMessage(e.message))},[rev,api])
 async function approve(id){try{await api('registrations/approve',{id});setRows(list=>list.filter(s=>s.id!==id));setMessage(id+' approved.')}catch(e){setMessage(e.message)}}
 return <main><div className="bar"><h1>{department} student approvals</h1>{!assigned&&<label>Department<select value={filter} onChange={e=>setFilter(e.target.value)}>{['CST','ME','CHE'].map(d=><option key={d}>{d}</option>)}</select></label>}<button onClick={()=>update(v=>v+1)}>Refresh</button></div><p role="status">{message}</p>{[1,2,3,4,5,6].map(sem=>{
 const pending=rows.filter(s=>s.room===department+'-'+sem)
 return <section key={sem}><h2>Semester {sem} · {pending.length} pending</h2>{pending.map(s=><article key={s.id}><strong>{s.id}</strong><button onClick={()=>approve(s.id)}>Approve</button></article>)}</section>
 })}</main>
}
export function Principal({api,logout}){
 const [rows,load]=useState([]),[msg,M]=useState(''),[rev,R]=useState(0)
 useEffect(()=>{api('principal/teachers').then(load).catch(e=>M(e.message))},[api,rev])
 async function save(event,extra){event.preventDefault();const form=event.currentTarget
 try{await api('principal/teachers',{...Object.fromEntries(new FormData(form)),...extra});form.reset();M('Assignment saved.');R(v=>v+1)}catch(e){M(e.message)}}
 function departments(value){return <label>Department<select name="department" defaultValue={value}>{['CST','ME','CHE'].map(d=><option key={d}>{d}</option>)}</select></label>}
 return <main><div className="bar"><h1>Teacher assignments</h1><button onClick={logout}>Sign out</button></div><form onSubmit={e=>save(e,{action:'create'})}><h2>Assign a teacher</h2><label>Teacher ID<input required name="id" placeholder="staff-example" pattern="staff-[a-z0-9-]{1,35}"/></label>{departments('CST')}<label>Teacher password<input required name="password" type="password" minLength="8" maxLength="128" autoComplete="new-password"/></label><button>Create teacher account</button></form><p role="status">{msg}</p><h2>Assigned teachers</h2>{!rows.length&&<p>No individual teacher assignments yet.</p>}{rows.map(row=><form key={row.id+row.department} onSubmit={e=>save(e,{id:row.id,action:'move'})}><strong>{row.id}</strong>{departments(row.department)}<button>Save department</button></form>)}</main>
}
export function LibraryDesk({book,students,save}){
 const [status,S]=useState(book.status)
 return <details><summary>Manage copy</summary><form onSubmit={e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(e.currentTarget));save({action:'Update',...fields,previous:book.status,previousBorrower:book.borrower||null})}}>
 <label>Status<select name="status" value={status} onChange={e=>S(e.target.value)}>{['Available','Reserved','Issued'].map(s=><option key={s}>{s}</option>)}</select></label>
 {status!=='Available'&&<label>Borrower<select name="student" required defaultValue={book.borrower||''}><option value="">Select approved student</option>{book.borrower&&!students.some(s=>s.id===book.borrower)&&<option>{book.borrower}</option>}{students.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</select></label>}<button>Save changes</button></form>
 <button disabled={book.status!=='Available'} onClick={()=>{if(confirm('Delete this available copy of '+book.title+'?'))save({action:'Delete'})}}>Delete copy</button></details>
}









