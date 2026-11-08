import { type Collection, type Db, MongoClient } from 'mongodb';
import type { HistoryRecord, LikeRecord, RefreshTokenRecord, Store, UserPlaylistRecord, UserRecord } from './types.js';

const HISTORY_CAP = 200;

type WithMongoId<T> = T & { _id?: unknown };
const strip = <T>(doc: WithMongoId<T> | null): T | null => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  void _id;
  return rest as T;
};

/**
 * MongoDB-backed store (works with Atlas free tier). The client is cached on
 * globalThis so serverless platforms reuse one connection across invocations.
 */
export function createMongoStore(uri: string, dbName: string): Store {
  const g = globalThis as unknown as { __auraMongo?: Promise<MongoClient> };
  let db: Db;
  let users: Collection<UserRecord>;
  let tokens: Collection<RefreshTokenRecord>;
  let likes: Collection<LikeRecord>;
  let playlists: Collection<UserPlaylistRecord>;
  let history: Collection<HistoryRecord>;

  return {
    async init() {
      g.__auraMongo ??= new MongoClient(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
        retryWrites: true,
      }).connect();
      const client = await g.__auraMongo;
      db = client.db(dbName);
      users = db.collection('users');
      tokens = db.collection('refresh_tokens');
      likes = db.collection('likes');
      playlists = db.collection('playlists');
      history = db.collection('history');
      await Promise.all([
        users.createIndex({ id: 1 }, { unique: true }),
        users.createIndex({ email: 1 }, { unique: true }),
        tokens.createIndex({ id: 1 }, { unique: true }),
        tokens.createIndex({ familyId: 1 }),
        tokens.createIndex({ userId: 1 }),
        // Mongo deletes expired refresh tokens for us.
        tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        likes.createIndex({ userId: 1, trackId: 1 }, { unique: true }),
        likes.createIndex({ userId: 1, createdAt: -1 }),
        playlists.createIndex({ id: 1 }, { unique: true }),
        playlists.createIndex({ userId: 1, updatedAt: -1 }),
        history.createIndex({ userId: 1, playedAt: -1 }),
      ]);
    },
    async close() {
      if (g.__auraMongo) {
        const c = await g.__auraMongo;
        await c.close();
        g.__auraMongo = undefined;
      }
    },

    async createUser(u) {
      await users.insertOne({ ...u });
    },
    async findUserByEmail(email) {
      return strip(await users.findOne({ email }));
    },
    async findUserById(id) {
      return strip(await users.findOne({ id }));
    },
    async updateUser(id, patch) {
      await users.updateOne({ id }, { $set: patch });
    },
    async deleteUser(id) {
      await Promise.all([
        users.deleteOne({ id }),
        tokens.deleteMany({ userId: id }),
        likes.deleteMany({ userId: id }),
        playlists.deleteMany({ userId: id }),
        history.deleteMany({ userId: id }),
      ]);
    },

    async saveRefreshToken(t) {
      await tokens.insertOne({ ...t });
    },
    async findRefreshToken(id) {
      return strip(await tokens.findOne({ id }));
    },
    async revokeRefreshToken(id, replacedBy) {
      const r = await tokens.updateOne(
        { id, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), ...(replacedBy ? { replacedBy } : {}) } },
      );
      return r.modifiedCount === 1;
    },
    async revokeFamily(familyId) {
      await tokens.updateMany({ familyId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    },
    async revokeAllForUser(userId) {
      await tokens.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    },

    async listLikes(userId, limit, before) {
      const docs = await likes
        .find({ userId, ...(before ? { createdAt: { $lt: before } } : {}) })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      return docs.map((d) => strip(d)!);
    },
    async addLike(l) {
      await likes.updateOne({ userId: l.userId, trackId: l.trackId }, { $setOnInsert: l }, { upsert: true });
    },
    async removeLike(userId, trackId) {
      await likes.deleteOne({ userId, trackId });
    },
    async hasLikes(userId, trackIds) {
      const docs = await likes.find({ userId, trackId: { $in: trackIds } }, { projection: { trackId: 1 } }).toArray();
      return docs.map((d) => d.trackId);
    },

    async listPlaylists(userId) {
      const docs = await playlists.find({ userId }).sort({ updatedAt: -1 }).limit(500).toArray();
      return docs.map((d) => strip(d)!);
    },
    async getPlaylist(userId, id) {
      return strip(await playlists.findOne({ id, userId }));
    },
    async createPlaylist(p) {
      await playlists.insertOne({ ...p });
    },
    async updatePlaylist(userId, id, patch) {
      const doc = await playlists.findOneAndUpdate(
        { id, userId },
        { $set: { ...patch, updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return strip(doc);
    },
    async deletePlaylist(userId, id) {
      const r = await playlists.deleteOne({ id, userId });
      return r.deletedCount === 1;
    },
    async countPlaylists(userId) {
      return playlists.countDocuments({ userId });
    },

    async addHistory(h) {
      const last = await history.find({ userId: h.userId }).sort({ playedAt: -1 }).limit(1).next();
      if (last && last.track.id === h.track.id) await history.deleteOne({ _id: (last as WithMongoId<HistoryRecord>)._id as never });
      await history.insertOne({ ...h });
      // Trim to the newest HISTORY_CAP entries.
      const overflow = await history.find({ userId: h.userId }).sort({ playedAt: -1 }).skip(HISTORY_CAP).limit(1).next();
      if (overflow) await history.deleteMany({ userId: h.userId, playedAt: { $lte: overflow.playedAt } });
    },
    async listHistory(userId, limit) {
      const docs = await history.find({ userId }).sort({ playedAt: -1 }).limit(limit).toArray();
      return docs.map((d) => strip(d)!);
    },
  };
}
