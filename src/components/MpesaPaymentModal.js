import React, { useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90 * 1000;
const AMOUNT_SHORTCUTS = [500, 1000, 2500, 5000];

function formatKES(value) {
  return Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('254')) return digits.slice(3);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function formatReceiptDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleString('en-KE');
  return date.toLocaleString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MpesaLogo({ className = '' }) {
  return (
    <div className={`mpesa-logo ${className}`} aria-label="M-Pesa">
      <span>m</span>
      <i aria-hidden="true">
        <b />
      </i>
      <span>pesa</span>
    </div>
  );
}

function friendlyPaymentMessage(message, fallback = 'We could not complete this payment request. Please try again.') {
  const text = String(message || '').trim();
  if (!text) return fallback;

  if (/auth|token|session|expired|forbidden|own account/i.test(text)) {
    return 'Your session needs a refresh. Please sign in again before making this payment.';
  }
  if (/phone|number/i.test(text)) {
    return 'Please enter a valid M-Pesa phone number and try again.';
  }
  if (/amount|minimum|at least/i.test(text)) {
    return 'Please enter a valid amount of at least KES 10.';
  }
  if (/not found|account|loan/i.test(text)) {
    return 'We could not confirm this account or loan. Please refresh the page and try again.';
  }
  if (/mismatch|ledger|database|configured|callback|secret|consumer|passkey|shortcode|server/i.test(text)) {
    return 'The payment could not be completed safely right now. Please try again or contact the Sacco office.';
  }

  return text.length > 140 ? fallback : text;
}

const MpesaPaymentModal = ({
  isOpen,
  onClose,
  memberNo,
  purpose,
  accountReference,
  defaultAmount,
  defaultPhone,
  onSuccess,
}) => {
  const [phone, setPhone] = useState(displayPhone(defaultPhone));
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '');
  const [stage, setStage] = useState('idle'); // idle | submitting | polling | success | failed | timeout
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef(null);
  const tickRef = useRef(null);
  const pollStartRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPhone(displayPhone(defaultPhone));
      setAmount(defaultAmount ? String(defaultAmount) : '');
      setStage('idle');
      setMessage('');
      setReceipt(null);
      setElapsed(0);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isOpen, defaultPhone, defaultAmount]);

  if (!isOpen) return null;

  const isLoan = purpose === 'loan_repayment';
  const purposeLabel = isLoan
    ? 'Loan Repayment'
    : purpose === 'withdrawable_deposit'
      ? 'Withdrawable Deposit'
      : 'Savings Deposit';
  const refLabel = isLoan
    ? 'Loan number'
    : purpose === 'member_deposit'
      ? 'Member number'
      : 'Account number';

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };

  const publishPaymentSuccess = (payment) => {
    const detail = {
      ...payment,
      purpose,
      accountReference,
      memberNo,
      completedAt: new Date().toISOString(),
    };

    localStorage.removeItem('dashboardMetrics');
    localStorage.removeItem('savingsTransactions');
    localStorage.removeItem('withdrawableData');
    localStorage.setItem('mpesaLastPayment', JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent('mpesa:payment-success', { detail }));
  };

  const pollStatus = (checkoutRequestId) => {
    const token = localStorage.getItem('proxyAuthToken') || localStorage.getItem('authToken');
    pollStartRef.current = Date.now();

    tickRef.current = setInterval(() => {
      setElapsed(Math.min(100, Math.round(((Date.now() - pollStartRef.current) / POLL_TIMEOUT_MS) * 100)));
    }, 500);

    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        stopPolling();
        setStage('timeout');
        setMessage(`We haven't heard back from Safaricom yet. If you were charged, contact the Sacco office with reference ${checkoutRequestId}.`);
        return;
      }

      try {
        const response = await fetch(`/api/v1/mpesa/status/${checkoutRequestId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (data.status === 'success') {
          stopPolling();
          setStage('success');
          setReceipt(data);
          publishPaymentSuccess(data);
          if (onSuccess) onSuccess(data);
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          stopPolling();
          setStage('failed');
          setMessage(
            data.status === 'cancelled'
              ? 'Payment cancelled. You can try again whenever you are ready.'
              : friendlyPaymentMessage(data.resultDesc, 'The payment was not completed. Please try again.')
          );
        }
      } catch (err) {
        // transient network error while polling — keep trying until timeout
      }
    }, POLL_INTERVAL_MS);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount < 10) {
      setMessage('Enter a valid amount of at least KES 10.');
      return;
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 9) {
      setMessage('Enter your M-Pesa phone number.');
      return;
    }

    setStage('submitting');
    setMessage('');

    try {
      const token = localStorage.getItem('proxyAuthToken') || localStorage.getItem('authToken');
      const response = await fetch('/api/v1/mpesa/stkpush', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          memberNo,
          purpose,
          accountReference,
          amount: numericAmount,
          phoneNumber: `254${phoneDigits}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStage('failed');
        setMessage(friendlyPaymentMessage(data.message, 'We could not send the M-Pesa prompt. Please try again.'));
        return;
      }

      setStage('polling');
      setElapsed(0);
      setMessage(data.customerMessage || 'Check your phone to complete the payment.');
      pollStatus(data.checkoutRequestId);
    } catch (err) {
      setStage('failed');
      setMessage('We could not send the request right now. Please check your connection and try again.');
    }
  };

  const handleRetry = () => {
    setStage('idle');
    setMessage('');
  };

  const handleClose = () => {
    stopPolling();
    onClose();
  };

  return (
    <div className="mpesa-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="mpesa-modal-title" onClick={handleClose}>
      <div className="mpesa-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mpesa-modal-close" onClick={handleClose} aria-label="Close">&times;</button>

        <div className="mpesa-modal-header">
          <MpesaLogo className="mpesa-modal-mark" />
          <span className="mpesa-modal-badge">Secure phone payment</span>
          <h2 id="mpesa-modal-title">{purposeLabel}</h2>
          <p>{refLabel} <strong>{accountReference}</strong></p>
        </div>

        {stage === 'idle' && (
          <form onSubmit={handleSubmit} className="mpesa-modal-form">
            {AMOUNT_SHORTCUTS.length > 0 && !isLoan && (
              <div className="mpesa-amount-chips">
                {AMOUNT_SHORTCUTS.map((val) => (
                  <button
                    type="button"
                    key={val}
                    className={`mpesa-chip ${String(val) === amount ? 'active' : ''}`}
                    onClick={() => setAmount(String(val))}
                  >
                    {val.toLocaleString('en-KE')}
                  </button>
                ))}
              </div>
            )}

            <label>
              Amount (KES)
              <div className="mpesa-input-wrap">
                <span className="mpesa-input-prefix">KES</span>
                <input
                  type="number"
                  min="10"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
            </label>

            <label>
              Phone number
              <div className="mpesa-input-wrap">
                <span className="mpesa-input-prefix">+254</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="7XX XXX XXX"
                  required
                />
              </div>
            </label>

            {message && <p className="mpesa-modal-error">{message}</p>}

            <button type="submit" className="mpesa-modal-submit">
              Send payment request
            </button>
            <p className="mpesa-modal-fineprint">You'll get a prompt on your phone to enter your M-Pesa PIN.</p>
          </form>
        )}

        {stage === 'submitting' && (
          <div className="mpesa-modal-status">
            <div className="mpesa-spinner" />
            <p>Sending payment request&hellip;</p>
          </div>
        )}

        {stage === 'polling' && (
          <div className="mpesa-modal-status">
            <div className="mpesa-phone-prompt">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="2" width="12" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="12" cy="18" r="1" fill="currentColor" />
              </svg>
            </div>
            <p>{message}</p>
            <div className="mpesa-progress-track">
              <div className="mpesa-progress-fill" style={{ width: `${elapsed}%` }} />
            </div>
            <span className="mpesa-modal-hint">This can take up to a minute.</span>
          </div>
        )}

        {stage === 'success' && receipt && (
          <div className="mpesa-modal-status mpesa-modal-success">
            <div className="mpesa-approval-top">
              <div className="mpesa-modal-check">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 12.5 10 17l9-10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span>Approved</span>
            </div>
            <p>Payment received successfully</p>
            <div className="mpesa-approval-card">
              <div className="mpesa-approval-amount">
                <span>Amount paid</span>
                <strong>KES {formatKES(receipt.amount)}</strong>
              </div>
              <div className="mpesa-receipt">
                <div><span>M-Pesa receipt</span><strong>{receipt.receiptNo || 'Confirmed'}</strong></div>
                <div><span>{refLabel}</span><strong>{receipt.accountReference || accountReference}</strong></div>
                <div><span>Payment type</span><strong>{purposeLabel}</strong></div>
                <div><span>Confirmed</span><strong>{formatReceiptDate(receipt.transactionDate)}</strong></div>
              </div>
            </div>
            <span className="mpesa-modal-hint">
              {receipt.receiptEmailed ? 'Receipt emailed to you.' : 'Your statement and dashboard are refreshing now.'}
            </span>
            <button type="button" className="mpesa-modal-submit" onClick={handleClose}>Close</button>
          </div>
        )}

        {(stage === 'failed' || stage === 'timeout') && (
          <div className="mpesa-modal-status mpesa-modal-failed">
            <div className="mpesa-modal-cross">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
            <p>{message}</p>
            <button type="button" className="mpesa-modal-submit" onClick={handleRetry}>Try again</button>
          </div>
        )}
      </div>

      <style>{`
        .mpesa-modal-overlay {
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at top right, rgba(34, 197, 94, 0.18), rgba(12, 45, 31, 0.62) 60%);
          backdrop-filter: blur(3px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 1rem;
          animation: mpesa-fade-in 0.18s ease-out;
        }

        @keyframes mpesa-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .mpesa-modal {
          position: relative;
          background: rgba(255, 255, 255, 0.97);
          border: 1px solid rgba(187, 247, 208, 0.9);
          border-radius: 18px;
          padding: 2rem 1.85rem 1.75rem;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 30px 70px rgba(10, 44, 72, 0.28);
          animation: mpesa-pop-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes mpesa-pop-in {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .mpesa-modal-overlay, .mpesa-modal { animation: none; }
        }

        .mpesa-modal-close {
          position: absolute;
          top: 14px;
          right: 16px;
          border: none;
          background: var(--bg-light, #f7fafc);
          width: 30px;
          height: 30px;
          border-radius: 50%;
          font-size: 1.15rem;
          line-height: 1;
          color: var(--text-muted, #718096);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mpesa-modal-close:hover {
          background: var(--border-light, #e2e8f0);
          color: var(--text-primary, #1a202c);
        }

        .mpesa-modal-header {
          text-align: center;
          margin-bottom: 1.6rem;
        }

        .mpesa-logo {
          --mpesa-green: #2ec66d;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.02em;
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1;
          color: #fff;
          text-transform: lowercase;
          font-family: Arial, Helvetica, sans-serif;
        }

        .mpesa-logo i {
          position: relative;
          display: inline-block;
          width: 0.78em;
          height: 1.12em;
          margin: 0 0.03em;
          border: 0.08em solid currentColor;
          border-radius: 0.12em;
          transform: translateY(0.02em);
        }

        .mpesa-logo i::before,
        .mpesa-logo i::after {
          content: "";
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          background: currentColor;
          border-radius: 999px;
        }

        .mpesa-logo i::before {
          top: 0.1em;
          width: 0.24em;
          height: 0.04em;
        }

        .mpesa-logo i::after {
          bottom: 0.08em;
          width: 0.14em;
          height: 0.14em;
        }

        .mpesa-logo i b {
          position: absolute;
          inset: 0.22em 0.12em;
          display: block;
          background: linear-gradient(135deg, #ff2b4f 0 48%, var(--mpesa-green) 48% 100%);
          border-radius: 0.04em;
        }

        .mpesa-modal-mark {
          width: fit-content;
          min-width: 132px;
          min-height: 54px;
          margin: 0 auto 0.75rem;
          border-radius: 14px;
          background: #2ec66d;
          color: #fff;
          padding: 0.55rem 1.15rem;
          font-size: 2rem;
          box-shadow: 0 16px 32px rgba(46, 198, 109, 0.28);
        }

        .mpesa-modal-badge {
          display: inline-block;
          background: #ecfdf5;
          color: #118c3f;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0.22rem 0.65rem;
          border-radius: 100px;
          margin-bottom: 0.55rem;
        }

        .mpesa-modal-header h2 {
          margin: 0 0 0.3rem;
          font-size: 1.2rem;
          color: var(--text-primary, #1a202c);
          font-weight: 800;
        }

        .mpesa-modal-header p {
          margin: 0;
          color: var(--text-muted, #718096);
          font-size: 0.82rem;
        }

        .mpesa-modal-header p strong {
          color: var(--text-secondary, #4a5568);
          font-variant-numeric: tabular-nums;
        }

        .mpesa-modal-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .mpesa-amount-chips {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .mpesa-chip {
          flex: 1;
          min-width: 70px;
          border: 1px solid var(--border-light, #e2e8f0);
          background: var(--bg-light, #f7fafc);
          color: var(--text-secondary, #4a5568);
          border-radius: 10px;
          padding: 0.5rem 0.4rem;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          font-variant-numeric: tabular-nums;
        }

        .mpesa-chip:hover {
          border-color: rgba(34, 197, 94, 0.45);
        }

        .mpesa-chip.active {
          background: #ecfdf5;
          border-color: #2bbf61;
          color: #118c3f;
        }

        .mpesa-modal-form label {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted, #718096);
        }

        .mpesa-input-wrap {
          display: flex;
          align-items: stretch;
          border: 1.5px solid var(--border-light, #e2e8f0);
          border-radius: 10px;
          overflow: hidden;
          transition: border-color 0.15s;
          background: #fff;
        }

        .mpesa-input-wrap:focus-within {
          border-color: #2bbf61;
          box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14);
        }

        .mpesa-input-prefix {
          display: flex;
          align-items: center;
          padding: 0 0.7rem;
          background: var(--bg-light, #f7fafc);
          color: var(--text-secondary, #4a5568);
          font-weight: 700;
          font-size: 0.9rem;
          border-right: 1.5px solid var(--border-light, #e2e8f0);
          white-space: nowrap;
        }

        .mpesa-modal-form input {
          flex: 1;
          min-width: 0;
          border: none;
          outline: none;
          padding: 0.65rem 0.8rem;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary, #1a202c);
          font-variant-numeric: tabular-nums;
        }

        .mpesa-modal-error {
          color: #7a4b00;
          font-size: 0.8rem;
          margin: 0;
          background: #fffbeb;
          border: 1px solid #fde68a;
          padding: 0.5rem 0.7rem;
          border-radius: 10px;
        }

        .mpesa-modal-submit {
          background: linear-gradient(135deg, var(--secondary, #27ae60), var(--secondary-dark, #1e8e4a));
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 0.8rem 1rem;
          font-weight: 800;
          font-size: 0.92rem;
          cursor: pointer;
          box-shadow: 0 14px 26px rgba(39, 174, 96, 0.24);
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .mpesa-modal-submit:hover {
          transform: translateY(-1px);
          box-shadow: 0 18px 32px rgba(39, 174, 96, 0.3);
        }

        .mpesa-modal-submit:active {
          transform: translateY(0);
        }

        .mpesa-modal-fineprint {
          margin: 0;
          text-align: center;
          font-size: 0.72rem;
          color: var(--text-muted, #718096);
        }

        .mpesa-modal-status {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.75rem;
        }

        .mpesa-modal-status p {
          margin: 0;
          font-weight: 700;
          color: var(--text-primary, #1a202c);
          font-size: 0.95rem;
        }

        .mpesa-modal-hint {
          font-size: 0.78rem;
          color: var(--text-muted, #718096);
        }

        .mpesa-spinner {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 3px solid var(--border-light, #e2e8f0);
          border-top-color: #2bbf61;
          animation: mpesa-spin 0.8s linear infinite;
        }

        .mpesa-phone-prompt {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #ecfdf5;
          color: #118c3f;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: mpesa-pulse 1.6s ease-in-out infinite;
        }

        .mpesa-phone-prompt svg { width: 24px; height: 24px; }

        @keyframes mpesa-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.28); }
          50% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .mpesa-spinner, .mpesa-phone-prompt { animation: none; }
        }

        @keyframes mpesa-spin {
          to { transform: rotate(360deg); }
        }

        .mpesa-progress-track {
          width: 100%;
          height: 5px;
          border-radius: 100px;
          background: var(--border-light, #e2e8f0);
          overflow: hidden;
        }

        .mpesa-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #2bbf61, #118c3f);
          border-radius: 100px;
          transition: width 0.5s linear;
        }

        .mpesa-modal-check, .mpesa-modal-cross {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
        }

        .mpesa-modal-check svg, .mpesa-modal-cross svg { width: 26px; height: 26px; }

        .mpesa-modal-check {
          background: linear-gradient(135deg, #22c55e, #15803d);
          box-shadow: 0 14px 28px rgba(34, 197, 94, 0.28);
        }

        .mpesa-modal-cross {
          background: linear-gradient(135deg, #f87171, #dc2626);
          box-shadow: 0 14px 28px rgba(220, 38, 38, 0.24);
        }

        .mpesa-approval-top {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.45rem;
        }

        .mpesa-approval-top span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 1.7rem;
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          background: #ecfdf5;
          color: #118c3f;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .mpesa-approval-card {
          width: 100%;
          overflow: hidden;
          border: 1px solid rgba(187, 247, 208, 0.9);
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.06);
        }

        .mpesa-approval-amount {
          padding: 1rem;
          background: linear-gradient(135deg, #2ec66d, #0f8a3a);
          color: #ffffff;
          text-align: left;
        }

        .mpesa-approval-amount span,
        .mpesa-approval-amount strong {
          display: block;
        }

        .mpesa-approval-amount span {
          color: rgba(255, 255, 255, 0.78);
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .mpesa-approval-amount strong {
          margin-top: 0.25rem;
          font-size: 1.45rem;
          font-variant-numeric: tabular-nums;
        }

        .mpesa-receipt {
          width: 100%;
          background: #ffffff;
          padding: 0.35rem 1rem 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .mpesa-receipt div {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          border-bottom: 1px solid #edf2f7;
          padding: 0.58rem 0;
          font-size: 0.85rem;
        }

        .mpesa-receipt div:last-child {
          border-bottom: 0;
        }

        .mpesa-receipt span { color: var(--text-muted, #718096); }
        .mpesa-receipt strong {
          color: var(--text-primary, #1a202c);
          font-variant-numeric: tabular-nums;
          text-align: right;
        }
      `}</style>
    </div>
  );
};

export default MpesaPaymentModal;
