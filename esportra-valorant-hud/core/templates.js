/* Graphics templates (Air › Graphics › Templates). A template restyles the parts of one graphic:
   position, scale, layer, visibility, opacity, fill, text, border, corners, depth, fixed words and the
   entrance. The graphics keep drawing their own data; this file only sets inline styles on the parts
   listed in GRAPHICS, so a template can never add code or markup to a page.

   State (all set by Air, which validates first):
     airTemplates          [template]   the templates this match uses
     airHudTemplate        id | null    the look for the in-game HUD
     airFullscreenTemplate id | null    the look for the graphic in the full-screen host
     airBrand              { primary, secondary, panel, text, atk, def }  the event's brand kit
   Air's editor previews a draft with postMessage AIR_TEMPLATE_DRAFT (preview pages only). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AirTemplates = api;
})(typeof window === 'object' ? window : globalThis, function () {
  // [id, label, selector, words?] — words: the part is a fixed label whose text a template may replace.
  const FULL = [
    ['background', 'Background', '.scene'], ['glow', 'Glow', '.scene .glow'], ['grain', 'Grain', '.scene .grain'],
    ['lines', 'Lines', '.scene .lines'], ['vignette', 'Vignette', '.scene .vig'], ['corners', 'Corner marks', '.chrome .br'],
    ['crest', 'Crest', '.chrome .clg'], ['topline', 'Top line', '.chrome .l1'], ['toplabel', 'Top label', '.chrome .r1'],
    ['clock', 'Clock', '.chrome .clk'], ['title', 'Title', '.title', 1], ['subtitle', 'Subtitle', '.title-r'],
  ];
  const BAND = [
    ['panel', 'Panel', '.bd'], ['title', 'Title', '.bd-title'], ['captions', 'Small text', '.bd-cap'],
    ['marks', 'Logos', '.bd-mark'], ['vs', 'VS', '.bd-vs'], ['maps', 'Map tiles', '.bd-map'],
    ['mapnames', 'Map names', '.bd-map .mn'], ['boxes', 'Boxes', '.bd-box'], ['scores', 'Scores', '.bd-big, .bd-mid-score, .bd-score, .bd-line'],
  ];
  /** A graphic's parts: the shared ones, with extras added and same-id entries replaced. */
  const withParts = (base, extra) => { const out = base.slice(); extra.forEach(e => { const i = out.findIndex(x => x[0] === e[0]); if (i >= 0) out[i] = e; else out.push(e); }); return out; };
  const GRAPHICS = {
    'map-veto|full': { title: 'Map veto', parts: [...FULL, ['cards', 'Map cards', '.card'], ['stamps', 'Ban stamps', '.stamp', 1], ['decider', 'Decider line', '.cap']] },
    'match-intro|full': { title: 'Match intro', parts: [...FULL, ['sides', 'Team halves', '.side'], ['teamnames', 'Team names', '.side .tn'], ['teamstats', 'Team lines', '.side .ts'], ['logos', 'Logos', '.side .lg'], ['vs', 'VS', '.vs', 1], ['event', 'Event name', '.ev'], ['stage', 'Stage', '.st'], ['maps', 'Map list', '.mp']] },
    'agent-select|full': { title: 'Agent select', parts: [...FULL, ['vs', 'VS', '.vs', 1], ['teamheads', 'Team names', '.th'], ['columns', 'Team columns', '.col'], ['cards', 'Player cards', '.pc'], ['cards.picture', 'Agent picture', '.pc .por'], ['cards.player', 'Player name', '.pc .who b'], ['cards.agent', 'Agent name', '.pc .who span'], ['cards.lock', 'Locked tag', '.pc .lock'], ['cards.strip', 'Name strip', '.pc .who']] },
    'map-result|full': { title: 'Map result', parts: [...FULL, ['mapart', 'Map picture', '.bgm'], ['score', 'Score block', '.sc'], ['bignumber', 'Big score', '.sc .big'], ['mvp', 'MVP panel', '.mvp'], ['mvpname', 'MVP name', '.mvp .n'], ['performers', 'Top performers', '.tp']] },
    'series|full': { title: 'Series', parts: [...FULL, ['cards', 'Map cards', '.cd'], ['mapnames', 'Map names', '.cd .mn'], ['results', 'Results', '.cd .res'], ['bars', 'Winner bars', '.cd .bar'], ['live', 'Live tag', '.cd .live', 1]] },
    'halftime|full': { title: 'Halftime', parts: [...FULL, ['score', 'Score', '.score'], ['halves', 'Halves table', '.halves'], ['rounds', 'Round by round', '.tl'], ['note', 'Side switch note', '.note'], ['stats', 'Side stats', '.side']] },
    'standings|full': { title: 'Standings', parts: [...FULL, ['table', 'Table', '.tbl'], ['header', 'Table header', '.tbl .hh'], ['rows', 'Table rows', '.tbl .rw'], ['side', 'MVP race', '.side']] },
    'player-profile|full': { title: 'Player profile', parts: [...FULL, ['wash', 'Colour wash', '.wash'], ['portrait', 'Portrait', '.por'], ['name', 'Name', '.n'], ['info', 'Team line', '.k'], ['stats', 'Stats', '.grid'], ['quote', 'Quote', '.q']] },
    'schedule|full': { title: "Today's schedule", parts: [...FULL, ['list', 'List', '.list'], ['rows', 'Rows', '.list .r'], ['times', 'Times', '.list .tm'], ['labels', 'Labels', '.list .l']] },
    'champion|full': { title: 'Champion', parts: [...FULL, ['kicker', 'Event line', '.k'], ['team', 'Team name', '.t'], ['line', 'Result line', '.s'], ['roster', 'Roster', '.roster']] },
    'cam-grid|full': { title: 'Camera grid', parts: [['wall', 'Camera wall', '.camwall'], ['title', 'Title', '.camwall-title', 1], ['rows', 'Rows', '.camrow'], ['cams', 'Cameras', '.camrow .cam'], ['observed', 'Observed camera', '.cam.observed']] },
    'holding|full': { title: 'Starting soon · Break · Ending', parts: [...FULL.filter(p => p[0] !== 'title' && p[0] !== 'subtitle' && p[0] !== 'toplabel'), ['mark', 'Logo', '.left .mark'], ['headline', 'Headline', '.left .big', 1], ['message', 'Message', '.left .sub', 1], ['countdown', 'Countdown', '.left .cd'], ['countlabel', 'Countdown label', '.left .cdl', 1], ['next', 'Up next panel', '.next'], ['nextteams', 'Up next teams', '.next .m'], ['schedule', 'Schedule', '.sch'], ['schedrows', 'Schedule rows', '.sch .r'], ['social', 'Social line', '.soc']] },
    'holding|band': { title: 'Break frame', parts: [['frame', 'Frame', '.bd-frame'], ['windows', 'Windows', '.bd-fwin'], ['clock', 'Clock', '.bd-clock'], ['title', 'Event line', '.bd-ftop .bd-title'], ['eventmark', 'Event logo', '.bd-fmark'], ['bottom', 'Score row', '.bd-fbot'], ['marks', 'Logos', '.bd-fbot .bd-mark'], ['teamnames', 'Team names', '.bd-tname'], ['scores', 'Scores', '.bd-big'], ['vs', 'VS', '.bd-vs'], ['next', 'Next line', '.bd-fnext']] },
    'casters|full': { title: 'Desk', parts: [['corners', 'Corner marks', '.chrome .br'], ['crest', 'Crest', '.chrome .clg'], ['topline', 'Top line', '.chrome .l1'], ['toplabel', 'Top label', '.chrome .r1', 1], ['clock', 'Clock', '.chrome .clk'], ['heading', 'Heading', '.hd'], ['subheading', 'Match line', '.hd2'], ['frames', 'Camera frames', '.frame'], ['plates', 'Name plates', '.plate'], ['names', 'Names', '.plate .n'], ['handles', 'Handles', '.plate .h']] },
    'map-veto|band': { title: 'Map veto', parts: withParts(BAND, [['title', 'Title', '.bd-title', 1], ['labels', 'Action labels', '.bd-vlab'], ['decider', 'Decider label', '.bd-vlab.dec'], ['pickcaps', 'Pick captions', '.bd-cap.top']]) },
    'agent-select|band': { title: 'Agent select', parts: [...BAND, ['teams', 'Team names', '.bd-team'], ['sides', 'Side tags', '.bd-side'], ['agents', 'Agent cards', '.bd-ag'], ['agents.picture', 'Agent picture', '.bd-ag .bd-pic'], ['agents.player', 'Player name', '.bd-ag .who b'], ['agents.agent', 'Agent name', '.bd-ag .who span'], ['agents.lock', 'Locked tag', '.bd-ag .bd-lock'], ['agents.line', 'Team underline', '.bd-ag .ul'], ['agentnames', 'Name strip', '.bd-ag .who'], ['series', 'Series box', '.bd-lser']] },
    'match-intro|band': { title: 'Match intro', parts: [...BAND, ['teamnames', 'Team names', '.bd-tname b'], ['lineup', 'Lineup row', '.bd-lineup'], ['faces', 'Faces', '.bd-face'], ['players', 'Player names', '.bd-lp b']] },
    'map-result|band': { title: 'Map result', parts: [...BAND] },
    'series|band': { title: 'Series', parts: [...BAND] },
    'halftime|band': { title: 'Halftime', parts: [...BAND] },
    'standings|band': { title: 'Standings', parts: [...BAND, ['cells', 'Team cells', '.bd-st']] },
    'player-profile|band': { title: 'Player profile', parts: [...BAND, ['photo', 'Photo', '.bd-pphoto'], ['name', 'Name', '.bd-pname'], ['stats', 'Stats', '.bd-pstats']] },
    'schedule|band': { title: "Today's schedule", parts: withParts(BAND, [['title', 'Title', '.bd-title', 1]]) },
    hud: { title: 'In-game HUD', parts: [
      ['scorebug', 'Scorebug', '.vsb'], ['sbteams', 'Scorebug · teams', '.vsb-team'], ['sbscores', 'Scorebug · scores', '.vsb-score'],
      ['sbround', 'Scorebug · round', '.vsb-round'], ['sbstatus', 'Scorebug · status', '.vsb-status'],
      ['players', 'Player cards', '.pl'], ['playerrows', 'Player card rows', '.pl .pr'], ['playercams', 'Player cameras', '.player-cams'],
      ['killfeed', 'Killfeed', '.kf'], ['killrows', 'Killfeed rows', '.kf .kr'], ['minimap', 'Minimap frame', '.mmf'],
      ['eventbug', 'Event bug', '.eb'], ['seriesmaps', 'Series maps', '.sm'], ['winprob', 'Win probability', '.winp'],
      ['roundhistory', 'Round history', '.rh'], ['ticker', 'Ticker', '.ts'], ['poll', 'Poll', '.pq'], ['observed', 'Observed player', '.ob'],
      ['sponsor', 'Sponsor', '.spn'], ['recap', 'Round recap', '.rr'], ['economy', 'Economy', '.ec'], ['duel', 'Duel', '.du'],
      ['compare', 'Team compare', '.tc'], ['scoreboard', 'Scoreboard', '.st'], ['banner', 'Banners', '.bn'], ['bannerband', 'Banner band', '.bn .band'],
      ['pause', 'Pause box', ':scope > .pause'], ['replay', 'Replay tag', '.rp'], ['lowerthird', 'Lower third', '.lt'], ['ltbox', 'Lower third box', '.lt .box'],
    ] },
  };
    // FINE LAYERS (generated by dev/parts-extra.py) ›
  const EXTRA = {
    'map-veto|full': [['teams', 'Team blocks', '.vt-team'], ['teams.logo', 'Team logos', '.vt-team .lg'], ['teams.name', 'Team names', '.vt-team b'], ['teams.tag', 'Team tags', '.vt-team div > span'], ['cards.head', 'Step header', '.card .hd'], ['cards.number', 'Step number', '.card .hd i'], ['cards.picture', 'Map picture box', '.card .art'], ['cards.image', 'Map picture', '.card .art img'], ['cards.strike', 'Ban strike', '.card .strike'], ['cards.map', 'Map name', '.card .mn'], ['cards.team', 'Team line', '.card .by'], ['cards.logo', 'Team logo', '.card .by .lg'], ['cards.note', 'Action note', '.card .nt']],
    'match-intro|full': [['sides.wash', 'Team colour wash', '.side .wash'], ['maps.card', 'Map cards', '.mp > div'], ['maps.picture', 'Map pictures', '.mp img'], ['maps.name', 'Map names', '.mp span'], ['maps.result', 'Map results', '.mp em']],
    'agent-select|full': [['teamheads.logo', 'Team logos', '.th .lg'], ['teamheads.name', 'Team names', '.th b'], ['teamheads.side', 'Side tags', '.th .side'], ['vs.title', 'Title', '.vs b', 1], ['vs.map', 'Map line', '.vs span'], ['mapcard', 'Map card', '.lu-row .mapc'], ['mapcard.picture', 'Map picture', '.mapc .art img'], ['mapcard.name', 'Map name', '.mapc .art b'], ['mapcard.series', 'Series score', '.mapc .score'], ['mapcard.serieslabel', 'Series label', '.mapc .score small'], ['mapcard.wins', 'Map wins', '.mapc .dia i'], ['mapcard.played', 'Maps played', '.mapc .played'], ['count', 'Locked count', '.cnt']],
    'map-result|full': [['score.map', 'Map line', '.sc .w'], ['score.winner', 'Winner line', '.sc .tn'], ['mvp.picture', 'MVP picture', '.mvp img'], ['mvp.label', 'MVP label', '.mvp .k', 1], ['mvp.team', 'MVP team and agent', '.mvp .a'], ['mvp.stats', 'MVP numbers', '.mvp .sts > div'], ['mvp.statlabels', 'MVP number labels', '.mvp .sts small'], ['performers.title', 'Top performers title', '.tp .h', 1], ['performers.rows', 'Performer rows', '.tp .r'], ['performers.picture', 'Performer pictures', '.tp .r img'], ['performers.name', 'Performer names', '.tp .r .n'], ['performers.line', 'Performer lines', '.tp .r .v']],
    'series|full': [['cards.picture', 'Map pictures', '.cd img'], ['cards.shade', 'Picture shade', '.cd .sh'], ['cards.number', 'Map numbers', '.cd .no'], ['cards.pick', 'Pick line', '.cd .pk'], ['results.team', 'Result teams', '.cd .res .t'], ['results.score', 'Result scores', '.cd .res .s span']],
    'halftime|full': [['score.tags', 'Team tags', '.score .t'], ['score.value', 'Half score', '.score .v'], ['halves.head', 'Table header', '.halves .row.h > div'], ['halves.team', 'Team names', '.halves .row .n'], ['halves.value', 'Table numbers', '.halves .row .v'], ['halves.side', 'Side labels', '.halves .v small'], ['rounds.title', 'Round by round title', '.tl .k', 1], ['rounds.cells', 'Round cells', '.tl .strip .c'], ['rounds.number', 'Round numbers', '.tl .c em'], ['rounds.icon', 'Round icons', '.tl .c .win-ic'], ['stats.value', 'Stat numbers', '.side .r b'], ['stats.label', 'Stat labels', '.side .r span']],
    'standings|full': [['header.rank', 'Rank header', '.hh .p'], ['header.team', 'Team header', '.hh .n'], ['header.cols', 'Column headers', '.hh .c'], ['rows.rank', 'Ranks', '.rw .p'], ['rows.team', 'Team names', '.rw .n'], ['rows.cols', 'Columns', '.rw .c'], ['side.title', 'MVP race title', '.side .k', 1], ['side.name', 'MVP name', '.side .v'], ['side.line', 'MVP line', '.side .s']],
    'player-profile|full': [['info.agent', 'Agent and stage', '.a.mono'], ['stats.value', 'Stat numbers', '.grid > div'], ['stats.label', 'Stat labels', '.grid small']],
    'schedule|full': [['rows.match', 'Matches', '.list .m'], ['rows.vs', 'vs', '.list .m i'], ['rows.next', 'Next up tag', '.list .m .lv'], ['rows.note', 'Notes', '.list .m span:not(.lv)']],
    'champion|full': [['roster.names', 'Roster names', '.roster > div'], ['roster.pictures', 'Roster pictures', '.roster img']],
    'holding|full': [['next.label', 'Up next label', '.next .k'], ['next.tags', 'Up next tags', '.next .m .t'], ['next.vs', 'Up next vs', '.next .m .v'], ['next.names', 'Up next names', '.next .s'], ['schedrows.time', 'Schedule times', '.sch .tm'], ['schedrows.match', 'Schedule matches', '.sch .r > span:not(.tm):not(.lab)'], ['schedrows.label', 'Schedule labels', '.sch .lab']],
    'holding|band': [['teamnames.name', 'Team names', '.bd-tname b'], ['teamnames.tag', 'Team tags', '.bd-tname .bd-cap']],
    'map-veto|band': [['maps.number', 'Step numbers', '.bd-map .bd-num'], ['labels.team', 'Label teams', '.bd-vlab b'], ['labels.action', 'Label actions', '.bd-vlab span:not(.acc)'], ['labels.decider', 'Decider word', '.bd-vlab .acc']],
    'agent-select|band': [['series.score', 'Series score', '.bd-lser b']],
    'match-intro|band': [['main', 'Main panel', '.bd-main'], ['lineup.team', 'Lineup team names', '.bd-lt b']],
    'standings|band': [['cells.record', 'Records', '.bd-st b']],
    'player-profile|band': [['stats.value', 'Stat numbers', '.bd-pstats b']],
    'hud': [['eventbug.logo', 'Event logo', '.eb img'], ['eventbug.name', 'Event name', '.eb .a'], ['eventbug.stage', 'Stage', '.eb .a b'], ['seriesmaps.tiles', 'Map tiles', '.sm .tile'], ['seriesmaps.names', 'Map names', '.sm .tile .mn'], ['seriesmaps.scores', 'Map scores', '.sm .tile .sc'], ['sbteams.logo', 'Logos', '.vsb-logo'], ['sbteams.tag', 'Team tags', '.vsb-tag'], ['sbteams.name', 'Team names', '.vsb-sub'], ['scorebug.wins', 'Map wins', '.vsb-heads > div'], ['scorebug.spike', 'Spike icon', '.vsb-spike .vsb-spk'], ['scorebug.spiketime', 'Spike timer', '.vsb-spike span'], ['winprob.value', 'Percentages', '.winp .n'], ['winprob.bar', 'Bar', '.winp .bar'], ['winprob.fill', 'Bar fill', '.winp .bar i'], ['winprob.label', 'Label', '.winp .lab', 1], ['killrows.killeragent', 'Killer agent', '.kr img.a'], ['killrows.killer', 'Killer name', '.kr .n:not(.v)'], ['killrows.weapon', 'Weapon', '.kr img.w'], ['killrows.victim', 'Victim name', '.kr .n.v'], ['killrows.victimagent', 'Victim agent', '.kr img.v'], ['playerrows.agentbox', 'Agent box', '.pr .ag-col'], ['playerrows.agent', 'Agent picture', '.pr .ag-i'], ['playerrows.ult', 'Ult icon', '.pr .ult-ico'], ['playerrows.name', 'Player name', '.pr .nm'], ['playerrows.shield', 'Shield', '.pr .sh'], ['playerrows.health', 'Health number', '.pr .hpn'], ['playerrows.healthbar', 'Health bar', '.pr .hpb'], ['playerrows.healthfill', 'Health fill', '.pr .hpb i'], ['playerrows.abilities', 'Ability icons', '.pr .ab img'], ['playerrows.charges', 'Ability charges', '.pr .cp i'], ['playerrows.weapon', 'Weapon', '.pr .wp'], ['playerrows.creditsicon', 'Credits icon', '.pr .cri'], ['playerrows.credits', 'Credits', '.pr .cr'], ['playerrows.kda', 'K/D/A', '.pr .di > span:not(.de)'], ['playerrows.loadout', 'Loadout icon', '.pr .de img'], ['observed.portraitbox', 'Portrait box', '.ob .pt'], ['observed.portrait', 'Portrait', '.ob .pt img'], ['observed.team', 'Team and agent', '.ob .tg'], ['observed.name', 'Name', '.ob .nm'], ['observed.weapon', 'Weapon', '.ob .ln .wp'], ['observed.credits', 'Credits', '.ob .ln .cr'], ['observed.kda', 'K/D/A', '.ob .ln > span.num'], ['observed.health', 'Health', '.ob .hp .v'], ['observed.healthlabel', 'Health label', '.ob .hp .l'], ['observed.healthicon', 'Health icon', '.ob .hp .l img'], ['observed.healthbar', 'Health bar', '.ob .hp .bar'], ['observed.healthfill', 'Health fill', '.ob .hp .bar i'], ['observed.keys', 'Ability keys', '.ob .slot .k'], ['observed.abilitybox', 'Ability boxes', '.ob .slot .ic'], ['observed.abilities', 'Ability icons', '.ob .slot .ic img'], ['observed.charges', 'Charges', '.ob .slot .ch i'], ['observed.ultpoints', 'Ult points', '.ob .slot .pts'], ['sponsor.label', 'Label', '.spn .k', 1], ['sponsor.name', 'Sponsor name', '.spn .v b'], ['sponsor.line', 'Sponsor line', '.spn .v span'], ['ltbox.kicker', 'Kicker', '.lt .box .k'], ['ltbox.title', 'Title', '.lt .box .t'], ['ltbox.subtitle', 'Subtitle', '.lt .box .s'], ['lowerthird.accent', 'Accent', '.lt .acc'], ['lowerthird.name', 'Caster name', '.lt .cn'], ['lowerthird.handle', 'Caster handle', '.lt .ch'], ['pause.title', 'Pause title', '.pause .a'], ['pause.time', 'Pause time', '.pause .b'], ['banner.portrait', 'Portrait', '.bn .por'], ['banner.headline', 'Headline', '.bn .t1'], ['banner.detail', 'Detail', '.bn .t2'], ['poll.label', 'Label', '.pq .k', 1], ['poll.question', 'Question', '.pq .q'], ['poll.options', 'Option names', '.pq .o > div:not(.b):not(.p)'], ['poll.bar', 'Option bars', '.pq .o .b'], ['poll.fill', 'Option fills', '.pq .o .b i'], ['poll.percent', 'Percentages', '.pq .o .p'], ['poll.votes', 'Votes', '.pq .v'], ['scoreboard.dim', 'Dim backdrop', '.st-dim'], ['scoreboard.title', 'Title', '.st .hd .t', 1], ['scoreboard.map', 'Map line', '.st .hd .m'], ['scoreboard.teams', 'Team blocks', '.st .tb'], ['scoreboard.teamname', 'Team names', '.st .row .tn'], ['scoreboard.teamscore', 'Team scores', '.st .tn b'], ['scoreboard.cols', 'Columns', '.st .row .c'], ['scoreboard.agents', 'Agent icons', '.st .row img'], ['scoreboard.players', 'Player names', '.st .row .pn'], ['scoreboard.loadout', 'Agent and weapon', '.st .row .ag'], ['scoreboard.mvp', 'MVP tag', '.st .pn .mvp'], ['roundhistory.label', 'Header label', '.rh-head .rh-lab'], ['roundhistory.rounds', 'Round numbers', '.rh-head span'], ['roundhistory.now', 'Current round', '.rh-head .now'], ['roundhistory.teams', 'Team tags', '.rh-row .rh-lab'], ['roundhistory.cells', 'Round cells', '.rh-row .c'], ['roundhistory.icons', 'Result icons', '.rh .result-icon'], ['roundhistory.half', 'Half mark', '.rh .half img'], ['economy.teams', 'Team panels', '.ec .tm'], ['economy.head', 'Team headers', '.ec .tm .hd'], ['economy.score', 'Scores', '.ec .team .score'], ['economy.name', 'Team names', '.ec .team .n'], ['economy.side', 'Sides', '.ec .team .side'], ['economy.summary', 'Phase', '.ec .summary'], ['economy.bonus', 'Loss bonus', '.ec .summary span'], ['economy.bank', 'Bank', '.ec .bank .v'], ['economy.banklabel', 'Bank label', '.ec .bank span'], ['economy.econbox', 'Credits box', '.ec .rw .econ'], ['economy.credits', 'Credits', '.ec .econ .cr'], ['economy.change', 'Change', '.ec .econ .change'], ['economy.abilitybox', 'Abilities box', '.ec .rw .abilities'], ['economy.abilities', 'Ability icons', '.ec .ability img'], ['economy.kit', 'Kit box', '.ec .rw .kit'], ['economy.ult', 'Ult icon', '.ec .ult img'], ['economy.ultpoints', 'Ult points', '.ec .ult span'], ['economy.charges', 'Ability charges', '.ec .ability .cp i'], ['economy.weapon', 'Weapon', '.ec .weapon img'], ['economy.armor', 'Armor icon', '.ec .armor img'], ['economy.armorlabel', 'Armor label', '.ec .armor span'], ['economy.identity', 'Player box', '.ec .rw .identity'], ['economy.agent', 'Agent icon', '.ec .identity .ag'], ['economy.player', 'Player name', '.ec .person .n'], ['economy.agentname', 'Agent name', '.ec .person .agent'], ['economy.kda', 'K/D/A', '.ec .kda strong'], ['economy.kdalabel', 'K/D/A label', '.ec .kda span'], ['recap.head', 'Header', '.rr .hd'], ['recap.icon', 'Result icon', '.rr .hd .win-ic'], ['recap.result', 'Result', '.rr .hd .s'], ['recap.title', 'Round winner line', '.rr .hd .t'], ['recap.agents', 'Agent icons', '.rr .col .r img'], ['recap.names', 'Player names', '.rr .n'], ['recap.labels', 'Labels', '.rr .k'], ['recap.values', 'Numbers', '.rr .k b'], ['recap.footer', 'Footer labels', '.rr .ft span'], ['recap.footervalues', 'Footer numbers', '.rr .ft b'], ['duel.backs', 'Player backs', '.du .p .bgc'], ['duel.pictures', 'Pictures', '.du .p img'], ['duel.shade', 'Picture shade', '.du .p .sh'], ['duel.names', 'Names', '.du .p .n'], ['duel.teams', 'Team and agent', '.du .p .t'], ['duel.title', 'Title', '.du .hd'], ['duel.values', 'Numbers', '.du .row .v'], ['duel.labels', 'Labels', '.du .row > div:not(.v)'], ['compare.title', 'Title', '.tc .hd .k'], ['compare.teams', 'Team tags', '.tc .hd .t'], ['compare.bars', 'Bars', '.tc .row .bar'], ['compare.values', 'Numbers', '.tc .row .v'], ['compare.labels', 'Labels', '.tc .row > div:not(.v):not(.bar)']],
  };
  for (const g in EXTRA) GRAPHICS[g].parts.push(...EXTRA[g]);
  // ‹ FINE LAYERS
  const FONTS = { barlow: 'BarlowC', mono: 'JB', montserrat: 'EsportraMontserrat', rajdhani: 'EsportraRajdhani' };
  const POPPINS = { 500: 'PMd', 600: 'PSB', 700: 'PBd', 800: 'PXB', 900: 'PBk' };
  // The weights each font really has (core/fonts); a chosen weight snaps to the nearest, so nothing is faked bold.
  const WEIGHTS = { barlow: [600, 700, 800], poppins: [500, 600, 700, 800, 900], mono: [400, 500, 600, 700, 800], montserrat: [600, 700, 800], rajdhani: [500, 600, 700] };
  const snap = (font, w) => { const list = WEIGHTS[font]; if (!list || w == null) return w; return list.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a)); };
  const BRAND = ['primary', 'secondary', 'panel', 'text', 'atk', 'def'];
  const HEX = /^#[0-9a-f]{6}$/i;
  // Entrances animate transform/opacity/clip (not translate), so a part moved by the template keeps its place.
  const DEPTH = { none: 'none', soft: '0 8px 24px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.4)', strong: '0 18px 48px rgba(0,0,0,.65), 0 3px 8px rgba(0,0,0,.5)' };
  const ENTER = {
    rise: [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    slide: [{ transform: 'translateX(-80px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  };

  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
  /** A colour reference: #rrggbb, brand.<name>, team.a or team.b. */
  function color(v) {
    if (typeof v !== 'string') return null;
    if (HEX.test(v)) return v;
    const m = /^brand\.([a-z]+)$/.exec(v);
    if (m && BRAND.includes(m[1])) return `var(--brand-${m[1]})`;
    if (v === 'team.a' || v === 'team.b') return `var(--team-${v.slice(5)})`;
    return null;
  }
  const withAlpha = (c, a) => (a == null || a >= 1 ? c : `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`);

  // Picture slots (20 Nov): parts whose picture a template may replace with one from a game pack or the producer's
  // own uploads. Data pictures (agents, team logos) are never slots: the game fills them. Air lists the same.
  const SLOTS = {};
  // BR PARTS (generated by dev/br-parts.py) ›
  GRAPHICS["brhud"] = { title: "Battle royale HUD", parts: [["rail", "Points rail", ".brh-rail"], ["rail.head", "Rail header", ".brh-head"], ["rail.title", "Rail title", ".brh-head .t", 1], ["rail.match", "Rail match line", ".brh-head .c"], ["rail.sub", "Rail info bar", ".brh-sub"], ["rail.subtext", "Rail info line", ".brh-sub span"], ["rail.rows", "Rail rows", ".brh-row"], ["rail.bars", "Points bars", ".brh-row .bkx"], ["rail.mpline", "Match point line", ".brh-row .mpl"], ["rail.rank", "Ranks", ".brh-row .rk"], ["rail.logo", "Team logos", ".brh-row .br-tl"], ["rail.name", "Team tags", ".brh-row .nm"], ["rail.mp", "Match point tag", ".brh-row .mpt", 1], ["rail.pips", "Alive marks", ".brh-row .br-pips i"], ["rail.points", "Points", ".brh-row .pt"], ["rail.key", "Key", ".brh-key span"], ["chip", "Match chip", ".brh-chip"], ["chip.match", "Match block", ".brh-chip .m"], ["chip.number", "Match number", ".brh-chip .m b"], ["chip.of", "Match count", ".brh-chip .m span"], ["chip.map", "Map picture", ".brh-chip .mapthumb"], ["chip.event", "Map and event", ".brh-chip .e"], ["chip.mapname", "Map name", ".brh-chip .e b"], ["chip.line", "Event line", ".brh-chip .e span"], ["grid", "Points grid", ".brh-gridbox"], ["grid.title", "Grid title", ".brh-ghead .t", 1], ["grid.match", "Grid match line", ".brh-ghead .m"], ["grid.count", "Alive count", ".brh-ghead .c"], ["grid.tiles", "Tiles", ".brh-tile"], ["grid.lead", "Leader tile", ".brh-tile.lead"], ["grid.rank", "Ranks", ".brh-tile .rk"], ["grid.name", "Team tags", ".brh-tile .nm"], ["grid.points", "Points", ".brh-tile .pt"], ["grid.pips", "Alive marks", ".brh-tile .br-pips i"], ["strip", "Top strip", ".brh-strip"], ["strip.match", "Strip match", ".brh-strip .m"], ["strip.teams", "Strip teams", ".brh-strip .t"], ["strip.rank", "Strip ranks", ".brh-strip .rk"], ["strip.logo", "Strip logos", ".brh-strip .br-tl"], ["strip.name", "Strip tags", ".brh-strip .nm"], ["strip.points", "Strip points", ".brh-strip .pt"], ["strip.alive", "Teams left", ".brh-strip .al"], ["strip.alivenum", "Teams left number", ".brh-strip .al b"], ["popup", "Standings pop-up", ".brh-pop"], ["popup.title", "Pop-up title", ".brh-phead .a", 1], ["popup.line", "Pop-up line", ".brh-phead .b"], ["popup.match", "Pop-up match", ".brh-phead .b b"], ["popup.body", "Pop-up table", ".brh-pbody"], ["popup.rows", "Pop-up rows", ".brh-pr"], ["popup.rank", "Pop-up ranks", ".brh-pr .rk"], ["popup.logo", "Pop-up logos", ".brh-pr .br-tl"], ["popup.name", "Pop-up names", ".brh-pr .nm"], ["popup.pips", "Pop-up alive marks", ".brh-pr .br-pips i"], ["popup.points", "Pop-up points", ".brh-pr .pt"], ["elim", "Team eliminated", ".brh-elim"], ["elim.cam", "Kill-cam frame", ".brh-elim .cam"], ["elim.corners", "Frame corners", ".brh-elim .c"], ["elim.logo", "Team logo", ".brh-elim .br-tl"], ["elim.text", "Text plate", ".brh-elim .tx"], ["elim.word", "Eliminated word", ".brh-elim .tx em", 1], ["elim.name", "Team name", ".brh-elim .tx b"], ["elim.line", "Points and teams left", ".brh-elim .tx span"], ["elim.place", "Place", ".brh-elim .place"], ["elim.hazard", "Hazard stripe", ".brh-elim .hz"], ["moment", "Moments", ".brh-mo"], ["moment.word", "Moment word", ".brh-mo > em"], ["moment.logo", "Moment team logo", ".brh-mo .br-tl"], ["moment.name", "Moment name", ".brh-mo > b"], ["moment.line", "Moment line", ".brh-mo > span:not(.br-tl)"], ["moment.bar", "Zone bar", ".brh-mo.zone > i"], ["ltf", "Live top fraggers", ".brh-ltf"], ["ltf.word", "Top fraggers word", ".brh-ltf > em", 1], ["ltf.players", "Top fragger rows", ".brh-ltf > span"], ["ltf.rank", "Top fragger ranks", ".brh-ltf > span > i"], ["ltf.logo", "Top fragger logos", ".brh-ltf .br-tl"], ["ltf.name", "Top fragger names", ".brh-ltf > span > b"], ["ltf.kills", "Top fragger elims", ".brh-ltf > span > em"]] };
  SLOTS["brhud"] = {"chip.map": "map"};
  GRAPHICS["br-lobby|full"] = { title: "Starting soon", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1", 1], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["emblem", "Event emblem", ".b6-emw"], ["emblem.picture", "Emblem picture", ".b6-emw .br-slot"], ["emblem.text", "Emblem name", ".b6-emblem.gen"], ["emblem.name", "Emblem words", ".b6-emblem.gen b"], ["countdown.label", "Countdown label", ".b6-k2"], ["countdown", "Countdown digits", ".b6-cd .dg"], ["countdown.colon", "Colon", ".b6-cd .col"], ["facts", "Facts", ".b6-facts"], ["facts.label", "Fact labels", ".b6-facts span"], ["facts.value", "Fact values", ".b6-facts b"], ["facts.small", "Fact small text", ".b6-facts small"], ["standings.title", "Standings title", ".b6-lsh"], ["standings", "Standings rows", ".b6-lr"], ["standings.rank", "Ranks", ".b6-lr .rk"], ["standings.logo", "Team logos", ".b6-lr .br-tl"], ["standings.name", "Team names", ".b6-lr .nm"], ["standings.points", "Points", ".b6-lr .v b"], ["standings.unit", "Points word", ".b6-lr small"], ["map", "Tactical map", ".b6-mapwrap"], ["map.picture", "Map picture", ".b6-tac .b6-tacmap"], ["map.letters", "Grid letters", ".b6-tx span"], ["map.numbers", "Grid numbers", ".b6-ty span"], ["map.jump", "Jump marker", ".b6-tfx .jump text"], ["map.north", "North arrow", ".b6-north i"], ["map.n", "North letter", ".b6-north b"]] };
  SLOTS["br-lobby|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "emblem.picture": "any", "map.picture": "map"};
  GRAPHICS["br-today|full"] = { title: "Today's matches", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1", 1], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["day.label", "Day labels", ".b6-day span"], ["day.number", "Day number", ".b6-day b"], ["stops", "Matches", ".b6-stop"], ["stops.disc", "Map discs", ".b6-disc"], ["stops.picture", "Map pictures", ".b6-disc .br-slot"], ["stops.number", "Match numbers", ".b6-disc .no"], ["stops.name", "Map names", ".b6-dl b"], ["stops.status", "Status tags", ".b6-dl .ss"], ["stops.winner", "Winner tags", ".b6-dl .wn"], ["stops.logo", "Winner logos", ".b6-dl .wn .br-tl"], ["stops.team", "Winner names", ".b6-dl .wn em"], ["stops.win", "Winner word", ".b6-dl .wn small"]] };
  SLOTS["br-today|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "stops.picture": "map"};
  GRAPHICS["br-rankings|full"] = { title: "Match results", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1"], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["mapcard", "Map card", ".b6-mapc"], ["mapcard.picture", "Map picture", ".b6-mapc .br-slot"], ["mapcard.name", "Map name", ".b6-mapc span"], ["table", "Table", ".b6-tbl"], ["table.head", "Column heads", ".b6-th span"], ["table.rows", "Rows", ".b6-tr"], ["table.rank", "Ranks", ".b6-tr .rk"], ["table.logo", "Team logos", ".b6-tr .br-tl"], ["table.name", "Team names", ".b6-tr .nm"], ["table.mp", "Match point tags", ".b6-tr .nm em"], ["table.cols", "Numbers", ".b6-tr .c"], ["table.bar", "Bars", ".b6-tr .bar"], ["table.fill", "Bar fills", ".b6-tr .bar > i"], ["table.elims", "Elimination marks", ".b6-tr .bar em b"], ["table.mpline", "Match point line", ".b6-tr .mpm"], ["table.total", "Points", ".b6-tr .t b"], ["players", "Players", ".b6-sq"], ["players.photo", "Player photos", ".b6-ph img"], ["players.shadow", "No-photo shadows", ".b6-ph.none"], ["winner", "Winner block", ".b6-win"], ["badge.place", "Winner place", ".b6-badge .p"], ["badge", "Winner plate", ".b6-badge .n"], ["badge.name", "Winner name", ".b6-badge .n b"], ["badge.line", "Winner line", ".b6-badge .n span"], ["key", "Key", ".b6-key span"], ["key.marks", "Key marks", ".b6-key i"], ["empty", "Waiting note", ".b6-none", 1]] };
  SLOTS["br-rankings|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "mapcard.picture": "map"};
  GRAPHICS["br-overall|full"] = { title: "Overall standings", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1", 1], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["table", "Table", ".b6-tbl"], ["table.head", "Column heads", ".b6-th span"], ["table.rows", "Rows", ".b6-tr"], ["table.rank", "Ranks", ".b6-tr .rk"], ["table.logo", "Team logos", ".b6-tr .br-tl"], ["table.name", "Team names", ".b6-tr .nm"], ["table.mp", "Match point tags", ".b6-tr .nm em"], ["table.cols", "Numbers", ".b6-tr .c"], ["table.bar", "Bars", ".b6-tr .bar"], ["table.fill", "Bar fills", ".b6-tr .bar > i"], ["table.elims", "Elimination marks", ".b6-tr .bar em b"], ["table.mpline", "Match point line", ".b6-tr .mpm"], ["table.total", "Points", ".b6-tr .t b"], ["leader", "Leader card", ".b6-ldc"], ["leader.label", "Leader label", ".b6-ldc span", 1], ["leader.name", "Leader name", ".b6-ldc b"], ["leader.line", "Leader points", ".b6-ldc em"], ["header.mp", "Match point tag", ".b6-s .mpx"]] };
  SLOTS["br-overall|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
  GRAPHICS["br-wwcd|full"] = { title: "WWCD", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["logo", "Esports logo", ".brf > .b6-logo.solo"], ["players", "Players", ".b6-sq"], ["players.photo", "Player photos", ".b6-ph img"], ["players.shadow", "No-photo shadows", ".b6-ph.none"], ["flares", "Flares", ".b6-flare"], ["shards", "Shards", ".b6-shard"], ["word", "Winner word", ".b6-ww .b6-lt"], ["word.depth", "Word depth", ".b6-ww .dp"], ["word.face", "Word face", ".b6-ww .fc"], ["subline", "Winner line", ".b6-wl", 1], ["team", "Team plate", ".b6-wteam"], ["team.match", "Match", ".b6-wteam .a"], ["team.name", "Team name", ".b6-wteam .b"], ["team.logo", "Team logo", ".b6-wteam .br-tl"], ["team.points", "Points block", ".b6-wteam .c"], ["team.value", "Points number", ".b6-wteam .c b"], ["team.unit", "Points word", ".b6-wteam .c span", 1], ["stats", "Player plates", ".b6-wst > div"], ["stats.name", "Player names", ".b6-wst b"], ["stats.label", "Stat labels", ".b6-wst span"], ["stats.value", "Stat numbers", ".b6-wst em"]] };
  SLOTS["br-wwcd|full"] = {"logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
  GRAPHICS["br-mvp|full"] = { title: "Match MVP", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1", 1], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["mapcard", "Map card", ".b6-mapc"], ["mapcard.picture", "Map picture", ".b6-mapc .br-slot"], ["mapcard.name", "Map name", ".b6-mapc span"], ["hero", "MVP", ".b6-hero"], ["hero.number", "Big 1", ".b6-hero .one"], ["hero.dials", "Dials", ".b6-hero .dial"], ["hero.photo", "MVP photo", ".b6-hp"], ["hero.photoimg", "MVP photo picture", ".b6-hp img"], ["hero.shadow", "MVP shadow", ".b6-hp .b6-ph.none"], ["hero.stats", "Stat plates", ".b6-nums div"], ["hero.values", "Stat numbers", ".b6-nums b"], ["hero.name", "Player name", ".b6-hn b"], ["hero.team", "Team line", ".b6-hn span"], ["hero.logo", "Team logo", ".b6-hn .br-tl"], ["others", "Players 2 to 4", ".b6-side"], ["others.rank", "Ranks", ".b6-side .rk"], ["others.photo", "Photos", ".b6-sp2"], ["others.photoimg", "Photo pictures", ".b6-sp2 img"], ["others.shadow", "Shadows", ".b6-sp2 .b6-ph.none"], ["others.name", "Names", ".b6-side .inf b"], ["others.line", "Team and numbers", ".b6-side .inf span"], ["others.values", "Numbers", ".b6-side .n3 em"], ["empty", "Waiting note", ".b6-none", 1]] };
  SLOTS["br-mvp|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "mapcard.picture": "map"};
  GRAPHICS["br-champion|full"] = { title: "Champions", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["logo", "Esports logo", ".brf > .b6-logo.solo"], ["emblem", "Event emblem", ".b6-emw"], ["emblem.picture", "Emblem picture", ".b6-emw .br-slot"], ["emblem.text", "Emblem name", ".b6-emblem.gen"], ["emblem.name", "Emblem words", ".b6-emblem.gen b"], ["players", "Players", ".b6-sq"], ["players.photo", "Player photos", ".b6-ph img"], ["players.shadow", "No-photo shadows", ".b6-ph.none"], ["rays", "Rays", ".b6-rays"], ["word", "Champions word", ".b6-cw .b6-lt"], ["word.depth", "Word depth", ".b6-cw .dp"], ["word.face", "Word face", ".b6-cw .fc"], ["team", "Team plate", ".b6-cn"], ["team.logo", "Team logo", ".b6-cn .br-tl"], ["team.name", "Team name", ".b6-cn b"], ["stats", "Stats", ".b6-cst div"], ["stats.value", "Stat numbers", ".b6-cst b"], ["journey", "Journey", ".b6-jr"], ["journey.label", "Journey title", ".b6-jr .lab"], ["journey.sub", "Journey line", ".b6-jr .lab span"], ["journey.marks", "Match labels", ".b6-jr text"]] };
  SLOTS["br-champion|full"] = {"logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "emblem.picture": "any"};
  GRAPHICS["br-teams|full"] = { title: "Teams in this lobby", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1", 1], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["cards", "Team cards", ".fd-tc"], ["cards.head", "Card heads", ".fd-tch"], ["cards.logo", "Team logos", ".fd-tch .br-tl"], ["cards.name", "Team names", ".fd-tch b"], ["cards.seed", "Seeds", ".fd-seed"], ["cards.players", "Players", ".fd-tcp span"]] };
  SLOTS["br-teams|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
  GRAPHICS["br-drop|full"] = { title: "Drop map", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1", 1], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["map", "Tactical map", ".fd-drop"], ["map.picture", "Map picture", ".fd-drop .b6-tacmap"], ["map.letters", "Grid letters", ".fd-drop .b6-tx span"], ["map.numbers", "Grid numbers", ".fd-drop .b6-ty span"], ["map.jump", "Jump marker", ".fd-drop .b6-tfx .jump text"], ["map.north", "North arrow", ".fd-drop .b6-north i"], ["map.n", "North letter", ".fd-drop .b6-north b"], ["side.label", "Flight path label", ".fd-dropside .fd-k", 1], ["side.map", "Map name", ".fd-big"], ["side.line", "Match line", ".fd-line span"], ["side.legend", "Legend", ".fd-legend span"], ["side.keys", "Legend marks", ".fd-legend i"]] };
  SLOTS["br-drop|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "map.picture": "map"};
  GRAPHICS["br-fraggers|full"] = { title: "Top fraggers", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1", 1], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["cards", "Player cards", ".fd-fc"], ["cards.top", "Top card", ".fd-fc.top"], ["cards.rank", "Ranks", ".fd-rk"], ["cards.photo", "Photos", ".fd-fc .fd-ph"], ["cards.photoimg", "Photo pictures", ".fd-fc .b6-ph img"], ["cards.shadow", "No-photo shadows", ".fd-fc .b6-ph.none"], ["cards.kills", "Elims", ".fd-kills"], ["cards.word", "Elims word", ".fd-kills small"], ["cards.name", "Player names", ".fd-pn"], ["cards.team", "Team lines", ".fd-fc .fd-pt"], ["cards.logo", "Team logos", ".fd-fc .fd-pt .br-tl"], ["cards.stats", "Damage and knocks", ".fd-ps"], ["cards.values", "Numbers", ".fd-ps em"]] };
  SLOTS["br-fraggers|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
  GRAPHICS["br-tom|full"] = { title: "Team of the match", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1", 1], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["team", "Team plate", ".fd-tomh"], ["team.logo", "Team logo", ".fd-tomh .br-tl"], ["team.name", "Team name", ".fd-tomh > b"], ["team.points", "Points", ".fd-pts"], ["team.value", "Points number", ".fd-pts b"], ["players", "Player cards", ".fd-tp"], ["players.photo", "Photos", ".fd-tp .fd-ph"], ["players.photoimg", "Photo pictures", ".fd-tp .b6-ph img"], ["players.shadow", "No-photo shadows", ".fd-tp .b6-ph.none"], ["players.name", "Player names", ".fd-tp > b"], ["players.stats", "Player numbers", ".fd-tps span"], ["players.values", "Numbers", ".fd-tps em"], ["totals", "Team numbers", ".fd-toms div"], ["totals.value", "Team values", ".fd-toms b"]] };
  SLOTS["br-tom|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
  GRAPHICS["br-profile|full"] = { title: "Player profile", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1", 1], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["photo", "Photo", ".fd-pbig"], ["photo.img", "Photo picture", ".fd-pbig .b6-ph img"], ["photo.shadow", "No-photo shadow", ".fd-pbig .b6-ph.none"], ["team", "Team line", ".fd-pinfo > .fd-pt"], ["team.logo", "Team logo", ".fd-pinfo > .fd-pt .br-tl"], ["name", "Player name", ".fd-pname"], ["tiles", "Stat tiles", ".fd-tiles div"], ["tiles.value", "Stat numbers", ".fd-tiles b"], ["bars.label", "Bars title", ".fd-bars .fd-k", 1], ["bars", "Match rows", ".fd-bar"], ["bars.match", "Match labels", ".fd-bar span"], ["bars.fill", "Bars", ".fd-bar i"], ["bars.value", "Damage", ".fd-bar b"], ["bars.elims", "Elims", ".fd-bar em"], ["rating", "Rating", ".fd-rating"], ["rating.word", "Rating word", ".fd-rating span", 1], ["rating.value", "Rating number", ".fd-rating b"]] };
  SLOTS["br-profile|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
  GRAPHICS["br-mstats|full"] = { title: "Match stats", parts: [["field", "Colour field", ".brf"], ["background", "Background picture", ".brf > .br-slot.bg"], ["veil", "Colour veil", ".b6-veil"], ["chutes", "Parachutes", ".b6-chute"], ["crate", "Airdrop crate", ".brf > .b6-crate"], ["footer", "Footer", ".b6-ft"], ["footer.ci", "Partner logos", ".b6-ft .b6-ci"], ["footer.line", "Footer line", ".b6-fl"], ["footer.sponsors", "Sponsors", ".b6-fr"], ["footer.sponsor", "Sponsor logos", ".b6-sp"], ["header", "Header", ".b6-hd"], ["header.logo", "Esports logo", ".b6-hd .b6-logo"], ["header.rule", "Header line", ".b6-rule"], ["header.event", "Event line", ".b6-k"], ["header.eventmark", "Event line marks", ".b6-k i"], ["header.title", "Title", ".b6-hd h1"], ["header.context", "Context", ".b6-s > span"], ["header.dots", "Context dots", ".b6-s > i"], ["header.progress", "Progress marks", ".b6-pips i"], ["header.card", "Context card", ".b6-card"], ["mapcard", "Map card", ".b6-mapc"], ["mapcard.picture", "Map picture", ".b6-mapc .br-slot"], ["mapcard.name", "Map name", ".b6-mapc span"], ["table", "Table", ".fd-ms"], ["table.head", "Column heads", ".fd-ms .b6-th span"], ["table.rows", "Rows", ".fd-ms .b6-tr"], ["table.rank", "Ranks", ".fd-ms .rk"], ["table.logo", "Team logos", ".fd-ms .br-tl"], ["table.name", "Team names", ".fd-ms .nm"], ["table.bar", "Damage bars", ".fd-ms .bar"], ["table.fill", "Bar fills", ".fd-ms .bar i"], ["table.damage", "Damage", ".fd-ms .bar b"], ["table.cols", "Numbers", ".fd-ms .c"]] };
  SLOTS["br-mstats|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "mapcard.picture": "map"};
  // ‹ BR PARTS
  function slotsOf(graphic) {
    const own = SLOTS[graphic] || {};
    const auto = /\|full$/.test(graphic) && partsOf(graphic).some(p => p[0] === 'background') ? { background: 'background' } : {};
    return Object.assign({}, auto, own);
  }
  /** Only pack files and the producer's uploads, both served by the graphics engine. */
  const PIC = /^\/(packs\/[a-z0-9]{2,16}\/[0-9a-f]{64}\.(png|jpg|webp)|air-assets\/[0-9a-f-]{36})$/;
  function picture(p) {
    const pic = p && p.picture;
    if (!pic || typeof pic !== 'object' || typeof pic.src !== 'string' || !PIC.test(pic.src)) return null;
    return { src: pic.src, fit: pic.fit === 'contain' ? 'contain' : 'cover', flip: pic.flip === true };
  }

  /** The inline styles for one part's settings. Anything unknown or out of range is left out. */
  function styles(p) {
    const out = {};
    if (!p || typeof p !== 'object') return out;
    const x = num(p.x, -1920, 1920), y = num(p.y, -1080, 1080), sc = num(p.scale, 0.25, 3);
    if (x || y) out.translate = `${x || 0}px ${y || 0}px`;
    if (sc != null && sc !== 1) out.scale = String(sc);
    const z = num(p.z, -99, 99), op = num(p.opacity, 0, 1), size = num(p.size, 6, 240), sp = num(p.spacing, -0.1, 0.6), rad = num(p.radius, 0, 80);
    if (z != null) out['z-index'] = String(Math.round(z));
    if (p.hidden === true) out.visibility = 'hidden';
    if (op != null) out.opacity = String(op);
    const f = p.fill;
    if (f && typeof f === 'object') {
      const a = color(f.a), b = color(f.b), al = num(f.alpha, 0, 1);
      if (f.kind === 'none') out.background = 'none';
      else if (f.kind === 'solid' && a) out.background = withAlpha(a, al);
      else if (f.kind === 'gradient' && a && b) out.background = `linear-gradient(${num(f.angle, 0, 360) ?? 180}deg, ${withAlpha(a, al)}, ${withAlpha(b, al)})`;
    }
    const c = color(p.color); if (c) { out.color = c; out['-webkit-text-fill-color'] = c; }
    const w = snap(p.font, num(p.weight, 400, 900));
    if (p.font === 'poppins') out['font-family'] = POPPINS[w ? Math.max(500, Math.round(w / 100) * 100) : 600] + ', sans-serif';
    else if (FONTS[p.font]) out['font-family'] = FONTS[p.font] + ', sans-serif';
    if (w != null) out['font-weight'] = String(Math.round(w / 100) * 100);
    if (size != null) out['font-size'] = size + 'px';
    if (sp != null) out['letter-spacing'] = sp + 'em';
    if (p.caps === 'upper') out['text-transform'] = 'uppercase'; else if (p.caps === 'none') out['text-transform'] = 'none';
    const bd = p.border;
    if (bd && typeof bd === 'object') {
      const bc = color(bd.color), bw = num(bd.width, 0, 16);
      if (bd.sides === 'none') out.border = 'none';
      else if (bc && bw != null && ['all', 'top', 'bottom', 'left', 'right'].includes(bd.sides)) out[bd.sides === 'all' ? 'border' : 'border-' + bd.sides] = `${bw}px solid ${bc}`;
    }
    if (rad != null) out['border-radius'] = rad + 'px';
    if (DEPTH[p.depth]) out['box-shadow'] = DEPTH[p.depth];
    const pic = picture(p);
    if (pic) {
      out['background-image'] = `url("${pic.src}")`;
      out['background-size'] = pic.fit; out['background-position'] = 'center'; out['background-repeat'] = 'no-repeat';
      if (pic.flip) out.transform = 'scaleX(-1)';
    }
    return out;
  }
  /** The same picture for an <img> part: its content is replaced, so no markup changes. */
  function imgStyles(css, p) {
    const pic = picture(p); if (!pic) return css;
    const out = {};
    for (const k in css) if (!k.startsWith('background-')) out[k] = css[k];
    out.content = `url("${pic.src}")`; out['object-fit'] = pic.fit;
    return out;
  }
  const words = v => (typeof v === 'string' && v.length <= 40 && !/[<>]/.test(v) ? v : null);

  function partsOf(graphic) { return (GRAPHICS[graphic] || { parts: [] }).parts; }
  const SET = typeof WeakMap === 'function' ? new WeakMap() : null;

  // A template's parts compiled once (18 Nov: graphics now have up to ~300 fine layers, and turning every part's
  // settings into styles on every redraw made a full HUD template ten times slower). Keyed by the template's
  // id and save time, so the copy the room sends on each update reuses the same compiled list.
  const COMPILED = new Map(), BY_OBJECT = typeof WeakMap === 'function' ? new WeakMap() : null;
  function compiled(template, graphic) {
    if (!template || template.graphic !== graphic || !template.parts) return [];
    const same = BY_OBJECT && BY_OBJECT.get(template);
    if (same && same.graphic === graphic) return same.list;
    const key = `${graphic}|${template.id}|${template.updatedAt}`;
    // An editor draft keeps its id and save time while it changes, so it is compiled per message (by object) only.
    const saved = template.id && template.updatedAt && !template.draft;
    const hit = saved ? COMPILED.get(key) : null;
    if (hit) { BY_OBJECT && BY_OBJECT.set(template, { graphic, list: hit }); return hit; }
    const list = [];
    for (const [id, , sel, fixed] of partsOf(graphic)) {
      const p = template.parts[id]; if (!p) continue;
      const css = styles(p);
      const img = picture(p) ? imgStyles(css, p) : null;
      list.push({ sel, css, keys: Object.keys(css), img, imgKeys: img ? Object.keys(img) : null, label: fixed ? words(p.label) : null, entrance: p.entrance && ENTER[p.entrance.kind] ? p.entrance : null });
    }
    if (saved) { if (COMPILED.size > 40) COMPILED.clear(); COMPILED.set(key, list); }
    if (BY_OBJECT) BY_OBJECT.set(template, { graphic, list });
    return list;
  }
  /** The elements a part's selector reaches. "A B" selectors look inside each A, not the whole page. */
  function reach(rootEl, sel, roots, hiddenToo) {
    const m = /^(\.[\w-]+) ([^,]+)$/.exec(sel);
    if (!m || m[2].startsWith('>')) return rootEl.querySelectorAll(sel);
    let list = roots.get(m[1]);
    // A part inside a HUD panel that is switched off waits until it shows (it is styled on the redraw that
    // shows it), so hidden panels cost nothing on every update.
    if (!list) { list = Array.prototype.filter.call(rootEl.querySelectorAll(m[1]), r => { if (hiddenToo) return true; const mod = r.closest('.mod'); return !mod || mod.classList.contains('on'); }); roots.set(m[1], list); }
    if (list.length === 1) return list[0].querySelectorAll(m[2]);
    const out = [];
    list.forEach(r => r.querySelectorAll(m[2]).forEach(el => out.push(el)));
    return out;
  }

  // What changed under a root since the last pass (its style, its words or its children): only those
  // elements, new ones and ones whose parts changed are written again (18 Nov: a full HUD template touches
  // ~1000 elements, and re-checking every property of each on every redraw was the slow part).
  const WATCH = typeof WeakMap === 'function' ? new WeakMap() : null;
  function changedUnder(rootEl) {
    if (!WATCH || typeof MutationObserver !== 'function') return null;
    let w = WATCH.get(rootEl);
    if (!w) {
      w = { mo: new MutationObserver(() => {}), dirty: new Set(), words: new Set() };
      w.mo.observe(rootEl, { subtree: true, attributes: true, attributeFilter: ['style'], childList: true, characterData: true });
      WATCH.set(rootEl, w);
      return { all: true, w };
    }
    // A style change needs the part's styles again; new words only matter where the template replaces them.
    for (const r of w.mo.takeRecords()) (r.type === 'attributes' ? w.dirty : w.words).add(r.target.nodeType === 1 ? r.target : r.target.parentElement);
    return { all: false, w };
  }

  /** Applies a template's parts inside `root`; parts the template no longer sets go back to their own look. */
  function apply(rootEl, template, graphic) {
    if (!rootEl || !SET) return;
    const want = new Map(), roots = new Map(), list = compiled(template, graphic);
    list.forEach((c, i) => {
      reach(rootEl, c.sel, roots).forEach(el => {
        const w = want.get(el);
        const asImg = c.img && el.tagName === 'IMG';
        const css = asImg ? c.img : c.css;
        // One part on an element shares its compiled styles; a second part makes a merged copy.
        if (!w) { want.set(el, { css, keys: asImg ? c.imgKeys : c.keys, own: false, label: c.label, sig: i }); return; }
        if (!w.own) { w.css = { ...w.css }; w.own = true; }
        Object.assign(w.css, css); w.keys = null; if (c.label != null) w.label = c.label; w.sig += ',' + i;
      });
    });
    const seen = changedUnder(rootEl);
    // Clear what an earlier template set on parts this one leaves alone.
    rootEl.querySelectorAll('[data-tpl]').forEach(el => { if (!want.has(el)) restore(el); });
    want.forEach((w, el) => {
      const keys = w.keys || (w.keys = Object.keys(w.css));
      const prev = SET.get(el);
      if (!prev) {
        // A new element (a redraw made it): nothing of ours on it yet, so write without reading first.
        for (const k of keys) el.style.setProperty(k, w.css[k], 'important');
        let text = null;
        if (w.label != null) { text = el.textContent; if (text !== w.label) el.textContent = w.label; }
        SET.set(el, { css: keys, vals: w.css, text, list, sig: w.sig });
        el.setAttribute('data-tpl', '');
        return;
      }
      if (seen && !seen.all && prev.list === list && prev.sig === w.sig && !seen.w.dirty.has(el) && !(w.label != null && seen.w.words.has(el))) return;
      prev.css.forEach(k => { if (!(k in w.css)) el.style.removeProperty(k); });
      for (const k of keys) { const v = w.css[k]; if (el.style.getPropertyValue(k) !== v || el.style.getPropertyPriority(k) !== 'important') el.style.setProperty(k, v, 'important'); }
      let text = prev.text;
      if (w.label != null) { if (text == null) text = el.textContent; if (el.textContent !== w.label) el.textContent = w.label; }
      else if (text != null) { if (el.textContent !== text) el.textContent = text; text = null; }
      SET.set(el, { css: keys, vals: w.css, text, list, sig: w.sig });
      if (!el.hasAttribute('data-tpl')) el.setAttribute('data-tpl', '');
    });
    // Our own writes are not changes to react to next time.
    if (seen) { seen.w.mo.takeRecords(); seen.w.dirty.clear(); seen.w.words.clear(); }
  }
  function restore(el) {
    const prev = SET.get(el); if (!prev) { el.removeAttribute('data-tpl'); return; }
    prev.css.forEach(k => el.style.removeProperty(k));
    if (prev.text != null && el.textContent !== prev.text) el.textContent = prev.text;
    SET.delete(el); el.removeAttribute('data-tpl');
  }

  /** What a template set on an element (its inline properties, and whether it replaced the words), so a
   *  redraw can keep them instead of stripping them for a frame (the flash on every veto update). */
  function owned(el) {
    const prev = SET && SET.get(el);
    return prev ? { css: prev.vals || {}, text: prev.text != null } : null;
  }

  /** Plays each part's entrance (preview Play, and when the full-screen host shows the graphic). */
  function enter(rootEl, template, graphic) {
    if (!rootEl || !template || template.graphic !== graphic || typeof Element === 'undefined' || !Element.prototype.animate) return;
    for (const [id, , sel] of partsOf(graphic)) {
      const e = template.parts && template.parts[id] && template.parts[id].entrance;
      if (!e || !ENTER[e.kind]) continue;
      const ms = num(e.ms, 0, 3000) ?? 600, delay = num(e.delay, 0, 3000) ?? 0;
      rootEl.querySelectorAll(sel).forEach((el, i) => el.animate(ENTER[e.kind], { duration: ms, delay: delay + (e.stagger ? i * 60 : 0), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
    }
  }

  /** Whether a part is on screen: its module is switched on and it takes up room. */
  // Read from the HUD's own on/off classes only, so checking never forces the browser to lay out the page.
  const shown = el => { if (el.hidden) return false; if (el.classList.contains('pause')) return el.classList.contains('on'); const m = el.closest && el.closest('.mod'); return !m || m.classList.contains('on') || el.classList.contains('on'); };
  const SEEN = typeof WeakMap === 'function' ? new WeakMap() : null;
  const LAST = typeof WeakMap === 'function' ? new WeakMap() : new Map();
  /** Plays a part's entrance each time it appears (a banner, the pause box). The first pass only records
   *  what is on screen, so a page refresh replays nothing. */
  function appear(rootEl, template, graphic, first) {
    if (!rootEl || !SEEN || !template || template.graphic !== graphic || typeof Element === 'undefined' || !Element.prototype.animate) return;
    // Nothing can have appeared while no panel switched on or off: skip the pass (18 Nov: with ~170 fine
    // layers, looking at every element on every redraw was most of a template's cost).
    const sig = Array.prototype.map.call(rootEl.querySelectorAll('.mod, .on'), el => (el.classList.contains('on') ? '1' : '0')).join('');
    const was = LAST.get(rootEl);
    LAST.set(rootEl, sig);
    if (!first && was === sig) return;
    const roots = new Map();
    for (const { sel, entrance: e } of compiled(template, graphic)) {
      if (!e) continue;
      // Hidden panels too: an entrance plays when a part goes from hidden to shown.
      Array.prototype.forEach.call(reach(rootEl, sel, roots, true), (el, i) => {
        const now = shown(el), before = SEEN.get(el);
        SEEN.set(el, now);
        if (first || !now || before === true) return;
        el.animate(ENTER[e.kind], { duration: num(e.ms, 0, 3000) ?? 600, delay: (num(e.delay, 0, 3000) ?? 0) + (e.stagger ? i * 60 : 0), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      });
    }
  }

  /** The brand kit and team colours as CSS variables on the page. */
  function brand(doc, kit, teams) {
    if (!doc || !doc.documentElement) return;
    const st = doc.documentElement.style, k = kit && typeof kit === 'object' ? kit : {};
    const D = { primary: '#8b7cf6', secondary: '#ffc83d', panel: '#12162f', text: '#ffffff', atk: '#c83452', def: '#169684' };
    BRAND.forEach(n => st.setProperty('--brand-' + n, HEX.test(k[n] || '') ? k[n] : D[n]));
    (teams || []).slice(0, 2).forEach((t, i) => st.setProperty('--team-' + 'ab'[i], HEX.test(t && t.color || '') ? t.color : i ? '#e0364f' : '#22b8c9'));
  }

  /** The graphic a page shows: the full-screen host's current one, or the HUD. */
  const graphicOf = (screen, style) => (screen ? `${screen}|${style === 'band' ? 'band' : 'full'}` : 'hud');

  return { GRAPHICS, SLOTS, slotsOf, FONTS: [...Object.keys(FONTS), 'poppins'], WEIGHTS, BRAND, ENTRANCES: Object.keys(ENTER), styles, apply, enter, appear, brand, graphicOf, partsOf, owned };
});
