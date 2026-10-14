/**
 * 内容风控：敏感词过滤（服务端统一打码）
 * - 内置基础词表，可通过环境变量 SENSITIVE_WORDS（逗号分隔）追加
 * - 在 MSG_CHAT 入库/路由前对 text 内容打码，保证各端看到同一份净化内容
 */
const BASE_WORDS = ['赌博', '诈骗', '色情', '暴力', '毒品', '枪支', '洗钱', '传销'];

const extra = (process.env.SENSITIVE_WORDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// 长词优先，避免短词先替换破坏长词匹配
const words = [...new Set([...BASE_WORDS, ...extra])].sort((a, b) => b.length - a.length);

/** 将文本中的敏感词替换为等长星号 */
export function maskText(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const w of words) {
    if (out.includes(w)) out = out.split(w).join('*'.repeat(w.length));
  }
  return out;
}

export default { maskText };
