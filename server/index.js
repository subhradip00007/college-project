
import {accounts,staffRoutes} from './accounts.js'
import {fileURLToPath} from 'node:url'
import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'

const app = express()
const cookieName='portal'
const db = new DatabaseSync(process.env.PORTAL_DB || fileURLToPath(new URL('./portal.sqlite', import.meta.url)))
db.exec(`
 CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY, room TEXT, author TEXT, kind TEXT, subject TEXT, body TEXT, filename TEXT, file BLOB, date TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS marks(room TEXT, student TEXT, day TEXT, subject TEXT, status TEXT, PRIMARY KEY(room,student,day,subject));
 CREATE TABLE IF NOT EXISTS books(id INTEGER PRIMARY KEY,title TEXT,author TEXT,shelf TEXT);
 CREATE TABLE IF NOT EXISTS loans(book INTEGER PRIMARY KEY,student TEXT,status TEXT,due TEXT);
`)
db.exec('CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY)')
const rooms=['CST','ME','CHE'].flatMap(p=>Array.from({length:6},(_,i)=>p+'-'+(i+1)))

const sessions=new Map()
app.use(express.json({limit:'3mb'}))
app.get('/api/health',(_,res)=>res.json({status:'ok'}))
function startSession(res,user){
 const token=randomBytes(32).toString('hex')
 sessions.set(token,{user,expires:Date.now()+8*3600000})
 res.cookie(cookieName,token,{httpOnly:true,sameSite:'strict',maxAge:8*3600000}).json(user)
}
const students=accounts(app,db,rooms,startSession,id=>{for(const [key,session] of sessions)if(session.user.id===id)sessions.delete(key)})
app.use('/api',(req,res,next)=>{
 const token=(req.headers.cookie||'').match(new RegExp('(?:^|; )'+cookieName+'=([a-f0-9]+)'))?.[1]
 const session=sessions.get(token)
 if(!session || session.expires<Date.now()) return res.status(401).json({error:'Please sign in.'})
 if(session.user.role==='student'){
   const enrollment=db.prepare('SELECT room FROM students WHERE id=? AND approved=1').get(session.user.id)
   if(!enrollment){sessions.delete(token);return res.status(401).json({error:'Student account is no longer active.'})}
   session.user.room=enrollment.room
 }
 if(session.user.assigned)session.user.department=db.prepare('SELECT department FROM assigned_teachers WHERE id=?').get(session.user.id)?.department
 req.staff=['teacher','principal'].includes(session.user.role)
 req.user=session.user
 req.token=token
 next()
})
db.exec('CREATE TABLE IF NOT EXISTS teacher_activity(id INTEGER PRIMARY KEY, department TEXT, actor TEXT, message TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)')
app.get('/api/activity',(req,res)=>{
 if(!req.staff)return res.sendStatus(403)
 res.json(db.prepare('SELECT id,actor,message,created FROM teacher_activity WHERE (?=1 OR department=?) ORDER BY id DESC LIMIT 200').all(Number(req.user.role==='principal'),req.user.department||''))
})

