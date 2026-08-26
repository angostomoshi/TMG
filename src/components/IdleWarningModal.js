import React from 'react';

const IdleWarningModal = ({ secondsLeft, onStay, onLogoutNow }) => {
  return (
    <div className="idle-modal-overlay" role="alertdialog" aria-modal="true" aria-labelledby="idle-modal-title">
      <div className="idle-modal">
        <div className="idle-modal-icon">!</div>
        <h2 id="idle-modal-title">Are you still there?</h2>
        <p>
          For your security, you'll be logged out due to inactivity in{' '}
          <strong>{secondsLeft}</strong> second{secondsLeft === 1 ? '' : 's'}.
        </p>
        <div className="idle-modal-actions">
          <button type="button" className="idle-modal-stay" onClick={onStay}>
            Stay logged in
          </button>
          <button type="button" className="idle-modal-logout" onClick={onLogoutNow}>
            Log out now
          </button>
        </div>
      </div>

      <style>{`
        .idle-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(10, 44, 72, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 1rem;
        }

        .idle-modal {
          background: var(--bg-white, #fff);
          border-radius: 12px;
          padding: 2rem;
          max-width: 380px;
          width: 100%;
          text-align: center;
          box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1));
        }

        .idle-modal-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 1rem;
          border-radius: 50%;
          background: var(--warning, #e67e22);
          color: #fff;
          font-weight: 800;
          font-size: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .idle-modal h2 {
          margin: 0 0 0.5rem;
          font-size: 1.1rem;
          color: var(--text-primary, #1a202c);
        }

        .idle-modal p {
          margin: 0 0 1.5rem;
          color: var(--text-secondary, #4a5568);
          font-size: 0.9rem;
          line-height: 1.5;
        }

        .idle-modal-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
        }

        .idle-modal-stay,
        .idle-modal-logout {
          flex: 1;
          padding: 0.65rem 1rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          border: none;
        }

        .idle-modal-stay {
          background: var(--secondary, #27ae60);
          color: #fff;
        }

        .idle-modal-stay:hover {
          background: var(--secondary-dark, #1e8e4a);
        }

        .idle-modal-logout {
          background: var(--bg-light, #f7fafc);
          color: var(--text-secondary, #4a5568);
          border: 1px solid var(--border-light, #e2e8f0);
        }

        .idle-modal-logout:hover {
          background: var(--border-light, #e2e8f0);
        }
      `}</style>
    </div>
  );
};

export default IdleWarningModal;
