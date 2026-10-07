import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaBell, FaArrowRight } from 'react-icons/fa';
import './MarketAlerts.css';
import { marketRequest } from '../services/shareMarketApi';

export default function MarketAlerts() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let fetching = false;
    async function refresh() {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        const result = await marketRequest('/notifications');
        if (active) { setData(result); setError(false); }
      } catch { if (active) setError(true); }
      finally { fetching = false; }
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('market-updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('market-updated', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <aside aria-label="Share market alerts" className="market-alerts">
    <div className="market-alerts-main"><span className="market-alerts-icon"><FaBell aria-hidden="true" /></span><div className="market-alerts-copy"><strong>{error?'Market updates unavailable':!data?'Checking market updates?':data.pending?`${data.pending} request${data.pending===1?'':'s'} need your attention`:'Your share marketplace'}</strong><p>{error?'Open the market to retry.':data?.pending?'A member has responded to your listing. Review their request.':'Explore offers, post a listing, and follow your requests.'}</p></div><div className="market-alerts-actions"><Link className="market-alerts-secondary" to="/share-market#trades">My activity {data?.pending>0&&!error&&<span>{data.pending}</span>}</Link><Link className="market-alerts-primary" to="/share-market">Open market <FaArrowRight aria-hidden="true" /></Link></div></div>
    {!error && data?.activity.length > 0 && <details className="market-alerts-recent"><summary>Recent activity</summary><ul>{data.activity.map(item=><li key={item.id}><Link to="/share-market#trades"><span>{item.needs_response?(item.side==='sell'?'New request to buy your capital':'New offer to sell you capital'):({requested:'Awaiting a response',awaiting_review:'Terms accepted ? awaiting office review',cancelled:'Request cancelled',declined:'Request closed'})[item.status]}</span><strong>KES {Number(item.capital_amount).toLocaleString('en-KE')}</strong><FaArrowRight aria-hidden="true" /></Link></li>)}</ul></details>}
  </aside>;
}
