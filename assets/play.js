const playRoot = document.querySelector('[data-play]');
if (playRoot) {
  const dataNode = document.getElementById('play-data');
  let payload = {rounds: []};
  try { payload = JSON.parse(dataNode?.textContent || '{}'); }
  catch { payload = {rounds: []}; }
  const rounds = Array.isArray(payload.rounds) ? payload.rounds : [];
  const ROUND_COUNT = Math.max(1, Number(payload.roundCount) || 5);
  const screens = {
    start: playRoot.querySelector('[data-play-screen="start"]'),
    round: playRoot.querySelector('[data-play-screen="round"]'),
    result: playRoot.querySelector('[data-play-screen="result"]'),
  };
  const progressEl = playRoot.querySelector('[data-play-progress]');
  const sceneEl = playRoot.querySelector('[data-play-scene]');
  const chatEl = playRoot.querySelector('[data-play-chat]');
  const questionEl = playRoot.querySelector('[data-play-question]');
  const optionsEl = playRoot.querySelector('[data-play-options]');
  const revealEl = playRoot.querySelector('[data-play-reveal]');
  const confidenceEl = playRoot.querySelector('[data-play-confidence]');
  const explainEl = playRoot.querySelector('[data-play-explain]');
  const msEl = playRoot.querySelector('[data-play-ms]');
  const nextBtn = playRoot.querySelector('[data-play-next]');
  const scoreEl = playRoot.querySelector('[data-play-score]');
  const blurbEl = playRoot.querySelector('[data-play-blurb]');
  const highEl = playRoot.querySelector('[data-play-high]');
  const reviewEl = playRoot.querySelector('[data-play-review]');
  const copyBtn = playRoot.querySelector('[data-play-copy]');
  const xLink = playRoot.querySelector('[data-play-x]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let index = 0;
  let shuffled = [];
  let answers = [];
  let pool = [];
  let revealed = false;
  let token = 0;
  let screen = 'start';

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function track(name, data) {
    if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, data);
  }

  function shuffle(list) {
    const next = list.slice();
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function showScreen(name) {
    screen = name;
    for (const [key, node] of Object.entries(screens)) {
      if (node) node.hidden = key !== name;
    }
  }

  function pct(value) {
    return Math.round((Number(value) || 0) * 100);
  }

  function optionByKey(round, key) {
    return (round.options || []).find(item => item.key === key);
  }

  function confidenceMeta(value) {
    const conf = Number(value) || 0;
    if (conf >= 0.75) return {tone: 'is-high', label: 'Jev 很有把握'};
    if (conf >= 0.5) return {tone: 'is-mid', label: 'Jev 比较有把握'};
    return {tone: 'is-low', label: 'Jev 也拿不准'};
  }

  function shareText(score) {
    return `我和 Jev 比了比谁更懂人话，一致 ${score}/${pool.length || ROUND_COUNT}。你也来试试：https://jevland.com/play/`;
  }

  function searchOpen() {
    const modal = document.querySelector('[data-search-modal]');
    return Boolean(modal && !modal.hidden);
  }

  function bubbleHtml(item) {
    const side = item.from === '我' ? 'me' : 'them';
    return `<div class="play-bubble is-${side}"><span class="play-bubble-from">${escapeHtml(item.from)}</span><p>${escapeHtml(item.text)}</p></div>`;
  }

  async function renderChat(messages, myToken) {
    chatEl.innerHTML = '';
    const list = messages || [];
    for (let i = 0; i < list.length; i += 1) {
      if (myToken !== token) return;
      chatEl.insertAdjacentHTML('beforeend', bubbleHtml(list[i]));
      if (!reduceMotion && i < list.length - 1) await wait(300);
    }
  }

  function renderOptions(round, order) {
    optionsEl.innerHTML = order.map((item, i) => `<button type="button" class="play-opt" data-play-option="${escapeHtml(item.key)}">
      <span class="play-opt-main"><span class="play-opt-index">${i + 1}</span><span class="play-opt-label">${escapeHtml(item.label)}</span></span>
      <span class="play-opt-tags" data-play-tags></span>
      <span class="play-prob" data-play-prob hidden>
        <span class="prob-bar"><span data-play-bar></span></span>
        <span class="prob-num" data-play-num></span>
      </span>
    </button>`).join('');
    optionsEl.querySelectorAll('[data-play-option]').forEach(btn => {
      btn.addEventListener('click', () => choose(btn.dataset.playOption));
    });
  }

  async function showRound() {
    const myToken = ++token;
    const round = pool[index];
    if (!round) return;
    revealed = false;
    showScreen('round');
    progressEl.textContent = `${index + 1} / ${pool.length}`;
    sceneEl.textContent = round.scene || '';
    questionEl.hidden = true;
    optionsEl.innerHTML = '';
    revealEl.hidden = true;
    await renderChat(round.messages, myToken);
    if (myToken !== token) return;
    questionEl.hidden = false;
    questionEl.textContent = round.question || '';
    renderOptions(round, shuffled[index] || round.options);
    const first = optionsEl.querySelector('[data-play-option]');
    first?.focus();
  }

  function choose(key) {
    if (screen !== 'round' || revealed) return;
    const round = pool[index];
    if (!round) return;
    const valid = (shuffled[index] || round.options).some(item => item.key === key);
    if (!valid) return;
    revealed = true;
    const match = key === round.jevChoice;
    answers[index] = {key, match};
    track('play-answer', {round: round.id, match: match ? 'yes' : 'no'});
    const conf = confidenceMeta(round.confidence);
    optionsEl.querySelectorAll('[data-play-option]').forEach(btn => {
      const optKey = btn.dataset.playOption;
      const option = optionByKey(round, optKey);
      const isJev = optKey === round.jevChoice;
      const isYou = optKey === key;
      btn.disabled = true;
      btn.classList.toggle('is-jev', isJev);
      btn.classList.toggle('is-you', isYou);
      btn.classList.toggle('is-match', isJev && isYou);
      btn.classList.add('is-open');
      const tags = [];
      if (isJev && isYou) tags.push('和 Jev 一致');
      else if (isJev) tags.push('Jev 的判断');
      else if (isYou) tags.push('你的选择');
      const tagBox = btn.querySelector('[data-play-tags]');
      if (tagBox) tagBox.innerHTML = tags.map(label => `<span class="play-tag">${escapeHtml(label)}</span>`).join('');
      const prob = btn.querySelector('[data-play-prob]');
      const bar = btn.querySelector('[data-play-bar]');
      const num = btn.querySelector('[data-play-num]');
      const percent = pct(option?.p);
      if (prob) prob.hidden = false;
      if (bar) {
        bar.style.setProperty('--p', `${percent}%`);
        bar.classList.toggle('is-top', isJev);
      }
      if (num) num.textContent = `${percent}%`;
    });
    const lowNote = conf.tone === 'is-low'
      ? `<p class="play-low">置信度低的时候，产品里应该交给人来确认。<a href="/docs/confidence-routing/">看置信度路由</a></p>`
      : '';
    confidenceEl.innerHTML = `<span class="conf ${conf.tone}">${escapeHtml(conf.label)}</span>${lowNote}`;
    explainEl.textContent = `为什么难判断：${round.explain || ''}`;
    msEl.textContent = `这次调用 ${round.ms} 毫秒`;
    nextBtn.textContent = index === pool.length - 1 ? '看结果' : '下一题';
    revealEl.hidden = false;
    nextBtn.focus();
  }

  function resultBlurb(score) {
    if (score >= 4) return '很接近。';
    if (score >= 2) return '一半左右。';
    return '差得比较多。';
  }

  function showResult() {
    const score = answers.filter(item => item?.match).length;
    const highRounds = pool.filter(item => Number(item.confidence) >= 0.75);
    const highMatch = pool.filter((item, i) => Number(item.confidence) >= 0.75 && answers[i]?.match).length;
    track('play-finish', {score: String(score)});
    showScreen('result');
    scoreEl.textContent = `你和 Jev 判断一致 ${score} / ${pool.length}`;
    blurbEl.textContent = resultBlurb(score);
    highEl.textContent = `Jev 很有把握的 ${highRounds.length} 题里，你和它一致 ${highMatch} 题。`;
    reviewEl.innerHTML = pool.map((round, i) => {
      const yours = optionByKey(round, answers[i]?.key);
      const jev = optionByKey(round, round.jevChoice);
      const conf = Number(round.confidence) || 0;
      return `<details class="play-review">
        <summary>
          <span class="chip">${escapeHtml(round.scene || '')}</span>
          <span>你的选择：${escapeHtml(yours?.label || '未作答')}</span>
          <span>Jev 的判断：${escapeHtml(jev?.label || '')}</span>
          <span class="play-review-conf">置信度 ${conf.toFixed(2)}</span>
        </summary>
        <div class="play-chat">${(round.messages || []).map(bubbleHtml).join('')}</div>
      </details>`;
    }).join('');
    const text = shareText(score);
    if (xLink) {
      xLink.href = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
    }
    if (copyBtn) copyBtn.textContent = '复制分享文案';
    scoreEl.focus?.();
  }

  function begin() {
    if (!rounds.length) return;
    index = 0;
    answers = [];
    pool = shuffle(rounds).slice(0, Math.min(ROUND_COUNT, rounds.length));
    shuffled = pool.map(round => shuffle(round.options || []));
    showRound();
  }

  playRoot.querySelector('[data-play-start]')?.addEventListener('click', begin);
  playRoot.querySelector('[data-play-again]')?.addEventListener('click', begin);
  nextBtn?.addEventListener('click', () => {
    if (!revealed) return;
    if (index >= pool.length - 1) showResult();
    else {
      index += 1;
      showRound();
    }
  });
  copyBtn?.addEventListener('click', async () => {
    const score = answers.filter(item => item?.match).length;
    try {
      await navigator.clipboard.writeText(shareText(score));
      copyBtn.textContent = '已复制';
      track('play-share', {channel: 'copy'});
    } catch {
      copyBtn.textContent = '复制失败';
    }
  });
  xLink?.addEventListener('click', () => {
    track('play-share', {channel: 'x'});
  });
  document.addEventListener('keydown', event => {
    if (screen !== 'round' || revealed || searchOpen()) return;
    if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    if (!/^[1-4]$/.test(event.key)) return;
    const btn = optionsEl.querySelectorAll('[data-play-option]')[Number(event.key) - 1];
    if (btn) {
      event.preventDefault();
      btn.click();
    }
  });
}
