import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCoins, FaFileInvoiceDollar, FaHandHoldingUsd, FaPiggyBank, FaUniversity, FaUserFriends } from 'react-icons/fa';
import Alert from './Alert';

const Dashboard = ({ userData }) => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(() => readDashboardMetrics());
  const [refreshKey, setRefreshKey] = useState(0);
  const [profile, setProfile] = useState(() => {
    const passedProfile = userData && Object.keys(userData).length ? userData : null;
    return passedProfile || readStoredJson('memberProfile', readStoredJson('memberData', {}));
  });

  const memberName = profile?.holdersName || profile?.name || localStorage.getItem('userName') || 'Member';
  const memberNo = profile?.accNo || profile?.memberNo || profile?.memberNumber || localStorage.getItem('memberNumber') || 'N/A';

  useEffect(() => {
    let mounted = true;

    const fetchDashboardData = async () => {
      const token = localStorage.getItem('authToken');
      const storedMemberData = readStoredJson('memberData', {});
      const currentMemberNo = memberNo !== 'N/A'
        ? memberNo
        : storedMemberData.accNo || storedMemberData.memberNo || localStorage.getItem('memberNumber');

      if (!currentMemberNo) {
        setMetrics((current) => ({
          ...current,
          loading: false,
          notice: 'We could not find your member number. Please log in again if the dashboard looks incomplete.'
        }));
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      };

      try {
        setMetrics((current) => ({ ...current, loading: true, notice: '' }));
        const [profileResponse, savingsResponse, shareCapitalResponse, dividendResponse, dividendTransactionsResponse, activeLoansResponse, pendingLoansResponse] = await Promise.allSettled([
          fetch(`/api/v1/member/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/savings/sumTotal/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/shareCapital/sumTotal/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/dividendPayable/sumTotal/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/dividend/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/instant/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/loan-applications/${currentMemberNo}`, { headers, credentials: 'include' })
        ]);

        const nextProfile = await responseJson(profileResponse);
        const savings = extractTotal(await responseJson(savingsResponse));
        const shareCapital = extractTotal(await responseJson(shareCapitalResponse));
        const payableDividend = extractTotal(await responseJson(dividendResponse));
        const transactionDividend = extractDividendNetTotal(await responseJson(dividendTransactionsResponse));
        const cachedDividend = extractCachedDividendTotal();
        const dividend = transactionDividend ?? cachedDividend ?? payableDividend;
        const loanBalance = extractLoanBalance([
          await responseJson(activeLoansResponse),
          await responseJson(pendingLoansResponse)
        ]);

        if (!mounted) return;

        if (nextProfile && Object.keys(nextProfile).length) {
          setProfile(nextProfile);
          localStorage.setItem('memberProfile', JSON.stringify(nextProfile));
        }

        const nextMetrics = {
          savings,
          shareCapital,
          dividend,
          loanBalance,
          loading: false,
          notice: ''
        };

        setMetrics(nextMetrics);
        localStorage.setItem('dashboardMetrics', JSON.stringify({
          ...nextMetrics,
          cacheVersion: DASHBOARD_METRICS_CACHE_VERSION
        }));
      } catch (error) {
        console.error('Error loading dashboard metrics:', error);
        if (!mounted) return;
        setMetrics((current) => ({
          ...current,
          loading: false,
          notice: 'We could not refresh your dashboard right now. Showing the last saved figures where available.'
        }));
      }
    };

    fetchDashboardData();

    return () => {
      mounted = false;
    };
  }, [memberNo, refreshKey]);

  useEffect(() => {
    const refreshAfterMpesa = () => {
      localStorage.removeItem('dashboardMetrics');
      setRefreshKey((key) => key + 1);
    };

    window.addEventListener('mpesa:payment-success', refreshAfterMpesa);
    window.addEventListener('storage', refreshAfterMpesa);
    return () => {
      window.removeEventListener('mpesa:payment-success', refreshAfterMpesa);
      window.removeEventListener('storage', refreshAfterMpesa);
    };
  }, []);

  const summaryCards = useMemo(() => [
    {
      label: 'Savings Balance',
      value: formatCurrency(metrics.savings),
      hint: metrics.loading ? 'Refreshing deposits...' : 'Your member deposits',
      path: '/share-statement',
      accent: 'cyan',
      icon: FaPiggyBank
    },
    {
      label: 'Share Capital',
      value: formatCurrency(metrics.shareCapital),
      hint: metrics.loading ? 'Refreshing capital...' : 'Ownership contribution',
      path: '/share-capital',
      accent: 'green',
      icon: FaUniversity
    },
    {
      label: 'Dividend Payable',
      value: formatCurrency(metrics.dividend),
      hint: metrics.loading ? 'Refreshing dividends...' : 'Latest dividend estimate',
      path: '/dividends',
      accent: 'amber',
      icon: FaCoins
    },
    {
      label: 'Loan Balance',
      value: formatCurrency(metrics.loanBalance),
      hint: metrics.loading ? 'Refreshing loans...' : 'Active and pending loans',
      path: '/loan-statement',
      accent: 'violet',
      icon: FaFileInvoiceDollar
    }
  ], [metrics]);

  const quickActions = [
    { label: 'Apply for instant loan', description: 'Preview repayment, interest, and monthly deduction.', path: '/apply-loan', icon: FaHandHoldingUsd },
    { label: 'Download savings statement', description: 'Export a clean PDF for your records.', path: '/share-statement', icon: FaFileInvoiceDollar },
    { label: 'Review guarantor position', description: 'See loans where you appear as guarantor.', path: '/guarantors', icon: FaUserFriends }
  ];

  const timelineItems = [
    { label: 'Profile check', text: 'Confirm your phone and email are current before payment periods.' },
    { label: 'Dividend rule', text: 'Dividends are calculated from last year’s eligible shares.' },
    { label: 'Support', text: 'For help, email sacco@metro-hospital.com with your member number.' }
  ];

  const mpesaActions = [
    { label: 'Savings', value: formatCurrency(metrics.savings), path: '/deposit' },
    { label: 'Withdrawable', value: 'Choose account', path: '/deposit' },
    { label: 'Loan pay', value: metrics.loanBalance > 0 ? formatCurrency(metrics.loanBalance) : 'No open balance', path: '/deposit' }
  ];

  return (
    <div className="modern-dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Metropolitan Hospital Sacco</span>
          <h1>Financial overview</h1>
          <p>
            A clean command center for member balances, statements, loan actions,
            and the key updates members need most.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={() => navigate('/apply-loan')}>Apply for loan</button>
            <button type="button" className="secondary" onClick={() => navigate('/profile')}>View profile</button>
          </div>
        </div>
        <div className="hero-card">
          <span>Member status</span>
          <strong>Active</strong>
          <p>Balances, statements, loans, and member actions in one clear workspace.</p>
          <small>Member {memberNo}</small>
        </div>
      </section>

      {metrics.notice && (
        <Alert type="warning" title="Dashboard notice" actionLabel="Refresh" onAction={() => window.location.reload()}>
          {metrics.notice}
        </Alert>
      )}

      <div className="summary-grid">
        {summaryCards.map((card) => (
          <MetricCard
            key={card.label}
            card={card}
            loading={metrics.loading}
            onClick={() => navigate(card.path)}
          />
        ))}
      </div>

      <section className="mpesa-dashboard-strip">
        <div className="mpesa-dashboard-logo" aria-label="M-Pesa">
          <span>m</span><i aria-hidden="true"><b /></i><span>pesa</span>
        </div>
        <div className="mpesa-dashboard-copy">
          <strong>Pay with M-Pesa</strong>
          <span>Deposits and loan repayments post through the Sacco ledger after Safaricom confirms the callback.</span>
        </div>
        <div className="mpesa-dashboard-options">
          {mpesaActions.map((item) => (
            <button type="button" key={item.label} onClick={() => navigate(item.path)}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
        </div>
      </section>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Quick actions</span>
              <h2>Move faster from the dashboard</h2>
            </div>
          </div>
          <div className="action-list">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  type="button"
                  key={action.label}
                  className={action.highlight ? 'action-list-highlight' : ''}
                  onClick={() => navigate(action.path)}
                >
                  {Icon && (
                    <span className={`action-icon ${action.highlight ? 'action-icon-mpesa' : ''}`}>
                      <Icon />
                    </span>
                  )}
                  <div>
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                  </div>
                  <span className="action-arrow">→</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Member guidance</span>
              <h2>Good to know</h2>
            </div>
          </div>
          <div className="timeline-list">
            {timelineItems.map((item) => (
              <div className="timeline-item" key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
          <Alert type="info" title="Need help?">
            If something looks off, contact the Sacco office and include your member number so they can assist faster.
          </Alert>
        </section>
      </div>

      <footer className="dashboard-footer">
        © {new Date().getFullYear()} Metropolitan Hospital Sacco Ltd · Building Wealth, Changing Lives
      </footer>
    </div>
  );
};

const DASHBOARD_METRICS_CACHE_VERSION = 2;

const readStoredJson = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const readDashboardMetrics = () => {
  const fallback = {
    savings: 0,
    shareCapital: 0,
    dividend: 0,
    loanBalance: 0,
    loading: true,
    notice: ''
  };
  const cached = readStoredJson('dashboardMetrics', fallback);

  if (cached.cacheVersion !== DASHBOARD_METRICS_CACHE_VERSION) {
    localStorage.removeItem('dashboardMetrics');
    return fallback;
  }

  return cached;
};

const MetricCard = ({ card, loading, onClick }) => {
  const Icon = card.icon;

  return (
    <button
      type="button"
      className={`summary-card summary-card-${card.accent} ${loading ? 'is-loading' : ''}`}
      onClick={onClick}
    >
      <div className="summary-card-top">
        <span>{card.label}</span>
        <div className="summary-card-icon"><Icon /></div>
      </div>
      {loading ? (
        <>
          <strong className="metric-skeleton"></strong>
          <small className="metric-skeleton short"></small>
        </>
      ) : (
        <>
          <strong>{card.value}</strong>
          <small>{card.hint}</small>
        </>
      )}
    </button>
  );
};

const responseJson = async (settledResponse) => {
  if (settledResponse.status !== 'fulfilled' || !settledResponse.value.ok) return null;
  return settledResponse.value.json();
};

const extractTotal = (data) => {
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
    data.data?.balance
  ];

  const found = candidates.find((value) => value !== undefined && value !== null && value !== '');
  return Number(found || 0);
};

const extractDividendNetTotal = (data) => {
  if (!data) return null;
  if (typeof data === 'number') return data;
  if (data.totals?.netDividend !== undefined) return Number(data.totals.netDividend || 0);
  if (data.netDividend !== undefined) return Number(data.netDividend || 0);
  if (data.netAmount !== undefined) return Number(data.netAmount || 0);
  if (data.runningTotal !== undefined) return Number(data.runningTotal || 0);
  if (data.balance !== undefined && !Array.isArray(data.data)) return Number(data.balance || 0);
  
  const transactions = Array.isArray(data)
    ? data
    : data.dividends || data.transactions || data.data || data.records || [];

  if (!Array.isArray(transactions) || transactions.length === 0) return null;

  const lastWithBalance = [...transactions].reverse().find((item) => (
    item?.runningTotal !== undefined ||
    item?.runningAmt !== undefined ||
    item?.netAmount !== undefined ||
    item?.balance !== undefined
  ));

  if (lastWithBalance) {
    return Number(
      lastWithBalance.runningTotal ??
      lastWithBalance.runningAmt ??
      lastWithBalance.netAmount ??
      lastWithBalance.balance ??
      0
    );
  }

  return transactions.reduce((sum, item) => {
    const amount = Number(item?.dividend || item?.dividendAmount || item?.amount || item?.credit || 0);
    const paid = Number(item?.paid || item?.withholdingTax || item?.tax || item?.debit || 0);
    return sum + amount - paid;
  }, 0);
};

const extractCachedDividendTotal = () => {
  const cached = readStoredJson('dividendTransactions', null);
  if (!cached) return 0;

  if (cached.totals?.netDividend !== undefined) return Number(cached.totals.netDividend || 0);
  if (cached.netDividend !== undefined) return Number(cached.netDividend || 0);

  return extractDividendNetTotal(cached.transactions || cached);
};

const extractLoanBalance = (responses) => {
  const [activeResponse, pendingResponse] = responses;
  const activeLoans = extractLoanRows(activeResponse);
  const pendingLoans = extractLoanRows(pendingResponse);
  const activeLoanNumbers = new Set(
    activeLoans
      .map((loan) => normalizeLoanNumber(loan?.loanNo || loan?.loan_no || loan?.loanNumber))
      .filter(Boolean)
  );

  const activeTotal = activeLoans.reduce((sum, loan) => {
    const outstanding = getLoanOutstanding(loan);
    return outstanding > 0 ? sum + outstanding : sum;
  }, 0);
  const pendingTotal = pendingLoans.reduce((sum, loan) => {
    const loanNumber = normalizeLoanNumber(loan?.loanNo || loan?.loan_no || loan?.loanNumber);
    if (loanNumber && activeLoanNumbers.has(loanNumber)) return sum;
    const outstanding = getLoanOutstanding(loan);
    return outstanding > 0 ? sum + outstanding : sum;
  }, 0);

  return activeTotal + pendingTotal;
};

const extractLoanRows = (response) => {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.loans)) return response.loans;
  if (Array.isArray(response.instant)) return response.instant;
  return [];
};

const normalizeLoanNumber = (loanNumber) => String(loanNumber || '').trim().toUpperCase();

const getLoanOutstanding = (loan) => {
  const candidates = [
    loan?.outStanding,
    loan?.outstanding,
    loan?.outstandingBalance,
    loan?.outstanding_balance,
    loan?.outstandingAmount,
    loan?.outstanding_amount,
    loan?.outStandingAmount,
    loan?.out_standing,
    loan?.total,
    loan?.amount,
    loan?.balance,
  ];

  const found = candidates.find((value) => value !== undefined && value !== null && value !== '');
  return parseMoney(found);
};

const parseMoney = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || '').replace(/,/g, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (amount) => {
  const value = Number(amount || 0);
  return `KES ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export default Dashboard;
