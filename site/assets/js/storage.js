const PREFIX = 'der3:v1:';

function safeRead(key, fallback) {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getPreference(key, fallback = null) {
  return safeRead(`pref:${key}`, fallback);
}

export function setPreference(key, value) {
  return safeWrite(`pref:${key}`, value);
}

export function getUser() {
  return safeRead('user', { name: 'ضيف', mode: 'guest' });
}

export function setUser(user) {
  return safeWrite('user', user);
}

export function getActivities() {
  const value = safeRead('activity', []);
  return Array.isArray(value) ? value : [];
}

export function recordActivity({ type, title, verdict = '', score = null }) {
  const activities = getActivities();
  activities.unshift({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: String(type).slice(0, 32),
    title: String(title).slice(0, 100),
    verdict: String(verdict).slice(0, 40),
    score: Number.isFinite(score) ? score : null,
    createdAt: new Date().toISOString()
  });
  return safeWrite('activity', activities.slice(0, 100));
}

export function clearActivities() {
  try {
    localStorage.removeItem(PREFIX + 'activity');
    return true;
  } catch {
    return false;
  }
}

export function clearQuizResults() {
  try {
    localStorage.removeItem(PREFIX + 'quiz-results');
    return true;
  } catch {
    return false;
  }
}

export function getQuizResults() {
  const value = safeRead('quiz-results', []);
  return Array.isArray(value) ? value : [];
}

export function recordQuizResult(result) {
  const results = getQuizResults();
  results.unshift({ ...result, createdAt: new Date().toISOString() });
  return safeWrite('quiz-results', results.slice(0, 30));
}

export function getReports() {
  const value = safeRead('reports', []);
  return Array.isArray(value) ? value : [];
}

export function recordReport(report) {
  const reports = getReports();
  reports.unshift({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}`,
    category: String(report.category).slice(0, 50),
    title: String(report.title).slice(0, 120),
    createdAt: new Date().toISOString()
  });
  return safeWrite('reports', reports.slice(0, 30));
}

export function clearReports() {
  try {
    localStorage.removeItem(PREFIX + 'reports');
    return true;
  } catch {
    return false;
  }
}
