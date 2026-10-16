const menuButton = document.querySelector('[data-menu-button]');
const navigation = document.querySelector('[data-navigation]');
menuButton?.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!expanded));
  menuButton.setAttribute('aria-label', expanded ? '打开菜单' : '关闭菜单');
  navigation?.classList.toggle('is-open', !expanded);
});
navigation?.addEventListener('click', event => {
  if (event.target.closest('a')) {
    menuButton?.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('is-open');
  }
});

const hotkey = document.querySelector('[data-search-hotkey]');
if (hotkey && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)) hotkey.textContent = '⌘K';

const searchModal = document.querySelector('[data-search-modal]');
const searchInput = document.querySelector('[data-search-input]');
const searchResults = document.querySelector('[data-search-results]');
const searchOpeners = document.querySelectorAll('[data-search-open]');
let searchItems = null;
let activeIndex = 0;

async function loadSearch() {
  if (searchItems) return searchItems;
  const res = await fetch('/search.json');
  searchItems = await res.json();
  return searchItems;
}

function scoreItem(item, query) {
  const q = query.toLocaleLowerCase('zh-CN');
  const title = String(item.title || '').toLocaleLowerCase('zh-CN');
  const desc = String(item.description || '').toLocaleLowerCase('zh-CN');
  const section = String(item.section || '').toLocaleLowerCase('zh-CN');
  const headings = (item.headings || []).join(' ').toLocaleLowerCase('zh-CN');
  let score = 0;
  if (title.includes(q)) score += 12;
  if (title.startsWith(q)) score += 6;
  if (section.includes(q)) score += 3;
  if (desc.includes(q)) score += 2;
  if (headings.includes(q)) score += 4;
  return score;
}

function renderSearch(query) {
  if (!searchResults || !searchItems) return;
  const q = query.trim();
  if (!q) {
    searchResults.innerHTML = '<li class="muted" style="padding:10px 12px">输入关键词开始搜索</li>';
    return;
  }
  const ranked = searchItems
    .map(item => ({item, score: scoreItem(item, q)}))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'zh-CN'))
    .slice(0, 12);
  if (!ranked.length) {
    searchResults.innerHTML = '<li class="muted" style="padding:10px 12px">没有匹配结果</li>';
    return;
  }
  activeIndex = 0;
  searchResults.innerHTML = ranked.map((row, i) => `<li><a href="${row.item.url}" class="${i === 0 ? 'is-active' : ''}" data-search-hit>
    <strong>${row.item.title}</strong>
    <span>${row.item.section || ''} ${row.item.description || ''}</span>
  </a></li>`).join('');
}

function closeSearch() {
  if (!searchModal) return;
  searchModal.hidden = true;
  document.body.style.overflow = '';
}

async function openSearch() {
  if (!searchModal) return;
  searchModal.hidden = false;
  document.body.style.overflow = 'hidden';
  try { await loadSearch(); } catch { searchItems = []; }
  searchInput?.focus();
  searchInput?.select();
  renderSearch(searchInput?.value || '');
}

searchOpeners.forEach(btn => btn.addEventListener('click', openSearch));
searchModal?.addEventListener('click', event => {
  if (event.target === searchModal) closeSearch();
});
searchInput?.addEventListener('input', () => renderSearch(searchInput.value));

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (searchModal && !searchModal.hidden) closeSearch();
    else openSearch();
    return;
  }
  if (!searchModal || searchModal.hidden) return;
  const hits = [...searchResults.querySelectorAll('[data-search-hit]')];
  if (event.key === 'Escape') { event.preventDefault(); closeSearch(); }
  if (event.key === 'ArrowDown' && hits.length) {
    event.preventDefault();
    activeIndex = (activeIndex + 1) % hits.length;
  }
  if (event.key === 'ArrowUp' && hits.length) {
    event.preventDefault();
    activeIndex = (activeIndex - 1 + hits.length) % hits.length;
  }
  hits.forEach((hit, i) => hit.classList.toggle('is-active', i === activeIndex));
  if (event.key === 'Enter' && hits[activeIndex]) {
    event.preventDefault();
    window.location.href = hits[activeIndex].getAttribute('href');
  }
});

