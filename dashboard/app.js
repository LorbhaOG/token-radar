// Token Radar's dashboard: it reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, per-protocol detail and farm plan, the live-token comparables and the model's own
// benchmark table. No framework and no network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('main');
  var M = DATA.model;
  var state = { tab: 'board', q: '', cat: 'all', seg: 'all', sort: 'implied', dir: -1, selected: null };

  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return money.format(n);
  }
  function fmtFull(n) { return isFinite(n) ? money.format(n) : 'n/a'; }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : n < 0 ? '' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtX(n) { return n === null || n === undefined ? 'n/a' : 'x' + n.toFixed(2); }
  function num(n) { return new Intl.NumberFormat('en-US').format(n); }

  // The model in one function: the page recomputes every row from the snapshot figures, so the
  // board's data and the page's arithmetic are visibly the same code.
  function parts(row, growthDelta, tvlScale, ageDelta) {
    var growth = Math.min(M.growth_cap, Math.max(M.growth_floor, (row.change_7d || 0) + (growthDelta || 0)));
    var growthMult = 1 + (growth / 100) * M.growth_weight;
    var age = Math.max(0, (row.age_days === null || row.age_days === undefined ? M.unknown_age_days : row.age_days) + (ageDelta || 0));
    var maturity = M.maturity_floor + Math.min(age, M.maturity_days) / M.maturity_days * M.maturity_range;
    var implied = Math.max(1, Math.round(row.tvl_usd * (tvlScale || 1) * row.category_multiple * growthMult * maturity));
    return { growth: growth, growthMult: growthMult, maturity: maturity, implied: implied };
  }
  function impliedOf(row) { return parts(row, 0, 1, 0).implied; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('cat')) state.cat = params.get('cat');
    if (params.get('seg')) state.seg = params.get('seg');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('dir')) state.dir = Number(params.get('dir')) === 1 ? 1 : -1;
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.q) params.set('q', state.q);
    if (state.cat !== 'all') params.set('cat', state.cat);
    if (state.seg !== 'all') params.set('seg', state.seg);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.sort !== 'implied' && state.dir === 1) params.set('dir', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname);
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('div', null,
          el('div', { class: 'brand-name', text: 'Token Radar' }),
          el('div', { class: 'brand-sub', text: 'Tokenless protocol index' })
        )
      ),
      el('div', { class: 'meta' },
        el('div', null, 'Snapshot', el('b', { text: DATA.as_of })),
        el('div', null, 'Source', el('b', { text: 'DefiLlama protocols' })),
        el('div', null, 'Model', el('b', { text: DATA.model_version }))
      )
    );
  }

  function hero() {
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: 'Every tokenless protocol, ranked by what its launch could be worth.' }),
        el('p', { class: 'lede' },
          el('b', { text: DATA.board_size + ' protocols' }),
          ' in the snapshot record no token on DefiLlama and are not a wrapped, staked or bridged product of one that trades. Each is valued from its own TVL, its seven-day growth and how long it has held that TVL with no token. No protocol name is special-cased. An implied value is a claim about scale, never a promise that a token arrives.'
        )
      ),
      el('dl', { class: 'stats' },
        el('div', null, el('dt', { text: 'Watchlist covered' }), el('dd', null, DATA.watchlist_size + ' / ' + DATA.watchlist_size)),
        el('div', null, el('dt', { text: 'Protocols ranked' }), el('dd', null, String(DATA.board_size))),
        el('div', null, el('dt', { text: 'TVL ranked' }), el('dd', null, fmtUsd(DATA.total_tvl_usd))),
        el('div', null, el('dt', { text: 'Largest implied' }), el('dd', null, fmtUsd(DATA.rows[0].implied_value_usd)))
      )
    );
  }

  function views() {
    var tabs = [
      ['board', 'Pre-token board', DATA.board_size],
      ['live', 'Live-token comparables', DATA.live_size],
      ['method', 'Method and exclusions', DATA.excluded_size]
    ];
    return el('nav', { class: 'views', role: 'tablist', 'aria-label': 'Views' },
      tabs.map(function (t) {
        return el('button', {
          type: 'button', role: 'tab', 'aria-selected': state.tab === t[0] ? 'true' : 'false',
          onclick: function () { state.tab = t[0]; writeHash(); render(); }
        }, t[1], el('b', { text: String(t[2]) }));
      })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Name, category or chain', value: state.q });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'cat' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.cat ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.cat = select.value; writeHash(); render(); });
    var segs = [['all', 'All', DATA.board_size], ['watch', 'Watchlist', DATA.watchlist_size], ['early', 'Off-watchlist', DATA.early_size]];
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'cat', text: 'Category' }), select),
      el('div', { class: 'field' },
        el('span', { class: 'lbl', text: 'Scope' }),
        el('div', { class: 'segments' }, segs.map(function (s) {
          return el('button', {
            type: 'button', 'aria-pressed': state.seg === s[0] ? 'true' : 'false',
            onclick: function () { state.seg = s[0]; writeHash(); render(); }
          }, s[1] + ' ' + s[2]);
        }))
      ),
      el('span', { class: 'count' }, el('b', { text: String(visible().length) }), ' of ' + DATA.board_size + ' rows shown')
    );
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.seg === 'watch' && !r.on_watchlist) return false;
      if (state.seg === 'early' && r.on_watchlist) return false;
      if (state.cat !== 'all' && (r.category || 'Uncategorised') !== state.cat) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function visible() { return sorted(filtered()); }
  function sorted(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  function sortHeader(key, label, cls) {
    var active = state.sort === key;
    return el('th', { scope: 'col', class: cls || null, 'aria-sort': active ? (state.dir < 0 ? 'descending' : 'ascending') : 'none' },
      el('button', {
        type: 'button',
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = key === 'name' || key === 'age' ? 1 : -1; }
          writeHash(); render();
        }
      }, label, active ? el('span', { class: 'caret', 'aria-hidden': 'true', text: state.dir < 0 ? '▼' : '▲' }) : null)
    );
  }

  function detailButton(slug) {
    return function () { state.selected = slug; writeHash(); openDetail(slug); };
  }

  function boardTable() {
    var list = visible();
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches these filters' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', {
          class: 'button primary', type: 'button', text: 'Clear filters',
          onclick: function () { state.q = ''; state.cat = 'all'; state.seg = 'all'; writeHash(); render(); }
        })
      ));
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthCls = r.change_7d === null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg';
      var pct = Math.max(4, Math.round((r.implied_value_usd / max) * 100));
      tbody.appendChild(el('tr', {
        class: 'row', tabindex: '0',
        onclick: detailButton(r.slug),
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.selected = r.slug; writeHash(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) }),
        el('td', null, el('div', { class: 'proto' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains.length ? r.chains[0] + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') : 'chain unnamed') })
        )),
        el('td', { class: 'col-scope' }, el('span', { class: 'scope ' + (r.on_watchlist ? 'watch' : 'early'), text: r.on_watchlist ? 'watchlist' : 'off-watchlist' })),
        el('td', { class: 'num col-tvl', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthCls, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar' + (r.rank <= 3 ? ' hot' : ''), 'aria-hidden': 'true' }, el('i', { style: 'width:' + pct + '%' })),
          el('b', { text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'chev', 'aria-hidden': 'true', text: '›' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Ranked by implied value. Click a row for the model behind it and a farm plan with costs and times.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', 'rank'),
            sortHeader('name', 'Protocol'),
            el('th', { scope: 'col', class: 'col-scope', text: 'Scope' }),
            sortHeader('tvl', 'TVL', 'col-tvl'),
            sortHeader('growth', '7 day'),
            sortHeader('age', 'No token for'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col' }, el('span', { class: 'sub', text: 'Plan' }))
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var byCat = {};
    DATA.benchmarks.forEach(function (b) { byCat[b.category] = b; });
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'proto' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains.length ? r.chains[0] : 'chain unnamed') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? 'muted' : r.change_7d >= 0 ? 'pos' : 'neg'), text: r.change_7d === null ? 'n/a' : fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtX(r.mcap_tvl) }),
        el('td', { class: 'num', text: byCat[r.category || 'Other'] ? fmtX(byCat[r.category || 'Other'].multiple) : fmtX(DATA.global_multiple) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Protocols whose token already trades, largest TVL first. Their market cap is a fact, not a model. A category\u2019s multiple is the median of these ratios, not the mean, so one outlier cannot set it. They are never mixed into the pre-token ranking.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7 day' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'MC / TVL' }),
            el('th', { scope: 'col', text: 'Category multiple used' })
          )),
          tbody
        )
      )
    );
  }

  function method() {
    var bench = el('tbody');
    DATA.benchmarks.forEach(function (b) {
      bench.appendChild(el('tr', null,
        el('td', { text: b.category }),
        el('td', { class: 'num', text: String(b.peers) }),
        el('td', { class: 'num', text: fmtX(b.median_multiple) }),
        el('td', { class: 'num' }, el('b', { text: fmtX(b.multiple) }))
      ));
    });
    var excluded = el('tbody');
    DATA.excluded.forEach(function (r) {
      excluded.appendChild(el('tr', null,
        el('td', { text: r.name }),
        el('td', { class: 'sub', text: r.category || 'Uncategorised' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'sub', text: r.reason })
      ));
    });
    return el('div', { class: 'article' },
      el('section', null,
        el('h2', { text: 'How the radar values a launch' }),
        el('p', { text: 'Implied value is what a token would be worth if the protocol\u2019s record stayed as it is. It is built from three inputs, all of them in the snapshot, and one table measured from the snapshot itself: what the market pays today for a dollar of TVL in each category.' }),
        el('div', { class: 'formula' },
          'implied = TVL \u00d7 m(category) \u00d7 (1 + clamp(7d, ', String(M.growth_floor), ', ', String(M.growth_cap), ') / 100 \u00d7 ', String(M.growth_weight), ') \u00d7 (', String(M.maturity_floor), ' + min(age, ', num(M.maturity_days), ') / ', num(M.maturity_days), ' \u00d7 ', String(M.maturity_range), ')',
          el('br'),
          el('span', { text: 'm(category) = (peers \u00d7 median mcap/TVL + ' + M.shrink_k + ' \u00d7 market median) / (peers + ' + M.shrink_k + '), kept within ' + M.multiple_floor + ' and ' + M.multiple_cap }),
          el('br'),
          el('span', { text: 'market median mcap/TVL measured on this snapshot: ' + fmtX(DATA.global_multiple) + ' over the live-token protocols with a market cap' })
        ),
        el('div', { class: 'cards' },
          el('div', { class: 'card' },
            el('h3', { text: 'Market multiple' }),
            el('p', { text: 'The median market cap per dollar of TVL among the category\u2019s protocols that already trade, shrunk toward the whole market\u2019s median by how many peers it rests on. A category with one peer cannot set the price alone.' }),
            el('span', { class: 'fig', text: 'x' + DATA.global_multiple.toFixed(2) + ' market median' })
          ),
          el('div', { class: 'card' },
            el('h3', { text: 'Momentum' }),
            el('p', { text: 'Seven-day TVL growth, clamped to ' + M.growth_floor + ' to +' + M.growth_cap + ' per cent and weighted at ' + M.growth_weight + ', so a good week lifts a protocol and a bad one trims it without either drowning the TVL term.' }),
            el('span', { class: 'fig', text: 'x' + (1 + M.growth_floor / 100 * M.growth_weight).toFixed(2) + ' to x' + (1 + M.growth_cap / 100 * M.growth_weight).toFixed(2) })
          ),
          el('div', { class: 'card' },
            el('h3', { text: 'Maturity' }),
            el('p', { text: 'How long the protocol has been listed with no token, as a proxy for how long it has held TVL. It rises from ' + M.maturity_floor + ' to ' + (M.maturity_floor + M.maturity_range) + ' over three years; a protocol with no listing date is credited ' + M.unknown_age_days + ' days.' }),
            el('span', { class: 'fig', text: 'x' + M.maturity_floor.toFixed(2) + ' to x' + (M.maturity_floor + M.maturity_range).toFixed(2) })
          )
        )
      ),
      el('section', null,
        el('h2', { text: 'Every category multiple, measured from this snapshot' }),
        el('p', { text: 'No number in this table is hand-picked: each median is computed from the snapshot\u2019s live-token protocols, and each applied multiple is that median shrunk toward the market median. A protocol whose category has no live peer is valued at the market median.' }),
        el('div', { class: 'panel' },
          el('div', { class: 'table-wrap' },
            el('table', { class: 'compact' },
              el('thead', null, el('tr', null,
                el('th', { scope: 'col', text: 'Category' }),
                el('th', { scope: 'col', text: 'Live peers' }),
                el('th', { scope: 'col', text: 'Median MC / TVL' }),
                el('th', { scope: 'col', text: 'Multiple applied' })
              )),
              bench
            )
          )
        )
      ),
      el('section', null,
        el('h2', { text: 'What the radar leaves out, and why' }),
        el('p', { text: 'A wrapped, staked or bridged product of a token that already trades is not a launch of its own. Neither is an exchange\u2019s product or a versioned pool of another protocol. The snapshot names ' + DATA.excluded_size + ' such protocols above the floor; the largest ' + DATA.excluded.length + ' are listed here, so the board\u2019s coverage can be checked rather than trusted.' }),
        el('ul', { class: 'rules' },
          el('li', null, 'The watchlist is the floor: ', el('code', { text: String(Math.round(DATA.floor_usd / 1e6)) + 'M' }), ' of TVL, no token in the DefiLlama record, and not a product of one that trades.'),
          el('li', null, 'The board is a superset: ', el('code', { text: String(DATA.board_size) + ' rows' }), ' including every watchlist protocol and ', el('code', { text: String(DATA.early_size) }), ' tokenless protocols the watchlist leaves out, down to the snapshot\u2019s ' + fmtUsd(5000000) + ' input floor.'),
          el('li', null, '\u201cNo token\u201d is always the record\u2019s word, never proof: a protocol on the board may still carry a token DefiLlama does not list.')
        ),
        el('div', { class: 'panel' },
          el('div', { class: 'table-wrap' },
            el('table', { class: 'compact' },
              el('thead', null, el('tr', null,
                el('th', { scope: 'col', text: 'Protocol' }),
                el('th', { scope: 'col', text: 'Category' }),
                el('th', { scope: 'col', text: 'TVL' }),
                el('th', { scope: 'col', text: 'Why it is not ranked' })
              )),
              excluded
            )
          )
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    dialog.textContent = '';
    var options = [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return row.farm_steps[i]; }).filter(Boolean);
    var sens = [
      ['TVL 25% lower', parts(row, 0, 0.75, 0).implied],
      ['Growth 20 points lower', parts(row, -20, 1, 0).implied],
      ['One year younger', parts(row, 0, 1, -Math.min(365, row.age_days === null ? M.unknown_age_days : row.age_days)).implied]
    ];
    var chains = row.chains.length ? row.chains.slice(0, 4).join(', ') + (row.chains.length > 4 ? ' +' + (row.chains.length - 4) : '') : 'chain unnamed';
    var plan = el('ol', { class: 'plan' }, options.map(function (s) {
      return el('li', null, el('div', null,
        el('p', { text: s.act }),
        el('div', { class: 'cost' },
          el('em', { text: 'Cost: ' + s.cost }),
          el('em', { class: 'time', text: 'Time: ' + s.time })
        )
      ));
    }));
    var peers = row.category_peers === 0 ? 'no live peers, market median' : row.category_peers + ' live peer' + (row.category_peers === 1 ? '' : 's');
    var body = el('div', { class: 'detail-inner' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('div', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · watchlist' : ' · off-watchlist') }),
          el('h2', { id: 'detail-title', text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Uncategorised') + ' · ' + chains })
        ),
        el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
      ),
      el('div', { class: 'big' },
        el('span', { class: 'label', text: 'Implied launch value' }),
        el('span', { class: 'value', text: fmtUsd(row.implied_value_usd) }),
        el('span', { class: 'note', text: fmtFull(row.implied_value_usd) + ' · the model\u2019s claim, not a price' })
      ),
      el('dl', { class: 'breakdown' },
        el('div', null, el('dt', { text: 'TVL' }), el('dd', null, fmtFull(row.tvl_usd), el('small', { text: chains }))),
        el('div', null,
          el('dt', { text: 'Category multiple' }),
          el('dd', null, '×' + row.category_multiple.toFixed(2), el('small', { text: (row.category || 'Uncategorised') + ' · ' + peers }))
        ),
        el('div', null,
          el('dt', { text: 'Seven-day growth' }),
          el('dd', null, '×' + row.growth_multiplier.toFixed(3),
            el('small', { text: row.change_7d === null ? 'not reported, counted as 0%' : fmtPct(row.change_7d) + ' over 7 days' }))
        ),
        el('div', null,
          el('dt', { text: 'Time with no token' }),
          el('dd', null, '×' + row.maturity_multiplier.toFixed(3),
            el('small', { text: row.age_days === null ? 'no listing date, credited ' + M.unknown_age_days + ' days' : fmtAge(row.age_days) + ' since ' + row.listed_at }))
        ),
        el('div', { class: 'total' }, el('dt', { text: 'Implied value' }), el('dd', { text: fmtFull(row.implied_value_usd) }))
      ),
      el('section', null,
        el('h3', { text: 'If the inputs moved' }),
        el('div', { class: 'sens' }, sens.map(function (s) {
          return el('div', null, el('span', { text: s[0] }), el('b', { text: fmtUsd(s[1]) }));
        }))
      ),
      el('section', null,
        el('h3', { text: 'Farm plan: before the token, and on launch day' }),
        plan
      ),
      el('p', { class: 'detail-note', text: 'The page recomputes this row from the snapshot figures as ' + fmtUsd(impliedOf(row)) + (impliedOf(row) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' DefiLlama lists no token for this protocol: that is a record, not proof. Nothing here is financial advice.' })
    );
    dialog.appendChild(body);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(views());
    if (state.tab === 'board') {
      shell.appendChild(controls());
      shell.appendChild(boardTable());
    } else if (state.tab === 'live') {
      shell.appendChild(el('div', { class: 'article' }, el('section', null, liveTable())));
    } else {
      shell.appendChild(method());
    }
    shell.appendChild(el('p', { class: 'foot', text: 'Snapshot ' + DATA.as_of + ', ' + DATA.source + '. The watchlist covers ' + DATA.watchlist_size + ' protocols; the board ranks ' + DATA.board_size + '. Implied values are the entry\u2019s own model output, never make.fun\u2019s, and never a prediction of a token.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) document.body.appendChild(dialog);
    if (state.selected && state.tab === 'board') openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
