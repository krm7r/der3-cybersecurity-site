import { t } from './locale.js';

export const toolLinks = [
  ['links', '/tools/links', 'link'],
  ['news', '/tools/news', 'news'],
  ['messages', '/tools/messages', 'message'],
  ['phone', '/tools/phone', 'phone'],
  ['password', '/tools/password', 'lock'],
  ['generator', '/tools/generator', 'key'],
  ['breach', '/tools/breach', 'shield'],
  ['search', '/tools/search', 'search']
];

const pageFiles = {
  '/': 'home.html',
  '/tools/links': 'tools-links.html',
  '/tools/news': 'tools-news.html',
  '/tools/messages': 'tools-messages.html',
  '/tools/phone': 'tools-phone.html',
  '/tools/password': 'tools-password.html',
  '/tools/generator': 'tools-generator.html',
  '/tools/breach': 'tools-breach.html',
  '/tools/search': 'tools-search.html',
  '/chat': 'chat.html',
  '/quiz': 'quiz.html',
  '/history': 'history.html',
  '/reports': 'reports.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
  '/about': 'about.html'
};

const paths = {
  '/': 'overview', '/chat': 'chat', '/quiz': 'quiz', '/history': 'history',
  '/reports': 'reports', '/privacy': 'privacy', '/terms': 'terms', '/about': 'about'
};

const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/>',
  news: '<path d="M4 4h16v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  message: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-2 2v-6a7.5 7.5 0 1 1 17-3.5Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3"/>',
  key: '<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 9-9M17 6l3 3M14 9l3 3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-2 2v-6a7.5 7.5 0 1 1 17-3.5Z"/>',
  quiz: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5v-12Z"/><path d="M4 16.5A2.5 2.5 0 0 1 6.5 14H20M8 7h8M8 10h5"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  report: '<path d="M5 3h14v18l-7-4-7 4V3Z"/><path d="M9 8h6M9 12h6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  shield: '<path d="M12 3 20 6v6.5c0 5.1-3.1 8.5-8 10.5-4.9-2-8-5.4-8-10.5V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  spark: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.8 1.7c-1 .9-1.6 1.3-1.6 2.8M12 17h.01"/>',
  trend: '<path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L9 10.8a16 16 0 0 0 4.2 4.2l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>'
};

export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.shield}</svg>`;
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function sectionFor(route, lang) {
  return toolLinks.some(item => item[1] === route)
    ? t('tools', lang)
    : ['/chat', '/quiz'].includes(route)
      ? t('learn', lang)
      : ['/history', '/reports', '/about'].includes(route)
        ? t('space', lang)
        : t('home', lang);
}

export function titleFor(route, lang) {
  const tool = toolLinks.find(item => item[1] === route);
  return tool ? t(tool[0], lang) : t(paths[route] || 'overview', lang);
}

// These are static same-origin HTML fragments, not API calls or external services.
export async function renderPage(route) {
  const file = pageFiles[route] || pageFiles['/'];
  const response = await fetch(`/pages/${file}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Page template unavailable: ${file}`);
  return response.text();
}
