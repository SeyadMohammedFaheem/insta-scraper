/**
 * Tiny coloured logger — zero dependencies.
 */

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
};

function ts() {
  return COLORS.dim + new Date().toISOString() + COLORS.reset;
}

const logger = {
  info: (...args) => console.log(ts(), COLORS.cyan + '●' + COLORS.reset, ...args),
  success: (...args) => console.log(ts(), COLORS.green + '✔' + COLORS.reset, ...args),
  warn: (...args) => console.warn(ts(), COLORS.yellow + '⚠' + COLORS.reset, ...args),
  error: (...args) => console.error(ts(), COLORS.red + '✖' + COLORS.reset, ...args),
  debug: (...args) => {
    if (process.env.DEBUG) console.log(ts(), COLORS.magenta + '⊙' + COLORS.reset, ...args);
  },
  banner: (text) => {
    const line = '─'.repeat(50);
    console.log(`\n${COLORS.cyan}${line}${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.cyan}  ${text}${COLORS.reset}`);
    console.log(`${COLORS.cyan}${line}${COLORS.reset}\n`);
  },
};

export default logger;
