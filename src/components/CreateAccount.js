// CreateAccount.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../log.png';
import Alert from './Alert';

const CreateAccount = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    memberNo: '',
    mobileNo: '',
    email: '',
    password: '',
    confirmPassword: '',
    otp: ''
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOtpField, setShowOtpField] = useState(false);

  // --- UPDATED COLORS BASED ON TMG LOGO ---
  // TMG Red: #E31E24
  // TMG Dark Blue: #1B3A6B
  const colors = {
    primary: '#1B3A6B',      // Dark Blue (Main brand color)
    primaryDark: '#142C52',  // Darker blue for gradients/hover
    accent: '#E31E24',       // Red (For highlights/errors)
    accentHover: '#C4181D',  // Darker Red for hover
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSendOtp = async () => {
    if (!formData.memberNo.trim()) {
      setError('Please enter your member number first.');
      return;
    }
    if (!formData.mobileNo.trim()) {
      setError('Please enter the mobile number linked to your membership.');
      return;
    }
    if (!formData.email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const response = await fetch('/api/v1/auth/registerOtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          memberNo: formData.memberNo.trim(),
          mobileNo: formData.mobileNo.trim(),
          email: formData.email.trim(),
          purpose: 'create-account'
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'We could not send the OTP right now.');
      }

      setShowOtpField(true);
      setSuccess(data.message || 'OTP sent successfully. Please check your email or phone number for the code.');
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'We could not send the OTP right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.memberNo.trim()) {
      setError('Please enter your member number first.');
      return;
    }
    
    if (!formData.mobileNo.trim()) {
      setError('Please enter the mobile number linked to your membership.');
      return;
    }
    
    if (!formData.email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    
    if (!formData.otp.trim()) {
      setError('Please enter the OTP sent to your email.');
      return;
    }
    
    if (!formData.password.trim()) {
      setError('Please create a password.');
      return;
    }
    
    if (formData.password.length < 4) {
      setError('Your password should be at least 4 characters.');
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('The two passwords do not match yet.');
      return;
    }
    
    setLoading(true);
    setSuccess('');
    
    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          memberNo: formData.memberNo.trim(),
          mobileNo: formData.mobileNo.trim(),
          email: formData.email.trim(),
          password: formData.password,
          otp: formData.otp.trim()
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || data.error || 'We could not create the account right now.');
      }

      setSuccess('Account created successfully. Taking you back to login...');
      
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      setError(err.message || 'We could not create the account right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo-section">
          <img src={logo} alt="Sacco Logo" className="login-logo-image" />
        </div>
        
        <div className="login-header">
          <h2>Create an Account</h2>
          <p>Register as a new member</p>
        </div>
        
        <div className="login-body">
          {error && (
            <Alert type="error" title="Account setup needs attention" className="auth-alert">
              {error}
            </Alert>
          )}
          
          {success && (
            <Alert type="success" title="Nice, that worked" className="auth-alert">
              {success}
            </Alert>
          )}
          
          <form onSubmit={handleSignUp}>
            <div className="form-group">
              <label className="form-label required">Member Number</label>
              <input
                type="text"
                name="memberNo"
                className="form-control"
                value={formData.memberNo}
                onChange={handleChange}
                placeholder="Enter your member number"
                disabled={showOtpField}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Mobile Number</label>
              <input
                type="tel"
                name="mobileNo"
                className="form-control"
                value={formData.mobileNo}
                onChange={handleChange}
                placeholder="Enter your mobile number"
                disabled={showOtpField}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Email</label>
              <input
                type="email"
                name="email"
                className="form-control"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter your email address"
                disabled={showOtpField}
              />
            </div>

            {!showOtpField ? (
              <button 
                type="button"
                onClick={handleSendOtp}
                className="login-btn"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label required">OTP</label>
                  <input
                    type="text"
                    name="otp"
                    className="form-control"
                    value={formData.otp}
                    onChange={handleChange}
                    placeholder="Enter OTP sent to your email"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Password</label>
                  <input
                    type="password"
                    name="password"
                    className="form-control"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create password"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Confirm Password</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    className="form-control"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm your password"
                  />
                </div>

                <button 
                  type="submit" 
                  className="login-btn" 
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Sign Up'}
                </button>
              </>
            )}
          </form>
          
          <div className="login-links">
            <span className="back-link" onClick={() => navigate('/login')}>← Back to Login</span>
          </div>
        </div>
      </div>

      <style>{`
        .login-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          /* Changed from Teal to TMG Blue Gradient */
          background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%);
          padding: 1rem;
        }

        .login-card {
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 420px;
          overflow: hidden;
        }

        .login-logo-section {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 2rem 2rem 1rem 2rem;
          background: white;
        }

        .login-logo-image {
          max-width: 120px;
          height: auto;
          object-fit: contain;
        }

        .login-header {
          text-align: center;
          padding: 1rem 2rem;
          /* Changed to TMG Blue Gradient */
          background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%);
        }

        .login-header h2 {
          font-size: 1.5rem;
          color: white;
          margin: 0 0 0.25rem 0;
          font-weight: 600;
        }

        .login-header p {
          font-size: 0.85rem;
          color: white;
          margin: 0;
          opacity: 0.9;
        }

        .login-body {
          padding: 2rem;
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #4a5568;
          margin-bottom: 0.5rem;
        }

        .form-label.required::after {
          content: '*';
          /* Changed to TMG Red */
          color: ${colors.accent};
          margin-left: 4px;
        }

        .form-control {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .form-control:focus {
          outline: none;
          /* Changed to TMG Blue */
          border-color: ${colors.primary};
          box-shadow: 0 0 0 3px rgba(27, 58, 107, 0.1);
        }

        .form-control:disabled {
          background-color: #f7fafc;
          color: #a0aec0;
        }

        .login-btn {
          width: 100%;
          padding: 0.75rem;
          /* Changed to TMG Blue */
          background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .login-btn:hover:not(:disabled) {
          /* Slightly darker blue on hover */
          background: ${colors.primaryDark};
        }

        .login-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .login-links {
          display: flex;
          justify-content: center;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
        }
        
        .back-link {
          /* Changed to TMG Blue */
          color: ${colors.primary};
          font-size: 0.8rem;
          cursor: pointer;
          font-weight: 500;
        }
        
        .back-link:hover {
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .login-body {
            padding: 1.5rem;
          }
          
          .login-header {
            padding: 1rem;
          }
          
          .login-logo-section {
            padding: 1.5rem 1.5rem 0.5rem 1.5rem;
          }
          
          .login-logo-image {
            max-width: 100px;
          }
        }
      `}</style>
    </div>
  );
};

export default CreateAccount;