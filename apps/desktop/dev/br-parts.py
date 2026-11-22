# Battle royale graphics' parts (22 Nov), one source for both lists: writes the BR block (between "BR PARTS"
# markers) into src/shared/templates.ts (ids, labels, words, picture slots) and core/templates.js (plus selectors).
# Run: python3 dev/br-parts.py
import json, pathlib, re

W = 1
FRAME = [
  ('base', 'Base colour', '.brf'), ('background', 'Wallpaper', '.brf > .br-slot.bg'), ('shade', 'Shade', '.brf-shade'), ('esportslogo', 'Esports logo', '.brf > .br-slot.logo'),
  ('cilogo', 'Game logo', '.brf > .br-slot.ci'), ('event', 'Event line', '.brf-ev'), ('event.name', 'Event name', '.brf-ev b'), ('event.stage', 'Group and day', '.brf-ev span'),
]
TITLE = [
  ('title', 'Title', '.brf-title'), ('title.first', 'Title first word', '.brf-title .a'), ('title.second', 'Title second word', '.brf-title .b'),
  ('subtitle', 'Subtitle', '.brf-sub'), ('subtitle.bar', 'Subtitle bar', '.brf-sub i'), ('subtitle.text', 'Subtitle text', '.brf-sub span'),
]
def words(parts, ids): return [(a, b, c, W) if a in ids else (a, b, c) for (a, b, c) in parts]
PODIUM = [
  ('podium', 'Podium', '.brf-pod'), ('podium.cards', 'Podium cards', '.brf-pc'), ('podium.first', 'First place card', '.brf-pc.first'),
  ('podium.place', 'Places', '.brf-pc .p'), ('podium.name', 'Team names', '.brf-pc .n'), ('podium.stats', 'Stat labels', '.brf-pc .s span'), ('podium.numbers', 'Stat numbers', '.brf-pc .s b'),
  ('rows', 'Rows', '.brf-rw'), ('rows.rank', 'Ranks', '.brf-rw .r'), ('rows.logo', 'Team logos', '.brf-rw .br-tl'), ('rows.name', 'Team names', '.brf-rw .nm'),
  ('rows.cols', 'Columns', '.brf-rw .c'), ('rows.total', 'Totals', '.brf-rw .t'),
]
CHAR = ('character', 'Character', '.brf > .br-slot.char')
G = {
  'brhud': ('Battle royale HUD', [
    ('rail', 'Points rail', '.brh-rail'), ('rail.head', 'Rail header', '.brh-head'), ('rail.title', 'Rail title', '.brh-head .t', W), ('rail.match', 'Rail match line', '.brh-head .c'),
    ('rail.rows', 'Rail rows', '.brh-row'), ('rail.rank', 'Ranks', '.brh-row .rk'), ('rail.logo', 'Team logos', '.brh-row .br-tl'), ('rail.name', 'Team tags', '.brh-row .nm'),
    ('rail.mp', 'Match point tag', '.brh-row .mpt', W), ('rail.pips', 'Alive marks', '.brh-row .br-pips i'), ('rail.points', 'Points', '.brh-row .pt'), ('rail.key', 'Key', '.brh-key span'),
    ('chip', 'Match chip', '.brh-chip'), ('chip.match', 'Match block', '.brh-chip .m'), ('chip.number', 'Match number', '.brh-chip .m b'), ('chip.of', 'Match count', '.brh-chip .m span'), ('chip.event', 'Map and event', '.brh-chip .e'), ('chip.map', 'Map name', '.brh-chip .e b'), ('chip.line', 'Event line', '.brh-chip .e span'),
    ('cilogo', 'Game logo', '.br-slot.ci'),
    ('grid', 'Points grid', '.brh-gridbox'), ('grid.title', 'Grid title', '.brh-ghead .t', W), ('grid.count', 'Alive count', '.brh-ghead .c'), ('grid.tiles', 'Tiles', '.brh-tile'),
    ('grid.lead', 'Leader tile', '.brh-tile.lead'), ('grid.rank', 'Ranks', '.brh-tile .rk'), ('grid.name', 'Team tags', '.brh-tile .nm'), ('grid.points', 'Points', '.brh-tile .pt'), ('grid.pips', 'Alive marks', '.brh-tile .br-pips i'),
    ('strip', 'Top strip', '.brh-strip'), ('strip.match', 'Strip match', '.brh-strip .m'), ('strip.teams', 'Strip teams', '.brh-strip .t'), ('strip.rank', 'Strip ranks', '.brh-strip .rk'),
    ('strip.logo', 'Strip logos', '.brh-strip .br-tl'), ('strip.name', 'Strip tags', '.brh-strip .nm'), ('strip.points', 'Strip points', '.brh-strip .pt'),
    ('popup', 'Standings pop-up', '.brh-pop'), ('popup.title', 'Pop-up title', '.brh-phead .a', W), ('popup.line', 'Pop-up line', '.brh-phead .b'), ('popup.match', 'Pop-up match', '.brh-phead .b b'),
    ('popup.body', 'Pop-up table', '.brh-pbody'), ('popup.rows', 'Pop-up rows', '.brh-pr'), ('popup.rank', 'Pop-up ranks', '.brh-pr .rk'), ('popup.logo', 'Pop-up logos', '.brh-pr .br-tl'),
    ('popup.name', 'Pop-up names', '.brh-pr .nm'), ('popup.pips', 'Pop-up alive marks', '.brh-pr .br-pips i'), ('popup.points', 'Pop-up points', '.brh-pr .pt'),
    ('elim', 'Team eliminated', '.brh-elim'), ('elim.place', 'Place', '.brh-elim .place'), ('elim.team', 'Team plate', '.brh-elim .tm'), ('elim.logo', 'Team logo', '.brh-elim .br-tl'),
    ('elim.name', 'Team name', '.brh-elim .tm b'), ('elim.word', 'Eliminated word', '.brh-elim .tm em', W), ('elim.points', 'Points block', '.brh-elim .pts'), ('elim.value', 'Points number', '.brh-elim .pts b'), ('elim.unit', 'Points word', '.brh-elim .pts span', W),
  ], {'cilogo': 'logo-ci'}),
  'br-lobby|full': ('Waiting lobby', FRAME + [
    ('slash', 'Slash', '.brf-slash'), CHAR, ('heading', 'Heading', '.brl-head', W), ('countdown', 'Countdown', '.brl-cd'),
    ('next', 'Next match', '.brl-next'), ('next.label', 'Next label', '.brl-next .a', W), ('next.match', 'Next match line', '.brl-next .b'), ('next.map', 'Map picture', '.brl-next .br-slot.mapthumb'),
  ], {'esportslogo': 'logo-esports', 'cilogo': 'logo-ci', 'character': 'character', 'next.map': 'map'}),
  'br-today|full': ("Today's matches", FRAME + words(TITLE, {'title.first', 'title.second'}) + [
    ('cards', 'Match cards', '.brt-card'), ('cards.map', 'Map pictures', '.brt-card .br-slot.map'), ('cards.tag', 'Status tags', '.brt-card .tag'),
    ('cards.name', 'Map names', '.brt-card .lab'), ('cards.number', 'Match numbers', '.brt-card .mn'), ('cards.next', 'Next card', '.brt-card.next'), ('cards.done', 'Played cards', '.brt-card.done'),
  ], {'esportslogo': 'logo-esports', 'cilogo': 'logo-ci', 'cards.map': 'map'}),
  'br-rankings|full': ('Match rankings', FRAME + words(TITLE, {'title.second'}) + [CHAR] + PODIUM,
    {'esportslogo': 'logo-esports', 'cilogo': 'logo-ci', 'character': 'character'}),
  'br-overall|full': ('Overall standings', FRAME + words(TITLE, {'title.first', 'title.second'}) + [('mpbar', 'Match point bar', '.brf-mpbar')] + PODIUM,
    {'esportslogo': 'logo-esports', 'cilogo': 'logo-ci'}),
  'br-wwcd|full': ('Match winner', FRAME + [
    ('band', 'Band', '.brw-band'), ('character', 'Left character', '.brf > .br-slot.char.l'), ('character2', 'Right character', '.brf > .br-slot.char.r'),
    ('team', 'Team plate', '.brw-team'), ('team.match', 'Match', '.brw-team .a'), ('team.name', 'Team name', '.brw-team .b'), ('team.logo', 'Team logo', '.brw-team .br-tl'),
    ('team.points', 'Points block', '.brw-team .c'), ('team.value', 'Points number', '.brw-team .c b'), ('team.unit', 'Points word', '.brw-team .c span', W), ('word', 'Winner word', '.brw-word', W), ('subline', 'Winner line', '.brw-sub', W),
    ('players', 'Players', '.brw-pl > div'), ('players.name', 'Player names', '.brw-pl b'),
  ], {'esportslogo': 'logo-esports', 'cilogo': 'logo-ci', 'character': 'character', 'character2': 'character'}),
  'br-mvp|full': ('MVP rankings', FRAME + words(TITLE, {'title.first', 'title.second'}) + [
    ('cards', 'Player cards', '.brm-card'), ('cards.first', 'First card', '.brm-card.first'), ('cards.picture', 'Character', '.brm-card .br-slot.char'),
    ('cards.number', 'Numbers', '.brm-card .no'), ('cards.info', 'Info', '.brm-card .info'), ('cards.name', 'Player names', '.brm-card .nm'), ('cards.team', 'Team names', '.brm-card .tm'),
    ('cards.stats', 'Stat labels', '.brm-card .stats div'), ('cards.numbers', 'Stat numbers', '.brm-card .stats b'), ('empty', 'Waiting note', '.brm-none', W),
  ], {'esportslogo': 'logo-esports', 'cilogo': 'logo-ci', 'cards.picture': 'character'}),
  'br-champion|full': ('Champions', FRAME + [
    ('word', 'Champions word', '.brc-word', W), ('character', 'Left character', '.brf > .br-slot.char.l'), ('character2', 'Right character', '.brf > .br-slot.char.r'),
    ('team', 'Team', '.brc-team'), ('team.event', 'Event line', '.brc-team .a'), ('team.name', 'Team name', '.brc-team .b'), ('team.logo', 'Team logo', '.brc-team .br-tl'),
    ('stats', 'Stats', '.brc-stats > div'), ('stats.numbers', 'Stat numbers', '.brc-stats b'),
  ], {'esportslogo': 'logo-esports', 'cilogo': 'logo-ci', 'character': 'character', 'character2': 'character'}),
}
def ts():
  out = ['// BR PARTS (generated by dev/br-parts.py) ›', '/** Battle royale graphics (22 Nov, core/br.js). */']
  for g, (title, parts, slots) in G.items():
    ps = ', '.join(json.dumps([p[0], p[1]] + ([1] if len(p) > 3 else [])).replace('"', "'") for p in parts)
    out.append(f"GRAPHICS[{json.dumps(g)}] = {{ title: {json.dumps(title)}, parts: [{ps}] }};")
    out.append(f"SLOTS[{json.dumps(g)}] = {json.dumps(slots)};")
  out.append('// ‹ BR PARTS')
  return '\n'.join(out)
def js():
  out = ['  // BR PARTS (generated by dev/br-parts.py) ›']
  for g, (title, parts, slots) in G.items():
    ps = ', '.join(json.dumps(list(p[:3]) + ([1] if len(p) > 3 else [])) for p in parts)
    out.append(f"  GRAPHICS[{json.dumps(g)}] = {{ title: {json.dumps(title)}, parts: [{ps}] }};")
    out.append(f"  SLOTS[{json.dumps(g)}] = {json.dumps(slots)};")
  out.append('  // ‹ BR PARTS')
  return '\n'.join(out)
root = pathlib.Path(__file__).resolve().parents[3]
for path, block, anchor in [(root / 'apps/desktop/src/shared/templates.ts', ts(), 'export function slotsOf'), (root / 'esportra-valorant-hud/core/templates.js', js(), '  function slotsOf')]:
  s = path.read_text()
  s = re.sub(r'\n *// BR PARTS \(generated.*?// ‹ BR PARTS', '', s, flags=re.S)
  i = s.index(anchor)
  s = s[:i].rstrip('\n') + '\n' + block + '\n' + s[i:]
  path.write_text(s)
print('BR parts written for', len(G), 'graphics')
