/**
 * MongoDB / JSON 文件 fallback 双模式
 *
 * STORAGE_MODE=real     → mongoose 按月分集合
 * STORAGE_MODE=fallback → JSON 文件 `data/messages_YYYYMM.json`
 *                          文件格式：{ "seqId_1": {...}, "seqId_2": {...} }
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import config from '../config/index.js';
import logger from '../utils/logger.js';

// —— Schema（real 模式用；fallback 只用来定义字段，不真正创建 model）——
export const MessageSchema = new mongoose.Schema(
  {
    seqId: { type: String, required: true, unique: true },
    fromId: { type: String, required: true, index: true },
    fromType: { type: String, enum: ['user', 'system'], default: 'user' },
    toId: { type: String, required: true, index: true },
    toType: { type: String, enum: ['single', 'group'], required: true, index: true },
    contentType: {
      type: String,
      enum: ['text', 'image', 'voice', 'system', 'recall'],
      required: true,
    },
    content: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent', index: true },
    originalContent: { type: mongoose.Schema.Types.Mixed },
    recalledAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

MessageSchema.index({ fromId: 1, toId: 1, createdAt: 1 });
MessageSchema.index({ toId: 1, toType: 1, createdAt: 1 });

// —— real 模式连接 ——
let connected = false;
let mongooseInit = false;
async function _connectReal() {
  if (connected) return;
  try {
    await mongoose.connect(config.mongo.uri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
    });
    connected = true;
    mongooseInit = true;
    logger.info('[MongoDB] connected successfully');
  } catch (err) {
    logger.warn(`[MongoDB] connection failed: ${err.message}. 可切 STORAGE_MODE=fallback 绕过`);
  }
}

// —— fallback 模式：JSON 文件 + 简单写锁 ——
let fileInit = false;
const _locks = new Map(); // key→Promise，串行写同一个文件
async function _lock(key, fn) {
  let prev = _locks.get(key) || Promise.resolve();
  const p = prev.then(fn, fn);
  _locks.set(key, p.catch(() => {}));
  return p;
}

function _ymFile(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return path.resolve(process.cwd(), config.storage.dataDir, `messages_${y}${m}.json`);
}

async function _readFile(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function _writeFile(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function _toDoc(obj) {
  // JSON 里 Date 存成 ISO 字符串，读出来转 Date 对象
  const d = { ...obj };
  for (const f of ['createdAt', 'updatedAt', 'recalledAt']) {
    if (typeof d[f] === 'string') d[f] = new Date(d[f]);
  }
  return d;
}

// —— real 模式 helpers ——
function _formatYM(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `messages_${y}${m}`;
}
function _getRealModel(date) {
  const name = _formatYM(date);
  if (mongoose.models[name]) return mongoose.models[name];
  return mongoose.model(name, MessageSchema, name);
}

// —— 对外 API ——
export async function connectMongo() {
  if (config.storage.mode === 'real') {
    await _connectReal();
  } else {
    logger.info(`[MongoDB] 走 fallback(JSON 文件) 模式`);
    fileInit = true;
  }
}

export function getCurrentMessageCollection() {
  return getCollectionByDate(new Date());
}

export function getCollectionByDate(date) {
  if (config.storage.mode === 'real' && mongooseInit) return _getRealModel(date);
  // fallback 下返回一个 fake Model，让 upsertMessage/findMessageBySeqId 统一用
  return { __date: date };
}

export async function upsertMessage(payload) {
  if (config.storage.mode === 'real' && connected) {
    const Model = getCurrentMessageCollection();
    const { seqId, ...rest } = payload;
    return Model.updateOne(
      { seqId },
      { $setOnInsert: { ...rest, createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true }
    );
  }
  // fallback
  const now = new Date();
  const file = _ymFile(now);
  return _lock(file, async () => {
    const data = await _readFile(file);
    const key = String(payload.seqId);
    if (!data[key]) {
      data[key] = {
        ...payload,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      await _writeFile(file, data);
    }
    return { matchedCount: data[key] ? 1 : 0 };
  });
}

export async function updateMessage(seqId, $setPayload) {
  if (config.storage.mode === 'real' && connected) {
    const now = new Date();
    const offsets = Array.from({ length: 3 }, (_, i) => -i);
    for (const off of offsets) {
      const Model = getCollectionByDate(
        new Date(now.getFullYear(), now.getMonth() + off, 1)
      );
      const result = await Model.updateOne(
        { seqId },
        { $set: { ...$setPayload, updatedAt: new Date() } }
      );
      if (result.matchedCount > 0) return result;
    }
    return { matchedCount: 0 };
  }
  // fallback：跨近 3 月文件找
  const now = new Date();
  const offsets = Array.from({ length: 3 }, (_, i) => -i);
  for (const off of offsets) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const file = _ymFile(d);
    const res = await _lock(file, async () => {
      const data = await _readFile(file);
      const key = String(seqId);
      if (!data[key]) return null;
      data[key] = {
        ...data[key],
        ...$setPayload,
        updatedAt: new Date().toISOString(),
      };
      await _writeFile(file, data);
      return data[key];
    });
    if (res) return { matchedCount: 1 };
  }
  return { matchedCount: 0 };
}

export async function findMessageBySeqId(seqId) {
  if (config.storage.mode === 'real' && connected) {
    const now = new Date();
    for (const off of [0, -1, -2]) {
      const Model = getCollectionByDate(
        new Date(now.getFullYear(), now.getMonth() + off, 1)
      );
      const doc = await Model.findOne({ seqId }).lean();
      if (doc) return doc;
    }
    return null;
  }
  const now = new Date();
  for (const off of [0, -1, -2]) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const file = _ymFile(d);
    const data = await _readFile(file);
    const key = String(seqId);
    if (data[key]) return _toDoc(data[key]);
  }
  return null;
}

export async function fetchMessagesAfter(toId, toType, lastMsgSeqId, limit = 200) {
  if (config.storage.mode === 'real' && connected) {
    const now = new Date();
    const results = [];
    for (const off of [0, -1, -2]) {
      const Model = getCollectionByDate(
        new Date(now.getFullYear(), now.getMonth() + off, 1)
      );
      const rows = await Model.find({
        toId, toType, seqId: { $gt: String(lastMsgSeqId) },
      }).sort({ seqId: 1 }).limit(limit).lean();
      results.push(...rows);
    }
    results.sort((a, b) => Number(a.seqId) - Number(b.seqId));
    return results.slice(0, limit);
  }
  // fallback
  const now = new Date();
  const all = [];
  for (const off of [0, -1, -2]) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const data = await _readFile(_ymFile(d));
    for (const v of Object.values(data)) {
      if (String(v.toId) === String(toId) && v.toType === toType && Number(v.seqId) > Number(lastMsgSeqId)) {
        all.push(_toDoc(v));
      }
    }
  }
  all.sort((a, b) => Number(a.seqId) - Number(b.seqId));
  return all.slice(0, limit);
}

export async function fetchHistory({ accessor, peerId, toType, cursor, limit = 50 }) {
  if (config.storage.mode === 'real' && connected) {
    const now = new Date();
    const results = [];
    const filter = toType === 'single'
      ? { $or: [
          { fromId: accessor, toId: peerId },
          { fromId: peerId, toId: accessor },
        ] }
      : { toId: accessor, toType };
    for (const off of Array.from({ length: 6 }, (_, i) => -i)) {
      const Model = getCollectionByDate(
        new Date(now.getFullYear(), now.getMonth() + off, 1)
      );
      const rows = await Model.find({
        ...filter,
        seqId: cursor ? { $lt: String(cursor) } : {},
      }).sort({ seqId: -1 }).limit(limit).lean();
      results.push(...rows);
    }
    results.sort((a, b) => Number(b.seqId) - Number(a.seqId));
    return results.slice(0, limit);
  }
  // fallback（JSON 存储中 ID 为字符串，统一转字符串比较，避免数字/字符串类型不一致漏数据）
  const now = new Date();
  const all = [];
  const acc = String(accessor);
  const peer = peerId == null ? '' : String(peerId);
  for (const off of Array.from({ length: 6 }, (_, i) => -i)) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const data = await _readFile(_ymFile(d));
    for (const v of Object.values(data)) {
      let match;
      if (toType === 'single') {
        match = (String(v.fromId) === acc && String(v.toId) === peer) ||
                (String(v.fromId) === peer && String(v.toId) === acc);
      } else {
        match = String(v.toId) === acc && v.toType === toType;
      }
      if (!match) continue;
      if (cursor && Number(v.seqId) >= Number(cursor)) continue;
      all.push(_toDoc(v));
    }
  }
  all.sort((a, b) => Number(b.seqId) - Number(a.seqId));
  return all.slice(0, limit);
}

/**
 * 扫描近 6 个月消息文件，返回当前最大 seqId（数字）。fallback 模式用于播种全局计数器。
 */
