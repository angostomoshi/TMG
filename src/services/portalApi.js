export async function portalRequest(path) {
  const token = localStorage.getItem('proxyAuthToken') || localStorage.getItem('authToken');
  const response = await fetch(`/api/v1${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Unable to load your account. Please try again.');
  return data;
}
