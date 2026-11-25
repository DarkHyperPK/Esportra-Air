/* Persistent chrome of the loop reel (spec 1): chapter index top left, a running timecode top right, a progress
 * hairline at the bottom whose current chapter segment is rose. Shared by problem-solution.html and every frame scene
 * the reel renders (the reel inlines this file). ReelChrome.tick(t) takes the reel's own time in seconds. */
(function (root) {
  'use strict';
  var FPS = 30, END = 79.5, REWIND_FROM = 76.5;
  // [index, name, from, to] on the cut sheet (the chapter segments of the progress hairline are one per chapter)
  var CH = [['01', 'PROBLEM', 1.5, 17.5], ['02', 'ESPORTRA', 17.5, 21.5], ['03', 'AIR', 21.5, 27.5], ['04', 'ON AIR', 27.5, 73.5]];
  var RV = [{ clipPath: 'inset(0 0 100% 0)', transform: 'translateY(20px) scale(.96)' }, { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0) scale(1)' }];
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };

  /** The reel time the timecode shows: it counts with the reel, then rewinds so the last frame meets the first. */
  function shown(t) {
    if (t <= REWIND_FROM) return t;
    var u = Math.min(1, (t - REWIND_FROM) / (END - REWIND_FROM - 1 / FPS));
    return REWIND_FROM * Math.pow(1 - u, 4);
  }
  function tc(t) {
    var f = Math.round(shown(t) * FPS), s = Math.floor(f / FPS);
    return 'TC ' + p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s / 60) % 60) + ':' + p2(s % 60) + ':' + p2(f % FPS);
  }
  function html(o) {
    o = o || {};
    return '<div id="chrome" class="chrome' + (o.over ? ' over' : '') + '" data-reveal="' + (o.reveal ? 1 : 0) + '">' +
      '<div class="ch-tag"><span class="ch-n"></span><span class="ch-l"></span></div>' +
      '<div class="ch-sub"' + (o.sub ? ' style="display:block"' : '') + '>' + (o.sub || '') + '</div>' +
      '<div class="ch-tc"></div><div class="ch-prog"><i><b></b></i><i><b></b></i><i><b></b></i><i><b></b></i></div></div>';
  }
  var last = { el: null, ch: undefined, tc: '', fills: [] };
  function tick(t) {
    var el = document.getElementById('chrome');
    if (!el) return;
    if (last.el !== el) last = { el: el, ch: undefined, tc: '', fills: [] };
    var idx = -1, i;
    for (i = 0; i < CH.length; i++) if (t >= CH[i][2] && t < CH[i][3]) idx = i;
    if (idx !== last.ch) {
      var first = last.ch === undefined;
      last.ch = idx;
      el.querySelector('.ch-n').textContent = idx < 0 ? '' : CH[idx][0];
      el.querySelector('.ch-l').textContent = idx < 0 ? '' : ' / ' + CH[idx][1];
      if (idx >= 0 && (!first || el.getAttribute('data-reveal') === '1'))
        el.querySelector('.ch-tag').animate(RV, { duration: 600, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'both' });
    }
    var s = tc(t);
    if (s !== last.tc) { last.tc = s; el.querySelector('.ch-tc').textContent = s; }
    var bars = el.querySelectorAll('.ch-prog b');
    for (i = 0; i < 4; i++) {
      var v = idx < 0 ? 0 : i < idx ? 1 : i === idx ? Math.min(1, Math.max(0, (t - CH[i][2]) / (CH[i][3] - CH[i][2]))) : 0;
      var k = v.toFixed(4) + (i === idx ? 'c' : '');
      if (last.fills[i] !== k) { last.fills[i] = k; bars[i].style.transform = 'scaleX(' + v + ')'; bars[i].className = i === idx ? 'cur' : ''; }
    }
  }
  root.ReelChrome = { html: html, tick: tick, tc: tc, shown: shown, CH: CH };
})(typeof window !== 'undefined' ? window : this);
