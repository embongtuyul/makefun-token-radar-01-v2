// Token Launch Radar page: renders the board, filters, sorting and the
// detail view from window.RADAR (z-data.js). Plans come from PLAN_ENGINE
// (plans.js), the same code the Node entrypoint uses for board.json.
(function () {
  const P = window.PLAN_ENGINE;
  const D = window.RADAR;
  const meta = D.meta;
  const VERDICT = { F: 'FARM', T: 'THIN', S: 'SKIP' };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function fmtGrowth(g) {
    if (g === null || g === undefined) return '—';
    const sign = g > 0 ? '+' : '';
    const cls = g > 0 ? 'up' : g < 0 ? 'down' : '';
    return '<span class="' + cls + '">' + sign + g.toFixed(1) + '%</span>';
  }
  // Decode one compact row array into a named object.
  function decode(a, i) {
    return {
      rank: i + 1, slug: a[0], name: a[1],
      category: D.cats[a[2]], chain: D.chains[a[3]],
      tvl: a[4], ch7: a[5], age: a[6], implied: a[7],
      verdict: VERDICT[a[8]], code: a[8],
      cost: a[9], net: a[10], watchlist: a[11] === 1,
      low: a[7] / meta.intervalFactor, high: a[7] * meta.intervalFactor
    };
  }
  const rows = D.rows.map(decode);
  const bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  // Header + method strip from the run's own fitted figures.
  document.getElementById('ncand').textContent = meta.n;
  document.getElementById('asof').textContent = meta.asOf;
  document.getElementById('asof2').textContent = meta.asOf;
  document.getElementById('method').innerHTML =
    'Model: <span class="eq">log(mcap) = ' + meta.intercept.toFixed(3) +
    ' + ' + meta.slope.toFixed(3) + ' &middot; log(TVL)</span> fitted on ' +
    meta.comps + ' comps &middot; R&sup2; ' + meta.r2.toFixed(2) +
    ' &middot; leave-one-out error ' + meta.loo.toFixed(2) +
    ' &middot; 80% interval &times;/&divide;' + meta.intervalFactor.toFixed(1) +
    ' &middot; <b>FARM ' + meta.farm + '</b> &middot; THIN ' + meta.thin +
    ' &middot; SKIP ' + meta.skip;

  // Category dropdown, by frequency.
  const catSel = document.getElementById('cat');
  const catCount = {};
  rows.forEach(function (r) { catCount[r.category] = (catCount[r.category] || 0) + 1; });
  Object.keys(catCount).sort(function (a, b) { return catCount[b] - catCount[a]; })
    .forEach(function (c) {
      const o = document.createElement('option');
      o.value = c; o.textContent = c + ' (' + catCount[c] + ')';
      catSel.appendChild(o);
    });

  const qEl = document.getElementById('q');
  const verdictEl = document.getElementById('verdict');
  const wlEl = document.getElementById('wl');
  const sortEl = document.getElementById('sort');
  const countEl = document.getElementById('count');
  const tbody = document.getElementById('rows');
  const detailEl = document.getElementById('detail');

  function filtered() {
    const q = qEl.value.trim().toLowerCase();
    const cat = catSel.value;
    const v = verdictEl.value;
    const wl = wlEl.checked;
    let list = rows.filter(function (r) {
      if (wl && !r.watchlist) return false;
      if (cat && r.category !== cat) return false;
      if (v && r.code !== v) return false;
      if (q && (r.name + ' ' + r.category + ' ' + r.chain + ' ' + r.slug)
        .toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    const s = sortEl.value;
    if (s === 'tvl') list.sort(function (a, b) { return b.tvl - a.tvl; });
    else if (s === 'growth') list.sort(function (a, b) { return (b.ch7 || -1e9) - (a.ch7 || -1e9); });
    else if (s === 'age') list.sort(function (a, b) { return (b.age || -1) - (a.age || -1); });
    else if (s === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return list;
  }

  function render() {
    const list = filtered();
    countEl.textContent = 'Showing ' + list.length + ' of ' + rows.length;
    tbody.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' +
        (r.watchlist ? '<span class="wl">WATCHLIST</span>' : '') + '</td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td>' + esc(r.chain) + '</td>' +
        '<td class="num">' + P.fmtMoney(r.tvl) + '</td>' +
        '<td class="num">' + fmtGrowth(r.ch7) + '</td>' +
        '<td class="num">' + fmtAge(r.age) + '</td>' +
        '<td class="num"><b>' + P.fmtMoney(r.implied) + '</b></td>' +
        '<td class="num">' + P.fmtMoney(r.low) + ' – ' + P.fmtMoney(r.high) + '</td>' +
        '<td><span class="tag ' + r.code + '">' + r.verdict + '</span></td></tr>';
    }).join('');
  }

  // Interval bar on a log scale across the board's whole implied range.
  const logMin = Math.log(rows[rows.length - 1].implied / meta.intervalFactor);
  const logMax = Math.log(rows[0].implied * meta.intervalFactor);
  function bar(r) {
    const lo = (Math.log(r.low) - logMin) / (logMax - logMin) * 100;
    const hi = (Math.log(r.high) - logMin) / (logMax - logMin) * 100;
    const pt = (Math.log(r.implied) - logMin) / (logMax - logMin) * 100;
    return '<div class="bar"><i style="left:' + lo.toFixed(1) + '%;width:' +
      (hi - lo).toFixed(1) + '%"></i><b style="left:' + pt.toFixed(1) + '%"></b></div>';
  }

  function openDetail(slug) {
    const r = bySlug[slug];
    if (!r) { detailEl.hidden = true; detailEl.innerHTML = ''; return; }
    const steps = P.expandPlan({
      name: r.name, chain: r.chain, category: r.category,
      cost: r.cost, expected: r.net + r.cost, net: r.net, verdict: r.verdict
    });
    detailEl.innerHTML =
      '<button class="close" id="detailClose">Close</button>' +
      '<h2>' + esc(r.name) + ' <span class="tag ' + r.code + '">' + r.verdict + '</span>' +
      (r.watchlist ? ' <span class="wl">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="meta">Rank #' + r.rank + ' &middot; ' + esc(r.category) +
      ' &middot; ' + esc(r.chain) + ' &middot; TVL ' + P.fmtMoney(r.tvl) +
      ' &middot; 7d ' + (r.ch7 === null ? '—' : (r.ch7 > 0 ? '+' : '') + r.ch7.toFixed(1) + '%') +
      ' &middot; tracked ' + fmtAge(r.age) + '</p>' +
      '<div class="grid">' +
      '<div class="cell"><div class="k">Implied value</div><div class="v">' + P.fmtMoney(r.implied) + '</div></div>' +
      '<div class="cell"><div class="k">80% interval</div><div class="v">' + P.fmtMoney(r.low) + ' – ' + P.fmtMoney(r.high) + '</div></div>' +
      '<div class="cell"><div class="k">Expected value</div><div class="v">' + P.fmtUsd(r.net + r.cost) + '</div></div>' +
      '<div class="cell"><div class="k">Plan cost / net</div><div class="v">' + P.fmtUsd(r.cost) + ' / ' + P.fmtUsd(r.net) + '</div></div>' +
      '</div>' + bar(r) +
      '<h3>Farm plan &mdash; $1,000, 12 weeks, on ' + esc(r.chain) + '</h3>' +
      '<ol>' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    detailEl.hidden = false;
    document.getElementById('detailClose').addEventListener('click', function () {
      location.hash = '#/';
    });
    const sel = tbody.querySelector('tr.sel');
    if (sel) sel.classList.remove('sel');
    const row = tbody.querySelector('tr[data-slug="' + slug + '"]');
    if (row) row.classList.add('sel');
  }

  function route() {
    const hash = location.hash || '#/';
    const detail = hash.match(/^#\/detail\/(.+)$/);
    if (detail) { openDetail(decodeURIComponent(detail[1])); return; }
    detailEl.hidden = true;
    detailEl.innerHTML = '';
    const v = hash.match(/^#\/verdict\/([FTS])$/);
    if (v) verdictEl.value = v[1];
    if (hash === '#/watchlist') wlEl.checked = true;
    render();
  }

  tbody.addEventListener('click', function (ev) {
    const tr = ev.target.closest('tr[data-slug]');
    if (tr) location.hash = '#/detail/' + encodeURIComponent(tr.getAttribute('data-slug'));
  });
  [qEl, catSel, verdictEl, wlEl, sortEl].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  window.addEventListener('hashchange', route);
  route();
})();
