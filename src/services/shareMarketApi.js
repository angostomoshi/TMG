export async function marketRequest(path = '', body) {
  const token = localStorage.getItem('proxyAuthToken') || localStorage.getItem('authToken');
  const response = await fetch(`/api/v1/share-market${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Unable to reach the share market. Please try again.');
  return data;
}
