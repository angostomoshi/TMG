// ApplyLoan.js - TMG Foundation themed
import React, { useState, useEffect } from 'react';
import Alert from './Alert';

function ApplyLoan() {
  const [memberData, setMemberData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loanAmount, setLoanAmount] = useState('');
  const [period, setPeriod] = useState('');
  const [payMode, setPayMode] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [monthlyDeduction, setMonthlyDeduction] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitMessageType, setSubmitMessageType] = useState('');

  // --- TMG FOUNDATION BRAND COLORS ---
  const colors = {
    primary: '#1B3A6B',
    primaryDark: '#12294C',
    accent: '#E31E24',
    accentDark: '#C4181D',
    softBlue: '#EEF3FA',
    softRed: '#FDECEC',
  };
  const brandColor = colors.primary;

  const INTEREST_RATE = 4.5;
  const MIN_AMOUNT = 1000;
  const MAX_AMOUNT = 50000;
  const MAX_PERIOD = 6;
  const PAY_MODES = [
    { value: 'N/A', label: 'N/A' },
    { value: 'checkoff', label: 'Check off' },
    { value: 'offline', label: 'Offline' },
    { value: 'hybrid', label: 'Hybrid' },
    { value: 'dividend', label: 'Dividend' },
  ];

  const formatPayMode = (mode) => {
    if (!mode) return '';
    if (mode === 'N/A') return 'N/A';
    if (String(mode).toLowerCase() === 'checkoff') return 'Check off';
    return mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
  };

  const API_BASE_URL = '/api/v1';

  useEffect(() => {
    const cachedProfile = localStorage.getItem('memberProfile');
    if (cachedProfile) {
      setMemberData(JSON.parse(cachedProfile));
      setLoading(false);
    }

    const fetchMemberData = async () => {
      try {
        let memberNumber = localStorage.getItem('memberNumber');
        const token = localStorage.getItem('authToken');

        if (!memberNumber) {
          const storedMemberData = localStorage.getItem('memberData');
          if (storedMemberData) {
            const parsed = JSON.parse(storedMemberData);
            memberNumber = parsed.accNo || parsed.memberNo || parsed.memberNumber;
          }
        }

        if (!memberNumber) {
          console.error('Member number not found');
          return;
        }

        const response = await fetch(`${API_BASE_URL}/member/${memberNumber}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          }
        });

        if (response.ok) {
          const data = await response.json();
          setMemberData(data);
          localStorage.setItem('memberProfile', JSON.stringify(data));
        } else {
          if (!cachedProfile) {
            const cachedProfileFallback = localStorage.getItem('memberProfile');
            if (cachedProfileFallback) {
              setMemberData(JSON.parse(cachedProfileFallback));
            }
          }
        }
      } catch (err) {
        console.error('Error fetching member data:', err);
        if (!cachedProfile) {
          const cachedProfileFallback = localStorage.getItem('memberProfile');
          if (cachedProfileFallback) {
            setMemberData(JSON.parse(cachedProfileFallback));
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMemberData();
  }, [API_BASE_URL]);

  const calculateLoan = () => {
    const amount = parseFloat(loanAmount) || 0;
    const months = parseFloat(period) || 0;

    if (amount && months && months > 0) {
      const interest = amount * (INTEREST_RATE / 100) * months;
      const total = amount + interest;
      const monthly = total / months;

      setTotalAmount(total.toFixed(2));
      setMonthlyDeduction(monthly.toFixed(2));
      setShowResults(true);
    } else {
      setShowResults(false);
      setTotalAmount('');
      setMonthlyDeduction('');
    }
  };

  useEffect(() => {
    calculateLoan();
  }, [loanAmount, period]);

  const validateLoan = () => {
    const amount = parseFloat(loanAmount);
    const months = parseFloat(period);

    if (!amount || amount <= 0) {
      setSubmitMessage('Please enter a loan amount.');
      setSubmitMessageType('error');
      return false;
    }

    if (amount < MIN_AMOUNT) {
      setSubmitMessage(`The minimum instant loan amount is KES ${MIN_AMOUNT.toLocaleString()}.`);
      setSubmitMessageType('error');
      return false;
    }

    if (amount > MAX_AMOUNT) {
      setSubmitMessage(`Instant loans are capped at KES ${MAX_AMOUNT.toLocaleString()}. For higher loan amounts, please contact the office for guidance.`);
      setSubmitMessageType('error');
      return false;
    }

    if (!months || months <= 0) {
      setSubmitMessage('Please select a repayment period.');
      setSubmitMessageType('error');
      return false;
    }

    if (months > MAX_PERIOD) {
      setSubmitMessage(`The maximum repayment period is ${MAX_PERIOD} months.`);
      setSubmitMessageType('error');
      return false;
    }

    if (!payMode) {
      setSubmitMessage('Please select a pay mode.');
      setSubmitMessageType('error');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateLoan()) {
      setTimeout(() => {
        setSubmitMessage('');
      }, 5000);
      return;
    }

    setSubmitting(true);
    setSubmitMessage('');

    const interestAmount = parseFloat(loanAmount) * (INTEREST_RATE / 100) * parseFloat(period);
    const token = localStorage.getItem('authToken');
    const memberNumber = memberData?.accNo || localStorage.getItem('memberNumber') || 'MS967';
    const memberName = memberData?.holdersName || localStorage.getItem('userName') || 'MEMBER';

    const loanApplication = {
      memberNo: memberNumber,
      memberName: memberName,
      loanType: 'TMG FOUNDATION INSTANT LOAN',
      loanPurpose: 'TMG FOUNDATION INSTANT LOAN',
      purpose: 'TMG FOUNDATION INSTANT LOAN',
      lpurpose: 'TMG FOUNDATION INSTANT LOAN',
      payMode: payMode,
      wstation: formatPayMode(payMode),
      loanAmount: parseFloat(loanAmount),
      periodMonths: parseFloat(period),
      interestRate: INTEREST_RATE,
      interestAmount: interestAmount,
      totalAmount: parseFloat(totalAmount),
      monthlyDeduction: parseFloat(monthlyDeduction),
      applicationDate: new Date().toISOString(),
      status: 'Pending'
    };

    try {
      const pendingResponse = await fetch(`${API_BASE_URL}/loan-applications/${memberNumber}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      if (pendingResponse.ok) {
        const pendingData = await pendingResponse.json();
        const pendingLoans = Array.isArray(pendingData?.data) ? pendingData.data : [];
        const existingPendingInstantLoan = pendingLoans.find((loan) => {
          const purpose = String(loan.loanPurpose || loan.purpose || '').toUpperCase();
          return purpose.includes('INSTANT LOAN');
        });

        if (existingPendingInstantLoan) {
          throw new Error(`You already have a pending instant loan application (${existingPendingInstantLoan.loanNo || 'awaiting approval'}). Please wait for approval before applying again.`);
        }
      }

      const response = await fetch(`${API_BASE_URL}/loan/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(loanApplication)
      });

      const result = await response.json();

      if (response.ok) {
        const existingApplications = JSON.parse(localStorage.getItem('loanApplications') || '[]');
        existingApplications.push({
          ...loanApplication,
          id: Date.now(),
          applicationId: result.loanNumber || result.loanNo || `IL${Date.now()}`,
          loanNumber: result.loanNumber || result.loanNo,
          submittedAt: new Date().toISOString()
        });
        localStorage.setItem('loanApplications', JSON.stringify(existingApplications));

        setSubmitMessage(`Your instant loan application has been submitted. Loan number: ${result.loanNumber || 'Processing'}.`);
        setSubmitMessageType('success');

        setTimeout(() => {
          setLoanAmount('');
          setPeriod('');
          setPayMode('');
          setTotalAmount('');
          setMonthlyDeduction('');
          setShowResults(false);
          setSubmitMessage('');
        }, 3000);
      } else {
        throw new Error(result.message || result.error || 'We could not submit the application right now.');
      }

    } catch (err) {
      console.error('Error submitting loan application:', err);
      setSubmitMessage(err.message || 'We could not submit the application right now. Please try again.');
      setSubmitMessageType('error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (value) => {
    if (!value) return '0';
    return parseFloat(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
        <style>{`
          .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; }
          .loading-spinner { width: 50px; height: 50px; border: 4px solid #e2e8f0; border-top-color: ${brandColor}; border-radius: 50%; animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div className="loan-calculator">
        <div className="member-card">
          <div className="member-info-row">
            <div className="member-info-item">
              <label>Name</label>
              <div className="member-value">
                {memberData?.holdersName || memberData?.name || 'MEMBER'}
              </div>
            </div>
            <div className="member-info-item">
              <label>Member No</label>
              <div className="member-value">
                {memberData?.accNo || localStorage.getItem('memberNumber') || 'MS967'}
              </div>
            </div>
          </div>
          <div className="member-info-row" style={{ marginTop: '1rem' }}>
            <div className="member-info-item">
              <label>ID Number</label>
              <div className="member-value">
                {memberData?.idNo || memberData?.idNumber || 'N/A'}
              </div>
            </div>
            <div className="member-info-item">
              <label>Phone</label>
              <div className="member-value">
                {memberData?.tel1 || memberData?.phone || 'N/A'}
              </div>
            </div>
          </div>
        </div>

        <div className="calculator-card">
          <form onSubmit={handleSubmit}>
            <div className="calculator-row">
              <div className="calculator-field">
                <label>Amount (KES)</label>
                <input
                  type="number"
                  className="calculator-input"
                  placeholder={`Enter amount (KES ${MIN_AMOUNT.toLocaleString()} – ${MAX_AMOUNT.toLocaleString()})`}
                  value={loanAmount}
                  onChange={(e) => {
                    setLoanAmount(e.target.value);
                  }}
                  step="1"
                  min={MIN_AMOUNT}
                  max={MAX_AMOUNT}
                  required
                />
              </div>

              <div className="calculator-field">
                <label>Period (Months)</label>
                <select
                  className="calculator-select"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  required
                >
                  <option value="">Select period</option>
                  <option value="1">1 month</option>
                  <option value="2">2 months</option>
                  <option value="3">3 months</option>
                  <option value="4">4 months</option>
                  <option value="5">5 months</option>
                  <option value="6">6 months</option>
                </select>
              </div>

              <div className="calculator-field">
                <label>Pay Mode</label>
                <select
                  className="calculator-select"
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value)}
                  required
                >
                  <option value="">Select pay mode</option>
                  {PAY_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="loan-info">
              <div className="info-icon">i</div>
              <div className="info-text">
                <strong>Instant Loan Terms:</strong> Minimum KES 1,000 | Maximum KES 50,000 | Maximum repayment period 6 months | Interest rate 4.5% per month | For higher amounts, please contact the office
              </div>
            </div>

            {showResults && (
              <div className="results-section">
                <div className="results-row">
                  <div className="result-item">
                    <label>Total Amount</label>
                    <div className="result-value">
                      KES {formatCurrency(totalAmount)}
                    </div>
                  </div>
                  <div className="result-item">
                    <label>Monthly Deduction</label>
                    <div className="result-value">
                      KES {formatCurrency(monthlyDeduction)}
                    </div>
                  </div>
                </div>
                <div className="calculation-details">
                  <small>
                    Calculation: {formatCurrency(loanAmount)} + ({formatCurrency(loanAmount)} × {INTEREST_RATE}% × {period}) = KES {formatCurrency(totalAmount)}
                  </small>
                </div>
              </div>
            )}

            {submitMessage && (
              <Alert
                type={submitMessageType === 'success' ? 'success' : 'error'}
                title={submitMessageType === 'success' ? 'Application received' : 'Please review your application'}
                className="submit-message"
              >
                {submitMessage}
              </Alert>
            )}

            <button
              type="submit"
              className="submit-btn"
              disabled={submitting || !showResults}
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .loan-calculator {
          max-width: 1000px;
          margin: 0 auto;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .member-card {
          background: white;
          border-radius: 16px;
          padding: 1.5rem;
          margin-bottom: 1rem;
          box-shadow: 0 4px 16px rgba(18, 41, 76, 0.06);
          border-left: 4px solid ${colors.accent};
        }

        .member-info-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 2rem;
        }

        .member-info-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .member-info-item label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          color: ${colors.primary};
          letter-spacing: 0.5px;
        }

        .member-value {
          font-size: 1.05rem;
          font-weight: 600;
          color: #1a202c;
          padding: 0.25rem 0;
          border-bottom: 2px solid ${colors.softBlue};
        }

        .calculator-card {
          background: white;
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 4px 16px rgba(18, 41, 76, 0.06);
        }

        .calculator-row {
          display: grid;
          grid-template-columns: 1.5fr 1fr 1fr;
          gap: 1rem;
          align-items: end;
        }

        .calculator-field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .calculator-field label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          color: ${colors.primary};
          letter-spacing: 0.5px;
        }

        .calculator-input,
        .calculator-select {
          width: 100%;
          min-width: 0;
          padding: 0.7rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          font-size: 0.875rem;
          background: #ffffff;
          font-family: inherit;
          color: #1a202c;
          transition: all 0.2s;
        }

        .calculator-input:focus,
        .calculator-select:focus {
          outline: none;
          border-color: ${colors.primary};
          box-shadow: 0 0 0 3px rgba(27, 58, 107, 0.1);
        }

        .loan-info {
          margin-top: 1rem;
          padding: 0.85rem 1rem;
          background: ${colors.softBlue};
          border: 1px solid rgba(27, 58, 107, 0.15);
          border-left: 4px solid ${colors.primary};
          border-radius: 10px;
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .info-icon {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: ${colors.primary};
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          font-size: 0.75rem;
          font-weight: 800;
          line-height: 1;
          font-style: italic;
        }

        .info-text {
          font-size: 0.78rem;
          color: #334155;
          line-height: 1.55;
        }

        .info-text strong {
          color: ${colors.primary};
        }

        .results-section {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid #e2e8f0;
        }

        .results-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 2rem;
        }

        .result-item label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          color: ${colors.primary};
          letter-spacing: 0.5px;
          display: block;
          margin-bottom: 0.4rem;
        }

        .result-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: ${colors.primary};
          padding: 0.5rem 0;
          border-bottom: 2px solid ${colors.softBlue};
        }

        .calculation-details {
          margin-top: 1rem;
          font-size: 0.75rem;
          color: #64748b;
          padding: 0.75rem 1rem;
          background: #f8fafc;
          border-radius: 8px;
          border-left: 3px solid ${colors.accent};
        }

        .calculation-details small {
          color: #64748b;
          line-height: 1.5;
        }

        .submit-btn {
          width: 100%;
          margin-top: 1.5rem;
          padding: 0.875rem;
          background: linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark});
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 0.875rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 6px 16px rgba(27, 58, 107, 0.25);
          font-family: inherit;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px rgba(27, 58, 107, 0.35);
        }

        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        @media (max-width: 768px) {
          .calculator-row { grid-template-columns: 1fr; }
          .member-info-row { grid-template-columns: 1fr; }
          .results-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}

export default ApplyLoan;