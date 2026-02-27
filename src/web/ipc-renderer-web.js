import { apiClient } from './api-client.js';

const FAVORITES_KEY = 'thrustelo:favorites';

function getFavoriteStore() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return {};
    }
    return parsed;
  } catch (_error) {
    return {};
  }
}

function setFavoriteStore(value) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(value));
}

class WebIpcRenderer {
  constructor() {
    this.listeners = new Map();
    this.version = 'web';
  }

  on(channel, handler) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
    }
    this.listeners.get(channel).push(handler);
  }

  emit(channel, payload) {
    const handlers = this.listeners.get(channel) || [];
    handlers.forEach((handler) => handler({ sender: 'web' }, payload));
  }

  send(channel) {
    if (channel === 'init') {
      this.handleInit();
      return;
    }

    if (channel === 'updateranking') {
      this.handleUpdateRanking();
    }
  }

  async invoke(channel, ...args) {
    if (channel === 'getAppversion') {
      return this.handleGetVersion();
    }

    if (channel === 'flipfavorite') {
      return this.handleFlipFavorite(args[0]);
    }

    if (channel === 'getplayerdata') {
      return this.handleGetPlayer(args[0]);
    }

    return null;
  }

  async handleGetVersion() {
    try {
      const health = await apiClient.getHealth();
      this.version = health.version || 'web';
      return this.version;
    } catch (_error) {
      return this.version;
    }
  }

  async handleInit() {
    try {
      this.emit('spinnertext', [true, 'Getting rankings from server. This may take a while...']);
      const data = await apiClient.getRanking(11);
      this.emit('clearmsg', 'readerror');
      this.emit('initdata', {
        ...data,
        favorites: Object.keys(getFavoriteStore())
      });
    } catch (error) {
      this.emit('showmsg', [error.message, false, 'bg-danger', 'readerror']);
      this.emit('sendtohome');
    } finally {
      this.emit('spinnertext', [false, '']);
    }
  }

  async handleUpdateRanking() {
    try {
      this.emit('spinnertext', [true, 'Getting rankings from server. This may take a while...']);
      const data = await apiClient.getRanking(11);
      this.emit('clearmsg', 'readerror');
      this.emit('initranking', {
        ...data,
        favorites: Object.keys(getFavoriteStore())
      });
    } catch (error) {
      this.emit('showmsg', [error.message, false, 'bg-danger', 'readerror']);
    } finally {
      this.emit('spinnertext', [false, '']);
    }
  }

  async handleGetPlayer(playerId) {
    if (!playerId) {
      this.emit('showmsg', ['No player provided', false, 'bg-danger', 'readerror']);
      return null;
    }

    try {
      this.emit('spinnertext', [true, 'Fetching Player Data']);
      this.emit('clearmsg', 'readerror');
      return await apiClient.getPlayer(playerId);
    } catch (error) {
      this.emit('showmsg', [error.message, false, 'bg-danger', 'readerror']);
      return null;
    } finally {
      this.emit('spinnertext', [false, '']);
    }
  }

  handleFlipFavorite(id) {
    const key = String(id);
    const store = getFavoriteStore();

    if (store[key] === undefined) {
      store[key] = true;
      setFavoriteStore(store);
      return true;
    }

    delete store[key];
    setFavoriteStore(store);
    return false;
  }
}

export function createWebIpcRenderer() {
  return new WebIpcRenderer();
}
