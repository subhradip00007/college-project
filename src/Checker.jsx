import { useState } from 'react'

const portals = {
  SVMCM: 'https://svmcm.wb.gov.in/',
  OASIS: 'https://oasis.gov.in/',
  Aikyashree: 'https://wbmdfcscholarship.in/',
  Pragati: 'https://scholarships.gov.in/'
}

export default function Checker(){
  const [result, setResult] = useState(null)
  function check(event){
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const matches = []
    const score = Number(form.get('marks'))
    if(score >= 60) matches.push('SVMCM')
    if(form.get('reserved')) matches.push('OASIS')
    if(form.get('minority')) matches.push('Aikyashree')
    if(form.get('woman')) matches.push('Pragati')
    setResult(matches)
  }
  return <form onSubmit={check} onChange={()=>setResult(null)}>
    <h2>Scholarship checker</h2>
    <p>Explore schemes using the college project's sample criteria. Confirm current eligibility, income limits and deadlines on the official portal.</p>
    <label>Qualifying exam marks (%)<input name="marks" type="number" min="0" max="100" step="0.01" required/></label>
    <fieldset><legend>Which apply to you?</legend>
      {[['reserved','SC, ST or OBC student'],['minority','Member of a notified minority community'],['woman','Female diploma student']].map(([name,label])=><label key={name} style={{display:'block'}}><input type="checkbox" name={name}/> {label}</label>)}
    </fieldset>
    <button>Check scholarships</button>
    {result && <section aria-live="polite"><h3>Schemes to explore</h3>{result.length ? result.map(name=><p key={name}><a href={portals[name]}>{name} official portal ↗</a></p>) : <p>No match in this demo. Browse the scholarship portals below for other opportunities.</p>}</section>}
  </form>
}
