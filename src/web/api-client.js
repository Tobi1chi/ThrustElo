async function readJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON response but got "${contentType || 'unknown'}"`);
  }
  return response.json();
}

async function request(path) {
  const response = await fetch(path);
  const data = await readJson(response);

  if (!response.ok) {
    const message = data?.error?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export const apiClient = {
  getHealth() {
    return request('/api/health');
  },
  getRanking(minKills = 11) {
    return request(`/api/ranking?minKills=${encodeURIComponent(minKills)}`);
  },
  getPlayer(playerId) {
    return request(`/api/players/${encodeURIComponent(playerId)}`);
  }
};
