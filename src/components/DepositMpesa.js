import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MpesaPaymentModal from './MpesaPaymentModal';

function formatCurrency(value) {
  return `KES ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function readStoredJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function extractTotal(data) {
  if (typeof data === 'number') return data;
  if (!data || typeof data !== 'object') return 0;

  const candidates = [
    data.sumTotal,
    data.total,
    data.amount,
    data.balance,
    data.data?.sumTotal,
    data.data?.total,
    data.data?.amount,
    data.data?.balance,
  ];

  const found = candidates.find((value) => value !== undefined && value !== null && value !== '');
  return Number(found || 0);
}

function extractLoans(data) {
  const list = Array.isArray(data) ? data : (data?.data || data?.loans || data?.instant || []);
  return (Array.isArray(list) ? list : []).map((loan, index) => {
    const balance = Number(
      loan?.outStanding ??
      loan?.outstanding ??
      loan?.outstandingBalance ??
      loan?.outstanding_amount ??
      loan?.balance ??
      loan?.amount ??
      0
    );

    return {
      id: loan.id || index,
      loanNo: loan.loanNo || loan.loan_no || 'N/A',
      purpose: loan.loanPurpose || loan.lpurpose || loan.purpose || 'Loan',
      balance,
      monthlyRepayment: Number(loan.repayment || loan.monthlyRepayment || loan.monthly_repayment || 0),
    };
  }).filter((loan) => loan.loanNo !== 'N/A' && loan.balance > 0);
}

function MpesaBrandMark({ compact = false }) {
  return (
    <div className={`mpesa-brand-mark ${compact ? 'compact' : ''}`} aria-label="M-Pesa">
      <span>m</span>
      <i aria-hidden="true">
        <b />
      </i>
      <span>pesa</span>
    </div>
  );
}

function PaymentCard({ title, subtitle, label, value, secondaryLabel, secondaryValue, action, onClick }) {
  return (
    <div className="deposit-mpesa-card">
      <div className="deposit-mpesa-card-icon">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2 3 7v6c0 5 3.8 8.7 9 9 5.2-.3 9-4 9-9V7l-9-5Z" fill="currentColor" opacity="0.22" />
          <path d="M8.5 12.2 11 14.7l4.7-5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="deposit-mpesa-card-info">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="deposit-mpesa-card-balance">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        {secondaryLabel && (
          <div>
            <span>{secondaryLabel}</span>
            <strong>{secondaryValue}</strong>
          </div>
        )}
      </div>
      <button type="button" className="deposit-mpesa-card-btn" onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

function DepositMpesa() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberData, setMemberData] = useState(null);
  const [mpesaAccount, setMpesaAccount] = useState(null);
  const [savingsBalance, setSavingsBalance] = useState(0);
  const [selectedFlow, setSelectedFlow] = useState('member_deposit');

  const fetchPaymentData = useCallback(async ({ quiet = false } = {}) => {
    const token = localStorage.getItem('authToken');
    const memberNumber = localStorage.getItem('memberNumber');

    if (!token || !memberNumber) {
      setError('Your session has expired. Please sign in again to continue with M-Pesa.');
      setLoading(false);
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    if (!quiet) setLoading(true);
    setError('');

    try {
      const [memberRes, withdrawableRes, savingsRes, loansRes] = await Promise.all([
        fetch(`/api/v1/member/${memberNumber}`, { headers }),
        fetch(`/api/v1/withDrawable/${memberNumber}`, { headers }),
        fetch(`/api/v1/savings/sumTotal/${memberNumber}`, { headers }),
        fetch(`/api/v1/instant/${memberNumber}`, { headers }),
      ]);

      if (memberRes.ok) {
        setMemberData(await memberRes.json());
      }

      if (withdrawableRes.ok) {
        const data = await withdrawableRes.json();
        setAccounts(Array.isArray(data) ? data : (data.data || []));
      }

      if (savingsRes.ok) {
        setSavingsBalance(extractTotal(await savingsRes.json()));
      } else {
        const cachedMetrics = readStoredJson('dashboardMetrics', {});
        setSavingsBalance(Number(cachedMetrics.savings || 0));
      }

      if (loansRes.ok) {
        setLoans(extractLoans(await loansRes.json()));
      }
    } catch (err) {
      setError('We could not load your payment options right now. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPaymentData();
  }, [fetchPaymentData]);

  useEffect(() => {
    const refreshAfterPayment = (event) => {
      const purpose = event?.detail?.purpose;
      if (purpose) setSelectedFlow(purpose);
      fetchPaymentData({ quiet: true });
    };

    window.addEventListener('mpesa:payment-success', refreshAfterPayment);
    return () => window.removeEventListener('mpesa:payment-success', refreshAfterPayment);
  }, [fetchPaymentData]);

  const memberNumber = localStorage.getItem('memberNumber');
  const memberName = memberData?.holdersName || memberData?.name || 'Member savings';
  const withdrawableTotal = accounts.reduce((sum, a) => sum + Number(a.outStanding || 0), 0);
  const loanTotal = loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
  const selectedAccountLabel = selectedFlow === 'member_deposit'
    ? 'Member deposits'
    : selectedFlow === 'withdrawable_deposit'
      ? 'Withdrawable deposits'
      : 'Loan repayments';

  return (
    <div className="deposit-mpesa-page">
      <section className="deposit-mpesa-hero">
        <div>
          <button type="button" className="deposit-mpesa-back" onClick={() => navigate('/')}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Dashboard
          </button>
          <MpesaBrandMark />
          <h1>M-Pesa payments</h1>
          <p>Choose where the money should go, confirm the reference, then approve the prompt on your phone.</p>
          <div className="deposit-mpesa-trust-row">
            <span>STK Push</span>
            <span>Secure callback</span>
            <span>Live statement update</span>
          </div>
        </div>
        <div className="deposit-mpesa-hero-card">
          <span>Savings balance</span>
          <strong>{loading ? '...' : formatCurrency(savingsBalance)}</strong>
          <small>Your member deposits</small>
        </div>
      </section>

      {error && <div className="deposit-mpesa-alert">{error}</div>}

      {loading && (
        <div className="deposit-mpesa-list">
          {[0, 1, 2].map((i) => (
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

      {!loading && !error && (
        <>
          <div className="deposit-mpesa-group-grid">
            <button
              type="button"
              className={`deposit-mpesa-group ${selectedFlow === 'member_deposit' ? 'active' : ''}`}
              onClick={() => setSelectedFlow('member_deposit')}
            >
              <MpesaBrandMark compact />
              <span>Deposit to savings</span>
              <strong>{formatCurrency(savingsBalance)}</strong>
              <small>Reference: {memberNumber}</small>
            </button>
            <button
              type="button"
              className={`deposit-mpesa-group ${selectedFlow === 'withdrawable_deposit' ? 'active' : ''}`}
              onClick={() => setSelectedFlow('withdrawable_deposit')}
            >
              <MpesaBrandMark compact />
              <span>Deposit to withdrawable</span>
              <strong>{formatCurrency(withdrawableTotal)}</strong>
              <small>{accounts.length} account{accounts.length === 1 ? '' : 's'}</small>
            </button>
            <button
              type="button"
              className={`deposit-mpesa-group ${selectedFlow === 'loan_repayment' ? 'active' : ''}`}
              onClick={() => setSelectedFlow('loan_repayment')}
            >
              <MpesaBrandMark compact />
              <span>Pay loan</span>
              <strong>{formatCurrency(loanTotal)}</strong>
              <small>{loans.length} open loan{loans.length === 1 ? '' : 's'}</small>
            </button>
          </div>

          <div className="deposit-mpesa-section-heading">
            <div>
              <span>{selectedAccountLabel}</span>
              <strong>Choose payment destination</strong>
            </div>
            <small>All successful payments refresh balances and statements automatically.</small>
          </div>

          {selectedFlow === 'member_deposit' && (
            <div className="deposit-mpesa-list">
              <PaymentCard
                title={memberNumber}
                subtitle={memberName}
                label="Savings"
                value={formatCurrency(savingsBalance)}
                action="Deposit"
                onClick={() => setMpesaAccount({
                  accNo: memberNumber,
                  name: 'Member savings',
                  purpose: 'member_deposit',
                })}
              />
            </div>
          )}

          {selectedFlow === 'withdrawable_deposit' && (
            accounts.length > 0 ? (
              <div className="deposit-mpesa-list">
                {accounts.map((account, idx) => (
                  <PaymentCard
                    key={account.accNo || idx}
                    title={account.accNo}
                    subtitle={account.name || account.holdersName}
                    label="Balance"
                    value={formatCurrency(account.outStanding)}
                    action="Deposit"
                    onClick={() => setMpesaAccount({ ...account, purpose: 'withdrawable_deposit' })}
                  />
                ))}
              </div>
            ) : (
              <div className="deposit-mpesa-empty">
                <p>We could not find a withdrawable account for deposits right now.</p>
              </div>
            )
          )}

          {selectedFlow === 'loan_repayment' && (
            loans.length > 0 ? (
              <div className="deposit-mpesa-list">
                {loans.map((loan) => (
                  <PaymentCard
                    key={loan.loanNo}
                    title={loan.loanNo}
                    subtitle={loan.purpose}
                    label="Full amount"
                    value={formatCurrency(loan.balance)}
                    secondaryLabel="Monthly"
                    secondaryValue={formatCurrency(loan.monthlyRepayment || loan.balance)}
                    action="Pay"
                    onClick={() => setMpesaAccount({
                      accNo: loan.loanNo,
                      name: loan.purpose,
                      purpose: 'loan_repayment',
                      defaultAmount: loan.monthlyRepayment || loan.balance,
                    })}
                  />
                ))}
              </div>
            ) : (
              <div className="deposit-mpesa-empty">
                <p>You do not have an open loan balance available for M-Pesa payment.</p>
              </div>
            )
          )}
        </>
      )}

      <MpesaPaymentModal
        isOpen={!!mpesaAccount}
        onClose={() => setMpesaAccount(null)}
        memberNo={memberNumber}
        purpose={mpesaAccount?.purpose || 'withdrawable_deposit'}
        accountReference={mpesaAccount?.accNo}
        defaultAmount={mpesaAccount?.defaultAmount}
        defaultPhone={memberData?.tel1 || memberData?.phone}
      />

      <style>{`
        .deposit-mpesa-page {
          max-width: 980px;
          margin: 0 auto;
          padding: 0.25rem 0 1rem;
        }

        .deposit-mpesa-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 1.5rem;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(135deg, rgba(46, 198, 109, 0.96), rgba(15, 138, 58, 0.98)),
            #2ec66d;
          border: 1px solid rgba(46, 198, 109, 0.9);
          border-radius: 16px;
          padding: 1.8rem 2rem;
          box-shadow: 0 20px 48px rgba(15, 138, 58, 0.22);
          margin-bottom: 1rem;
        }

        .deposit-mpesa-back {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.86);
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          margin-bottom: 1rem;
        }

        .deposit-mpesa-back svg { width: 14px; height: 14px; }
        .deposit-mpesa-back:hover { color: var(--brand-dark, #087987); }

        .mpesa-brand-mark {
          --mpesa-green: #2ec66d;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.02em;
          width: fit-content;
          background: transparent;
          color: #fff;
          font-size: 2.1rem;
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1;
          text-transform: lowercase;
          font-family: Arial, Helvetica, sans-serif;
          margin-bottom: 0.8rem;
        }

        .mpesa-brand-mark.compact {
          color: #2ec66d;
          font-size: 1.28rem;
          margin-bottom: 0.7rem;
          transform: none;
          transform-origin: left center;
        }

        .mpesa-brand-mark i {
          position: relative;
          display: inline-block;
          width: 0.78em;
          height: 1.12em;
          margin: 0 0.03em;
          border: 0.08em solid currentColor;
          border-radius: 0.12em;
          transform: translateY(0.02em);
        }

        .mpesa-brand-mark i::before,
        .mpesa-brand-mark i::after {
          content: "";
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          background: currentColor;
          border-radius: 999px;
        }

        .mpesa-brand-mark i::before {
          top: 0.1em;
          width: 0.24em;
          height: 0.04em;
        }

        .mpesa-brand-mark i::after {
          bottom: 0.08em;
          width: 0.14em;
          height: 0.14em;
        }

        .mpesa-brand-mark i b {
          position: absolute;
          inset: 0.22em 0.12em;
          display: block;
          background: linear-gradient(135deg, #ff2b4f 0 48%, var(--mpesa-green) 48% 100%);
          border-radius: 0.04em;
        }

        .mpesa-brand-mark.compact i {
          border-color: #2ec66d;
        }

        .mpesa-brand-mark.compact i b {
          background: linear-gradient(135deg, #ff2b4f 0 48%, #2ec66d 48% 100%);
        }

        .deposit-mpesa-hero h1 {
          margin: 0 0 0.4rem;
          font-size: 1.55rem;
          color: #fff;
          font-weight: 800;
        }

        .deposit-mpesa-hero p {
          margin: 0;
          color: rgba(255, 255, 255, 0.86);
          font-size: 0.88rem;
          max-width: 38ch;
        }

        .deposit-mpesa-trust-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 1rem;
        }

        .deposit-mpesa-trust-row span {
          color: #fff;
          background: rgba(255, 255, 255, 0.16);
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 999px;
          padding: 0.35rem 0.6rem;
          font-size: 0.72rem;
          font-weight: 800;
        }

        .deposit-mpesa-hero-card {
          position: relative;
          z-index: 1;
          flex-shrink: 0;
          text-align: right;
          background: rgba(255, 255, 255, 0.16);
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 14px;
          padding: 1rem;
        }

        .deposit-mpesa-hero-card span,
        .deposit-mpesa-card-balance span,
          .deposit-mpesa-group span {
          display: block;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted, #718096);
        }

        .deposit-mpesa-hero-card span {
          color: rgba(255, 255, 255, 0.72);
        }

        .deposit-mpesa-hero-card strong {
          display: block;
          font-size: 1.5rem;
          color: #fff;
          margin: 0.3rem 0 0.15rem;
          font-variant-numeric: tabular-nums;
        }

        .deposit-mpesa-hero-card small,
        .deposit-mpesa-group small {
          color: var(--text-muted, #718096);
          font-size: 0.75rem;
        }

        .deposit-mpesa-hero-card small {
          color: rgba(255, 255, 255, 0.74);
        }

        .deposit-mpesa-alert,
        .deposit-mpesa-empty {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 12px;
          padding: 0.9rem 1.1rem;
          color: var(--text-secondary, #4a5568);
          margin-bottom: 1rem;
        }

        .deposit-mpesa-alert {
          color: #7a4b00;
          border-color: #fde68a;
          background: #fffbeb;
        }

        .deposit-mpesa-group-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.85rem;
          margin-bottom: 1rem;
        }

        .deposit-mpesa-group {
          text-align: left;
          border: 1px solid rgba(209, 250, 229, 0.95);
          background: linear-gradient(180deg, #ffffff, #f8fffb);
          border-radius: 12px;
          padding: 1rem;
          cursor: pointer;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
          transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        }

        .deposit-mpesa-group:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
        }

        .deposit-mpesa-group.active {
          border-color: #2bbf61;
          background: linear-gradient(180deg, #ffffff, #edfff4);
          box-shadow: 0 16px 34px rgba(34, 197, 94, 0.18);
        }

        .deposit-mpesa-group strong {
          display: block;
          color: #102a43;
          font-size: 1rem;
          margin: 0.25rem 0;
          font-variant-numeric: tabular-nums;
        }

        .deposit-mpesa-section-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 1rem;
          margin: 0.25rem 0 0.8rem;
        }

        .deposit-mpesa-section-heading span,
        .deposit-mpesa-section-heading small {
          color: var(--text-muted, #718096);
          font-size: 0.75rem;
        }

        .deposit-mpesa-section-heading strong {
          display: block;
          color: #102a43;
          font-size: 1.05rem;
          margin-top: 0.15rem;
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
          background: #fff;
          border: 1px solid rgba(220, 252, 231, 0.95);
          border-radius: 12px;
          padding: 1.1rem 1.35rem;
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.05);
        }

        .deposit-mpesa-card-icon {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #2bbf61, #0f8a3a);
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
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          text-align: right;
          flex-shrink: 0;
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
          background: linear-gradient(135deg, var(--secondary, #27ae60), var(--secondary-dark, #1e8e4a));
          color: #fff;
          border: none;
          border-radius: 999px;
          padding: 0.6rem 1.15rem;
          font-weight: 800;
          font-size: 0.82rem;
          cursor: pointer;
          box-shadow: 0 12px 22px rgba(39, 174, 96, 0.24);
          transition: transform 0.16s ease, box-shadow 0.16s ease;
        }

        .deposit-mpesa-card-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 16px 28px rgba(39, 174, 96, 0.32);
        }

        .deposit-mpesa-card.is-loading {
          pointer-events: none;
        }

        .skeleton-icon,
        .skeleton-line {
          background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
          background-size: 200% 100%;
          animation: mpesa-skeleton-pulse 1.2s ease-in-out infinite;
        }

        .skeleton-line {
          display: block;
          height: 0.9rem;
          width: 55%;
          border-radius: 999px;
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

        @media (max-width: 760px) {
          .deposit-mpesa-hero {
            flex-direction: column;
            align-items: stretch;
            padding: 1.35rem;
          }

          .deposit-mpesa-hero-card {
            text-align: left;
          }

          .deposit-mpesa-group-grid {
            grid-template-columns: 1fr;
          }

          .deposit-mpesa-card {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .deposit-mpesa-card-balance {
            text-align: left;
            justify-content: flex-start;
          }

          .deposit-mpesa-card-btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default DepositMpesa;
