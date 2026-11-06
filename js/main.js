/* КАЛИБР — сценарии страницы.
   1. Шапка и бургер   2. Живые стрелки   3. Разборка часов (GSAP ScrollTrigger)
   4. Лупа   5. Шторки «до/после»   6. Форма   7. Появление блоков */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = mqReduce.matches;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var seg = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var r2 = function (n) { return Math.round(n * 100) / 100; };

  /* ---------- 1. Шапка ---------- */
  var header = $('.site-header');
  var onScrollHeader = function () { header.classList.toggle('is-scrolled', window.scrollY > 24); };
  window.addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  var burger = $('.burger');
  var nav = $('#nav');
  function setMenu(open) {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    nav.classList.toggle('is-open', open);
    doc.body.classList.toggle('menu-open', open);
    header.classList.toggle('menu-shown', open);
    if (open) { var first = $('a', nav); if (first) first.focus(); }
  }
  burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
  $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { if (nav.classList.contains('is-open')) setMenu(false); }); });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); burger.focus(); }
  });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', function (e) { if (e.matches) setMenu(false); });

  /* ---------- 2. Живые стрелки ---------- */
  var handH = $$('.hand-h'), handM = $$('.hand-m'), handS = $$('.hand-s');
  var logoH = $('.logo-h'), logoM = $('.logo-m');
  var lastBeat = -1;
  function setHands(force) {
    var d = new Date();
    var ms = d.getMilliseconds();
    var s = d.getSeconds() + (reduce ? 0 : Math.floor(ms / 125) / 8); // 8 полуколебаний в секунду — «тикающая» секундная
    var m = d.getMinutes() + s / 60;
    var h = (d.getHours() % 12) + m / 60;
    var beat = Math.floor(s * 8);
    if (beat === lastBeat && !force) return;
    lastBeat = beat;
    var aS = s * 6, aM = m * 6, aH = h * 30;
    handS.forEach(function (el) { el.setAttribute('transform', 'rotate(' + r2(aS) + ')'); });
    handM.forEach(function (el) { el.setAttribute('transform', 'rotate(' + r2(aM) + ')'); });
    handH.forEach(function (el) { el.setAttribute('transform', 'rotate(' + r2(aH) + ')'); });
    if (logoM) logoM.setAttribute('transform', 'rotate(' + r2(aM) + ')');
    if (logoH) logoH.setAttribute('transform', 'rotate(' + r2(aH) + ')');
  }
  setHands(true);
  var sceneVisible = true;
  if (reduce) {
    setInterval(function () { setHands(true); }, 1000);
  } else {
    (function tick() {
      if (sceneVisible) setHands(false);
      requestAnimationFrame(tick);
    })();
    setInterval(function () { if (!sceneVisible) setHands(true); }, 1000);
  }

  /* ---------- 3. Разборка часов ---------- */
  var scene = $('#scene');
  var stage = $('#stage');
  var svg = $('#watch-svg');
  var watch = $('#watch');
  var calloutsG = $('#callouts');
  var axesG = $('#axes');
  var heroEl = $('.hero', scene);
  var razborHead = $('.razbor-head', scene);
  var hint = $('.stage-hint', scene);

  var R = 150;
  var STACK = ['crystal', 'bezel', 'hands', 'dial', 'movement', 'balance', 'case', 'back'];
  var parts = {};
  $$('.part', watch).forEach(function (g) {
    parts[g.id.replace('p-', '')] = { g: g, tilt: $('.tilt', g), num: g.getAttribute('data-part') };
  });
  var strapUp = $$('#p-strap .strap-up'), strapDown = $$('#p-strap .strap-down');
  var strapSolid = $('#p-strap .strap-solid'), strapPhantom = $('#p-strap .strap-phantom');

  // подписи берём из списка спецификации — один источник правды
  var info = {};
  $$('#parts-list li').forEach(function (li) {
    info[li.getAttribute('data-part')] = { name: $('.pname', li).textContent, spec: li.getAttribute('data-short') };
  });

  // точки привязки выносок в локальных координатах детали
  var ANCHOR = {
    land: {
      crystal: [0, -121, 't'], bezel: [0, 146, 'b'], hands: [0, -40, 't'], dial: [0, 118, 'b'],
      movement: [0, -112, 't'], balance: [-34, 88, 'b'], 'case': [0, -150, 't'], back: [0, 146, 'b'],
      crown: [179, -22, 't'], strap: [0, 200, 'b']
    },
    port: {
      crystal: [121, 0], bezel: [146, 0], hands: [40, 0], dial: [118, 0], movement: [112, 0],
      balance: [0, 54], 'case': [150, 0], back: [146, 0], crown: [192, 0]
    }
  };

  var L = null;           // текущая раскладка
  var state = { p: 0 };   // прогресс сцены 0..1
  var mode = 'land';
  var isStatic = reduce || !window.gsap || !window.ScrollTrigger;

  function el(name, attrs, parent) {
    var n = doc.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function computeLayout() {
    var w = stage.clientWidth, h = stage.clientHeight;
    var portrait = w / h < 1.1 || w < 860;
    mode = portrait ? 'port' : 'land';
    var sc = portrait ? clamp(w / 420, 0.84, 1.15) : clamp(w / 1500, 0.8, 1.3); // px на единицу
    var W = w / sc, H = h / sc;
    var hU = (isStatic ? 0 : 68) / sc; // высота шапки в единицах
    var lay = { W: W, H: H, sc: sc, mode: mode, off: {}, anchors: {} };

    // --- состояние «hero» ---
    if (portrait) {
      var copyBottom = 0;
      if (!isStatic) {
        var sb = stage.getBoundingClientRect();
        var maxB = 0;
        Array.prototype.forEach.call(heroEl.children, function (ch) {
          var r = ch.getBoundingClientRect();
          if (r.height > 0) maxB = Math.max(maxB, r.bottom);
        });
        copyBottom = maxB ? (maxB - sb.top) / sc : H * 0.5;
      }
      var room = H - copyBottom;
      // ушки (194) не должны залезать на текст; корпус может уходить за нижний край не больше чем на четверть
      var hs = clamp(Math.min(W * 0.84 / (2 * R), (room - 12) / (194 + R * 0.8)), 0.42, 1.5);
      lay.hero = { x: W / 2, y: copyBottom + 12 + 194 * hs, s: hs };
    } else {
      var hs2 = Math.min((H - hU) * 0.8 / (2 * R), W * 0.36 / (2 * R));
      lay.hero = { x: Math.min(W * 0.72, W - 200 * hs2 - 30), y: hU + (H - hU) / 2, s: hs2 };
    }

    // --- состояние «разбор» ---
    var k, s, cx, cy, gap;
    if (portrait) {
      k = 0.3;
      var headH = isStatic ? 20 : (razborHead.getBoundingClientRect().height + 30) / sc;
      var top = hU + headH + 10, bottom = H - 30;
      var labelW = 168;
      var colX = W - labelW - 12;
      s = clamp((colX - 28) / (R + 192 + 20), 0.45, 0.9);
      // центр стопки по X: правый край головки (192) не должен залезать на колонку подписей
      cx = colX - 18 - 192 * s;
      cx = Math.max(cx, R * s + 14);
      var halfH = R * s * k;
      gap = (bottom - top - 2 * halfH) / 7;
      gap = clamp(gap, 40, 110);
      var span = gap * 7;
      cy = top + halfH + ((bottom - top - 2 * halfH) - span) / 2;
      STACK.forEach(function (id, i) { lay.off[id] = [0, (cy + i * gap - cy) / s]; });
      lay.exp = { x: cx, y: cy, s: s, k: k, gap: gap };
      lay.off.crown = [20, lay.off['case'][1]];
      lay.strap = 0;
      lay.colX = colX; lay.labelW = labelW; lay.top = top; lay.bottom = bottom;
    } else {
      k = 0.42;
      var headL = isStatic ? 0 : (razborHead.getBoundingClientRect().height + 16) / sc;
      var topRow = hU + headL + 54, bottomRow = H - 62;
      var regionTop = topRow + 48, regionBottom = bottomRow - 64;
      s = clamp((regionBottom - regionTop) / (2 * R), 0.5, 1.25);
      var halfW = R * s * k;
      gap = Math.min((W - 120 - 2 * halfW - 60 * s) / 7, R * s * 1.15);
      cx = W / 2 - 3.5 * gap - 20 * s;
      cy = (regionTop + regionBottom) / 2;
      STACK.forEach(function (id, i) { lay.off[id] = [(i * gap) / s, 0]; });
      lay.exp = { x: cx, y: cy, s: s, k: k, gap: gap };
      lay.off.crown = [lay.off['case'][0] + 20, -R * 1.2];
      lay.strap = 1;
      lay.topRow = topRow; lay.bottomRow = bottomRow;
    }
    return lay;
  }

  // перевод локальной точки детали в координаты сцены (в состоянии полного разбора)
  function toView(lay, id, px, py) {
    var e = lay.exp, o;
    if (id === 'strap') {
      o = [lay.off['case'][0], 0];
      var dy = py > 0 ? 60 : -60;
      return [e.x + e.s * (o[0] + e.k * px), e.y + e.s * (py + dy)];
    }
    o = lay.off[id];
    if (lay.mode === 'land') return [e.x + e.s * (o[0] + e.k * px), e.y + e.s * (o[1] + py)];
    return [e.x + e.s * (o[0] + px), e.y + e.s * (o[1] + e.k * py)];
  }

  function buildCallouts(lay) {
    calloutsG.textContent = '';
    axesG.textContent = '';
    var items = [];
    var ids = STACK.concat(['crown']);
    if (lay.mode === 'land') ids.push('strap');
    ids.forEach(function (id) {
      var a = ANCHOR[lay.mode][id];
      var v = toView(lay, id, a[0], a[1]);
      var num = id === 'strap' ? '10' : parts[id].num;
      items.push({ id: id, num: num, ax: v[0], ay: v[1], row: a[2] });
    });

    // осевая линия
    var e = lay.exp, first, last, axis;
    if (lay.mode === 'land') {
      first = toView(lay, 'crystal', -R, 0); last = toView(lay, 'back', R, 0);
      axis = el('path', { d: 'M' + r2(first[0] - 50) + ' ' + r2(e.y) + 'H' + r2(last[0] + 50), 'class': 'co-axis' }, axesG);
    } else {
      first = toView(lay, 'crystal', 0, -R); last = toView(lay, 'back', 0, R);
      axis = el('path', { d: 'M' + r2(e.x) + ' ' + r2(first[1] - 30) + 'V' + r2(last[1] + 24), 'class': 'co-axis' }, axesG);
    }
    lay.axis = axis;

    // подписи
    items.forEach(function (it) {
      var g = el('g', { 'class': 'co', opacity: 0 }, calloutsG);
      var line = el('path', { 'class': 'co-line' }, g);
      var dot = el('circle', { 'class': 'co-dot', r: 3 }, g);
      var t = el('g', { 'class': 'co-label' }, g);
      var tn = el('text', { 'class': 'co-num co-text', x: 0, y: -8 }, t); tn.textContent = it.num;
      var tname = el('text', { 'class': 'co-name co-text', x: 28, y: -8 }, t); tname.textContent = info[it.num].name;
      var tspec = el('text', { 'class': 'co-spec co-text', x: 0, y: 17 }, t); tspec.textContent = info[it.num].spec;
      var shelf = el('path', { 'class': 'co-line' }, t);
      var wName = 28 + tname.getComputedTextLength();
      var wSpec = tspec.getComputedTextLength();
      it.w = Math.max(wName, wSpec) + 6;
      it.g = g; it.line = line; it.dot = dot; it.t = t; it.shelf = shelf;
    });

    if (lay.mode === 'land') {
      ['t', 'b'].forEach(function (row) {
        var list = items.filter(function (i) { return i.row === row; }).sort(function (a, b) { return a.ax - b.ax; });
        var minX = 24, maxX = lay.W - 24;
        var y = row === 't' ? lay.topRow : lay.bottomRow;
        var spacing = 18;
        var total = list.reduce(function (acc, i) { return acc + i.w; }, 0) + spacing * (list.length - 1);
        if (total > maxX - minX) spacing = Math.max(6, (maxX - minX - total + spacing * (list.length - 1)) / (list.length - 1));
        // жадно слева направо, затем сдвиг влево при переполнении
        var x = minX;
        list.forEach(function (i) { i.lx = Math.max(i.ax - 26, x); x = i.lx + i.w + spacing; });
        var over = (list[list.length - 1].lx + list[list.length - 1].w) - maxX;
        for (var j = list.length - 1; j >= 0 && over > 0; j--) {
          var lim = j === 0 ? minX : list[j - 1].lx + list[j - 1].w + spacing;
          var can = list[j].lx - lim;
          var mv = Math.min(can, over);
          for (var q = j; q < list.length; q++) list[q].lx -= mv;
          over -= mv;
        }
        list.forEach(function (i) { i.ly = y; });
      });
    } else {
      var list = items.slice().sort(function (a, b) { return a.ay - b.ay; });
      var minGap = 54;
      var yy = lay.top + 4;
      list.forEach(function (i) { i.ly = Math.max(i.ay + 4, yy); yy = i.ly + minGap; });
      var overB = list[list.length - 1].ly + 22 - lay.H + 6;
      if (overB > 0) {
        for (var m = list.length - 1; m >= 0; m--) {
          var limit = m === 0 ? lay.top : list[m - 1].ly + minGap;
          var mvB = Math.min(list[m].ly - limit, overB);
          for (var z = m; z < list.length; z++) list[z].ly -= mvB;
          overB -= mvB;
          if (overB <= 0) break;
        }
      }
      list.forEach(function (i) { i.lx = lay.colX; });
    }

    items.forEach(function (it) {
      it.t.setAttribute('transform', 'translate(' + r2(it.lx) + ' ' + r2(it.ly) + ')');
      it.shelf.setAttribute('d', 'M0 0H' + r2(it.w));
      var ex = it.lx, ey = it.ly;
      it.line.setAttribute('d', 'M' + r2(it.ax) + ' ' + r2(it.ay) + 'L' + r2(ex) + ' ' + r2(ey));
      it.dot.setAttribute('cx', r2(it.ax)); it.dot.setAttribute('cy', r2(it.ay));
      var len = Math.hypot(ex - it.ax, ey - it.ay) + 1;
      it.len = len;
      it.line.style.strokeDasharray = len;
      it.shelfLen = it.w;
      it.shelf.style.strokeDasharray = it.w;
    });
    var axLen = axis.getTotalLength();
    axis.style.strokeDasharray = '22 5 3 5';
    lay.axLen = axLen;
    lay.items = items;
  }

  function render(p) {
    if (!L) return;
    var lay = L;
    var a = ease(seg(p, 0, 0.22));
    var t = ease(seg(p, 0.12, 0.36));
    var e = ease(seg(p, 0.3, 0.7));
    var c = seg(p, 0.6, 0.94);
    var H0 = lay.hero, X = lay.exp;
    var wx = lerp(H0.x, X.x, a), wy = lerp(H0.y, X.y, a), ws = lerp(H0.s, X.s, a);
    // пока не разобраны — центрируем всю стопку, а не первую деталь
    var mid = lay.mode === 'land' ? 3.5 * X.gap : 3.5 * X.gap;
    if (lay.mode === 'land') wx = lerp(H0.x, X.x + mid, a) - mid * e;
    else wy = lerp(H0.y, X.y + mid, a) - mid * e;
    watch.setAttribute('transform', 'translate(' + r2(wx) + ' ' + r2(wy) + ') scale(' + r2(ws * 1000) / 1000 + ')');

    var k = lerp(1, X.k, t);
    var tiltT = lay.mode === 'land' ? 'scale(' + r2(k * 1000) / 1000 + ' 1)' : 'scale(1 ' + r2(k * 1000) / 1000 + ')';
    Object.keys(parts).forEach(function (id) {
      var pt = parts[id];
      pt.tilt.setAttribute('transform', tiltT);
      var o = lay.off[id];
      if (o) pt.g.setAttribute('transform', 'translate(' + r2(o[0] * e) + ' ' + r2(o[1] * e) + ')');
    });
    // ремешок: уходит вверх/вниз и становится условным контуром
    var sOff = lay.mode === 'land' ? lay.off['case'][0] * e : 0;
    parts.strap.g.setAttribute('transform', 'translate(' + r2(sOff) + ' 0)');
    strapUp.forEach(function (g) { g.setAttribute('transform', 'translate(0 ' + r2(-60 * e) + ')'); });
    strapDown.forEach(function (g) { g.setAttribute('transform', 'translate(0 ' + r2(60 * e) + ')'); });
    strapSolid.setAttribute('opacity', r2(1 - e));
    strapPhantom.setAttribute('opacity', r2(lay.strap * e * 0.5));

    // осевая и выноски
    if (lay.axis) lay.axis.style.opacity = r2(seg(p, 0.45, 0.7) * 0.6);
    var n = lay.items.length;
    lay.items.forEach(function (it, i) {
      var st = (i / n) * 0.5;
      var ci = seg(c, st, st + 0.45);
      it.g.setAttribute('opacity', ci > 0 ? 1 : 0);
      it.line.style.strokeDashoffset = r2(it.len * (1 - seg(ci, 0, 0.6)));
      it.shelf.style.strokeDashoffset = r2(it.shelfLen * (1 - seg(ci, 0.5, 1)));
      $$('text', it.t).forEach(function (tx) { tx.style.opacity = r2(seg(ci, 0.55, 1)); });
    });

    if (!isStatic) {
      var hp = seg(p, 0, 0.14);
      heroEl.style.opacity = r2(1 - hp);
      heroEl.style.transform = 'translateY(' + r2(-40 * hp) + 'px)';
      heroEl.style.visibility = hp >= 1 ? 'hidden' : 'visible';
      var rp = seg(p, 0.28, 0.42);
      razborHead.style.opacity = r2(rp);
      razborHead.style.visibility = rp > 0 ? 'visible' : 'hidden';
      if (hint) hint.style.opacity = r2(1 - seg(p, 0, 0.06));
    }
  }

  function applyLayout() {
    if (isStatic) {
      // статичная схема «в разборе»: высота сцены под раскладку
      stage.style.height = '';
      var w = stage.clientWidth;
      var portrait = w < 860;
      stage.style.height = (portrait ? Math.round(Math.min(860, w * 2.05)) : Math.round(Math.min(760, w * 0.56))) + 'px';
    }
    L = computeLayout();
    svg.setAttribute('viewBox', '0 0 ' + r2(L.W) + ' ' + r2(L.H));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    buildCallouts(L);
    render(isStatic ? 1 : state.p);
  }

  var trigger = null;
  function initScene() {
    if (isStatic) {
      scene.classList.add('is-static');
      applyLayout();
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    applyLayout();
    var tween = gsap.to(state, {
      p: 1, ease: 'none',
      onUpdate: function () { render(state.p); },
      scrollTrigger: {
        trigger: scene, start: 'top top',
        end: function () { return '+=' + Math.round(window.innerHeight * (mode === 'land' ? 2.6 : 2.2)); },
        pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true
      }
    });
    trigger = tween.scrollTrigger;
    scene.classList.add('is-live');
    var lastW = window.innerWidth, lastH = window.innerHeight, to;
    window.addEventListener('resize', function () {
      clearTimeout(to);
      to = setTimeout(function () {
        // на телефоне меняется только высота из-за адресной строки — пересчитываем, только если изменилась ширина или высота заметно
        if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 120) return;
        lastW = window.innerWidth; lastH = window.innerHeight;
        applyLayout();
        ScrollTrigger.refresh();
      }, 150);
    });
  }

  // пауза анимаций колёс, когда сцена вне экрана
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        sceneVisible = en.isIntersecting;
        svg.classList.toggle('is-paused', !en.isIntersecting);
      });
    }).observe(stage);
  }

  /* ---------- 4. Лупа ---------- */
  function initLoupe() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var loupe = $('#loupe'), use = $('#loupeUse'), clipC = $('#loupeClipCircle'), bg = $('#loupeBg');
    var ring = $('#loupeRing'), ring2 = $('#loupeRing2'), label = $('#loupeLabel');
    var ZOOM = 2.5, raf = 0, last = null;
    // лупа должна рисоваться поверх выносок
    svg.appendChild(loupe);
    function place() {
      raf = 0;
      if (!last) return;
      var ctm = svg.getScreenCTM();
      if (!ctm) return;
      var pnt = svg.createSVGPoint(); pnt.x = last.x; pnt.y = last.y;
      var q = pnt.matrixTransform(ctm.inverse());
      var r = 92 / ctm.a;
      [clipC, bg, ring].forEach(function (c) { c.setAttribute('cx', r2(q.x)); c.setAttribute('cy', r2(q.y)); c.setAttribute('r', r2(r)); });
      ring2.setAttribute('cx', r2(q.x)); ring2.setAttribute('cy', r2(q.y)); ring2.setAttribute('r', r2(r + 7 / ctm.a));
      ring.setAttribute('stroke-width', r2(3 / ctm.a));
      ring2.setAttribute('stroke-width', r2(1 / ctm.a));
      label.setAttribute('x', r2(q.x)); label.setAttribute('y', r2(q.y + r + 24 / ctm.a));
      label.setAttribute('font-size', r2(13 / ctm.a));
      use.setAttribute('transform', 'translate(' + r2(q.x) + ' ' + r2(q.y) + ') scale(' + ZOOM + ') translate(' + r2(-q.x) + ' ' + r2(-q.y) + ')');
    }
    function hide() { loupe.style.display = 'none'; stage.classList.remove('loupe-on'); last = null; }
    svg.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var onWatch = e.target.closest && e.target.closest('#watch');
      if (!onWatch) { hide(); return; }
      loupe.style.display = '';
      stage.classList.add('loupe-on');
      last = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(place);
    });
    svg.addEventListener('pointerleave', hide);
    window.addEventListener('scroll', function () { if (last) hide(); }, { passive: true });
  }

  /* ---------- 5. Шторки «до/после» ---------- */
  $$('.ba').forEach(function (ba) {
    var range = $('.ba-range', ba);
    var set = function () { ba.style.setProperty('--pos', range.value + '%'); };
    range.addEventListener('input', set);
    set();
  });

  /* ---------- 6. Форма ---------- */
  var form = $('#booking-form');
  if (form) {
    form.setAttribute('novalidate', '');
    var fName = $('#f-name'), fPhone = $('#f-phone'), fMsg = $('#f-msg'), fDate = $('#f-date');
    var chipsSet = $('.field-chips', form);
    var success = $('#form-success'), summary = $('#success-summary');

    var today = new Date();
    var iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    fDate.min = iso(today);
    var maxD = new Date(today.getTime()); maxD.setMonth(maxD.getMonth() + 3);
    fDate.max = iso(maxD);

    // маска телефона +7 (XXX) XXX-XX-XX
    var digitsOf = function (v) {
      var d = v.replace(/\D/g, '');
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d && d[0] !== '7') d = '7' + d;
      return d.slice(0, 11);
    };
    var formatPhone = function (d) {
      if (!d) return '';
      var out = '+7';
      if (d.length > 1) out += ' (' + d.slice(1, 4);
      if (d.length >= 4) out += ')';
      if (d.length > 4) out += ' ' + d.slice(4, 7);
      if (d.length > 7) out += '-' + d.slice(7, 9);
      if (d.length > 9) out += '-' + d.slice(9, 11);
      return out;
    };
    fPhone.addEventListener('input', function () {
      var d = digitsOf(fPhone.value);
      fPhone.value = formatPhone(d);
    });

    var showErr = function (input, msg) {
      var id = input.id ? input.id + '-err' : 'f-type-err';
      var box = $('#' + id);
      if (box) box.textContent = msg || '';
      if (input.tagName) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };
    var rules = {
      name: function () {
        var v = fName.value.trim();
        if (!v) return 'Напишите, как к вам обращаться.';
        if (v.length < 2) return 'Имя слишком короткое — хотя бы две буквы.';
        if (!/^[A-Za-zА-Яа-яЁё\s\-']+$/.test(v)) return 'Только буквы, пробел и дефис.';
        return '';
      },
      phone: function () {
        var d = digitsOf(fPhone.value);
        if (!d) return 'Нужен телефон, чтобы мастер перезвонил.';
        if (d.length < 11) return 'Номер неполный: нужно 10 цифр после +7.';
        return '';
      },
      type: function () { return $('input[name="type"]:checked', form) ? '' : 'Выберите тип часов — от этого зависит, кто из мастеров посмотрит.'; },
      msg: function () {
        var v = fMsg.value.trim();
        if (!v) return 'Опишите в двух словах, что с часами.';
        if (v.length < 5) return 'Чуть подробнее, пожалуйста — хотя бы пару слов.';
        return '';
      },
      date: function () {
        if (!fDate.value) return '';
        var d = new Date(fDate.value + 'T12:00:00');
        if (isNaN(d)) return 'Не получилось прочитать дату.';
        if (fDate.value < fDate.min) return 'Эта дата уже прошла.';
        if (fDate.value > fDate.max) return 'Записываем не дальше чем на три месяца вперёд.';
        if (d.getDay() === 0) return 'В воскресенье мастерская закрыта — выберите другой день.';
        return '';
      }
    };
    var fields = { name: fName, phone: fPhone, msg: fMsg, date: fDate };
    var touched = {};
    Object.keys(fields).forEach(function (k) {
      fields[k].addEventListener('blur', function () { touched[k] = true; showErr(fields[k], rules[k]()); });
      fields[k].addEventListener('input', function () { if (touched[k]) showErr(fields[k], rules[k]()); });
    });
    fDate.addEventListener('change', function () { touched.date = true; showErr(fDate, rules.date()); });
    $$('input[name="type"]', form).forEach(function (r) {
      r.addEventListener('change', function () { $('#f-type-err').textContent = ''; chipsSet.classList.remove('is-invalid'); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstBad = null;
      Object.keys(fields).forEach(function (k) {
        touched[k] = true;
        var m = rules[k]();
        showErr(fields[k], m);
        if (m && !firstBad) firstBad = fields[k];
      });
      var tm = rules.type();
      $('#f-type-err').textContent = tm;
      chipsSet.classList.toggle('is-invalid', !!tm);
      if (tm && (!firstBad || firstBad === fMsg || firstBad === fDate)) firstBad = firstBad === fMsg || firstBad === fDate ? $('input[name="type"]', form) : (firstBad || $('input[name="type"]', form));
      if (firstBad) { firstBad.focus(); return; }

      var type = $('input[name="type"]:checked', form).value;
      var dateTxt = fDate.value ? new Date(fDate.value + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) : 'мастер предложит сам';
      var rows = [['Имя', fName.value.trim()], ['Телефон', fPhone.value], ['Часы', type], ['Что случилось', fMsg.value.trim()], ['Дата визита', dateTxt]];
      summary.textContent = '';
      rows.forEach(function (r) {
        var d = doc.createElement('div');
        var dt = doc.createElement('dt'); dt.textContent = r[0];
        var dd = doc.createElement('dd'); dd.textContent = r[1];
        d.appendChild(dt); d.appendChild(dd); summary.appendChild(d);
      });
      $('#success-text').textContent = fName.value.trim() + ', спасибо! В настоящей мастерской мастер перезвонил бы в течение рабочего дня. Это демо: данные никуда не отправлены.';
      form.hidden = true;
      success.hidden = false;
      success.focus();
    });

    $('#form-reset').addEventListener('click', function () {
      form.reset();
      touched = {};
      Object.keys(fields).forEach(function (k) { showErr(fields[k], ''); });
      $('#f-type-err').textContent = '';
      success.hidden = true;
      form.hidden = false;
      fName.focus();
    });
  }

  /* ---------- 7. Появление блоков ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    var targets = $$('.section-head, .level, .price-table, .step, .case, .tool, .qa, .route, .parts-list li, .stamp');
    targets.forEach(function (t) { t.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ---------- запуск ---------- */
  function start() {
    try {
      initScene();
    } catch (err) {
      // запасной путь: статичная схема
      isStatic = true;
      scene.classList.add('is-static');
      try { applyLayout(); } catch (e2) { /* без сцены страница всё равно читается */ }
    }
    initLoupe();
  }
  if (doc.fonts && doc.fonts.ready) {
    var started = false;
    var go = function () { if (!started) { started = true; start(); } };
    doc.fonts.ready.then(go);
    setTimeout(go, 1200);
  } else {
    start();
  }
})();
