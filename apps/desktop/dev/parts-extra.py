# Fine layers for every graphic (17 Nov audit). One source for both lists: this writes the EXTRA block into
# src/shared/templates.ts (ids, labels, words) and esportra-valorant-hud/core/templates.js (plus selectors).
# An id "parent.child" is shown under its parent in Graphics studio. Run: python3 dev/parts-extra.py
import json, re, pathlib

W = 1  # words: a fixed label the template may replace
X = {
  'map-veto|full': [
    ('teams', 'Team blocks', '.vt-team'), ('teams.logo', 'Team logos', '.vt-team .lg'), ('teams.name', 'Team names', '.vt-team b'), ('teams.tag', 'Team tags', '.vt-team div > span'),
    ('cards.head', 'Step header', '.card .hd'), ('cards.number', 'Step number', '.card .hd i'), ('cards.picture', 'Map picture box', '.card .art'), ('cards.image', 'Map picture', '.card .art img'),
    ('cards.strike', 'Ban strike', '.card .strike'), ('cards.map', 'Map name', '.card .mn'), ('cards.team', 'Team line', '.card .by'), ('cards.logo', 'Team logo', '.card .by .lg'), ('cards.note', 'Action note', '.card .nt'),
  ],
  'match-intro|full': [
    ('sides.wash', 'Team colour wash', '.side .wash'), ('maps.card', 'Map cards', '.mp > div'), ('maps.picture', 'Map pictures', '.mp img'), ('maps.name', 'Map names', '.mp span'), ('maps.result', 'Map results', '.mp em'),
  ],
  'agent-select|full': [
    ('teamheads.logo', 'Team logos', '.th .lg'), ('teamheads.name', 'Team names', '.th b'), ('teamheads.side', 'Side tags', '.th .side'),
    ('vs.title', 'Title', '.vs b', W), ('vs.map', 'Map line', '.vs span'),
    ('mapcard', 'Map card', '.lu-row .mapc'), ('mapcard.picture', 'Map picture', '.mapc .art img'), ('mapcard.name', 'Map name', '.mapc .art b'), ('mapcard.series', 'Series score', '.mapc .score'),
    ('mapcard.serieslabel', 'Series label', '.mapc .score small'), ('mapcard.wins', 'Map wins', '.mapc .dia i'), ('mapcard.played', 'Maps played', '.mapc .played'), ('count', 'Locked count', '.cnt'),
  ],
  'map-result|full': [
    ('score.map', 'Map line', '.sc .w'), ('score.winner', 'Winner line', '.sc .tn'), ('mvp.picture', 'MVP picture', '.mvp img'), ('mvp.label', 'MVP label', '.mvp .k', W), ('mvp.team', 'MVP team and agent', '.mvp .a'),
    ('mvp.stats', 'MVP numbers', '.mvp .sts > div'), ('mvp.statlabels', 'MVP number labels', '.mvp .sts small'), ('performers.title', 'Top performers title', '.tp .h', W), ('performers.rows', 'Performer rows', '.tp .r'),
    ('performers.picture', 'Performer pictures', '.tp .r img'), ('performers.name', 'Performer names', '.tp .r .n'), ('performers.line', 'Performer lines', '.tp .r .v'),
  ],
  'series|full': [
    ('cards.picture', 'Map pictures', '.cd img'), ('cards.shade', 'Picture shade', '.cd .sh'), ('cards.number', 'Map numbers', '.cd .no'), ('cards.pick', 'Pick line', '.cd .pk'),
    ('results.team', 'Result teams', '.cd .res .t'), ('results.score', 'Result scores', '.cd .res .s span'),
  ],
  'halftime|full': [
    ('score.tags', 'Team tags', '.score .t'), ('score.value', 'Half score', '.score .v'), ('halves.head', 'Table header', '.halves .row.h > div'), ('halves.team', 'Team names', '.halves .row .n'),
    ('halves.value', 'Table numbers', '.halves .row .v'), ('halves.side', 'Side labels', '.halves .v small'), ('rounds.title', 'Round by round title', '.tl .k', W), ('rounds.cells', 'Round cells', '.tl .strip .c'),
    ('rounds.number', 'Round numbers', '.tl .c em'), ('rounds.icon', 'Round icons', '.tl .c .win-ic'), ('stats.value', 'Stat numbers', '.side .r b'), ('stats.label', 'Stat labels', '.side .r span'),
  ],
  'standings|full': [
    ('header.rank', 'Rank header', '.hh .p'), ('header.team', 'Team header', '.hh .n'), ('header.cols', 'Column headers', '.hh .c'), ('rows.rank', 'Ranks', '.rw .p'), ('rows.team', 'Team names', '.rw .n'),
    ('rows.cols', 'Columns', '.rw .c'), ('side.title', 'MVP race title', '.side .k', W), ('side.name', 'MVP name', '.side .v'), ('side.line', 'MVP line', '.side .s'),
  ],
  'player-profile|full': [('info.agent', 'Agent and stage', '.a.mono'), ('stats.value', 'Stat numbers', '.grid > div'), ('stats.label', 'Stat labels', '.grid small')],
  'schedule|full': [('rows.match', 'Matches', '.list .m'), ('rows.vs', 'vs', '.list .m i'), ('rows.next', 'Next up tag', '.list .m .lv'), ('rows.note', 'Notes', '.list .m span:not(.lv)')],
  'champion|full': [('roster.names', 'Roster names', '.roster > div'), ('roster.pictures', 'Roster pictures', '.roster img')],
  'holding|full': [
    ('next.label', 'Up next label', '.next .k'), ('next.tags', 'Up next tags', '.next .m .t'), ('next.vs', 'Up next vs', '.next .m .v'), ('next.names', 'Up next names', '.next .s'),
    ('schedrows.time', 'Schedule times', '.sch .tm'), ('schedrows.match', 'Schedule matches', '.sch .r > span:not(.tm):not(.lab)'), ('schedrows.label', 'Schedule labels', '.sch .lab'),
  ],
  'holding|band': [('teamnames.name', 'Team names', '.bd-tname b'), ('teamnames.tag', 'Team tags', '.bd-tname .bd-cap')],
  'map-veto|band': [('maps.number', 'Step numbers', '.bd-map .bd-num'), ('labels.team', 'Label teams', '.bd-vlab b'), ('labels.action', 'Label actions', '.bd-vlab span:not(.acc)'), ('labels.decider', 'Decider word', '.bd-vlab .acc')],
  'agent-select|band': [('series.score', 'Series score', '.bd-lser b')],
  'match-intro|band': [('main', 'Main panel', '.bd-main'), ('lineup.team', 'Lineup team names', '.bd-lt b')],
  'standings|band': [('cells.record', 'Records', '.bd-st b')],
  'player-profile|band': [('stats.value', 'Stat numbers', '.bd-pstats b')],
  'hud': [
    ('eventbug.logo', 'Event logo', '.eb img'), ('eventbug.name', 'Event name', '.eb .a'), ('eventbug.stage', 'Stage', '.eb .a b'),
    ('seriesmaps.tiles', 'Map tiles', '.sm .tile'), ('seriesmaps.names', 'Map names', '.sm .tile .mn'), ('seriesmaps.scores', 'Map scores', '.sm .tile .sc'),
    ('sbteams.logo', 'Logos', '.vsb-logo'), ('sbteams.tag', 'Team tags', '.vsb-tag'), ('sbteams.name', 'Team names', '.vsb-sub'), ('scorebug.wins', 'Map wins', '.vsb-heads > div'),
    ('scorebug.spike', 'Spike icon', '.vsb-spike .vsb-spk'), ('scorebug.spiketime', 'Spike timer', '.vsb-spike span'),
    ('winprob.value', 'Percentages', '.winp .n'), ('winprob.bar', 'Bar', '.winp .bar'), ('winprob.fill', 'Bar fill', '.winp .bar i'), ('winprob.label', 'Label', '.winp .lab', W),
    ('killrows.killeragent', 'Killer agent', '.kr img.a'), ('killrows.killer', 'Killer name', '.kr .n:not(.v)'), ('killrows.weapon', 'Weapon', '.kr img.w'), ('killrows.victim', 'Victim name', '.kr .n.v'), ('killrows.victimagent', 'Victim agent', '.kr img.v'),
    ('playerrows.agentbox', 'Agent box', '.pr .ag-col'), ('playerrows.agent', 'Agent picture', '.pr .ag-i'), ('playerrows.ult', 'Ult icon', '.pr .ult-ico'), ('playerrows.name', 'Player name', '.pr .nm'),
    ('playerrows.shield', 'Shield', '.pr .sh'), ('playerrows.health', 'Health number', '.pr .hpn'), ('playerrows.healthbar', 'Health bar', '.pr .hpb'), ('playerrows.healthfill', 'Health fill', '.pr .hpb i'),
    ('playerrows.abilities', 'Ability icons', '.pr .ab img'), ('playerrows.charges', 'Ability charges', '.pr .cp i'), ('playerrows.weapon', 'Weapon', '.pr .wp'), ('playerrows.creditsicon', 'Credits icon', '.pr .cri'),
    ('playerrows.credits', 'Credits', '.pr .cr'), ('playerrows.kda', 'K/D/A', '.pr .di > span:not(.de)'), ('playerrows.loadout', 'Loadout icon', '.pr .de img'),
    ('observed.portraitbox', 'Portrait box', '.ob .pt'), ('observed.portrait', 'Portrait', '.ob .pt img'), ('observed.team', 'Team and agent', '.ob .tg'), ('observed.name', 'Name', '.ob .nm'),
    ('observed.weapon', 'Weapon', '.ob .ln .wp'), ('observed.credits', 'Credits', '.ob .ln .cr'), ('observed.kda', 'K/D/A', '.ob .ln > span.num'), ('observed.health', 'Health', '.ob .hp .v'),
    ('observed.healthlabel', 'Health label', '.ob .hp .l'), ('observed.healthicon', 'Health icon', '.ob .hp .l img'), ('observed.healthbar', 'Health bar', '.ob .hp .bar'), ('observed.healthfill', 'Health fill', '.ob .hp .bar i'),
    ('observed.keys', 'Ability keys', '.ob .slot .k'), ('observed.abilitybox', 'Ability boxes', '.ob .slot .ic'), ('observed.abilities', 'Ability icons', '.ob .slot .ic img'), ('observed.charges', 'Charges', '.ob .slot .ch i'), ('observed.ultpoints', 'Ult points', '.ob .slot .pts'),
    ('sponsor.label', 'Label', '.spn .k', W), ('sponsor.name', 'Sponsor name', '.spn .v b'), ('sponsor.line', 'Sponsor line', '.spn .v span'),
    ('ltbox.kicker', 'Kicker', '.lt .box .k'), ('ltbox.title', 'Title', '.lt .box .t'), ('ltbox.subtitle', 'Subtitle', '.lt .box .s'), ('lowerthird.accent', 'Accent', '.lt .acc'), ('lowerthird.name', 'Caster name', '.lt .cn'), ('lowerthird.handle', 'Caster handle', '.lt .ch'),
    ('pause.title', 'Pause title', '.pause .a'), ('pause.time', 'Pause time', '.pause .b'),
    ('banner.portrait', 'Portrait', '.bn .por'), ('banner.headline', 'Headline', '.bn .t1'), ('banner.detail', 'Detail', '.bn .t2'),
    ('poll.label', 'Label', '.pq .k', W), ('poll.question', 'Question', '.pq .q'), ('poll.options', 'Option names', '.pq .o > div:not(.b):not(.p)'), ('poll.bar', 'Option bars', '.pq .o .b'),
    ('poll.fill', 'Option fills', '.pq .o .b i'), ('poll.percent', 'Percentages', '.pq .o .p'), ('poll.votes', 'Votes', '.pq .v'),
    ('scoreboard.dim', 'Dim backdrop', '.st-dim'), ('scoreboard.title', 'Title', '.st .hd .t', W), ('scoreboard.map', 'Map line', '.st .hd .m'), ('scoreboard.teams', 'Team blocks', '.st .tb'),
    ('scoreboard.teamname', 'Team names', '.st .row .tn'), ('scoreboard.teamscore', 'Team scores', '.st .tn b'), ('scoreboard.cols', 'Columns', '.st .row .c'), ('scoreboard.agents', 'Agent icons', '.st .row img'),
    ('scoreboard.players', 'Player names', '.st .row .pn'), ('scoreboard.loadout', 'Agent and weapon', '.st .row .ag'), ('scoreboard.mvp', 'MVP tag', '.st .pn .mvp'),
    ('roundhistory.label', 'Header label', '.rh-head .rh-lab'), ('roundhistory.rounds', 'Round numbers', '.rh-head span'), ('roundhistory.now', 'Current round', '.rh-head .now'), ('roundhistory.teams', 'Team tags', '.rh-row .rh-lab'),
    ('roundhistory.cells', 'Round cells', '.rh-row .c'), ('roundhistory.icons', 'Result icons', '.rh .result-icon'), ('roundhistory.half', 'Half mark', '.rh .half img'),
    ('economy.teams', 'Team panels', '.ec .tm'), ('economy.head', 'Team headers', '.ec .tm .hd'), ('economy.score', 'Scores', '.ec .team .score'), ('economy.name', 'Team names', '.ec .team .n'), ('economy.side', 'Sides', '.ec .team .side'),
    ('economy.summary', 'Phase', '.ec .summary'), ('economy.bonus', 'Loss bonus', '.ec .summary span'), ('economy.bank', 'Bank', '.ec .bank .v'), ('economy.banklabel', 'Bank label', '.ec .bank span'),
    ('economy.econbox', 'Credits box', '.ec .rw .econ'), ('economy.credits', 'Credits', '.ec .econ .cr'), ('economy.change', 'Change', '.ec .econ .change'), ('economy.abilitybox', 'Abilities box', '.ec .rw .abilities'),
    ('economy.abilities', 'Ability icons', '.ec .ability img'), ('economy.kit', 'Kit box', '.ec .rw .kit'), ('economy.ult', 'Ult icon', '.ec .ult img'), ('economy.ultpoints', 'Ult points', '.ec .ult span'),
    ('economy.charges', 'Ability charges', '.ec .ability .cp i'), ('economy.weapon', 'Weapon', '.ec .weapon img'), ('economy.armor', 'Armor icon', '.ec .armor img'), ('economy.armorlabel', 'Armor label', '.ec .armor span'), ('economy.identity', 'Player box', '.ec .rw .identity'),
    ('economy.agent', 'Agent icon', '.ec .identity .ag'), ('economy.player', 'Player name', '.ec .person .n'), ('economy.agentname', 'Agent name', '.ec .person .agent'), ('economy.kda', 'K/D/A', '.ec .kda strong'), ('economy.kdalabel', 'K/D/A label', '.ec .kda span'),
    ('recap.head', 'Header', '.rr .hd'), ('recap.icon', 'Result icon', '.rr .hd .win-ic'), ('recap.result', 'Result', '.rr .hd .s'), ('recap.title', 'Round winner line', '.rr .hd .t'), ('recap.agents', 'Agent icons', '.rr .col .r img'), ('recap.names', 'Player names', '.rr .n'), ('recap.labels', 'Labels', '.rr .k'),
    ('recap.values', 'Numbers', '.rr .k b'), ('recap.footer', 'Footer labels', '.rr .ft span'), ('recap.footervalues', 'Footer numbers', '.rr .ft b'),
    ('duel.backs', 'Player backs', '.du .p .bgc'), ('duel.pictures', 'Pictures', '.du .p img'), ('duel.shade', 'Picture shade', '.du .p .sh'), ('duel.names', 'Names', '.du .p .n'), ('duel.teams', 'Team and agent', '.du .p .t'),
    ('duel.title', 'Title', '.du .hd'), ('duel.values', 'Numbers', '.du .row .v'), ('duel.labels', 'Labels', '.du .row > div:not(.v)'),
    ('compare.title', 'Title', '.tc .hd .k'), ('compare.teams', 'Team tags', '.tc .hd .t'), ('compare.bars', 'Bars', '.tc .row .bar'), ('compare.values', 'Numbers', '.tc .row .v'), ('compare.labels', 'Labels', '.tc .row > div:not(.v):not(.bar)'),
  ],
}

