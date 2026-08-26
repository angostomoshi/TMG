import React, { useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90 * 1000;

function formatKES(value) {
  return Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const [phone, setPhone] = useState(defaultPhone || '');
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '');
  const [stage, setStage] = useState('idle'); // idle | submitting | polling | success | failed | timeout
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState(null);
  const pollRef = useRef(null);
  const pollStartRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPhone(defaultPhone || '');
      setAmount(defaultAmount ? String(defaultAmount) : '');
      setStage('idle');
      setMessage('');
      setReceipt(null);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOpen, defaultPhone, defaultAmount]);

  if (!isOpen) return null;

  const purposeLabel = purpose === 'loan_repayment' ? 'Loan Repayment' : 'Savings Deposit';

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollStatus = (checkoutRequestId) => {
    const token = localStorage.getItem('authToken');
    pollStartRef.current = Date.now();

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
          if (onSuccess) onSuccess();
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          stopPolling();
          setStage('failed');
          setMessage(data.resultDesc || 'The payment was not completed.');
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
    if (!phone.trim()) {
      setMessage('Enter your M-Pesa phone number.');
      return;
    }

    setStage('submitting');
    setMessage('');

    try {
      const token = localStorage.getItem('authToken');
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
          phoneNumber: phone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStage('failed');
        setMessage(data.message || 'Could not start the M-Pesa payment.');
        return;
      }

      setStage('polling');
      setMessage(data.customerMessage || 'Check your phone to complete the payment.');
      pollStatus(data.checkoutRequestId);
    } catch (err) {
      setStage('failed');
      setMessage('Could not reach the server. Please try again.');
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
    <div className="mpesa-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="mpesa-modal-title">
      <div className="mpesa-modal">
        <button type="button" className="mpesa-modal-close" onClick={handleClose} aria-label="Close">&times;</button>

        <div className="mpesa-modal-header">
          <span className="mpesa-modal-badge">M-Pesa</span>
          <h2 id="mpesa-modal-title">{purposeLabel}</h2>
          <p>Paying to account <strong>{accountReference}</strong></p>
        </div>

        {stage === 'idle' && (
          <form onSubmit={handleSubmit} className="mpesa-modal-form">
            <label>
              Phone number
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXX"
                required
              />
            </label>
            <label>
              Amount (KES)
              <input
                type="number"
                min="10"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                required
              />
            </label>
            {message && <p className="mpesa-modal-error">{message}</p>}
            <button type="submit" className="mpesa-modal-submit">Send payment request</button>
          </form>
        )}

        {stage === 'submitting' && (
          <div className="mpesa-modal-status">
            <div className="mpesa-spinner" />
            <p>Sending payment request...</p>
          </div>
        )}

        {stage === 'polling' && (
          <div className="mpesa-modal-status">
            <div className="mpesa-spinner" />
            <p>{message}</p>
            <span className="mpesa-modal-hint">This can take up to a minute.</span>
          </div>
        )}

        {stage === 'success' && receipt && (
          <div className="mpesa-modal-status mpesa-modal-success">
            <div className="mpesa-modal-check">&#10003;</div>
            <p>Payment received</p>
            <div className="mpesa-receipt">
              <div><span>Amount</span><strong>KES {formatKES(receipt.amount)}</strong></div>
              <div><span>M-Pesa Receipt</span><strong>{receipt.receiptNo}</strong></div>
            </div>
            <span className="mpesa-modal-hint">
              {receipt.receiptEmailed ? 'Receipt emailed to you.' : 'Your receipt will be emailed shortly.'}
            </span>
            <button type="button" className="mpesa-modal-submit" onClick={handleClose}>Done</button>
          </div>
        )}

        {(stage === 'failed' || stage === 'timeout') && (
          <div className="mpesa-modal-status mpesa-modal-failed">
            <div className="mpesa-modal-cross">&times;</div>
            <p>{message}</p>
            <button type="button" className="mpesa-modal-submit" onClick={handleRetry}>Try again</button>
          </div>
        )}
      </div>

      <style>{`
        .mpesa-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(10, 44, 72, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 1rem;
        }

        .mpesa-modal {
          position: relative;
          background: var(--bg-white, #fff);
          border-radius: 16px;
          padding: 2rem;
          max-width: 400px;
          width: 100%;
          box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1));
        }

        .mpesa-modal-close {
          position: absolute;
          top: 12px;
          right: 14px;
          border: none;
          background: none;
          font-size: 1.4rem;
          line-height: 1;
          color: var(--text-muted, #718096);
          cursor: pointer;
        }

        .mpesa-modal-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .mpesa-modal-badge {
          display: inline-block;
          background: var(--secondary-light, #e8f5e9);
          color: var(--secondary-dark, #1e8e4a);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 0.2rem 0.6rem;
          border-radius: 100px;
          margin-bottom: 0.6rem;
        }

        .mpesa-modal-header h2 {
          margin: 0 0 0.35rem;
          font-size: 1.15rem;
          color: var(--text-primary, #1a202c);
        }

        .mpesa-modal-header p {
          margin: 0;
          color: var(--text-secondary, #4a5568);
          font-size: 0.85rem;
        }

        .mpesa-modal-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .mpesa-modal-form label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary, #4a5568);
        }

        .mpesa-modal-form input {
          padding: 0.65rem 0.8rem;
          border-radius: 8px;
          border: 1px solid var(--border-light, #e2e8f0);
          font-size: 0.9rem;
        }

        .mpesa-modal-error {
          color: var(--danger, #e74c3c);
          font-size: 0.8rem;
          margin: 0;
        }

        .mpesa-modal-submit {
          background: var(--secondary, #27ae60);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
        }

        .mpesa-modal-submit:hover {
          background: var(--secondary-dark, #1e8e4a);
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
          font-weight: 600;
          color: var(--text-primary, #1a202c);
        }

        .mpesa-modal-hint {
          font-size: 0.78rem;
          color: var(--text-muted, #718096);
        }

        .mpesa-spinner {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 3px solid var(--border-light, #e2e8f0);
          border-top-color: var(--secondary, #27ae60);
          animation: mpesa-spin 0.8s linear infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .mpesa-spinner { animation: none; }
        }

        @keyframes mpesa-spin {
          to { transform: rotate(360deg); }
        }

        .mpesa-modal-check, .mpesa-modal-cross {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: 800;
          color: #fff;
        }

        .mpesa-modal-check { background: var(--secondary, #27ae60); }
        .mpesa-modal-cross { background: var(--danger, #e74c3c); }

        .mpesa-receipt {
          width: 100%;
          background: var(--bg-light, #f7fafc);
          border-radius: 10px;
          padding: 0.8rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .mpesa-receipt div {
          display: flex;
          justify-content: space-between;
          font-size: 0.85rem;
        }

        .mpesa-receipt span { color: var(--text-muted, #718096); }
        .mpesa-receipt strong { color: var(--text-primary, #1a202c); font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
};

export default MpesaPaymentModal;
