// src/components/Login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../log.png';
import Alert from './Alert';

const Login = ({ onLogin, onCreateAccount, onForgotPassword }) => {
  const navigate = useNavigate();
  const [memberNumber, setMemberNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Use proxy server (relative URL) - this will go to http://localhost:3023 due to package.json proxy
  const API_BASE = '/api/v1';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!memberNumber.trim() || !password.trim()) {
      setError('Please enter your member number and password to continue.');
      return;
    }
    
    setLoading(true);
    localStorage.removeItem('authToken');
    localStorage.removeItem('proxyAuthToken');
    
    try {
      // Call through proxy server (NOT directly to live server)
      const authResponse = await fetch(`${API_BASE}/auth/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          memberNo: memberNumber.trim(),
          password: password.trim()
        })
      });
      
      const authData = await authResponse.json();
      
      if (authResponse.ok) {
        // Store authentication data
        localStorage.setItem('memberNumber', memberNumber.trim());
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('loginTimestamp', String(Date.now()));
        
        if (authData.token) {
          localStorage.setItem('authToken', authData.token);
        }
        if (authData.proxyToken) {
          localStorage.setItem('proxyAuthToken', authData.proxyToken);
        }
        
        // Fetch member details through proxy
        try {
          const memberResponse = await fetch(`${API_BASE}/member/${memberNumber.trim()}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              ...(authData.token && { 'Authorization': `Bearer ${authData.token}` })
            }
          });
          
          if (memberResponse.ok) {
            const memberData = await memberResponse.json();
            
            // Store member details
            localStorage.setItem('memberData', JSON.stringify(memberData));
            
            // Extract name from response
            let userName = '';
            if (memberData.data && memberData.data.holders_name) {
              userName = memberData.data.holders_name;
            } else if (memberData.holders_name) {
              userName = memberData.holders_name;
            } else if (memberData.holdersName) {
              userName = memberData.holdersName;
            }
            
            if (userName) {
              localStorage.setItem('holdersName', userName);
              localStorage.setItem('userName', userName);
            }
            
            // Extract account number
            let accountNo = '';
            if (memberData.data && memberData.data.acc_no) {
              accountNo = memberData.data.acc_no;
            } else if (memberData.acc_no) {
              accountNo = memberData.acc_no;
            } else if (memberData.accNo) {
              accountNo = memberData.accNo;
            }
            
            if (accountNo) {
              localStorage.setItem('accountNo', accountNo);
            } else {
              localStorage.setItem('accountNo', memberNumber.trim());
            }
            
            // Create and store initials
            if (userName) {
              const names = userName.split(' ');
              const initials = names.map(n => n[0]).join('').toUpperCase().substring(0, 2);
              localStorage.setItem('userInitials', initials);
            } else {
              localStorage.setItem('userInitials', memberNumber.trim().substring(0, 2).toUpperCase());
            }
            
            // Store member ID
            let memberId = '';
            if (memberData.data && memberData.data.id_no) {
              memberId = memberData.data.id_no;
            } else if (memberData.id_no) {
              memberId = memberData.id_no;
            } else if (memberData.id) {
              memberId = memberData.id;
            }
            
            if (memberId) {
              localStorage.setItem('memberId', String(memberId));
            }
            
            if (onLogin) {
              onLogin(memberData);
            } else {
              navigate('/');
            }
          } else {
            // If member details fetch fails, still allow login with basic info
            console.warn('Could not fetch member details, using basic info');
            localStorage.setItem('holdersName', `Member ${memberNumber.trim()}`);
            localStorage.setItem('userName', `Member ${memberNumber.trim()}`);
            localStorage.setItem('accountNo', memberNumber.trim());
            localStorage.setItem('userInitials', memberNumber.trim().substring(0, 2).toUpperCase());
            
            if (onLogin) {
              onLogin(authData);
            } else {
              navigate('/');
            }
          }
        } catch (memberError) {
          console.error('Error fetching member details:', memberError);
          // Still allow login even if member details fetch fails
          localStorage.setItem('holdersName', `Member ${memberNumber.trim()}`);
          localStorage.setItem('userName', `Member ${memberNumber.trim()}`);
          localStorage.setItem('accountNo', memberNumber.trim());
          localStorage.setItem('userInitials', memberNumber.trim().substring(0, 2).toUpperCase());
          
          if (onLogin) {
            onLogin(authData);
          } else {
            navigate('/');
          }
        }
      } else {
        setError(authData.message || authData.error || 'We could not sign you in with those details. Please check and try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('We could not reach the server right now. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #00a3b5 0%, #008a9a 100%)',
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
      background: 'linear-gradient(135deg, #00a3b5 0%, #008a9a 100%)',
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
    errorMessage: {
      background: 'rgba(231, 76, 60, 0.08)',
      borderLeft: '3px solid #e74c3c',
      color: '#c0392b',
      padding: '0.75rem',
      borderRadius: '8px',
      marginBottom: '1rem',
      fontSize: '0.875rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
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
      background: 'linear-gradient(135deg, #00a3b5 0%, #008a9a 100%)',
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
      color: '#48bb78',
    },
    forgotLink: {
      color: '#e74c3c',
    },
  };

  const keyframes = `
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
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
        
        <div style={styles.body}>          {error && (
            <Alert type="error" title="Sign in needs attention" className="auth-alert">
              {error}
            </Alert>
          )}
          
          <form onSubmit={handleSubmit}>
            <div style={styles.formGroup}>
              <label style={{...styles.formLabel, ...{position: 'relative'}}}>
                Member Number <span style={{color: '#e74c3c'}}>*</span>
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
                  onFocus={(e) => e.target.style.borderColor = '#00a3b5'}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
              </div>
            </div>
            
            <div style={styles.formGroup}>
              <label style={{...styles.formLabel, ...{position: 'relative'}}}>
                Password <span style={{color: '#e74c3c'}}>*</span>
              </label>
              <div style={styles.inputGroup}>
                <span style={styles.inputIcon}>🔒</span>
                <input
                  type={showPassword ? "text" : "password"}
                  style={styles.formControl}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={loading}
                  onFocus={(e) => e.target.style.borderColor = '#00a3b5'}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
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
                ...(loading && styles.loginBtnDisabled)
              }}
              disabled={loading}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(0, 163, 181, 0.3)';
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
              ) : 'Sign In'}
            </button>
          </form>
          
          <div style={styles.loginLinks}>
            <button 
              type="button"
              style={{...styles.linkBtn, ...styles.createLink}}
              onClick={onCreateAccount}
              disabled={loading}
              onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
            >
              Create an Account
            </button>
            <button 
              type="button"
              style={{...styles.linkBtn, ...styles.forgotLink}}
              onClick={onForgotPassword}
              disabled={loading}
              onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
            >
              Forgot Password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

