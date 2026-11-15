/*
 * Skarbonka: one shared star wallet for Matma, Angielski, Polski and Naukagry.
 * All apps live on paduszynski.github.io, so they share localStorage.
 * Canonical copy lives in the naukagry repo; the learning apps carry an identical copy.
 * Keep this file self-contained (no build step) and bump SKARBONKA_VERSION on change.
 */
(function () {
  'use strict';
  var SKARBONKA_VERSION = '1.1';
  var KEY = 'skarbonka.v1';
  var BASE = 300, GROW = 1.1;
  var GIFT_EVERY = 5, GIFT = 100;
  var LOG_MAX = 60;
  var GAMES_URL = '/naukagry/';

  // games unlocked by level (shown in the level-up overlay and used by the hub)
  var UNLOCKS = {
    1: ['Klockownia', 'Ogródek'],
    2: ['Jeżyk w biegu'],
    3: ['Akwarium'],
    4: ['Grządkowe trójki'],
    5: ['Latawiec'],
    6: ['Rury do ogródka']
  };

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dayDiff(a, b) { // whole days from a to b (YYYY-MM-DD)
    if (!a || !b) return Infinity;
    var pa = a.split('-'), pb = b.split('-');
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 864e5);
  }

  function fresh() {
    return { v: 1, balance: 0, earned: 0, spent: 0, gifts: 0, days: { last: null, streak: 0 }, log: [] };
  }
  var memory = null; // fallback when localStorage is blocked
  function read() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    if (!s && memory) s = JSON.parse(JSON.stringify(memory));
    if (!s || typeof s !== 'object') s = fresh();
    var f = fresh();
    for (var k in f) if (!(k in s)) s[k] = f[k];
    return s;
  }
  function write(s) {
    memory = s;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    emit(s);
  }

  // ---------- levels ----------
  function need(n) { return Math.round(BASE * Math.pow(GROW, n - 1) / 10) * 10; }
  function levelOf(earned) {
    var lvl = 1, acc = 0;
    while (earned >= acc + need(lvl)) { acc += need(lvl); lvl++; }
    return { level: lvl, into: earned - acc, need: need(lvl), start: acc };
  }
  function pointsForStreak(streak) { return streak >= 10 ? 30 : streak >= 5 ? 20 : streak >= 3 ? 15 : 10; }

  // ---------- events ----------
  var subs = [];
  function emit(s) { subs.slice().forEach(function (fn) { try { fn(s); } catch (e) {} }); }
  function on(fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }
  window.addEventListener('storage', function (e) { if (e.key === KEY) emit(read()); });

  // ---------- money ----------
  function log(s, app, kind, amount, note) {
    s.log.unshift({ t: Date.now(), app: app, kind: kind, amount: amount, note: note || '' });
    if (s.log.length > LOG_MAX) s.log.length = LOG_MAX;
  }
  // earn: counts toward balance and level. Returns { gained, level, levelUp, levels, gift, unlocked }
  function earn(amount, app, note) {
    amount = Math.max(0, Math.round(amount || 0));
    var s = read();
    var before = levelOf(s.earned).level;
    s.balance += amount; s.earned += amount;
    log(s, app, 'earn', amount, note);
    var after = levelOf(s.earned).level, gift = 0, unlocked = [], levels = [];
    for (var l = before + 1; l <= after; l++) {
      levels.push(l);
      if (l % GIFT_EVERY === 0) { gift += GIFT; }
      if (UNLOCKS[l]) unlocked = unlocked.concat(UNLOCKS[l]);
    }
    if (gift) { s.balance += gift; s.gifts += gift; log(s, app, 'gift', gift, 'prezent za poziom'); }
    write(s);
    var res = { gained: amount, level: after, levelUp: after > before, levels: levels, gift: gift, unlocked: unlocked };
    if (res.levelUp) showLevelUp(res);
    return res;
  }
  function spend(amount, app, note) {
    amount = Math.max(0, Math.round(amount || 0));
    var s = read();
    if (s.balance < amount) return false;
    s.balance -= amount; s.spent += amount;
    log(s, app, 'spend', amount, note);
    write(s);
    return true;
  }
  // gives stars back without counting toward the level (refunds, in-game returns)
  function refund(amount, app, note) {
    amount = Math.max(0, Math.round(amount || 0));
    var s = read();
    s.balance += amount; s.spent = Math.max(0, s.spent - amount);
    log(s, app, 'refund', amount, note);
    write(s);
  }
  // first finished set of the day: +20, each following day in a row +10 more, max +50
  function dailyBonus(app) {
    var s = read(), t = today();
    if (s.days.last === t) return 0;
    var gap = dayDiff(s.days.last, t);
    s.days.streak = gap === 1 ? s.days.streak + 1 : 1;
    s.days.last = t;
    write(s);
    var bonus = Math.min(20 + 10 * (s.days.streak - 1), 50);
    earn(bonus, app, 'pierwszy zestaw dnia (' + s.days.streak + ' dz. z rzędu)');
    return bonus;
  }

  // ---------- session helper for learning apps ----------
  // var S = Skarbonka.session('matma');
  // S.correct()     first-try correct answer -> 10/15/20/30 by streak
  // S.wrong()       wrong first try -> streak 0, set is no longer clean
  // S.retry()       correct answer to an item that was wrong before -> 3
  // S.setDone()     finished set -> +20, +50 if clean, + daily bonus; resets set state
  // S.newSet()      start a set over without the bonus (e.g. settings changed)
  function session(app) {
    var st = { streak: 0, clean: true, answered: 0 };
    function fire(n, label) { if (n > 0) flyUp('+' + n, label); }
    return {
      get streak() { return st.streak; },
      correct: function () {
        st.streak++; st.answered++;
        var p = pointsForStreak(st.streak);
        earn(p, app, 'dobra odpowiedź, seria ' + st.streak);
        fire(p, st.streak >= 3 ? 'seria ' + st.streak : '');
        if (st.streak === 5 || st.streak === 10 || (st.streak > 10 && st.streak % 10 === 0)) streakBurst(st.streak);
        render();
        return p;
      },
      wrong: function () { st.streak = 0; st.clean = false; st.answered++; render(); return 0; },
      retry: function () { earn(3, app, 'poprawka'); fire(3, 'poprawka'); render(); return 3; },
      setDone: function () {
        if (st.answered === 0) return 0;
        var b = 20 + (st.clean ? 50 : 0);
        earn(b, app, st.clean ? 'zestaw bez błędu' : 'zestaw ukończony');
        var d = dailyBonus(app);
        fire(b + d, st.clean ? 'zestaw bez błędu!' : 'zestaw ukończony');
        st.clean = true; st.answered = 0;
        render();
        return b + d;
      },
      newSet: function () { st.clean = true; st.answered = 0; },
      _st: st
    };
  }

  // ---------- UI: header badge, fly-up, streak burst, level-up overlay ----------
  var CSS = [
    '.skb{--skb-star:#e3a008;--skb-lvl:#7a4fc4;--skb-bg:rgba(255,255,255,.92);--skb-ink:#1d2f6f;',
    'display:inline-flex;align-items:center;gap:8px;font:inherit;line-height:1;color:var(--skb-ink);background:var(--skb-bg);',
    'border:2px solid var(--skb-ink);border-radius:999px;padding:4px 10px 4px 8px;text-decoration:none;white-space:nowrap;',
    '-webkit-tap-highlight-color:transparent;position:relative;flex:none}',
    '.skb:focus-visible{outline:3px solid var(--skb-lvl);outline-offset:2px}',
    '.skb-star{color:var(--skb-star);font-size:1.1em}',
    '.skb-bal{font-variant-numeric:tabular-nums;font-weight:700}',
    '.skb-lvl{display:inline-flex;align-items:center;gap:4px;color:var(--skb-lvl);font-weight:700;font-variant-numeric:tabular-nums}',
    '.skb-ln{background:var(--skb-lvl);color:var(--skb-ln-fg,#fff);border-radius:999px;min-width:1.45em;padding:2px .35em 1px;text-align:center;line-height:1}',
    '.skb-bar{width:34px;height:7px;border-radius:9px;background:rgba(122,79,196,.18);overflow:hidden;display:inline-block}',
    '.skb-bar>i{display:block;height:100%;background:var(--skb-lvl);width:0;transition:width .4s}',
    '.skb-fl{color:#cf412d;font-weight:700;font-variant-numeric:tabular-nums}',
    '.skb-fl[hidden]{display:none}',
    '.skb-fly{position:fixed;z-index:9998;pointer-events:none;font-weight:700;font-size:28px;color:#e3a008;',
    'text-shadow:0 2px 0 #fff,0 0 8px rgba(0,0,0,.18);left:50%;top:38%;transform:translate(-50%,0);text-align:center;',
    'animation:skbfly 1.1s ease-out forwards;font-family:inherit}',
    '.skb-fly small{display:block;font-size:15px;color:#7a4fc4}',
    '@keyframes skbfly{0%{opacity:0;transform:translate(-50%,10px) scale(.7)}15%{opacity:1;transform:translate(-50%,0) scale(1.1)}',
    '70%{opacity:1}100%{opacity:0;transform:translate(-50%,-70px) scale(1)}}',
    '.skb-burst{position:fixed;inset:0;z-index:9997;pointer-events:none;display:flex;align-items:center;justify-content:center}',
    '.skb-burst b{font-size:64px;color:#cf412d;text-shadow:0 3px 0 #fff;animation:skbburst 1.4s ease-out forwards}',
    '@keyframes skbburst{0%{transform:scale(.3);opacity:0}25%{transform:scale(1.15);opacity:1}75%{opacity:1}100%{transform:scale(1.4);opacity:0}}',
    '.skb-lu{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;',
    'background:rgba(29,47,111,.55);padding:24px;font-family:inherit}',
    '.skb-lu-card{background:#fff;color:#1d2f6f;border:3px solid #1d2f6f;border-radius:22px;padding:28px 24px;max-width:360px;width:100%;',
    'text-align:center;display:flex;flex-direction:column;gap:12px;animation:skbpop .45s cubic-bezier(.2,1.6,.4,1)}',
    '.skb-lu-card h2{margin:0;font-size:44px;line-height:1;color:#7a4fc4;font-weight:400}',
    '.skb-lu-card p{margin:0;font-size:20px;line-height:1.35}',
    '.skb-lu-card .skb-big{font-size:84px;line-height:1;color:#e3a008}',
    '.skb-lu-card button,.skb-lu-card a{font:inherit;font-size:22px;padding:10px 18px;border-radius:14px;border:2px solid #1d2f6f;cursor:pointer;text-decoration:none}',
    '.skb-lu-card button{background:#7a4fc4;color:#fff;border-color:#7a4fc4}',
    '.skb-lu-card a{background:#fff;color:#1d2f6f}',
    '@keyframes skbpop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.skb-fly,.skb-burst b,.skb-lu-card{animation-duration:.01s}.skb-bar>i{transition:none}}'
  ].join('');
  function injectCss() {
    if (document.getElementById('skb-css')) return;
    var st = document.createElement('style'); st.id = 'skb-css'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  var badges = [];
  var currentSession = null;
  // mountBadge(container, { href, session }) -> renders the wallet pill; tapping it opens the games
  function mountBadge(container, opts) {
    opts = opts || {};
    injectCss();
    var a = document.createElement('a');
    a.className = 'skb';
    a.href = opts.href === undefined ? GAMES_URL : opts.href;
    if (!opts.href && opts.href !== undefined) a.removeAttribute('href');
    a.setAttribute('aria-label', 'Gwiazdki i poziom, otwórz gry');
    a.innerHTML = '<span class="skb-star" aria-hidden="true">★</span><span class="skb-bal">0</span>' +
      '<span class="skb-lvl"><span>poz.</span><span class="skb-ln">1</span><span class="skb-bar"><i></i></span></span>' +
      '<span class="skb-fl" hidden>🔥<span class="skb-fn">0</span></span>';
    container.appendChild(a);
    if (opts.session) currentSession = opts.session;
    badges.push(a);
    render();
    return a;
  }
  function render() {
    if (!badges.length) return;
    var s = read(), L = levelOf(s.earned);
    var streak = currentSession ? currentSession.streak : 0;
    badges.forEach(function (a) {
      a.querySelector('.skb-bal').textContent = s.balance;
      a.querySelector('.skb-ln').textContent = L.level;
      a.querySelector('.skb-bar>i').style.width = (L.into / L.need * 100).toFixed(1) + '%';
      var fl = a.querySelector('.skb-fl');
      fl.hidden = streak < 3;
      a.querySelector('.skb-fn').textContent = streak;
      a.title = s.balance + ' gwiazdek · poziom ' + L.level + ' (' + L.into + '/' + L.need + ')';
    });
  }
  on(render);
  function useSession(sess) { currentSession = sess; render(); }

  function flyUp(text, sub) {
    if (!document.body) return;
    injectCss();
    var el = document.createElement('div');
    el.className = 'skb-fly';
    el.innerHTML = '★ ' + text + (sub ? '<small>' + sub + '</small>' : '');
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1200);
  }
  function streakBurst(n) {
    if (!document.body) return;
    injectCss();
    var el = document.createElement('div');
    el.className = 'skb-burst';
    el.innerHTML = '<b>🔥 ' + n + ' z rzędu!</b>';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1500);
  }
  var luQueue = [];
  function showLevelUp(res) {
    if (!document.body || !res.levels.length) return;
    injectCss();
    var lvl = res.levels[res.levels.length - 1];
    var el = document.createElement('div');
    el.className = 'skb-lu';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    var lines = '';
    if (res.unlocked.length) lines += '<p>Nowa gra: <b>' + res.unlocked.join(', ') + '</b></p>';
    if (res.gift) lines += '<p>Prezent: <b>+' + res.gift + ' ★</b></p>';
    lines += '<p>W sklepikach gier czekają nowe rzeczy.</p>';
    el.innerHTML = '<div class="skb-lu-card"><div class="skb-big">★</div><h2>Poziom ' + lvl + '!</h2>' + lines +
      '<button type="button">Super!</button>' + (location.pathname.indexOf(GAMES_URL) === 0 ? '' : '<a href="' + GAMES_URL + '">Do gier ★</a>') + '</div>';
    el.querySelector('button').onclick = function () { el.remove(); };
    el.addEventListener('click', function (e) { if (e.target === el) el.remove(); });
    document.body.appendChild(el);
    luQueue.push(el);
    setTimeout(function () { try { el.querySelector('button').focus(); } catch (e) {} }, 50);
  }

  window.Skarbonka = {
    version: SKARBONKA_VERSION,
    KEY: KEY,
    UNLOCKS: UNLOCKS,
    get: read,
    earn: earn,
    spend: spend,
    refund: refund,
    dailyBonus: dailyBonus,
    need: need,
    levelOf: levelOf,
    level: function () { return levelOf(read().earned); },
    pointsForStreak: pointsForStreak,
    session: session,
    useSession: useSession,
    mountBadge: mountBadge,
    flyUp: flyUp,
    on: on,
    // tests / parent tools
    _reset: function () { write(fresh()); },
    _export: function () { return btoa(unescape(encodeURIComponent(JSON.stringify(read())))); },
    _import: function (code) { var s = JSON.parse(decodeURIComponent(escape(atob(code)))); if (s && s.v === 1) write(s); }
  };
})();