root = pathlib.Path(__file__).resolve().parents[1]
ts = root / 'src/shared/templates.ts'
js = root.parents[1] / 'esportra-valorant-hud/core/templates.js'

def block(with_sel):
    lines = []
    for g, parts in X.items():
        items = []
        for p in parts:
            pid, label, sel = p[0], p[1], p[2]
            words = len(p) > 3
            vals = [pid, label] + ([sel] if with_sel else []) + ([1] if words else [])
            items.append('[' + ', '.join(json.dumps(v, ensure_ascii=False).replace('"', "'") if isinstance(v, str) else str(v) for v in vals) + ']')
        lines.append(f"    {json.dumps(g)}: [" + ', '.join(items) + '],')
    return '\n'.join(lines).replace('"', "'")

START, END = '// FINE LAYERS (generated by dev/parts-extra.py) ›', '// ‹ FINE LAYERS'
def put(path, body):
    s = path.read_text()
    s = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\n', '', s, flags=re.S)
    return s, body

s, _ = put(ts, '')
code = f"{START}\n/** Every visible text, picture and shape of each graphic has its own part (17 Nov parts audit). */\nconst EXTRA: Record<string, Part[]> = {{\n{block(False)}\n}};\nfor (const [g, parts] of Object.entries(EXTRA)) GRAPHICS[g]!.parts.push(...parts);\n{END}\n"
anchor = 'export const partsOf ='
assert anchor in s
ts.write_text(s.replace(anchor, code + anchor, 1))

s, _ = put(js, '')
code = f"  {START}\n  const EXTRA = {{\n{block(True)}\n  }};\n  for (const g in EXTRA) GRAPHICS[g].parts.push(...EXTRA[g]);\n  {END}\n"
anchor = '  const FONTS = {'
assert anchor in s
js.write_text(s.replace(anchor, code + anchor, 1))
print('written', sum(len(v) for v in X.values()), 'parts')