app.use('/api',(req,res,next)=>{
 if(!req.staff||req.method!=='POST')return next()
 const parts=req.path.split('/').filter(Boolean)
 const body=req.body||{}
 let message
 if(parts[0]==='directory')message=(parts[1]==='delete-student'?'Deleted student · ':'Issued recovery code · ')+body.id
 if(parts[0]==='books'){
   const name=parts[1]?db.prepare('SELECT title FROM books WHERE id=?').get(parts[1])?.title:body.title
   const borrower=parts[1]?db.prepare('SELECT student FROM loans WHERE book=?').get(parts[1])?.student:null
   message=parts[1]?'Library · '+body.action+' · '+name+' (#'+parts[1]+')':'Added library copy · '+name
   if(body.status)message+=' · '+body.status
   if(body.student||borrower)message+=' · '+(body.student||borrower)
 }else if(parts[0]==='registrations')message='Approved registration · '+body.id
 else if(parts[0]==='rooms'){
   const descriptions={subjects:'Added attendance subject · '+body.name,marks:'Marked '+body.student+' '+body.status+' · '+body.subject+' · '+body.day,
     posts:'Posted '+body.kind+' · '+body.subject+(body.filename?' · Attached a file':''),
     terms:(body.action==='start'?'Started':'Ended')+' semester · '+body.start,
     promote:'Promoted '+(body.selected?.length||0)+' students'}
   if(descriptions[parts[2]])message=parts[1]+' · '+descriptions[parts[2]]
 }
 if(message){
   const json=res.json.bind(res)
   res.json=value=>{
     if(res.statusCode<300)db.prepare('INSERT INTO teacher_activity(department,actor,message) VALUES(?,?,?)').run(req.user.department||(parts[0]==='rooms'?parts[1].split('-')[0]:'College'),req.user.id,message)
     return json(value)
   }
 }
 next()
})
staffRoutes(app,db,students)
app.post('/api/logout',(req,res)=>{sessions.delete(req.token);res.clearCookie(cookieName).json({ok:true})})
app.get('/api/me',(req,res)=>res.json(req.user))
app.use('/api/rooms/:room',(req,res,next)=>{
 if(!rooms.includes(req.params.room) || !(req.user.role==='principal'||(req.staff && req.params.room.split('-')[0]===req.user.department)||req.user.room===req.params.room)) return res.status(403).json({error:'This classroom is restricted to its members.'})
 next()
})
db.exec(`CREATE TABLE IF NOT EXISTS attendance_subjects(room TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(room,name));
 INSERT OR IGNORE INTO attendance_subjects SELECT DISTINCT room,subject FROM marks;`)
