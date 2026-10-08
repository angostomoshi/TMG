import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  FaChartPie,
  FaUserCircle,
  FaCoins,
  FaUniversity,
  FaChartLine,
  FaBars,
  FaChevronDown,
  FaSignOutAlt,
  FaHeart
} from 'react-icons/fa';
import Dashboard from './components/Dashboard';
import MemberProfile from './components/MemberProfile';
import DividendList from './components/DividendList';
import ShareCapital from './components/ShareCapital';
import ShareMarket from './components/ShareMarketConnected';
import MarketAlerts from './components/MarketAlerts';
import Login from './components/Login';
import CreateAccount from './components/CreateAccount';
import ChangePassword from './components/ChangePassword';
import IdleWarningModal from './components/IdleWarningModal';
import useIdleLogout from './hooks/useIdleLogout';
import './App.css';
import logo from './log.png';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_WARNING_MS = 60 * 1000;
const ABSOLUTE_SESSION_MS = 60 * 60 * 1000;

// --- TMG FOUNDATION BRAND COLORS ---
const TMG = {
  primary: '#1B3A6B',
  primaryDark: '#12294C',
  primaryLight: '#2A5091',
  accent: '#E31E24',
  accentDark: '#C4181D',
  softBlue: '#EEF3FA',
  softRed: '#FDECEC',
};

const clearSession = () => {
  [
    'isAuthenticated',
    'userData',
    'memberData',
    'memberProfile',
    'userName',
    'userInitials',
    'accountNo',
    'memberNumber',
    'authToken',
    'proxyAuthToken',
    'holdersName',
    'loginTimestamp',
    'savingsTransactions',
    'shareTransactions',
    'dividendTransactions',
    'guarantorTransactions',
    'withdrawableData',
    'dashboardMetrics'
  ].forEach((key) => localStorage.removeItem(key));
};

const isSessionExpired = () => {
  const loginTimestamp = Number(localStorage.getItem('loginTimestamp'));
  if (!loginTimestamp) return false;
  return Date.now() - loginTimestamp > ABSOLUTE_SESSION_MS;
};

/* ============================================================
   SIDEBAR
   ============================================================ */
const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: FaChartPie },
    { path: '/profile', label: 'Shareholder Profile', icon: FaUserCircle },
    { path: '/dividends', label: 'Dividends', icon: FaCoins },
    { path: '/share-capital', label: 'Share Statement', icon: FaUniversity },
    { path: '/share-market', label: 'Share Market', icon: FaChartLine },
  ];

  const handleNavigation = (path) => {
    navigate(path);
    if (window.innerWidth <= 768) onClose();
  };

  const handleLogout = () => {
    clearSession();
    navigate('/login');
    window.location.reload();
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Brand block — logo only */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo-wrap">
            <img src={logo} alt="The Metro Group PLC" className="sidebar-brand-logo" />
          </div>
        </div>

        {/* Nav */}
        <nav className="nav-menu" aria-label="Main navigation">
          <span className="nav-section-label">Menu</span>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                type="button"
                key={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavigation(item.path)}
              >
                <span className="nav-icon"><Icon /></span>
                <span className="nav-label">{item.label}</span>
                {isActive && <span className="nav-active-dot" />}
              </button>
            );
          })}

          {/* Divider + Logout */}
          <div className="nav-divider" />
          <button
            type="button"
            className="nav-item nav-item-logout"
            onClick={handleLogout}
          >
            <span className="nav-icon"><FaSignOutAlt /></span>
            <span className="nav-label">Log out</span>
          </button>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-tagline">
            <FaHeart className="sidebar-footer-heart" />
            <span>Building a stronger community, together.</span>
          </div>
        </div>
      </aside>
    </>
  );
};

/* ============================================================
   TOP BAR
   ============================================================ */
