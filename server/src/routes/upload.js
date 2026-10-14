/**
 * 文件上传（本地 static）
 * POST /upload  无额外依赖，手动读 req stream
 * query: ?type=image|voice&ext=jpg
 * header 也可以传: X-Upload-Type / X-Upload-Ext
 */
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import config from '../config/index.js';
import logger from '../utils/logger.js';
import { ok, AppError } from '../utils/response.js';

const router = express.Router();

function parseUploadParams(req) {
  const type = (req.query.type || req.header('x-upload-type') || '').toLowerCase();
  const ext = (req.query.ext || req.header('x-upload-ext') || '').toLowerCase().replace(/^\./, '');
  return { type, ext };
}

function validateParams(type, ext) {
  const allowedImage = config.upload.allowedImageExts;
  const allowedVoice = config.upload.allowedVoiceExts;

  if (!type || !ext) throw new AppError('missing upload params: type / ext', 4001, 400);
  if (type === 'image') {
    if (!allowedImage.includes(ext)) throw new AppError(`image ext not allowed: ${ext}`, 4002, 400);
    return { type, ext, maxSize: config.upload.maxImageSize };
  }
  if (type === 'voice') {
    if (!allowedVoice.includes(ext)) throw new AppError(`voice ext not allowed: ${ext}`, 4003, 400);
    return { type, ext, maxSize: config.upload.maxVoiceSize };
  }
  throw new AppError(`unsupported type: ${type}`, 4004, 400);
}

/** 手动读原始 body（Express 4 req 是 Readable stream） */
function readRawBody(req, maxSize) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new AppError('file too large', 4101, 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

/** 魔数校验：文件头必须与声明的扩展名一致，防止伪造扩展名的恶意文件 */
const MAGIC_CHECKERS = {
  jpg: (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  jpeg: (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  png: (buf) => buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
  gif: (buf) => buf.subarray(0, 4).toString('latin1') === 'GIF8',
  webp: (buf) => buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP',
  mp3: (buf) => buf.subarray(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0),
  wav: (buf) => buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE',
  amr: (buf) => buf.subarray(0, 5).toString('latin1') === '#!AMR',
};

function assertMagicBytes(ext, buf) {
  const checker = MAGIC_CHECKERS[ext];
  if (!checker) return; // 无已知魔数的扩展名跳过
  if (!checker(buf)) {
    throw new AppError(`file content does not match extension: ${ext} (magic bytes mismatch)`, 4005, 400);
  }
}

router.post('/', async (req, res, next) => {
  try {
    const { type, ext } = parseUploadParams(req);
    const { ext: validExt, maxSize } = validateParams(type, ext);

    const buf = await readRawBody(req, maxSize);
    if (buf.length === 0) throw new AppError('empty body', 4102, 400);
    assertMagicBytes(validExt, buf);

    const now = new Date();
    const yyyyMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const uid = req.user.uid;
    const filename = `${crypto.randomUUID()}.${validExt}`;
    const relative = `${config.upload.dir}/${uid}/${yyyyMM}/${filename}`;
    const absPath = path.resolve(process.cwd(), relative);

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buf);

    const url = `/static/${relative.replace(/\\/g, '/')}`;
    return ok(res, { url, size: buf.length, ext: validExt });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    logger.error('[UPLOAD]', err.message);
    next(new AppError(err.message, 4000, 500));
  }
});

export default router;
