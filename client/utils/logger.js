/**
 * 分级 logger：debug / info / warn / error
 * 生产环境可通过 LEVEL 调高屏蔽 debug
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL =
  import.meta.env?.PROD === true ? LEVELS.info : LEVELS.debug;

function shouldLog(level) {
  return LEVELS[level] >= CURRENT_LEVEL;
}

function make(level) {
  return (tag, ...args) => {
    if (!shouldLog(level)) return;
    const prefix = `[${new Date().toLocaleTimeString()}] ${tag}`;
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](prefix, ...args);
  };
}

const logger = {
  debug: make('debug'),
  info: make('info'),
  warn: make('warn'),
  error: make('error'),
};

export default logger;
