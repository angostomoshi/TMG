// Authentication service for managing user session
class AuthService {
  constructor() {
    this.authKey = 'isAuthenticated';
    this.memberDataKey = 'memberData';
    this.memberNumberKey = 'memberNumber';
    this.authTokenKey = 'authToken';
    this.proxyAuthTokenKey = 'proxyAuthToken';
    this.userInfoKey = 'userInfo';
  }

  isAuthenticated() {
    return localStorage.getItem(this.authKey) === 'true';
  }

  getMemberData() {
    const data = localStorage.getItem(this.memberDataKey);
    return data ? JSON.parse(data) : null;
  }

  getMemberNumber() {
    return localStorage.getItem(this.memberNumberKey);
  }

  getAuthToken() {
    return localStorage.getItem(this.authTokenKey);
  }

  getUserInfo() {
    const userInfo = localStorage.getItem(this.userInfoKey);
    return userInfo ? JSON.parse(userInfo) : null;
  }

  setAuth(data, memberNumber) {
    localStorage.setItem(this.authKey, 'true');
    localStorage.setItem(this.memberDataKey, JSON.stringify(data));
    localStorage.setItem(this.memberNumberKey, memberNumber);
    
    if (data.token) {
      localStorage.setItem(this.authTokenKey, data.token);
    }
    if (data.proxyToken) {
      localStorage.setItem(this.proxyAuthTokenKey, data.proxyToken);
    }
    
    if (data.user) {
      localStorage.setItem(this.userInfoKey, JSON.stringify(data.user));
    }
  }

  clearAuth() {
    localStorage.removeItem(this.authKey);
    localStorage.removeItem(this.memberDataKey);
    localStorage.removeItem(this.memberNumberKey);
    localStorage.removeItem(this.authTokenKey);
    localStorage.removeItem(this.proxyAuthTokenKey);
    localStorage.removeItem(this.userInfoKey);
  }

  logout() {
    this.clearAuth();
    window.location.href = '/login';
  }

  // Check if token is expired
  isTokenExpired() {
    const token = this.getAuthToken();
    if (!token) return true;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expirationTime = payload.exp * 1000;
      return Date.now() >= expirationTime;
    } catch (error) {
      return true;
    }
  }

  // Refresh token if needed
  async refreshToken() {
    // Implement token refresh logic if your backend supports it
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem(this.authTokenKey, data.token);
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }
}

export default new AuthService();
