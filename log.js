export const LogLevel = Object.freeze({
  Debug: 0,
  Information: 1,
  Warning: 2,
  Error: 3,
});

const LogLevelStrings = Object.freeze({
  [LogLevel.Debug]: "DEBUG",
  [LogLevel.Information]: "INFO",
  [LogLevel.Warning]: "WARN",
  [LogLevel.Error]: "ERROR",
});

export function log(level, ...message) {
  const writeMethod = level > LogLevel.Error ? console.error : console.log;

  const timestamp = new Date().toISOString();
  writeMethod(`[${timestamp}] ${LogLevelStrings[level]}`, ...message);
}

export function debug(...message) {
  log(LogLevel.Debug, ...message);
}

export function information(...message) {
  log(LogLevel.Information, ...message);
}

export function warning(...message) {
  log(LogLevel.Warning, ...message);
}

export function error(...message) {
  log(LogLevel.Error, ...message);
}
