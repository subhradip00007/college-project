import {readFileSync,writeFileSync} from 'node:fs'
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto'
export function accounts(app,db,rooms,startSession,revoke){
 db.exec(`CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,name TEXT NOT NULL,room TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL,approved INTEGER NOT NULL DEFAULT 0)`)
 const departments=[...new Set(rooms.map(room=>room.split('-')[0]))]
 const staffFile=process.env.STAFF_FILE||new URL('./department-credentials.local',import.meta.url)
 try{
   const passwords=Object.fromEntries(departments.map(d=>[d,randomBytes(14).toString('base64url')]))
   writeFileSync(staffFile,JSON.stringify(passwords,null,2),{flag:'wx',mode:0o600})
 }catch(error){if(error.code!=='EEXIST')throw error}
 const passwords=JSON.parse(readFileSync(staffFile,'utf8'))
 const teachers=new Map(departments.map(d=>['teacher-'+d.toLowerCase(),d]))
 if(!db.prepare("SELECT 1 FROM migrations WHERE name='retire-sample-students'").get()){
   db.exec('BEGIN IMMEDIATE')
   try{
     const remove=db.prepare('DELETE FROM students WHERE id=?')
     for(const room of rooms)for(const suffix of ['a','b'])remove.run(room.toLowerCase()+'-'+suffix)
     db.prepare('INSERT INTO migrations VALUES(?)').run('retire-sample-students')
     db.exec('COMMIT')
   }catch(error){db.exec('ROLLBACK');throw error}
 }
 db.exec('CREATE TABLE IF NOT EXISTS assigned_teachers(id TEXT PRIMARY KEY,department TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL)')
 const keyFile=process.env.PRINCIPAL_FILE || (process.env.STAFF_FILE ? process.env.STAFF_FILE+'.principal.local' : new URL('./principal-password.local',import.meta.url))
 if(!process.env.PRINCIPAL_PASSWORD){
   try{writeFileSync(keyFile,randomBytes(20).toString('base64url'),{flag:'wx',mode:0o600})}
   catch(err){if(err.code!=='EEXIST')throw err}
 }
 const principalPassword=process.env.PRINCIPAL_PASSWORD||readFileSync(keyFile,'utf8').trim()
 db.exec('CREATE TABLE IF NOT EXISTS reset_codes(id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS legacy_teacher_passwords(id TEXT PRIMARY KEY,salt TEXT NOT NULL,hash TEXT NOT NULL)')
 app.post('/api/recover',(req,res)=>{
   const id=String(req.body.id||'').trim().toLowerCase(),{code,password}=req.body
   if(typeof password!=='string'||password.length<8||password.length>128||typeof code!=='string'||code.length>100)return res.status(400).json({error:'Enter the recovery code and a password of 8–128 characters.'})
   const ticket=db.prepare('SELECT * FROM reset_codes WHERE id=? AND expires>?').get(id,Date.now())
   if(!ticket||!timingSafeEqual(scryptSync(code.trim(),ticket.salt,64),Buffer.from(ticket.hash,'hex')))return res.status(400).json({error:'Invalid or expired recovery code.'})
   const salt=randomBytes(16).toString('hex'),hash=scryptSync(password,salt,64).toString('hex')
   db.exec('BEGIN IMMEDIATE')
   try{
     if(teachers.has(id))db.prepare('INSERT OR REPLACE INTO legacy_teacher_passwords VALUES(?,?,?)').run(id,salt,hash)
     else if(!db.prepare('UPDATE assigned_teachers SET salt=?,hash=? WHERE id=?').run(salt,hash,id).changes)db.prepare('UPDATE students SET salt=?,hash=? WHERE id=?').run(salt,hash,id)
     db.prepare('DELETE FROM reset_codes WHERE id=?').run(id)
     db.exec('COMMIT')
   }catch(err){db.exec('ROLLBACK');throw err}
   revoke(id)
   res.json({ok:true})
 })
 const normalize=id=>typeof id==='string'?id.trim().toLowerCase():''
 const students=()=>db.prepare("SELECT id,NULLIF(name,id) AS name,room,'student' role FROM students WHERE approved=1 ORDER BY id").all()
 app.post('/api/register',(req,res)=>{
   const {room,password,name=''}=req.body
   if(typeof name!=='string'||name.trim().length>100)return res.status(400).json({error:'Enter a name of up to 100 characters.'})
   const id=normalize(req.body.id)
   if(!/^[a-z0-9][a-z0-9/-]{2,39}$/.test(id)||teachers.has(id)||(id.startsWith('staff-')||['principal','teacher','librarian'].includes(id))||/^(cst|me|che)-[1-6]-[ab]$/.test(id)||!rooms.includes(room)||typeof password!=='string'||password.length<8||password.length>128)return res.status(400).json({error:'Enter a valid registration number, semester and password (8–128 characters).'})
   const salt=randomBytes(16).toString('hex')
   const hash=scryptSync(password,salt,64).toString('hex')
   const result=db.prepare('INSERT OR IGNORE INTO students(id,name,room,salt,hash) VALUES(?,?,?,?,?)').run(id,name.trim(),room,salt,hash)
   if(!result.changes)return res.status(409).json({error:'This registration number already has an application.'})
   res.status(201).json({ok:true})
 })
 app.post('/api/login',(req,res)=>{
   const id=normalize(req.body.id), password=req.body.password
   const deny=()=>res.status(401).json({error:'Incorrect account or password.'})
   if(typeof password!=='string'||password.length>128)return deny()
   if(id==='principal'){
     if(password!==principalPassword)return deny()
     return startSession(res,{id,role:'principal',name:'Principal'})
   }
   const assigned=db.prepare('SELECT * FROM assigned_teachers WHERE id=?').get(id)
   if(assigned){
     if(!timingSafeEqual(scryptSync(password,assigned.salt,64),Buffer.from(assigned.hash,'hex')))return deny()
     return startSession(res,{id,name:id,role:'teacher',department:assigned.department,assigned:true})
   }
   if(teachers.has(id)){
     const department=teachers.get(id)
     const override=db.prepare('SELECT * FROM legacy_teacher_passwords WHERE id=?').get(id)
     if(override?!timingSafeEqual(scryptSync(password,override.salt,64),Buffer.from(override.hash,'hex')):password!==(process.env[department+'_TEACHER_PASSWORD']||passwords[department]))return deny()
     return startSession(res,{id,name:department+' teacher',role:'teacher',department})
   }
   const row=db.prepare('SELECT * FROM students WHERE id=? AND approved>=0').get(id)
   if(!row||!timingSafeEqual(scryptSync(password,row.salt,64),Buffer.from(row.hash,'hex')))return deny()
   if(!row.approved)return res.status(403).json({error:'Your registration is waiting for teacher approval.'})
   startSession(res,{id,room:row.room,role:'student'})
 })
 return students
}
export function staffRoutes(app,db,students){
 function directory(user){
   const rows=db.prepare("SELECT id,room AS groupName,'Student' AS kind,approved FROM students WHERE approved>=0 AND (?=1 OR room LIKE ?) ORDER BY room,id").all(Number(user.role==='principal'),(user.department||'')+'-%')
   if(user.role==='principal'){
     rows.push(...db.prepare("SELECT id,department AS groupName,'Teacher' AS kind,1 AS approved FROM assigned_teachers ORDER BY department,id").all())
     for(const d of ['CST','ME','CHE'])rows.push({id:'teacher-'+d.toLowerCase(),groupName:d,kind:'Teacher',approved:1})
   }
   return rows
 }
 app.get('/api/directory',(req,res)=>req.staff?res.json(directory(req.user)):res.sendStatus(403))
 app.post('/api/directory/delete-student',(req,res)=>{
   if(!req.staff)return res.sendStatus(403)
   const id=req.body.id
   if(typeof id!=='string')return res.sendStatus(400)
   const student=db.prepare('SELECT room FROM students WHERE id=? AND approved>=0').get(id)
   if(!student||(req.user.role!=='principal'&&student.room.split('-')[0]!==req.user.department))return res.sendStatus(404)
   if(db.prepare("SELECT 1 FROM loans WHERE student=? AND status='Issued'").get(id))return res.status(409).json({error:'Return this student’s issued books before deleting the account.'})
   db.exec('BEGIN IMMEDIATE')
   try{
     db.prepare("UPDATE students SET approved=-1,salt='',hash='' WHERE id=?").run(id)
     db.prepare('DELETE FROM reset_codes WHERE id=?').run(id)
     db.prepare("DELETE FROM loans WHERE student=? AND status='Reserved'").run(id)
     db.exec('COMMIT')
   }catch(err){db.exec('ROLLBACK');throw err}
   res.json({ok:true})
 })
 app.post('/api/directory/reset',(req,res)=>{
   if(!req.staff||!directory(req.user).some(row=>row.id===req.body.id))return res.sendStatus(403)
   const code=randomBytes(15).toString('base64url'),salt=randomBytes(16).toString('hex')
   db.prepare('INSERT OR REPLACE INTO reset_codes VALUES(?,?,?,?)').run(req.body.id,salt,scryptSync(code,salt,64).toString('hex'),Date.now()+900000)
   res.set('Cache-Control','no-store').json({code})
 })
 app.use('/api/principal',(req,res,next)=>req.user.role==='principal'?next():res.sendStatus(403))
 app.get('/api/principal/teachers',(_req,res)=>res.json(db.prepare('SELECT id,department FROM assigned_teachers ORDER BY department,id').all()))
 app.post('/api/principal/teachers',(req,res)=>{
   const {department,password,action}=req.body
   const id=String(req.body.id||'').trim().toLowerCase()
   if(!/^staff-[a-z0-9-]{1,35}$/.test(id)||!['CST','ME','CHE'].includes(department))return res.status(400).json({error:'Use a teacher ID starting with staff- and a valid department.'})
   if(action==='move'){
     if(!db.prepare('UPDATE assigned_teachers SET department=? WHERE id=?').run(department,id).changes)return res.sendStatus(404)
   }else{
     if(typeof password!=='string'||password.length<8||password.length>128)return res.status(400).json({error:'Choose a password of 8–128 characters.'})
     if(db.prepare('SELECT 1 FROM students WHERE id=?').get(id))return res.status(409).json({error:'ID already in use.'})
     const salt=randomBytes(16).toString('hex'),hash=scryptSync(password,salt,64).toString('hex')
     if(!db.prepare('INSERT OR IGNORE INTO assigned_teachers VALUES(?,?,?,?)').run(id,department,salt,hash).changes)return res.status(409).json({error:'Teacher ID already exists.'})
   }
   res.json({ok:true})
 })
 app.get('/api/registrations',(req,res)=>{
   if(!req.staff)return res.sendStatus(403)
   res.json(db.prepare('SELECT id,room FROM students WHERE approved=0 AND room LIKE ? ORDER BY id').all(req.user.role==='principal'?'%':req.user.department+'-%'))
 })
 app.post('/api/registrations/approve',(req,res)=>{
   if(!req.staff)return res.sendStatus(403)
   const result=db.prepare('UPDATE students SET approved=1 WHERE id=? AND approved=0 AND room LIKE ?').run(req.body.id,req.user.role==='principal'?'%':req.user.department+'-%')
   if(!result.changes)return res.status(409).json({error:'This request is no longer pending.'})
   res.json({ok:true})
 })
 app.get('/api/borrowers',(req,res)=>req.staff?res.json(students()):res.sendStatus(403))
}











