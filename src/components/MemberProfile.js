// MemberProfile.js — DEMO MODE (no backend)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from './Alert';

// ─────────────────────────────────────────────────────────────
// DEMO DATA — remove this block when reconnecting the backend
// ─────────────────────────────────────────────────────────────
const SIMULATE_LOADING = true; // set false for instant render
const DEMO_DATA = {
  profile: {
    holdersName: 'Jane Wanjiku Mwangi',
    accNo: 'TMG-004821',
    memberNo: 'TMG-004821',
    idNo: '28471935',
    emailAdd: 'jane.mwangi@example.co.ke',
    tel1: '+254 712 345 678',
    postalAddress: 'P.O. Box 1420-00100, Nairobi',
    id: '4821',
    kraPin: 'A012345678Z',
    createdAt: '2019-03-14T00:00:00.000Z',
    nok1: 'Peter Mwangi (Spouse) — +254 722 111 222',
    nok2: 'Grace Njeri (Daughter) — +254 733 444 555',
    nok3: 'Samuel Otieno (Brother) — +254 701 777 888',
  },
  savings: 248500,
  shareCapital: 120000,
  dividendPayable: 36750,
};
// ─────────────────────────────────────────────────────────────

const MemberProfile = () => {
  const navigate = useNavigate();
  const [memberData, setMemberData] = useState(null);
  const [savings, setSavings] = useState(null);
  const [shareCapital, setShareCapital] = useState(null);
  const [dividendPayable, setDividendPayable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // TMG Foundation brand colors
  const brandColor = '#1B3A6B';
  const brandAccent = '#E31E24';
  const isDemo = true; // flip to false when wiring real data

  useEffect(() => {
    // ── DEMO LOADER ──────────────────────────────────────────
    // Simulates a brief fetch so the loading state is visible.
    // Replace this entire effect when reconnecting the backend.
    const loadDemo = () => {
      if (!SIMULATE_LOADING) {
        setMemberData(DEMO_DATA.profile);
        setSavings(DEMO_DATA.savings);
        setShareCapital(DEMO_DATA.shareCapital);
        setDividendPayable(DEMO_DATA.dividendPayable);
        setLoading(false);
        return undefined;
      }

      const timer = setTimeout(() => {
        setMemberData(DEMO_DATA.profile);
        setSavings(DEMO_DATA.savings);
        setShareCapital(DEMO_DATA.shareCapital);
        setDividendPayable(DEMO_DATA.dividendPayable);
        setLoading(false);
      }, 600);

      return () => clearTimeout(timer);
    };

    return loadDemo();
    // ── END DEMO LOADER ──────────────────────────────────────
  }, []);

  // Format date function
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `KES ${(amount || 0).toLocaleString()}`;
  };

  // Total holdings across the three shareholder balances
  const totalHoldings = (savings || 0) + (shareCapital || 0) + (dividendPayable || 0);

  // If no data at all (no cached, no fetched)
  if (!memberData && !loading) {
    return (
      <div className="profile-error">
        <div className="error-icon">⚠️</div>
        <h3>Unable to Load Profile</h3>
        <p>{error || 'No profile data available'}</p>
        <button onClick={() => window.location.reload()} className="retry-btn">
          Try Again
        </button>
        <style>{`
          .profile-error {
            text-align: center;
            padding: 3rem;
            background: white;
            border-radius: 12px;
          }
          .error-icon { font-size: 3rem; margin-bottom: 1rem; }
          .profile-error h3 { color: #1a202c; margin-bottom: 0.5rem; }
          .profile-error p { color: #718096; margin-bottom: 1.5rem; }
          .retry-btn {
            background: ${brandColor};
            color: white;
            border: none;
            padding: 0.6rem 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          }
          .retry-btn:hover { background: #12294C; }
        `}</style>
      </div>
    );
  }

  // Show loading state
  if (loading && !memberData) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading profile data...</p>
        <style>{`
          .loading-container {
            text-align: center;
            padding: 3rem;
            background: white;
            border-radius: 12px;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #e2e8f0;
            border-top-color: ${brandColor};
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 1rem;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <>
      {isDemo && (
        <div className="demo-banner">
          <span className="demo-dot" />
          <strong>Demo Preview</strong>
          <span className="demo-sep">•</span>
          <span>Showing sample shareholder data — backend not connected</span>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Personal Information</h3>
          {error && (
            <span style={{ fontSize: '0.7rem', color: '#f39c12' }}>⚠️ {error}</span>
          )}
        </div>
        <div className="card-body">
          <div className="profile-info-grid three-columns">
            <div className="profile-info-item">
              <label>Full Name</label>
              <div className="value">
                {memberData?.holdersName || memberData?.fullName || memberData?.name || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Member Number</label>
              <div className="value">
                {memberData?.accNo || memberData?.memberNo || memberData?.memberNumber || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>ID Number</label>
              <div className="value">
                {memberData?.idNo || memberData?.idNumber || memberData?.nationalId || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Email Address</label>
              <div className="value">
                {memberData?.emailAdd || memberData?.email || memberData?.emailAddress || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Phone Number</label>
              <div className="value">
                {memberData?.tel1 || memberData?.phone || memberData?.phoneNumber || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Postal Address</label>
              <div className="value">
                {memberData?.postalAddress || 'Not provided'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Member ID</label>
              <div className="value">{memberData?.id || 'N/A'}</div>
            </div>
            <div className="profile-info-item">
              <label>KRA PIN</label>
              <div className="value">
                {memberData?.kraPin || memberData?.pin || 'Not registered'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Status</label>
              <div className="value">
                <span className="status-badge" style={{ backgroundColor: brandColor + '20', color: brandColor }}>
                  ✓ Shareholder
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: '1rem' }}>
          <Alert type="warning" title="Showing the best available profile data">
            {error}
          </Alert>
        </div>
      )}

      {(memberData?.nok1 || memberData?.nok2 || memberData?.nok3) && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header">
            <h3>Next of Kin Information</h3>
          </div>
          <div className="card-body">
            <div className="profile-info-grid three-columns">
              {memberData?.nok1 && (
                <div className="profile-info-item">
                  <label>Next of Kin 1</label>
                  <div className="value">{memberData.nok1}</div>
                </div>
              )}
              {memberData?.nok2 && (
                <div className="profile-info-item">
                  <label>Next of Kin 2</label>
                  <div className="value">{memberData.nok2}</div>
                </div>
              )}
              {memberData?.nok3 && (
                <div className="profile-info-item">
                  <label>Next of Kin 3</label>
                  <div className="value">{memberData.nok3}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3>Shareholder Account Summary</h3>
        </div>
        <div className="card-body">
          <div className="profile-info-grid three-columns">
            <div className="profile-info-item">
              <label>Account Number</label>
              <div className="value">{memberData?.accNo || 'N/A'}</div>
            </div>
            <div className="profile-info-item">
              <label>Member Since</label>
              <div className="value">
                {formatDate(memberData?.createdAt || memberData?.joinDate) || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Savings</label>
              <div className="value financial">{formatCurrency(savings)}</div>
            </div>
            <div className="profile-info-item">
              <label>Share Capital</label>
              <div className="value financial">{formatCurrency(shareCapital)}</div>
            </div>
            <div className="profile-info-item">
              <label>Dividend Payable</label>
              <div className="value financial">{formatCurrency(dividendPayable)}</div>
            </div>
            <div className="profile-info-item">
              <label>Total Holdings</label>
              <div className="value financial" style={{ color: brandAccent }}>
                {formatCurrency(totalHoldings)}
              </div>
            </div>
          </div>

          <div className="info-note">
            <small>💡 Dividends are declared annually and paid on eligible shares held during the financial year.</small>
          </div>
        </div>
      </div>

      <style>{`
        .demo-banner {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #FFF7E6;
          border: 1px solid #F6C453;
          color: #7A4F01;
          padding: 0.6rem 1rem;
          border-radius: 10px;
          font-size: 0.8rem;
          margin-bottom: 1rem;
        }
        .demo-banner strong { font-weight: 700; }
        .demo-dot {
          width: 8px; height: 8px;
          background: #F6A700;
          border-radius: 50%;
          box-shadow: 0 0 0 3px rgba(246,167,0,0.25);
        }
        .demo-sep { opacity: 0.5; }

        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow: hidden;
          margin-bottom: 1rem;
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .card-header h3 {
          margin: 0;
          font-size: 0.9rem;
          font-weight: 600;
          color: #1a202c;
        }
        .card-body { padding: 1.25rem; }
        .profile-info-grid { display: grid; gap: 1.5rem; }
        .profile-info-grid.three-columns { grid-template-columns: repeat(3, 1fr); }
        .profile-info-item { display: flex; flex-direction: column; gap: 0.5rem; }
        .profile-info-item label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #718096;
        }
        .profile-info-item .value {
          font-size: 1rem;
          color: #1a202c;
          font-weight: 500;
          padding: 0.5rem 0;
          border-bottom: 2px solid #e2e8f0;
          word-break: break-word;
        }
        .profile-info-item .value.financial {
          color: ${brandColor};
          font-weight: 700;
        }
        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.875rem;
          font-weight: 600;
        }
        .info-note {
          margin-top: 1rem;
          padding: 0.75rem;
          background: #EEF3FA;
          border-radius: 8px;
          color: #1B3A6B;
          font-size: 0.75rem;
          text-align: center;
        }
        @media (max-width: 992px) {
          .profile-info-grid.three-columns { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 768px) {
          .profile-info-grid.three-columns { grid-template-columns: 1fr; }
          .card-body { padding: 1rem; }
        }
      `}</style>
    </>
  );
};

export default MemberProfile;