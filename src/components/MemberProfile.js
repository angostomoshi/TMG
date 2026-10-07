import React, { useEffect, useState } from 'react';
import { portalRequest } from '../services/portalApi';
import './ShareholderProfile.css';
const text = value => value == null || String(value).trim() === '' || String(value) === '0' ? 'Not recorded' : String(value);
const money = value => value == null ? 'Unavailable' : new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(Number(value));
function Section({title,fields}) {
  return <section className="sh-section"><h2>{title}</h2><dl>{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{text(value)}</dd></div>)}</dl></section>;
}
export default function MemberProfile() {
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    const account=localStorage.getItem('memberNumber');
    if(!account){setError('Please sign in again.');return;}
    Promise.all([portalRequest(`/member/${encodeURIComponent(account)}`),portalRequest(`/shareCapital/sumTotal/${encodeURIComponent(account)}`),portalRequest(`/dividendPayable/sumTotal/${encodeURIComponent(account)}`)])
      .then(([member,capital,dividends])=>{if(active)setData({member,capital,dividends});})
      .catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[]);
  if(error)return <div className="sh-section" role="alert"><h2>Unable to load shareholder details</h2><p>{error}</p><button onClick={()=>window.location.reload()}>Try again</button></div>;
  if(!data)return <div className="sh-section" role="status">Loading your shareholder record?</div>;
  const {member:m,capital,dividends:d}=data;
  return <div className="sh-profile">
    <header className="sh-heading"><div><p className="sh-eyebrow">THE METRO GROUP PLC</p><h1>Shareholder profile</h1><p>Your registered details and financial summary.</p></div><span className="sh-status">{text(m.status)}</span></header>
    <section className="sh-identity"><div className="sh-avatar" aria-hidden="true">{(m.holdersName || '?').split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('')}</div><div><h2>{m.holdersName}</h2><p>Shareholder {m.accNo} ? Registered {m.date ? String(m.date).slice(0,10) : 'Not recorded'}</p></div><div className="sh-account-status"><small>Account status</small><strong>{text(m.account_status)}</strong></div></section>
    <section className="sh-balances" aria-label="Financial summary">{[['Shares',capital.balance],['Dividends',d.dividends],['Dividends paid',d.paid],['Balance',d.balance]].map(([label,value])=><div key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</section>
    <p className="sh-asof">Balance is outstanding dividends. As at {new Date(m.asOf).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})} (EAT).</p>
    <div className="sh-grid">
      <Section title="Contact details" fields={[["Telephone",m.tel1],["Mobile",m.tel2],["Email",m.email_add],["Postal address",m.postal_address],["Street",m.street],["Nationality",m.nationality],["Locality",m.locality]]} />
      <Section title="Legal information" fields={[["ID number",m.id_no],["KRA PIN",m.pin_no],["Resident permit number",m.resident_permit_no],["Resident",m.resident],["Tax exempt",m.tax_exempt]]} />
      <Section title="Payment details" fields={[["Registered account name",m.reg_accname],[/mobile/i.test(m.mode_ofpymt || '')?'Payment phone number':'Payment account',m.bank_acc],["Payment method",m.mode_ofpymt],["Delivery mode",m.mode_of_dispatch]]} />
      <section className="sh-section"><h2>Next of kin</h2>{[1,2,3].filter(i=>m[`nok${i}`]).map(i=><div className="sh-kin" key={i}><span className="sh-kin-number">{i}</span><div><strong>{text(m[`nok${i}`])}</strong><p>{text(m[`relation${i}`])} ? {text(m[`nok${i}_pnoneno`])}</p></div></div>)}{![1,2,3].some(i=>m[`nok${i}`])&&<p>No next of kin recorded.</p>}</section>
    </div><p className="sh-asof">Contact the office to correct your registered details.</p>
  </div>;
}