const TopBar = ({ onMenuToggle }) => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [holdersName, setHoldersName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      setCurrentDate(now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);

    const storedUserData = localStorage.getItem('userData');
    const storedUserName = localStorage.getItem('userName');
    const storedUserInitials = localStorage.getItem('userInitials');
    const storedAccountNo = localStorage.getItem('accountNo');
    const storedMemberNumber = localStorage.getItem('memberNumber');
    const storedHoldersName = localStorage.getItem('holdersName');

    setAccountNo(storedAccountNo || storedMemberNumber || '');

    if (storedUserData) {
      try {
        const userData = JSON.parse(storedUserData);
        const name = userData.holdersName || userData.name || storedHoldersName || 'Member';
        const names = name.split(' ').filter(Boolean);
        setHoldersName(name);
        setUserName(name);
        setUserInitials(names.map((part) => part[0]).join('').toUpperCase().substring(0, 2) || 'MB');
      } catch {
        setHoldersName(storedHoldersName || storedUserName || 'Member');
        setUserName(storedUserName || 'Member');
        setUserInitials(storedUserInitials || 'MB');
      }
    } else {
      setHoldersName(storedHoldersName || storedUserName || 'Member');
      setUserName(storedUserName || 'Member');
      setUserInitials(storedUserInitials || 'MB');
    }

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pageTitles = {
    '/': 'Dashboard',
    '/profile': 'Shareholder Profile',
    '/share-market': 'Share Market',
    '/dividends': 'Dividends',
    '/share-capital': 'Share Statement',
  };

  const getFirstName = () => {
    if (holdersName && holdersName !== 'Member') return holdersName.split(' ')[0];
    return accountNo ? `Member ${accountNo}` : 'Member';
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleLogout = () => {
    clearSession();
    navigate('/login');
    window.location.reload();
  };

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button className="mobile-menu-toggle" onClick={onMenuToggle} type="button" aria-label="Open menu">
          <FaBars />
        </button>
        <div className="top-bar-title-block">
          <div className="page-title">{pageTitles[window.location.pathname] || 'Dashboard'}</div>
          <div className="page-subtitle">
            <span>Home</span>
            <span className="page-subtitle-sep">/</span>
            <span className="page-subtitle-current">{pageTitles[window.location.pathname] || 'Dashboard'}</span>
            <span className="greeting-divider">•</span>
            <strong>{getGreeting()}, {getFirstName()}</strong>
          </div>
        </div>
      </div>

      <div className="header-right">
        <div className="datetime" aria-label="Current date and time">
          <div className="time">{currentTime}</div>
          <div className="date">{currentDate}</div>
        </div>

        <div className="user-menu" ref={menuRef}>
          <button
            type="button"
            className={`user-dropdown ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className="user-avatar-sm">{userInitials}</div>
            <div className="user-info">
              <div className="name">{userName}</div>
              <div className="role">Member {accountNo && `- ${accountNo}`}</div>
            </div>
            <span className="user-menu-chevron"><FaChevronDown /></span>
          </button>

          {menuOpen && (
            <div className="user-menu-panel" role="menu">
              <div className="user-menu-summary">
                <div className="user-avatar-lg">{userInitials}</div>
                <div>
                  <strong>{userName}</strong>
                  <span>{accountNo ? `Member ${accountNo}` : 'TMG Member'}</span>
                </div>
              </div>
              <div className="user-menu-divider" />
              <button type="button" onClick={() => { setMenuOpen(false); navigate('/profile'); }}>
                <FaUserCircle /> View profile
              </button>
              <button type="button" onClick={handleLogout} className="logout-menu-btn">
                <FaSignOutAlt /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

/* ============================================================
   MAIN LAYOUT
   ============================================================ */
const MainLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setSidebarOpen(false);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="dashboard-container">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <TopBar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="content-wrapper">
          <MarketAlerts />
          {children}
        </main>
      </div>
    </div>
  );
};

/* ============================================================
   APP
   ============================================================ */
function App() {
  const location = useLocation();
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.querySelectorAll('.main-content, .content-wrapper').forEach(element => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
  }, [location.key]);
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const wasAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    if (wasAuthenticated && isSessionExpired()) {
      clearSession();
      return false;
    }
    return wasAuthenticated;
  });

  const handleIdleLogout = useCallback(() => {
    clearSession();
    setIsAuthenticated(false);
    navigate('/login');
  }, [navigate]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const checkExpiry = () => {
      if (isSessionExpired()) {
        handleIdleLogout();
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, handleIdleLogout]);

  const { warningSecondsLeft, stayLoggedIn } = useIdleLogout({
    idleMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    onIdle: handleIdleLogout,
    enabled: isAuthenticated,
  });

  const handleLogin = async () => {
    try {
      const storedMemberNumber = localStorage.getItem('memberNumber');
      const storedMemberData = localStorage.getItem('memberData');

      if (storedMemberData) {
        const memberData = JSON.parse(storedMemberData);
        const nameToUse = memberData.holdersName || memberData.name || `Member ${storedMemberNumber}`;
        const names = nameToUse.split(' ').filter(Boolean);

        localStorage.setItem('userData', storedMemberData);
        localStorage.setItem('userName', nameToUse);
        localStorage.setItem('accountNo', memberData.accNo || memberData.memberNo || storedMemberNumber);
        localStorage.setItem('holdersName', memberData.holdersName || memberData.name || '');
        localStorage.setItem('userInitials', names.map((name) => name[0]).join('').toUpperCase().substring(0, 2) || 'MB');
      } else {
        try {
          const response = await fetch(`/api/v1/member/${storedMemberNumber}`);
          if (response.ok) {
            const memberData = await response.json();
            const nameToUse = memberData.holdersName || `Member ${storedMemberNumber}`;
            const names = nameToUse.split(' ').filter(Boolean);

            localStorage.setItem('userData', JSON.stringify(memberData));
            localStorage.setItem('userName', nameToUse);
            localStorage.setItem('accountNo', memberData.accNo || storedMemberNumber);
            localStorage.setItem('holdersName', memberData.holdersName || '');
            localStorage.setItem('userInitials', names.map((name) => name[0]).join('').toUpperCase().substring(0, 2) || 'MB');
          } else {
            localStorage.setItem('userName', `Member ${storedMemberNumber}`);
            localStorage.setItem('accountNo', storedMemberNumber || '');
            localStorage.setItem('userInitials', 'MB');
            localStorage.setItem('holdersName', '');
          }
        } catch (error) {
          console.error('Error fetching member data:', error);
          localStorage.setItem('userName', `Member ${storedMemberNumber}`);
          localStorage.setItem('accountNo', storedMemberNumber || '');
          localStorage.setItem('userInitials', 'MB');
          localStorage.setItem('holdersName', '');
        }
      }

      setIsAuthenticated(true);
      navigate('/');
    } catch (error) {
      console.error('Error processing login data:', error);
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userName', 'Member');
      localStorage.setItem('userInitials', 'MB');
      setIsAuthenticated(true);
      navigate('/');
    }
  };

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*" element={
          <Login
            onLogin={handleLogin}
            onCreateAccount={() => navigate('/create-account')}
            onForgotPassword={() => navigate('/change-password')}
          />
        } />
      </Routes>
    );
  }

  return (
    <>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard userData={JSON.parse(localStorage.getItem('userData') || '{}')} />} />
          <Route path="/dashboard" element={<Dashboard userData={JSON.parse(localStorage.getItem('userData') || '{}')} />} />
          <Route path="/profile" element={<MemberProfile />} />
          <Route path="/dividends" element={<DividendList />} />
          <Route path="/share-capital" element={<ShareCapital />} />
          <Route path="/share-market" element={<ShareMarket />} />
          <Route path="/create-account" element={<CreateAccount />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
      {warningSecondsLeft !== null && (
        <IdleWarningModal
          secondsLeft={warningSecondsLeft}
          onStay={stayLoggedIn}
          onLogoutNow={handleIdleLogout}
        />
      )}
    </>
  );
}

export default App;