function initDemo() {
  const root = document.querySelector('[data-demo]');
  if (!root) return;
  const tabs = [...root.querySelectorAll('[data-demo-tab]')];
  const panels = [...root.querySelectorAll('[data-demo-panel]')];
  if (!tabs.length || !panels.length) return;
  let index = 0;
  let timer = 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function show(next) {
    index = (next + panels.length) % panels.length;
    tabs.forEach((tab, i) => {
      tab.classList.toggle('is-active', i === index);
      tab.setAttribute('aria-selected', String(i === index));
    });
    panels.forEach((panel, i) => {
      panel.hidden = i !== index;
      panel.classList.toggle('is-active', i === index);
    });
  }
  function start() {
    if (reduce || panels.length < 2) return;
    stop();
    timer = window.setInterval(() => show(index + 1), 7000);
  }
  function stop() { window.clearInterval(timer); }
  tabs.forEach((tab, i) => tab.addEventListener('click', () => { show(i); start(); }));
  root.addEventListener('mouseenter', stop);
  root.addEventListener('mouseleave', start);
  start();
}
initDemo();

document.addEventListener('click', async event => {
  const btn = event.target.closest('[data-copy]');
  if (!btn) return;
  const code = btn.closest('.code-block')?.querySelector('code');
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code.textContent || '');
    btn.textContent = '已复制';
    window.setTimeout(() => { btn.textContent = '复制'; }, 1500);
  } catch {
    btn.textContent = '复制失败';
  }
});

function initToc() {
  const links = [...document.querySelectorAll('[data-toc] a')];
  if (!links.length) return;
  const items = links.map(link => {
    const id = decodeURIComponent((link.hash || '').slice(1));
    return {link, el: document.getElementById(id)};
  }).filter(item => item.el);
  if (!items.length) return;
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting);
    if (!visible.length) return;
    const id = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0].target.id;
    links.forEach(link => {
      const hid = decodeURIComponent((link.hash || '').slice(1));
      link.classList.toggle('is-active', hid === id);
    });
  }, {rootMargin: '-90px 0px -65% 0px', threshold: 0});
  items.forEach(item => observer.observe(item.el));
}
initToc();

const guideSearch = document.querySelector('[data-guide-search]');
const guideCards = [...document.querySelectorAll('[data-guide-card]')];
const guideFilters = [...document.querySelectorAll('[data-guide-filter]')];
const guideStatus = document.querySelector('[data-search-status]');
const guideEmpty = document.querySelector('[data-search-empty]');
let selectedCategory = '全部';

function filterGuides() {
  if (!guideCards.length) return;
  const query = guideSearch?.value.trim().toLocaleLowerCase('zh-CN') || '';
  let visible = 0;
  for (const card of guideCards) {
    const matchesCategory = selectedCategory === '全部' || card.dataset.category === selectedCategory;
    const matchesQuery = !query || (card.dataset.search || '').toLocaleLowerCase('zh-CN').includes(query);
    card.hidden = !(matchesCategory && matchesQuery);
    if (!card.hidden) visible += 1;
  }
  if (guideStatus) guideStatus.textContent = `找到 ${visible} 篇教程`;
  if (guideEmpty) guideEmpty.hidden = visible !== 0;
}
guideSearch?.addEventListener('input', filterGuides);
for (const filter of guideFilters) {
  filter.addEventListener('click', () => {
    selectedCategory = filter.dataset.guideFilter;
    for (const item of guideFilters) item.setAttribute('aria-pressed', String(item === filter));
    filterGuides();
  });
}

const starNodes = [...document.querySelectorAll('[data-stars][data-repo]')];
const starCache = new Map();
for (const el of starNodes) {
  const repo = el.dataset.repo;
  if (!repo) continue;
  if (!starCache.has(repo)) {
    starCache.set(repo, fetch(`https://api.github.com/repos/${repo}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => data && data.stargazers_count != null ? data.stargazers_count : null)
      .catch(() => null));
  }
  starCache.get(repo).then(count => {
    if (count == null) return;
    el.textContent = count;
    const box = el.closest('.stars');
    if (box) box.hidden = false;
  });
}

const kindFilters = [...document.querySelectorAll('[data-kind-filter]')];
const caseItems = [...document.querySelectorAll('[data-case-item]')];
function filterCases(kind) {
  for (const item of caseItems) {
    item.hidden = kind !== '全部' && item.dataset.kind !== kind;
  }
  document.querySelectorAll('[data-month-group]').forEach(group => {
    const visible = [...group.querySelectorAll('[data-case-item]')].some(item => !item.hidden);
    group.hidden = !visible;
  });
}
for (const filter of kindFilters) {
  filter.addEventListener('click', () => {
    const kind = filter.dataset.kindFilter;
    for (const item of kindFilters) item.setAttribute('aria-pressed', String(item === filter));
    filterCases(kind);
  });
}
