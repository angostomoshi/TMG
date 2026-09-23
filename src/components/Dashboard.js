import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaCoins,
  FaFileInvoiceDollar,
  FaUniversity,
  FaPiggyBank,
  FaArrowRight,
  FaPhoneAlt,
  FaHeart,
  FaChartPie,
  FaUserCog
} from 'react-icons/fa';
import Alert from './Alert';

const CONTACT = {
  phone: '+254 114470459',
  phoneHref: 'tel:+254114470459',
  email: 'info@tmgfoundation.ke',
  emailHref: 'mailto:info@tmgfoundation.ke'
};

const Dashboard = ({ userData }) => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(() => readDashboardMetrics());
  const [refreshKey, setRefreshKey] = useState(0);
  const [profile, setProfile] = useState(() => {
    const passedProfile = userData && Object.keys(userData).length ? userData : null;
    return passedProfile || readStoredJson('memberProfile', readStoredJson('memberData', {}));
  });

  const memberName = profile?.holdersName || profile?.name || localStorage.getItem('userName') || 'Member';

  const colors = {
    primary: '#1B3A6B',
    primaryDark: '#12294C',
    primaryLight: '#2A5091',
    accent: '#E31E24',
    accentDark: '#C4181D',
    softBlue: '#EEF3FA',
    softRed: '#FDECEC',
  };

  useEffect(() => {
    let mounted = true;

    const fetchDashboardData = async () => {
      const token = localStorage.getItem('authToken');
      const storedMemberData = readStoredJson('memberData', {});
      const currentMemberNo = storedMemberData.accNo || storedMemberData.memberNo || localStorage.getItem('memberNumber');

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
        const [profileResponse, savingsResponse, shareCapitalResponse, dividendResponse, dividendTransactionsResponse] = await Promise.allSettled([
          fetch(`/api/v1/member/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/savings/sumTotal/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/shareCapital/sumTotal/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/dividendPayable/sumTotal/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/dividend/${currentMemberNo}`, { headers, credentials: 'include' })
        ]);

        const nextProfile = await responseJson(profileResponse);
        const savings = extractTotal(await responseJson(savingsResponse));
        const shareCapital = extractTotal(await responseJson(shareCapitalResponse));
        const payableDividend = extractTotal(await responseJson(dividendResponse));
        const transactionDividend = extractDividendNetTotal(await responseJson(dividendTransactionsResponse));
        const cachedDividend = extractCachedDividendTotal();
        const dividend = transactionDividend ?? cachedDividend ?? payableDividend;
        const totalHoldings = savings + shareCapital + dividend;

        if (!mounted) return;

        if (nextProfile && Object.keys(nextProfile).length) {
          setProfile(nextProfile);
          localStorage.setItem('memberProfile', JSON.stringify(nextProfile));
        }

        const nextMetrics = {
          savings,
          shareCapital,
          dividend,
          totalHoldings,
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
  }, [refreshKey]);

  useEffect(() => {
    const refreshMetrics = () => {
      localStorage.removeItem('dashboardMetrics');
      setRefreshKey((key) => key + 1);
    };

    window.addEventListener('storage', refreshMetrics);
    return () => {
      window.removeEventListener('storage', refreshMetrics);
    };
  }, []);

  const summaryCards = useMemo(() => [
    {
      label: 'Savings Balance',
      value: formatCurrency(metrics.savings),
      hint: metrics.loading ? 'Refreshing deposits...' : 'Your member deposits',
      path: '/share-statement',
      accent: 'blue',
      icon: FaPiggyBank
    },
    {
      label: 'Share Capital',
      value: formatCurrency(metrics.shareCapital),
      hint: metrics.loading ? 'Refreshing capital...' : 'Ownership contribution',
      path: '/share-capital',
      accent: 'red',
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
      label: 'Total Holdings',
      value: formatCurrency(metrics.totalHoldings),
      hint: metrics.loading ? 'Calculating total...' : 'Savings + capital + dividend',
      path: '/share-statement',
      accent: 'navy',
      icon: FaChartPie
    }
  ], [metrics]);

  const quickActions = [
    { label: 'Download savings statement', description: 'Export a clean PDF for your records.', path: '/share-statement', icon: FaFileInvoiceDollar },
    { label: 'Review dividend history', description: 'See declared and payable dividends by year.', path: '/dividends', icon: FaCoins },
    { label: 'Update your profile', description: 'Keep phone, email, and KYC details current.', path: '/profile', icon: FaUserCog }
  ];

  const timelineItems = [
    { label: 'Profile check', text: 'Confirm your phone and email are current before payment periods.' },
    { label: 'Dividend rule', text: 'Dividends are calculated from last year\'s eligible shares.' },
    { label: 'Share capital', text: 'Your share capital reflects your ownership stake in the foundation.' },
    { label: 'Support', text: `For help, call ${CONTACT.phone} or email ${CONTACT.email} with your member number.` }
  ];

  return (
    <div className="tmg-dashboard">
      {/* ===== HERO ===== */}
      <section className="tmg-hero">
        <div className="tmg-hero-content">
          <span className="tmg-eyebrow">Shareholder Dashboard</span>
          <h1>
            Welcome back, <span className="tmg-name-highlight">{firstName(memberName)}</span>
          </h1>
          <p>
            Your shareholder overview — track savings, share capital,
            and dividends, all in one clear place.
          </p>
          <div className="tmg-hero-actions">
            <button type="button" className="tmg-btn tmg-btn-primary" onClick={() => navigate('/dividends')}>
              <FaCoins /> View dividends
            </button>
            <button type="button" className="tmg-btn tmg-btn-outline" onClick={() => navigate('/profile')}>
              View profile <FaArrowRight />
            </button>
          </div>
        </div>
        <div className="tmg-hero-badge">
          <div className="tmg-hero-badge-inner">
            <span className="tmg-badge-label">Shareholder Status</span>
            <strong className="tmg-badge-status">Active</strong>
            <div className="tmg-badge-divider" />
            <div className="tmg-badge-tagline">
              <FaHeart /> Member since joining
            </div>
          </div>
        </div>
      </section>

      {metrics.notice && (
        <div className="tmg-alert-wrap">
          <Alert type="warning" title="Dashboard notice" actionLabel="Refresh" onAction={() => window.location.reload()}>
            {metrics.notice}
          </Alert>
        </div>
      )}

      {/* ===== SUMMARY CARDS ===== */}
      <div className="tmg-summary-grid">
        {summaryCards.map((card) => (
          <MetricCard
            key={card.label}
            card={card}
            loading={metrics.loading}
            onClick={() => navigate(card.path)}
          />
        ))}
      </div>

      {/* ===== MAIN GRID ===== */}
      <div className="tmg-main-grid">
        <section className="tmg-panel">
          <div className="tmg-panel-header">
            <div>
              <span className="tmg-eyebrow">Quick actions</span>
              <h2>Move faster from your dashboard</h2>
            </div>
          </div>
          <div className="tmg-action-list">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  type="button"
                  key={action.label}
                  onClick={() => navigate(action.path)}
                >
                  <span className="tmg-action-icon"><Icon /></span>
                  <div className="tmg-action-body">
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                  </div>
                  <span className="tmg-action-arrow"><FaArrowRight /></span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="tmg-panel">
          <div className="tmg-panel-header">
            <div>
              <span className="tmg-eyebrow">Shareholder guidance</span>
              <h2>Good to know</h2>
            </div>
          </div>
          <div className="tmg-timeline">
            {timelineItems.map((item) => (
              <div className="tmg-timeline-item" key={item.label}>
                <span className="tmg-timeline-dot" />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.text}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="tmg-help-card">
            <div className="tmg-help-icon"><FaPhoneAlt /></div>
            <div>
              <strong>Need help?</strong>
              <span>
                Call <a href={CONTACT.phoneHref}>{CONTACT.phone}</a> or email{' '}
                <a href={CONTACT.emailHref}>{CONTACT.email}</a> and include your member number.
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* ===== STYLES ===== */}
      <style>{`
        * { box-sizing: border-box; }

        .tmg-dashboard {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          background: #f6f8fc;
          min-height: 100vh;
          color: ${colors.primary};
          padding-top: 0.5rem;
          overflow-x: hidden;
        }

        /* ===== HERO ===== */
        .tmg-hero {
          display: grid;
          grid-template-columns: 1.6fr 1fr;
          gap: 2rem;
          max-width: 1280px;
          margin: 1rem auto 0;
          padding: 0 2rem;
          align-items: stretch;
        }
        .tmg-hero-content {
          background: white;
          border-radius: 20px;
          padding: 2.25rem 2.5rem;
          box-shadow: 0 10px 40px rgba(18, 41, 76, 0.08);
          border-left: 6px solid ${colors.accent};
          position: relative;
          overflow: hidden;
        }
        .tmg-hero-content::after {
          content: '';
          position: absolute;
          right: -40px;
          top: -40px;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(227,30,36,0.08) 0%, transparent 70%);
          pointer-events: none;
        }
        .tmg-eyebrow {
          display: inline-block;
          text-transform: uppercase;
          font-size: 0.7rem;
          letter-spacing: 1.5px;
          font-weight: 800;
          color: ${colors.accent};
          margin-bottom: 0.5rem;
        }
        .tmg-hero-content h1 {
          font-size: clamp(1.35rem, 2.5vw + 0.5rem, 2rem);
          color: ${colors.primary};
          margin: 0 0 0.75rem;
          line-height: 1.2;
          font-weight: 700;
          word-break: break-word;
        }
        .tmg-name-highlight { color: ${colors.accent}; }
        .tmg-hero-content p {
          color: #4a5568;
          margin: 0 0 1.5rem;
          line-height: 1.6;
          font-size: 0.95rem;
          max-width: 540px;
        }
        .tmg-hero-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .tmg-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.7rem 1.3rem;
          border-radius: 10px;
          border: none;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          font-family: inherit;
          white-space: nowrap;
        }
        .tmg-btn-primary {
          background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%);
          color: white;
          box-shadow: 0 4px 14px rgba(27, 58, 107, 0.25);
        }
        .tmg-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(27, 58, 107, 0.35);
        }
        .tmg-btn-primary:focus-visible,
        .tmg-btn-outline:focus-visible,
        .tmg-summary-card:focus-visible,
        .tmg-action-list button:focus-visible {
          outline: 3px solid ${colors.accent};
          outline-offset: 2px;
        }
        .tmg-btn-outline {
          background: white;
          color: ${colors.primary};
          border: 2px solid ${colors.primary};
        }
        .tmg-btn-outline:hover {
          background: ${colors.softBlue};
          transform: translateY(-2px);
        }

        /* Hero Badge */
        .tmg-hero-badge {
          background: linear-gradient(160deg, ${colors.primary} 0%, ${colors.primaryDark} 100%);
          border-radius: 20px;
          padding: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(18, 41, 76, 0.2);
        }
        .tmg-hero-badge::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 20% 20%, rgba(227,30,36,0.25) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(42,80,145,0.4) 0%, transparent 50%);
        }
        .tmg-hero-badge-inner { position: relative; text-align: center; color: white; z-index: 1; }
        .tmg-badge-label {
          display: block;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: rgba(255,255,255,0.7);
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .tmg-badge-status {
          display: block;
          font-size: clamp(1.75rem, 3vw, 2.25rem);
          font-weight: 800;
          color: white;
          margin-bottom: 1rem;
          letter-spacing: -0.5px;
        }
        .tmg-badge-divider {
          width: 60px;
          height: 3px;
          background: ${colors.accent};
          margin: 0 auto 1rem;
          border-radius: 2px;
        }
        .tmg-badge-tagline {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          color: rgba(255,255,255,0.85);
          font-style: italic;
        }
        .tmg-badge-tagline svg { color: ${colors.accent}; font-size: 0.75rem; }

        .tmg-alert-wrap {
          max-width: 1280px;
          margin: 1.5rem auto 0;
          padding: 0 2rem;
        }

        /* ===== SUMMARY CARDS ===== */
        .tmg-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1rem;
          max-width: 1280px;
          margin: 1.75rem auto 0;
          padding: 0 2rem;
        }
        .tmg-summary-card {
          background: white;
          border-radius: 16px;
          padding: 1.25rem 1.35rem;
          text-align: left;
          border: none;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 2px 10px rgba(18, 41, 76, 0.06);
          border-bottom: 4px solid ${colors.primary};
          position: relative;
          overflow: hidden;
          font-family: inherit;
          width: 100%;
        }
        .tmg-summary-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 28px rgba(18, 41, 76, 0.14);
        }
        .tmg-summary-card-blue { border-bottom-color: ${colors.primary}; }
        .tmg-summary-card-red { border-bottom-color: ${colors.accent}; }
        .tmg-summary-card-amber { border-bottom-color: #ed8936; }
        .tmg-summary-card-navy { border-bottom-color: ${colors.primaryDark}; }

        .tmg-summary-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.85rem;
          gap: 0.5rem;
        }
        .tmg-summary-top > span {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          font-weight: 700;
          color: #718096;
        }
        .tmg-summary-icon {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${colors.softBlue};
          color: ${colors.primary};
          font-size: 1rem;
          flex-shrink: 0;
        }
        .tmg-summary-card-red .tmg-summary-icon { background: ${colors.softRed}; color: ${colors.accent}; }
        .tmg-summary-card-amber .tmg-summary-icon { background: #FEF3E2; color: #ed8936; }
        .tmg-summary-card-navy .tmg-summary-icon { background: #E5EAF3; color: ${colors.primaryDark}; }

        .tmg-summary-value {
          display: block;
          font-size: clamp(1.15rem, 2vw, 1.4rem);
          color: ${colors.primary};
          margin-bottom: 0.2rem;
          font-weight: 700;
          letter-spacing: -0.3px;
          word-break: break-word;
        }
        .tmg-summary-hint { font-size: 0.75rem; color: #718096; }
        .tmg-skeleton {
          display: block;
          height: 22px;
          width: 60%;
          background: linear-gradient(90deg, #edf2f7 25%, #e2e8f0 50%, #edf2f7 75%);
          background-size: 200% 100%;
          animation: tmg-shimmer 1.2s infinite;
          border-radius: 6px;
          margin-bottom: 0.5rem;
        }
        .tmg-skeleton.short { width: 40%; height: 12px; }
        @keyframes tmg-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* ===== MAIN GRID ===== */
        .tmg-main-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 1.5rem;
          max-width: 1280px;
          margin: 1.75rem auto 2rem;
          padding: 0 2rem;
        }
        .tmg-panel {
          background: white;
          border-radius: 16px;
          padding: 1.75rem;
          box-shadow: 0 4px 14px rgba(18, 41, 76, 0.06);
        }
        .tmg-panel-header {
          margin-bottom: 1.25rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #edf2f7;
        }
        .tmg-panel-header h2 {
          margin: 0.25rem 0 0;
          color: ${colors.primary};
          font-size: clamp(1rem, 1.2vw + 0.6rem, 1.15rem);
          font-weight: 700;
        }

        /* Action list */
        .tmg-action-list { display: flex; flex-direction: column; gap: 0.65rem; }
        .tmg-action-list button {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          background: #f8fafc;
          border: 1px solid #edf2f7;
          border-radius: 12px;
          padding: 0.85rem 1rem;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
          width: 100%;
          font-family: inherit;
        }
        .tmg-action-list button:hover {
          background: white;
          border-color: ${colors.primary};
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(27, 58, 107, 0.08);
        }
        .tmg-action-icon {
          width: 40px; height: 40px;
          display: flex; align-items: center; justify-content: center;
          background: ${colors.primary};
          color: white;
          border-radius: 10px;
          flex-shrink: 0;
          font-size: 1rem;
        }
        .tmg-action-list button:hover .tmg-action-icon { background: ${colors.accent}; }
        .tmg-action-body { flex: 1; min-width: 0; }
        .tmg-action-body strong {
          display: block;
          color: ${colors.primary};
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.15rem;
        }
        .tmg-action-body span { font-size: 0.75rem; color: #718096; line-height: 1.4; }
        .tmg-action-arrow {
          color: ${colors.accent};
          font-size: 0.9rem;
          transition: transform 0.2s;
          flex-shrink: 0;
        }
        .tmg-action-list button:hover .tmg-action-arrow { transform: translateX(3px); }

        /* Timeline */
        .tmg-timeline {
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
          margin-bottom: 1.25rem;
        }
        .tmg-timeline-item { display: flex; gap: 0.85rem; align-items: flex-start; }
        .tmg-timeline-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: ${colors.accent};
          margin-top: 6px;
          flex-shrink: 0;
          box-shadow: 0 0 0 4px ${colors.softRed};
        }
        .tmg-timeline-item strong {
          display: block;
          color: ${colors.primary};
          font-size: 0.875rem;
          margin-bottom: 0.15rem;
          font-weight: 600;
        }
        .tmg-timeline-item span { font-size: 0.8rem; color: #4a5568; line-height: 1.5; }

        /* Help card */
        .tmg-help-card {
          display: flex;
          gap: 0.85rem;
          background: linear-gradient(135deg, ${colors.softBlue} 0%, #E5EAF3 100%);
          border-radius: 12px;
          padding: 1rem;
          align-items: flex-start;
          border-left: 4px solid ${colors.primary};
        }
        .tmg-help-icon {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          background: ${colors.primary};
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 0.9rem;
        }
        .tmg-help-card strong {
          display: block;
          color: ${colors.primary};
          font-size: 0.85rem;
          margin-bottom: 0.2rem;
        }
        .tmg-help-card span { font-size: 0.78rem; color: #4a5568; line-height: 1.5; word-break: break-word; }
        .tmg-help-card a { color: ${colors.accent}; font-weight: 600; text-decoration: none; }
        .tmg-help-card a:hover { text-decoration: underline; }

        /* ===== RESPONSIVE BREAKPOINTS ===== */

        /* Large tablets / small laptops */
        @media (max-width: 1024px) {
          .tmg-hero { gap: 1.5rem; padding: 0 1.5rem; }
          .tmg-hero-content { padding: 2rem; }
          .tmg-summary-grid { padding: 0 1.5rem; }
          .tmg-main-grid { padding: 0 1.5rem; gap: 1.25rem; }
          .tmg-alert-wrap { padding: 0 1.5rem; }
        }

        /* Tablets — stack hero, keep 2-col main */
        @media (max-width: 900px) {
          .tmg-hero { grid-template-columns: 1fr; }
          .tmg-hero-badge { padding: 1.75rem; }
          .tmg-badge-status { font-size: 1.85rem; }
          .tmg-main-grid { grid-template-columns: 1fr; }
        }

        /* Large phones */
        @media (max-width: 640px) {
          .tmg-dashboard { padding-top: 0.25rem; }

          .tmg-hero {
            padding: 0 1rem;
            margin-top: 1rem;
            gap: 1rem;
          }
          .tmg-hero-content {
            padding: 1.5rem 1.25rem;
            border-radius: 16px;
            border-left-width: 5px;
          }
          .tmg-hero-content h1 { font-size: 1.4rem; margin-bottom: 0.6rem; }
          .tmg-hero-content p { font-size: 0.875rem; margin-bottom: 1.25rem; }

          .tmg-hero-actions { flex-direction: column; gap: 0.6rem; }
          .tmg-btn {
            width: 100%;
            justify-content: center;
            padding: 0.75rem 1rem;
          }

          .tmg-hero-badge { padding: 1.5rem; border-radius: 16px; }
          .tmg-badge-status { font-size: 1.65rem; margin-bottom: 0.75rem; }
          .tmg-badge-label { font-size: 0.65rem; letter-spacing: 1.5px; }

          .tmg-alert-wrap { padding: 0 1rem; margin-top: 1rem; }

          .tmg-summary-grid {
            padding: 0 1rem;
            margin-top: 1.25rem;
            gap: 0.75rem;
            grid-template-columns: 1fr 1fr;
          }
          .tmg-summary-card { padding: 1rem; border-radius: 14px; }
          .tmg-summary-top { margin-bottom: 0.65rem; }
          .tmg-summary-top > span { font-size: 0.62rem; letter-spacing: 0.5px; }
          .tmg-summary-icon { width: 34px; height: 34px; font-size: 0.85rem; border-radius: 9px; }
          .tmg-summary-value { font-size: 1.05rem; }
          .tmg-summary-hint { font-size: 0.68rem; }

          .tmg-main-grid {
            padding: 0 1rem;
            margin: 1.25rem auto 1.5rem;
            gap: 1rem;
          }
          .tmg-panel { padding: 1.25rem 1.1rem; border-radius: 14px; }
          .tmg-panel-header { margin-bottom: 1rem; padding-bottom: 0.85rem; }
          .tmg-panel-header h2 { font-size: 1rem; }

          .tmg-action-list button { padding: 0.75rem 0.85rem; gap: 0.7rem; }
          .tmg-action-icon { width: 36px; height: 36px; font-size: 0.9rem; }
          .tmg-action-body strong { font-size: 0.82rem; }
          .tmg-action-body span { font-size: 0.7rem; }
          .tmg-action-list button:hover { transform: none; }

          .tmg-help-card { padding: 0.85rem; }
        }

        /* Small phones */
        @media (max-width: 420px) {
          .tmg-hero-content { padding: 1.25rem 1rem; }
          .tmg-hero-content h1 { font-size: 1.2rem; }
          .tmg-hero-content p { font-size: 0.82rem; }

          .tmg-summary-grid { grid-template-columns: 1fr; }
          .tmg-summary-card { padding: 1rem 1.1rem; }
          .tmg-summary-value { font-size: 1.15rem; }

          .tmg-panel { padding: 1.1rem 0.95rem; }
          .tmg-action-arrow { display: none; }

          .tmg-help-card { flex-direction: column; }
          .tmg-help-icon { width: 32px; height: 32px; }
        }

        /* Very small phones */
        @media (max-width: 340px) {
          .tmg-hero-content h1 { font-size: 1.1rem; }
          .tmg-badge-status { font-size: 1.4rem; }
          .tmg-summary-top > span { font-size: 0.58rem; }
        }

        /* Landscape phones with short height */
        @media (max-height: 500px) and (orientation: landscape) {
          .tmg-hero { margin-top: 0.5rem; }
          .tmg-hero-content { padding: 1rem 1.25rem; }
          .tmg-hero-content h1 { font-size: 1.2rem; }
          .tmg-hero-content p { display: none; }
          .tmg-hero-badge { padding: 1rem; }
        }

        /* Reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          .tmg-summary-card,
          .tmg-btn,
          .tmg-action-list button,
          .tmg-action-arrow,
          .tmg-skeleton {
            transition: none !important;
            animation: none !important;
          }
          .tmg-summary-card:hover,
          .tmg-btn:hover,
          .tmg-action-list button:hover {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
};

/* ===== HELPERS ===== */
const DASHBOARD_METRICS_CACHE_VERSION = 3;

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
    totalHoldings: 0,
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

const firstName = (name) => {
  if (!name) return 'Member';
  return String(name).trim().split(/\s+/)[0];
};

const MetricCard = ({ card, loading, onClick }) => {
  const Icon = card.icon;

  return (
    <button
      type="button"
      className={`tmg-summary-card tmg-summary-card-${card.accent}`}
      onClick={onClick}
      aria-label={`${card.label}: ${card.value}`}
    >
      <div className="tmg-summary-top">
        <span>{card.label}</span>
        <div className="tmg-summary-icon"><Icon /></div>
      </div>
      {loading ? (
        <>
          <strong className="tmg-skeleton"></strong>
          <small className="tmg-skeleton short"></small>
        </>
      ) : (
        <>
          <strong className="tmg-summary-value">{card.value}</strong>
          <small className="tmg-summary-hint">{card.hint}</small>
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

const formatCurrency = (amount) => {
  const value = Number(amount || 0);
  return `KES ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export default Dashboard;