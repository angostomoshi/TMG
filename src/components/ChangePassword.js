import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../log.png';

const ChangePassword = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    memberNo: '',
    channel: 'email',
    otp: '',
    password: '',
    confirmPassword: ''
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Auto-clear messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (error) setError('');
  };

  // Send OTP
  const handleSendOtp = async () => {
    if (!formData.memberNo.trim()) {
      setError('Please enter Member number');
      return;
    }
    
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/v1/auth/registerOtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberNo: formData.memberNo.trim(),
          channel: formData.channel,
          purpose: 'reset-password'
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setOtpSent(true);
        setSuccess(data.message || 'OTP sent successfully. Please check your email or phone number for the code.');
        
        // Start countdown for resend
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
      } else {
        setError(data.message || 'Failed to send OTP. Please try again.');
      }
    } catch (err) {
      console.error('Error sending OTP:', err);
      setError('Unable to connect to server. Please check your connection.');
    }
    
    setLoading(false);
  };

  // Change password
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (!formData.memberNo.trim()) {
      setError('Please enter Member number');
      return;
    }
    
    if (!formData.otp.trim()) {
      setError('Please enter OTP');
      return;
    }
    
    if (!/^\d{6}$/.test(formData.otp.trim())) {
      setError('Enter the six-digit OTP');
      return;
    }
    
    if (!formData.password.trim()) {
      setError('Please enter new password');
      return;
    }
    
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberNo: formData.memberNo.trim(),
          channel: formData.channel,
          otp: formData.otp.trim(),
          newPassword: formData.password,
          confirmPassword: formData.confirmPassword
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(data.message || 'Password changed successfully! Redirecting to login...');
        
        // Clear form
        setFormData({
          memberNo: '',
    channel: 'email',
          otp: '',
          password: '',
          confirmPassword: ''
        });
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setError(data.message || 'Failed to change password. Please check your OTP and try again.');
      }
    } catch (err) {
      console.error('Error changing password:', err);
      setError('Unable to connect to server. Please try again.');
    }
    
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <style>{styles.keyframes}</style>
      <div style={styles.card}>
        <div style={styles.logoSection}>
          <img src={logo} alt="TMG Shares Portal" style={styles.logoImage} />
        </div>
        
        <div style={styles.header}>
          <h2 style={styles.headerH2}>Change Password</h2>
          <p style={styles.headerP}>Update your account password</p>
        </div>
        
        <div style={styles.body}>
          {error && (
            <div style={styles.errorMessage}>
              <span>⚠️</span> {error}
            </div>
          )}
          
          {success && (
            <div style={styles.successMessage}>
              <span>✓</span> {success}
            </div>
          )}
          
          <form onSubmit={handleChangePassword}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>
                Member number <span style={{color: '#E31E24'}}>*</span>
              </label>
              <input
                type="text"
                name="memberNo"
                style={styles.formInput}
                value={formData.memberNo}
                onChange={handleChange}
                placeholder="Enter your member number"
                disabled={loading}
                autoFocus
                onFocus={(e) => e.target.style.borderColor = '#1B3A6B'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>

            <label>Send OTP by <select style={styles.formInput} name="channel" value={formData.channel} onChange={handleChange} disabled={loading}><option value="email">Registered email</option><option value="sms">Registered phone (SMS)</option></select></label><p>The code is sent only to the contact details on your member record.</p>
            {/* OTP verification */}
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>
                OTP Code <span style={{color: '#E31E24'}}>*</span>
              </label>
              <input
                type="text"
                name="otp"
                style={styles.formInput}
                value={formData.otp}
                onChange={handleChange}
                placeholder="Enter OTP"
                disabled={loading}
                onFocus={(e) => e.target.style.borderColor = '#1B3A6B'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>

            {/* Send OTP Button - Below OTP field */}
            <button 
              type="button"
              onClick={handleSendOtp}
              style={{
                ...styles.otpButton,
                ...(otpSent ? styles.otpButtonSent : {}),
                ...((loading || countdown > 0) ? styles.otpButtonDisabled : {})
              }}
              disabled={loading || countdown > 0}
              onMouseEnter={(e) => {
                if (!loading && countdown === 0) {
                  e.target.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
              }}
            >
              {loading ? 'Sending...' : countdown > 0 ? `Resend in ${countdown}s` : (otpSent ? 'Resend OTP' : 'Send OTP')}
            </button>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>
                New Password <span style={{color: '#E31E24'}}>*</span>
              </label>
              <input
                type="password"
                name="password"
                style={styles.formInput}
                value={formData.password}
                onChange={handleChange}
                placeholder="Minimum 8 characters"
                disabled={loading}
                onFocus={(e) => e.target.style.borderColor = '#1B3A6B'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
              <small style={styles.inputHint}>Password must be at least 8 characters long</small>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>
                Confirm Password <span style={{color: '#E31E24'}}>*</span>
              </label>
              <input
                type="password"
                name="confirmPassword"
                style={styles.formInput}
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter new password"
                disabled={loading}
                onFocus={(e) => e.target.style.borderColor = '#1B3A6B'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>

            <button 
              type="submit" 
              style={{
                ...styles.submitButton,
                ...(loading ? styles.submitButtonDisabled : {})
              }}
              disabled={loading}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.transform = 'translateY(-1px)';
                  // Updated shadow color to Blue
                  e.target.style.boxShadow = '0 4px 12px rgba(27, 58, 107, 0.3)';
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
                  Processing...
                </>
              ) : 'Change Password'}
            </button>
          </form>
          
          <div style={styles.links}>
            <button 
              type="button"
              style={styles.backLink}
              onClick={() => navigate('/login')}
              disabled={loading}
              onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
            >
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    // Changed from Teal to TMG Blue Gradient
    background: 'linear-gradient(135deg, #1B3A6B 0%, #142C52 100%)',
    padding: '1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: 'white',
    borderRadius: '20px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    width: '100%',
    maxWidth: '450px',
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
    // Changed to TMG Blue Gradient
    background: 'linear-gradient(135deg, #1B3A6B 0%, #142C52 100%)',
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
    background: 'rgba(227, 30, 36, 0.08)',
    borderLeft: '3px solid #E31E24',
    color: '#C4181D',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.875rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  successMessage: {
    background: 'rgba(72, 187, 120, 0.08)',
    borderLeft: '3px solid #48bb78',
    color: '#276749',
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
  formInput: {
    width: '100%',
    padding: '0.75rem',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '0.875rem',
    transition: 'all 0.2s',
    boxSizing: 'border-box',
    outline: 'none',
  },
  inputHint: {
    display: 'block',
    fontSize: '0.7rem',
    color: '#718096',
    marginTop: '0.25rem',
  },
  otpButton: {
    width: '100%',
    padding: '0.75rem',
    // Changed to TMG Red
    background: '#E31E24',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '1.25rem',
  },
  otpButtonSent: {
    // Changed to TMG Dark Blue
    background: '#1B3A6B',
  },
  otpButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  submitButton: {
    width: '100%',
    padding: '0.75rem',
    // Changed to TMG Blue Gradient
    background: 'linear-gradient(135deg, #1B3A6B 0%, #142C52 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '1rem',
  },
  submitButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  links: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '1.5rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e2e8f0',
  },
  backLink: {
    background: 'none',
    border: 'none',
    // Changed to TMG Blue
    color: '#1B3A6B',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  spinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '50%',
    borderTopColor: 'white',
    animation: 'spin 0.6s linear infinite',
    marginRight: '0.5rem',
  },
  keyframes: `
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
  `,
};

export default ChangePassword;
