// src/components/Login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../log.png';
import Alert from './Alert';

const CONTACT = {
  phone: '+254 114470459',
  phoneHref: 'tel:+254114470459',
  email: 'info@tmgfoundation.ke',
  emailHref: 'mailto:info@tmgfoundation.ke'
};

const Login = ({ onLogin, onCreateAccount, onForgotPassword }) => {
  const navigate = useNavigate();
  const [memberNumber, setMemberNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // --- UPDATED COLORS BASED ON TMG LOGO ---
  const colors = {
    primary: '#1B3A6B',
    primaryDark: '#142C52',
    accent: '#E31E24',
    accentHover: '#C4181D',
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!memberNumber.trim() || !password.trim()) {
      setError('Please enter your member number and password to continue.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/auth/authenticate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberNo: memberNumber.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.message || 'Unable to sign in.');
      const account = data.memberNo;
      const name = data.holdersName || `Member ${account}`;
      ['dashboardMetrics','shareTransactions','savingsTransactions','dividendTransactions','memberProfile','userData'].forEach(key => localStorage.removeItem(key));
      localStorage.setItem('memberNumber', account);
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('loginTimestamp', String(Date.now()));
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('proxyAuthToken', data.proxyToken || data.token);
      localStorage.setItem('holdersName', name);
      localStorage.setItem('userName', name);
      localStorage.setItem('accountNo', account);
      localStorage.setItem('userInitials', name.split(' ').map(part => part[0]).join('').slice(0, 2));
      localStorage.setItem('memberData', JSON.stringify({ accNo: account, memberNo: account, holdersName: name }));
      if (onLogin) {
        await onLogin(data);
      } else {
        navigate('/');
      }
    } catch (error) {
      setError(error.message || 'Unable to reach the server. Please try again.');
    } finally { setLoading(false); }
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
      padding: '1rem',
      margin: 0,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    card: {
      background: 'white',
      borderRadius: '20px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      width: '100%',
      maxWidth: '420px',
      overflow: 'hidden',
      animation: 'fadeInUp 0.5s ease-out',
    },
    logoSection: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '2rem 2rem 1rem 2rem',
      background: 'white',
    },
    logoImage: {
      maxWidth: '120px',
      height: 'auto',
      objectFit: 'contain',
    },
    header: {
      textAlign: 'center',
      padding: '1rem 2rem',
      background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
    },
    headerH2: {
      fontSize: '1.5rem',
      color: 'white',
      margin: '0 0 0.25rem 0',
      fontWeight: 600,
    },
    headerP: {
      fontSize: '0.85rem',
      color: 'white',
      margin: 0,
      opacity: 0.9,
    },
    body: {
      padding: '2rem',
    },
    formGroup: {
      marginBottom: '1.25rem',
    },
    formLabel: {
      display: 'block',
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: '#4a5568',
      marginBottom: '0.5rem',
    },
    inputGroup: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
    },
    inputIcon: {
      position: 'absolute',
      left: '12px',
      fontSize: '1rem',
      color: '#a0aec0',
      pointerEvents: 'none',
    },
    formControl: {
      width: '100%',
      padding: '0.75rem 0.75rem 0.75rem 2.5rem',
      border: '2px solid #e2e8f0',
      borderRadius: '10px',
      fontSize: '0.875rem',
      transition: 'all 0.2s',
      boxSizing: 'border-box',
      outline: 'none',
    },
    passwordToggle: {
      position: 'absolute',
      right: '12px',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '1rem',
      padding: 0,
      color: '#a0aec0',
    },
    loginBtn: {
      width: '100%',
      padding: '0.75rem',
      background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '0.875rem',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
    },
    loginBtnDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed',
    },
    spinner: {
      display: 'inline-block',
      width: '14px',
      height: '14px',
      border: '2px solid rgba(255, 255, 255, 0.3)',
      borderRadius: '50%',
      borderTopColor: 'white',
      animation: 'spin 0.6s linear infinite',
    },
    loginLinks: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: '1.5rem',
      paddingTop: '1rem',
      borderTop: '1px solid #e2e8f0',
      gap: '1rem',
    },
    linkBtn: {
      background: 'none',
      border: 'none',
      fontSize: '0.8rem',
      cursor: 'pointer',
      fontWeight: 500,
      transition: 'all 0.2s',
      padding: 0,
    },
    createLink: {
      color: colors.accent,
    },
    forgotLink: {
      color: colors.primary,
    },
    contactFooter: {
      marginTop: '1.25rem',
      textAlign: 'center',
      fontSize: '0.75rem',
      color: 'rgba(255, 255, 255, 0.85)',
      lineHeight: 1.6,
      maxWidth: '420px',
    },
    contactLink: {
      color: 'white',
      fontWeight: 600,
      textDecoration: 'none',
    },
  };

  const keyframes = `
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  return (
    <div style={styles.container}>
      <style>{keyframes}</style>
      <div style={styles.card}>
        <div style={styles.logoSection}>
          <img src={logo} alt="Metro Sacco Logo" style={styles.logoImage} />
        </div>

        <div style={styles.header}>
          <h2 style={styles.headerH2}>Welcome Back!</h2>
          <p style={styles.headerP}>Sign in to your account</p>
        </div>

        <div style={styles.body}>
          {error && (
            <Alert type="error" title="Sign in needs attention" className="auth-alert">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>
                Member Number <span style={{ color: '#E31E24' }}>*</span>
              </label>
              <div style={styles.inputGroup}>
                <span style={styles.inputIcon}>👤</span>
                <input
                  type="text"
                  style={styles.formControl}
                  value={memberNumber}
                  onChange={(e) => setMemberNumber(e.target.value)}
                  placeholder="Enter your member number"
                  autoFocus
                  disabled={loading}
                  onFocus={(e) => (e.target.style.borderColor = colors.primary)}
                  onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>
                Password <span style={{ color: '#E31E24' }}>*</span>
              </label>
              <div style={styles.inputGroup}>
                <span style={styles.inputIcon}>🔒</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  style={styles.formControl}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={loading}
                  onFocus={(e) => (e.target.style.borderColor = colors.primary)}
                  onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
                />
                <button
                  type="button"
                  style={styles.passwordToggle}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              style={{
                ...styles.loginBtn,
                ...(loading && styles.loginBtnDisabled),
              }}
              disabled={loading}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = `0 4px 12px rgba(27, 58, 107, 0.3)`;
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = 'none';
              }}
            >
              {loading ? (
                <>
                  <span style={styles.spinner}></span>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div style={styles.loginLinks}>
            <button
              type="button"
              style={{ ...styles.linkBtn, ...styles.createLink }}
              onClick={onCreateAccount}
              disabled={loading}
              onMouseEnter={(e) => (e.target.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.target.style.textDecoration = 'none')}
            >
              Create an Account
            </button>
            <button
              type="button"
              style={{ ...styles.linkBtn, ...styles.forgotLink }}
              onClick={onForgotPassword}
              disabled={loading}
              onMouseEnter={(e) => (e.target.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.target.style.textDecoration = 'none')}
            >
              Forgot Password?
            </button>
          </div>
        </div>
      </div>

      <div style={styles.contactFooter}>
        Need help? Call{' '}
        <a href={CONTACT.phoneHref} style={styles.contactLink}>{CONTACT.phone}</a>{' '}
        or email{' '}
        <a href={CONTACT.emailHref} style={styles.contactLink}>{CONTACT.email}</a>
      </div>
    </div>
  );
};

export default Login;