export async function getMaxSeqId() {
  const now = new Date();
  let max = 0;
  for (const off of Array.from({ length: 6 }, (_, i) => -i)) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const data = await _readFile(_ymFile(d));
    for (const v of Object.values(data)) {
      const n = Number(v.seqId);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

/**
 * 统计当前用户在某会话中未读（toId=自己 且 status != read）的消息数
 * @param {string} accessor 当前用户 uid
 * @param {string} peerId   单聊对方 id（群聊传 groupId）
 * @param {'single'|'group'} toType
 */
export async function countUnread(accessor, peerId, toType) {
  const acc = String(accessor);
  const peer = String(peerId);
  const now = new Date();
  let count = 0;
  for (const off of [0, -1, -2]) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const data = await _readFile(_ymFile(d));
    for (const v of Object.values(data)) {
      if (String(v.toId) !== acc) continue;
      if (String(v.fromId) !== peer) continue;
      if (v.toType !== toType) continue;
      if (v.status === 'read') continue;
      count++;
    }
  }
  return count;
}

/**
 * 聚合当前用户的会话摘要（单聊 + 群聊）
 * 返回每个会话的"最后一条消息"，按 seqId 倒序。
 * 单聊：从 accessor 视角，peer = 对方 id（fromId/toId 中非 accessor 的那个）
 * 群聊：toId = groupId
 * @param {string} accessor 当前用户 uid
 */
export async function fetchSessionSummaries(accessor) {
  const acc = String(accessor);
  const now = new Date();
  const byConv = new Map(); // convKey -> doc

  // 群消息存储的 toId 是 groupId 而非成员 uid，需按"我所在的群"判断可见性
  const { listGroupsByUser } = await import('../models/mysql/Member.js');
  const myGroups = new Set((await listGroupsByUser(acc)).map((g) => String(g)));

  for (const off of Array.from({ length: 6 }, (_, i) => -i)) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const data = await _readFile(_ymFile(d));
    for (const v of Object.values(data)) {
      const fromId = String(v.fromId ?? '');
      const toId = String(v.toId ?? '');
      let convKey, peerId, type;
      if (v.toType === 'group') {
        // 群聊：发送方本人 或 该群成员可见
        if (fromId !== acc && !myGroups.has(toId)) continue;
        type = 'group';
        peerId = toId;
        convKey = `g_${toId}`;
      } else {
        // 单聊：涉及 accessor 才计入
        if (fromId !== acc && toId !== acc) continue;
        type = 'single';
        peerId = fromId === acc ? toId : fromId;
        convKey = `u_${peerId}`;
      }
      const prev = byConv.get(convKey);
      if (!prev || Number(v.seqId) > Number(prev.seqId)) {
        byConv.set(convKey, { ..._toDoc(v), __convKey: convKey, __type: type, __peerId: peerId });
      }
    }
  }

  const list = Array.from(byConv.values()).sort(
    (a, b) => Number(b.seqId) - Number(a.seqId)
  );
  return list;
}

export async function closeMongo() {
  if (connected) await mongoose.disconnect();
}

export default {
  connectMongo,
  getCurrentMessageCollection,
  getCollectionByDate,
  upsertMessage,
  updateMessage,
  findMessageBySeqId,
  fetchMessagesAfter,
  fetchHistory,
  fetchSessionSummaries,
  closeMongo,
  MessageSchema,
};
