import type { HistoryRecord, LikeRecord, RefreshTokenRecord, Store, UserPlaylistRecord, UserRecord } from './types.js';

const HISTORY_CAP = 200;
const clone = <T>(v: T): T => structuredClone(v);

/** In-process store for development and tests. Data vanishes on restart. */
export function createMemoryStore(): Store {
  const users = new Map<string, UserRecord>();
  const emails = new Map<string, string>();
  const tokens = new Map<string, RefreshTokenRecord>();
  const likes = new Map<string, Map<string, LikeRecord>>();
  const playlists = new Map<string, UserPlaylistRecord>();
  const history = new Map<string, HistoryRecord[]>();

  return {
    async init() {},
    async close() {},

    async createUser(u) {
      if (emails.has(u.email)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      users.set(u.id, clone(u));
      emails.set(u.email, u.id);
    },
    async findUserByEmail(email) {
      const id = emails.get(email);
      return id ? clone(users.get(id) ?? null) : null;
    },
    async findUserById(id) {
      return clone(users.get(id) ?? null);
    },
    async updateUser(id, patch) {
      const u = users.get(id);
      if (u) Object.assign(u, patch);
    },
    async deleteUser(id) {
      const u = users.get(id);
      if (!u) return;
      users.delete(id);
      emails.delete(u.email);
      likes.delete(id);
      history.delete(id);
      for (const [pid, p] of playlists) if (p.userId === id) playlists.delete(pid);
      for (const [tid, t] of tokens) if (t.userId === id) tokens.delete(tid);
    },

    async saveRefreshToken(t) {
      tokens.set(t.id, clone(t));
    },
    async findRefreshToken(id) {
      return clone(tokens.get(id) ?? null);
    },
    async revokeRefreshToken(id, replacedBy) {
      const t = tokens.get(id);
      if (!t || t.revokedAt) return false;
      t.revokedAt = new Date();
      t.replacedBy = replacedBy;
      return true;
    },
    async revokeFamily(familyId) {
      const now = new Date();
      for (const t of tokens.values()) if (t.familyId === familyId && !t.revokedAt) t.revokedAt = now;
    },
    async revokeAllForUser(userId) {
      const now = new Date();
      for (const t of tokens.values()) if (t.userId === userId && !t.revokedAt) t.revokedAt = now;
    },

    async listLikes(userId, limit, before) {
      const all = [...(likes.get(userId)?.values() ?? [])]
        .filter((l) => !before || l.createdAt < before)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return clone(all.slice(0, limit));
    },
    async addLike(l) {
      let m = likes.get(l.userId);
      if (!m) likes.set(l.userId, (m = new Map()));
      if (!m.has(l.trackId)) m.set(l.trackId, clone(l));
    },
    async removeLike(userId, trackId) {
      likes.get(userId)?.delete(trackId);
    },
    async hasLikes(userId, trackIds) {
      const m = likes.get(userId);
      return m ? trackIds.filter((id) => m.has(id)) : [];
    },

    async listPlaylists(userId) {
      return clone(
        [...playlists.values()].filter((p) => p.userId === userId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      );
    },
    async getPlaylist(userId, id) {
      const p = playlists.get(id);
      return p && p.userId === userId ? clone(p) : null;
    },
    async createPlaylist(p) {
      playlists.set(p.id, clone(p));
    },
    async updatePlaylist(userId, id, patch) {
      const p = playlists.get(id);
      if (!p || p.userId !== userId) return null;
      Object.assign(p, clone(patch), { updatedAt: new Date() });
      return clone(p);
    },
    async deletePlaylist(userId, id) {
      const p = playlists.get(id);
      if (!p || p.userId !== userId) return false;
      playlists.delete(id);
      return true;
    },
    async countPlaylists(userId) {
      let n = 0;
      for (const p of playlists.values()) if (p.userId === userId) n++;
      return n;
    },

    async addHistory(h) {
      const list = history.get(h.userId) ?? [];
      // Collapse immediate repeats of the same track.
      if (list[0]?.track.id === h.track.id) list.shift();
      list.unshift(clone(h));
      history.set(h.userId, list.slice(0, HISTORY_CAP));
    },
    async listHistory(userId, limit) {
      return clone((history.get(userId) ?? []).slice(0, limit));
    },
  };
}
