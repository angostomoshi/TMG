import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  FaChartPie,
  FaUserCircle,
  FaHandHoldingUsd,
  FaCoins,
  FaFileInvoiceDollar,
  FaUserFriends,
  FaUniversity,
  FaChartLine,
  FaWallet,
  FaBars,
  FaChevronDown
} from 'react-icons/fa';
import Dashboard from './components/Dashboard';
import MemberProfile from './components/MemberProfile';
import ApplyLoan from './components/ApplyLoan';
import DividendList from './components/DividendList';
import LoanStatement from './components/LoanStatement';
import GuarantorList from './components/GuarantorList';
import ShareCapital from './components/ShareCapital';
import ShareStatement from './components/ShareStatement';
import WithdrawableStmt from './components/WithdrawableStmt';
import Login from './components/Login';
import CreateAccount from './components/CreateAccount';
import ChangePassword from './components/ChangePassword';
import './App.css';
import logo from './log.png';

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
    'holdersName'
  ].forEach((key) => localStorage.removeItem(key));
};

const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: FaChartPie },
    { path: '/profile', label: 'Member Profile', icon: FaUserCircle },
    { path: '/apply-loan', label: 'Instant Loan', icon: FaHandHoldingUsd },
    { path: '/dividends', label: 'Dividends', icon: FaCoins },
    { path: '/loan-statement', label: 'Loan Statement', icon: FaFileInvoiceDollar },
    { path: '/guarantors', label: 'Guarantors', icon: FaUserFriends },
    { path: '/share-capital', label: 'Share Capital', icon: FaUniversity },
    { path: '/share-statement', label: 'Savings Statement', icon: FaChartLine },
    { path: '/withdrawable', label: 'Withdrawable Statement', icon: FaWallet },
  ];

  const handleNavigation = (path) => {
    navigate(path);
    if (window.innerWidth <= 768) onClose();
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <img src={logo} alt="Sacco Logo" className="logo-image" />
          <p className="sidebar-kicker">Member Portal</p>
        </div>

        <nav className="nav-menu" aria-label="Main navigation">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
            <button
              type="button"
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => handleNavigation(item.path)}
            >
              <span className="nav-icon"><Icon /></span>
              <span>{item.label}</span>
            </button>
          );
          })}
        </nav>
      </aside>
    </>
  );
};

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
    '/profile': 'Member Profile',
    '/apply-loan': 'Apply Instant Loan',
    '/dividends': 'Dividends',
    '/loan-statement': 'Loan Statement',
    '/guarantors': 'Guarantors',
    '/share-capital': 'Share Capital',
    '/share-statement': 'Savings Statement',
    '/withdrawable': 'Withdrawable Statement'
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
        <div>
          <div className="page-title">{pageTitles[window.location.pathname] || 'Dashboard'}</div>
          <div className="page-subtitle">
            <span>Home</span>
            <span>/</span>
            <span>{pageTitles[window.location.pathname] || 'Dashboard'}</span>
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
                  <span>{accountNo ? `Member ${accountNo}` : 'Sacco member'}</span>
                </div>
              </div>
              <button type="button" onClick={() => { setMenuOpen(false); navigate('/profile'); }}>
                View profile
              </button>
              <button type="button" onClick={handleLogout} className="logout-menu-btn">
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

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
          {children}
        </main>
      </div>
    </div>
  );
};

function App() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
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
    <MainLayout>
      <Routes>
        <Route path="/" element={<Dashboard userData={JSON.parse(localStorage.getItem('userData') || '{}')} />} />
        <Route path="/dashboard" element={<Dashboard userData={JSON.parse(localStorage.getItem('userData') || '{}')} />} />
        <Route path="/profile" element={<MemberProfile />} />
        <Route path="/apply-loan" element={<ApplyLoan />} />
        <Route path="/dividends" element={<DividendList />} />
        <Route path="/loan-statement" element={<LoanStatement />} />
        <Route path="/guarantors" element={<GuarantorList />} />
        <Route path="/share-capital" element={<ShareCapital />} />
        <Route path="/share-statement" element={<ShareStatement />} />
        <Route path="/withdrawable" element={<WithdrawableStmt />} />
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/change-password" element={<ChangePassword />} />
      </Routes>
    </MainLayout>
  );
}

export default App;


