import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MpesaPaymentModal from './MpesaPaymentModal';

function formatCurrency(value) {
  return `KES ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DepositMpesa() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberData, setMemberData] = useState(null);
  const [mpesaAccount, setMpesaAccount] = useState(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      const token = localStorage.getItem('authToken');
      const memberNumber = localStorage.getItem('memberNumber');

      if (!token || !memberNumber) {
        setError('Please log in again to continue.');
        setLoading(false);
        return;
      }

      try {
        const [memberRes, withdrawableRes] = await Promise.all([
          fetch(`/api/v1/member/${memberNumber}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/v1/withDrawable/${memberNumber}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (memberRes.ok) {
          setMemberData(await memberRes.json());
        }

        if (withdrawableRes.ok) {
          const data = await withdrawableRes.json();
          const list = Array.isArray(data) ? data : (data.data || []);
          setAccounts(list);
        } else {
          setError('Unable to load your savings accounts.');
        }
      } catch (err) {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.outStanding || 0), 0);

  return (
    <div className="deposit-mpesa-page">
      <section className="deposit-mpesa-hero">
        <div>
          <button type="button" className="deposit-mpesa-back" onClick={() => navigate('/')}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Dashboard
          </button>
          <span className="eyebrow">M-Pesa</span>
          <h1>Deposit to your savings</h1>
          <p>Choose an account below and we'll send a payment prompt straight to your phone.</p>
        </div>
        <div className="deposit-mpesa-hero-card">
          <span>Total savings balance</span>
          <strong>{loading ? '···' : formatCurrency(totalBalance)}</strong>
          <small>{accounts.length} account{accounts.length === 1 ? '' : 's'}</small>
        </div>
      </section>

      {error && (
        <div className="deposit-mpesa-alert">{error}</div>
      )}

      {loading && (
        <div className="deposit-mpesa-list">
          {[0, 1].map((i) => (
            <div className="deposit-mpesa-card is-loading" key={i}>
              <div className="deposit-mpesa-card-icon skeleton-icon" />
              <div className="deposit-mpesa-card-info">
                <span className="skeleton-line" />
                <span className="skeleton-line short" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && accounts.length === 0 && (
        <div className="deposit-mpesa-empty">
          <p>No savings account found. Please contact the Sacco office.</p>
        </div>
      )}

      {!loading && accounts.length > 0 && (
        <div className="deposit-mpesa-list">
          {accounts.map((account, idx) => (
            <div className="deposit-mpesa-card" key={account.accNo || idx}>
              <div className="deposit-mpesa-card-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 7h18M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7l2-3h14l2 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="deposit-mpesa-card-info">
                <strong>{account.accNo}</strong>
                <span>{account.name || account.holdersName}</span>
              </div>
              <div className="deposit-mpesa-card-balance">
                <span>Balance</span>
                <strong>{formatCurrency(account.outStanding)}</strong>
              </div>
              <button type="button" className="deposit-mpesa-card-btn" onClick={() => setMpesaAccount(account)}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M12 2 3 7v6c0 5 3.8 8.7 9 9 5.2-.3 9-4 9-9V7l-9-5Z" fill="currentColor" opacity="0.22" />
                  <path d="M8.5 12.2 11 14.7l4.7-5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Deposit
              </button>
            </div>
          ))}
        </div>
      )}

      <MpesaPaymentModal
        isOpen={!!mpesaAccount}
        onClose={() => setMpesaAccount(null)}
        memberNo={localStorage.getItem('memberNumber')}
        purpose="savings"
        accountReference={mpesaAccount?.accNo}
        defaultPhone={memberData?.tel1 || memberData?.phone}
        onSuccess={() => navigate('/')}
      />

      <style>{`
        .deposit-mpesa-page {
          max-width: 760px;
          margin: 0 auto;
          padding: 0.25rem 0 1rem;
        }

        .deposit-mpesa-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 1.5rem;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 24px;
          padding: 1.75rem 2rem;
          box-shadow: 0 14px 36px rgba(15, 23, 42, 0.06);
          margin-bottom: 1.25rem;
        }

        .deposit-mpesa-back {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          background: none;
          border: none;
          color: var(--text-muted, #718096);
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          margin-bottom: 1rem;
        }

        .deposit-mpesa-back svg { width: 14px; height: 14px; }
        .deposit-mpesa-back:hover { color: var(--brand-dark, #087987); }

        .deposit-mpesa-hero .eyebrow {
          display: block;
          color: var(--brand-dark, #087987);
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 0.4rem;
        }

        .deposit-mpesa-hero h1 {
          margin: 0 0 0.4rem;
          font-size: 1.55rem;
          color: #102a43;
          font-weight: 800;
        }

        .deposit-mpesa-hero p {
          margin: 0;
          color: var(--text-secondary, #4a5568);
          font-size: 0.88rem;
          max-width: 34ch;
        }

        .deposit-mpesa-hero-card {
          flex-shrink: 0;
          text-align: right;
        }

        .deposit-mpesa-hero-card span {
          display: block;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted, #718096);
        }

        .deposit-mpesa-hero-card strong {
          display: block;
          font-size: 1.5rem;
          color: #102a43;
          margin: 0.3rem 0 0.15rem;
          font-variant-numeric: tabular-nums;
        }

        .deposit-mpesa-hero-card small {
          color: var(--text-muted, #718096);
          font-size: 0.75rem;
        }

        .deposit-mpesa-alert {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
          border-radius: 14px;
          padding: 0.85rem 1.1rem;
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }

        .deposit-mpesa-empty {
          background: rgba(255, 255, 255, 0.92);
          border: 1px dashed var(--border-light, #e2e8f0);
          border-radius: 20px;
          padding: 2rem;
          text-align: center;
          color: var(--text-muted, #718096);
        }

        .deposit-mpesa-list {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .deposit-mpesa-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 20px;
          padding: 1.1rem 1.35rem;
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.05);
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .deposit-mpesa-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 38px rgba(0, 163, 181, 0.1);
        }

        .deposit-mpesa-card-icon {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--brand, #00a3b5), var(--brand-dark, #087987));
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 12px 24px rgba(0, 163, 181, 0.22);
        }

        .deposit-mpesa-card-icon svg { width: 20px; height: 20px; }

        .deposit-mpesa-card-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .deposit-mpesa-card-info strong {
          color: var(--text-primary, #1a202c);
          font-size: 0.95rem;
        }

        .deposit-mpesa-card-info span {
          font-size: 0.78rem;
          color: var(--text-muted, #718096);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .deposit-mpesa-card-balance {
          text-align: right;
          flex-shrink: 0;
        }

        .deposit-mpesa-card-balance span {
          display: block;
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted, #718096);
        }

        .deposit-mpesa-card-balance strong {
          display: block;
          color: #102a43;
          font-size: 0.95rem;
          margin-top: 0.15rem;
          font-variant-numeric: tabular-nums;
        }

        .deposit-mpesa-card-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: linear-gradient(135deg, var(--secondary, #27ae60), var(--secondary-dark, #1e8e4a));
          color: #fff;
          border: none;
          border-radius: 100px;
          padding: 0.6rem 1.15rem;
          font-weight: 800;
          font-size: 0.82rem;
          cursor: pointer;
          box-shadow: 0 12px 22px rgba(39, 174, 96, 0.24);
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .deposit-mpesa-card-btn svg { width: 15px; height: 15px; }

        .deposit-mpesa-card-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 16px 28px rgba(39, 174, 96, 0.3);
        }

        .deposit-mpesa-card.is-loading {
          pointer-events: none;
        }

        .skeleton-icon {
          background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
          background-size: 200% 100%;
          animation: mpesa-skeleton-pulse 1.2s ease-in-out infinite;
        }

        .skeleton-line {
          display: block;
          height: 0.9rem;
          width: 55%;
          border-radius: 999px;
          background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
          background-size: 200% 100%;
          animation: mpesa-skeleton-pulse 1.2s ease-in-out infinite;
        }

        .skeleton-line.short {
          width: 35%;
          height: 0.7rem;
        }

        @keyframes mpesa-skeleton-pulse {
          0% { background-position: 0% 50%; }
          100% { background-position: -200% 50%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .skeleton-icon, .skeleton-line { animation: none; }
        }

        @media (max-width: 640px) {
          .deposit-mpesa-hero {
            flex-direction: column;
            align-items: flex-start;
          }

          .deposit-mpesa-hero-card { text-align: left; }

          .deposit-mpesa-card {
            flex-wrap: wrap;
          }

          .deposit-mpesa-card-balance {
            order: 3;
            text-align: left;
          }

          .deposit-mpesa-card-btn {
            order: 4;
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

export default DepositMpesa;
