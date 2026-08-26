import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MpesaPaymentModal from './MpesaPaymentModal';

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

  return (
    <div className="deposit-mpesa-page">
      <div className="deposit-mpesa-header">
        <button type="button" className="deposit-mpesa-back" onClick={() => navigate('/')}>&larr; Back to dashboard</button>
        <h1>Deposit via M-Pesa</h1>
        <p>Choose an account and send a payment request to your phone.</p>
      </div>

      {loading && <p>Loading your accounts...</p>}
      {error && <p className="deposit-mpesa-error">{error}</p>}

      {!loading && !error && accounts.length === 0 && (
        <p>No savings account found. Please contact the Sacco office.</p>
      )}

      <div className="deposit-mpesa-list">
        {accounts.map((account, idx) => (
          <div className="deposit-mpesa-card" key={account.accNo || idx}>
            <div>
              <strong>{account.accNo}</strong>
              <span>{account.name || account.holdersName}</span>
            </div>
            <button type="button" onClick={() => setMpesaAccount(account)}>Deposit</button>
          </div>
        ))}
      </div>

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
          max-width: 640px;
          margin: 0 auto;
          padding: 1rem;
        }

        .deposit-mpesa-back {
          background: none;
          border: none;
          color: var(--text-secondary, #4a5568);
          font-size: 0.85rem;
          cursor: pointer;
          padding: 0;
          margin-bottom: 1rem;
        }

        .deposit-mpesa-header h1 {
          margin: 0 0 0.35rem;
          font-size: 1.4rem;
          color: var(--text-primary, #1a202c);
        }

        .deposit-mpesa-header p {
          margin: 0 0 1.5rem;
          color: var(--text-secondary, #4a5568);
        }

        .deposit-mpesa-error {
          color: var(--danger, #e74c3c);
        }

        .deposit-mpesa-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .deposit-mpesa-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-white, #fff);
          border: 1px solid var(--border-light, #e2e8f0);
          border-radius: 10px;
          padding: 1rem 1.25rem;
        }

        .deposit-mpesa-card div { display: flex; flex-direction: column; gap: 0.2rem; }
        .deposit-mpesa-card strong { color: var(--text-primary, #1a202c); }
        .deposit-mpesa-card span { font-size: 0.8rem; color: var(--text-muted, #718096); }

        .deposit-mpesa-card button {
          background: var(--secondary, #27ae60);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 0.55rem 1.1rem;
          font-weight: 700;
          cursor: pointer;
        }

        .deposit-mpesa-card button:hover {
          background: var(--secondary-dark, #1e8e4a);
        }
      `}</style>
    </div>
  );
}

export default DepositMpesa;