app.post('/api/rooms/:room/subjects',(req,res)=>{
 if(!req.staff)return res.sendStatus(403)
 const name=typeof req.body.name==='string'?req.body.name.trim().replace(/\s+/g,' '):''
 if(!name||name.length>100)return res.status(400).json({error:'Enter a subject name of 1 to 100 characters.'})
 const result=db.prepare('INSERT INTO attendance_subjects SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM attendance_subjects WHERE room=? AND name=? COLLATE NOCASE)').run(req.params.room,name,req.params.room,name)
 if(!result.changes)return res.status(409).json({error:'This subject already exists in this classroom.'})
 res.status(201).json({name})
})
db.exec('CREATE TABLE IF NOT EXISTS terms(room TEXT,start TEXT,finish TEXT,closed INTEGER DEFAULT 0,PRIMARY KEY(room,start))')
db.exec(`
 CREATE TABLE IF NOT EXISTS term_roll(room TEXT,start TEXT,student TEXT,PRIMARY KEY(room,start,student));
 CREATE TABLE IF NOT EXISTS promotion_runs(room TEXT,start TEXT,PRIMARY KEY(room,start));
 CREATE TRIGGER IF NOT EXISTS snapshot_closed_term AFTER UPDATE OF closed ON terms WHEN NEW.closed=1 AND OLD.closed=0 BEGIN
 INSERT OR IGNORE INTO term_roll SELECT NEW.room,NEW.start,id FROM students WHERE approved=1 AND room=NEW.room;
 END;
`)
if(!db.prepare("SELECT 1 FROM migrations WHERE name='closed-rolls'").get()){
 db.exec("BEGIN; INSERT OR IGNORE INTO term_roll SELECT t.room,t.start,s.id FROM terms t JOIN students s ON t.room=s.room WHERE t.closed=1 AND s.approved=1; INSERT OR IGNORE INTO term_roll SELECT t.room,t.start,m.student FROM terms t JOIN marks m ON t.room=m.room AND m.day BETWEEN t.start AND t.finish WHERE t.closed=1; INSERT INTO migrations VALUES('closed-rolls'); COMMIT")
}
app.post('/api/rooms/:room/promote',(req,res)=>{
 const room=req.params.room, [dept,num]=room.split('-'), {start,selected}=req.body
 if(!req.staff||(req.user.role!=='principal'&&req.user.department!==dept))return res.sendStatus(403)
 if(Number(num)>=6||!Array.isArray(selected)||!selected.every(id=>typeof id==='string')||new Set(selected).size!==selected.length)return res.status(400).json({error:'Invalid promotion selection.'})
 db.exec('BEGIN IMMEDIATE')
 try{
   const term=db.prepare('SELECT * FROM terms WHERE room=? ORDER BY start DESC LIMIT 1').get(room)
   if(!term?.closed||term.start!==start||db.prepare('SELECT 1 FROM promotion_runs WHERE room=? AND start=?').get(room,start))throw Error('Refresh and select the latest ended semester.')
   for(const id of selected){
     const changed=db.prepare('UPDATE students SET room=? WHERE id=? AND room=? AND approved=1 AND EXISTS(SELECT 1 FROM term_roll WHERE room=? AND start=? AND student=?)').run(dept+'-'+(Number(num)+1),id,room,room,start,id)
     if(!changed.changes)throw Error('The roster changed. Refresh before promoting.')
   }
   db.prepare('INSERT INTO promotion_runs VALUES(?,?)').run(room,start)
   db.exec('COMMIT')
   res.json({count:selected.length})
 }catch(error){db.exec('ROLLBACK');res.status(409).json({error:error.message})}
})
app.post('/api/rooms/:room/terms',(req,res)=>{
 if(!req.staff)return res.sendStatus(403)
 const room=req.params.room,{action,start}=req.body
 if(action==='end'){
   const result=db.prepare('UPDATE terms SET closed=1 WHERE room=? AND start=? AND closed=0').run(room,start)
   if(!result.changes)return res.status(409).json({error:'Refresh to view the current semester.'})
 }else{
   const date=new Date(start+'T00:00:00Z')
   if(action!=='start'||!/^\d{4}-\d\d-\d\d$/.test(start)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==start)return res.status(400).json({error:'Choose a valid start date.'})
   const finish=db.prepare("SELECT date(?, '+6 months','floor','-1 day') AS day").get(start).day
   if(db.prepare('SELECT 1 FROM terms WHERE room=? AND (closed=0 OR (start<=? AND finish>=?))').get(room,finish,start))return res.status(409).json({error:'End the open semester and choose dates outside existing semesters.'})
   db.prepare('INSERT INTO terms(room,start,finish) VALUES(?,?,?)').run(room,start,finish)
 }
 res.json({ok:true})
})
app.get('/api/rooms/:room',(req,res)=>{
 const room=req.params.room
 res.json({subjects:db.prepare('SELECT name FROM attendance_subjects WHERE room=? ORDER BY name COLLATE NOCASE').all(room).map(s=>s.name),roll:db.prepare('SELECT r.start,r.student AS id,NULLIF(s.name,s.id) AS name FROM term_roll r LEFT JOIN students s ON s.id=r.student WHERE r.room=? AND (?=1 OR r.student=?)').all(room,Number(req.staff),req.user.id),promotions:db.prepare('SELECT start FROM promotion_runs WHERE room=?').all(room),terms:db.prepare('SELECT * FROM terms WHERE room=? ORDER BY start DESC').all(room),posts:db.prepare('SELECT id,author,kind,subject,body,filename,date FROM posts WHERE room=? ORDER BY id DESC').all(room),roster:students().filter(u=>u.room===room && (req.staff||u.id===req.user.id)),marks:db.prepare('SELECT * FROM marks WHERE room=? AND (student=? OR ?=1) ORDER BY day DESC').all(room,req.user.id,Number(req.staff))})
})
app.post('/api/rooms/:room/posts',(req,res)=>{
 const {kind,subject,body,filename,data}=req.body
 if(!['Message','Task'].includes(kind)||!body?.trim()||!subject?.trim()||((kind==='Task'||data||filename)&&!req.staff)) return res.status(400).json({error:'Choose a subject and enter a message.'})
 const file=data?Buffer.from(data,'base64'):null
 if(file?.length>2*1024*1024)return res.status(400).json({error:'Choose a file under 2 MB.'})
 db.prepare('INSERT INTO posts(room,author,kind,subject,body,filename,file) VALUES(?,?,?,?,?,?,?)').run(req.params.room,req.user.role==='student'?req.user.id:req.user.name,kind,subject.trim(),body.trim(),file?filename:null,file)
 res.json({ok:true})
})
app.get('/api/rooms/:room/files/:id',(req,res)=>{
 const row=db.prepare('SELECT file,filename FROM posts WHERE room=? AND id=?').get(req.params.room,req.params.id)
 if(!row?.file)return res.sendStatus(404)
 res.attachment(row.filename).type('application/octet-stream').send(Buffer.from(row.file))
})
app.post('/api/rooms/:room/marks',(req,res)=>{
 const {student,day,subject,status}=req.body
 if(!req.staff)return res.sendStatus(403)
 if(!students().some(u=>u.room===req.params.room&&u.id===student)||!/^\d{4}-\d\d-\d\d$/.test(day)||!subject?.trim()||!['Present','Absent'].includes(status))return res.status(400).json({error:'Invalid attendance entry.'})
 if(!db.prepare('SELECT 1 FROM terms WHERE room=? AND closed=0 AND start<=? AND finish>=?').get(req.params.room,day,day))return res.status(409).json({error:'Start a semester or select a day in the open semester.'})
 if(!db.prepare('SELECT 1 FROM attendance_subjects WHERE room=? AND name=?').get(req.params.room,subject.trim()))return res.status(400).json({error:'Choose a saved attendance subject.'})
 db.prepare('INSERT OR REPLACE INTO marks VALUES(?,?,?,?,?)').run(req.params.room,student,day,subject.trim(),status)
 res.json({ok:true})
})
app.get('/api/books',(req,res)=>res.json(db.prepare("SELECT books.*,coalesce(status,'Available') status,CASE WHEN student=? OR ?=1 THEN student END borrower,CASE WHEN student=? OR ?=1 THEN due END due FROM books LEFT JOIN loans ON books.id=loans.book").all(req.user.id,Number(req.staff),req.user.id,Number(req.staff))))
app.post('/api/books',(req,res)=>{
 if(!req.staff)return res.sendStatus(403)
 const {title,author,shelf}=req.body
 if(![title,author,shelf].every(x=>typeof x==='string'&&x.trim()))return res.status(400).json({error:'Complete all book fields.'})
 db.prepare('INSERT INTO books(title,author,shelf) VALUES(?,?,?)').run(title,author,shelf)
 res.json({ok:true})
})
app.post('/api/books/:id',(req,res)=>{
 const id=req.params.id, action=req.body.action
 if(!db.prepare('SELECT id FROM books WHERE id=?').get(id))return res.sendStatus(404)
 if(['Update','Delete'].includes(action)){
   if(!req.staff)return res.sendStatus(403)
   const current=db.prepare('SELECT * FROM loans WHERE book=?').get(id)
   if(action==='Delete'){
     if(current)return res.status(409).json({error:'Return or release this copy before deleting it.'})
     db.prepare('DELETE FROM books WHERE id=?').run(id)
   }else{
     const {status,student,previous,previousBorrower}=req.body
     if(previous!==(current?.status||'Available')||previousBorrower!==(current?.student||null))return res.status(409).json({error:'This copy changed. Refresh before editing.'})
     if(status==='Available')db.prepare('DELETE FROM loans WHERE book=?').run(id)
     else{
       if(!['Reserved','Issued'].includes(status)||(!students().some(s=>s.id===student)&&current?.student!==student)||!student)return res.status(400).json({error:'Choose an approved borrower.'})
       const due=status==='Issued'&&current?.student===student?current?.due:null
       db.prepare("INSERT OR REPLACE INTO loans VALUES(?,?,?,CASE WHEN ?='Issued' THEN coalesce(?,date('now','+14 days')) END)").run(id,student,status,status,due||null)
     }
   }
   return res.json({ok:true})
 }
 let result
 if(action==='Reserve'&&req.user.role==='student')result=db.prepare("INSERT OR IGNORE INTO loans VALUES(?,?,'Reserved',NULL)").run(id,req.user.id)
 if(action==='Cancel')result=db.prepare("DELETE FROM loans WHERE book=? AND student=? AND status='Reserved'").run(id,req.user.id)
 if(req.staff&&action==='Issue')result=db.prepare("UPDATE loans SET status='Issued',due=date('now','+14 days') WHERE book=? AND status='Reserved'").run(id)
 if(req.staff&&action==='Return')result=db.prepare("DELETE FROM loans WHERE book=? AND status='Issued'").run(id)
 if(!result?.changes)return res.status(409).json({error:'Action unavailable. Refresh the catalog.'})
 res.json({ok:true})
})
app.use(express.static(resolve('dist')))
app.listen(process.env.PORT||3000,process.env.HOST||'127.0.0.1',()=>console.log('College portal listening on localhost'))


















