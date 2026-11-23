# Battle royale graphics' parts (22 Nov), one source for both lists: writes the BR block (between "BR PARTS"
# markers) into src/shared/templates.ts (ids, labels, words, picture slots) and core/templates.js (plus selectors).
# Run: python3 dev/br-parts.py
import json, pathlib, re

W = 1
# Shared by every full screen: the backdrop, props, header, footer.
def frame(title_words=False, emblem=False, header=True):
  out = [
    ('field', 'Colour field', '.brf'), ('background', 'Background picture', '.brf > .br-slot.bg'), ('veil', 'Colour veil', '.b6-veil'),
    ('chutes', 'Parachutes', '.b6-chute'), ('crate', 'Airdrop crate', '.brf > .b6-crate'),
    ('footer', 'Footer', '.b6-ft'), ('footer.ci', 'Partner logos', '.b6-ft .b6-ci'), ('footer.line', 'Footer line', '.b6-fl'),
    ('footer.sponsors', 'Sponsors', '.b6-fr'), ('footer.sponsor', 'Sponsor logos', '.b6-sp'),
  ]
  if header:
    out += [
      ('header', 'Header', '.b6-hd'), ('header.logo', 'Esports logo', '.b6-hd .b6-logo'), ('header.rule', 'Header line', '.b6-rule'),
      ('header.event', 'Event line', '.b6-k'), ('header.eventmark', 'Event line marks', '.b6-k i'),
      ('header.title', 'Title', '.b6-hd h1') + ((W,) if title_words else ()),
      ('header.context', 'Context', '.b6-s > span'), ('header.dots', 'Context dots', '.b6-s > i'), ('header.progress', 'Progress marks', '.b6-pips i'),
      ('header.card', 'Context card', '.b6-card'),
    ]
  else:
    out += [('logo', 'Esports logo', '.brf > .b6-logo.solo')]
  if emblem:
    out += [('emblem', 'Event emblem', '.b6-emw'), ('emblem.picture', 'Emblem picture', '.b6-emw .br-slot'), ('emblem.text', 'Emblem name', '.b6-emblem.gen'), ('emblem.name', 'Emblem words', '.b6-emblem.gen b')]
  return out
TABLE = [
  ('table', 'Table', '.b6-tbl'), ('table.head', 'Column heads', '.b6-th span'), ('table.rows', 'Rows', '.b6-tr'), ('table.rank', 'Ranks', '.b6-tr .rk'),
  ('table.logo', 'Team logos', '.b6-tr .br-tl'), ('table.name', 'Team names', '.b6-tr .nm'), ('table.mp', 'Match point tags', '.b6-tr .nm em'),
  ('table.cols', 'Numbers', '.b6-tr .c'), ('table.bar', 'Bars', '.b6-tr .bar'), ('table.fill', 'Bar fills', '.b6-tr .bar > i'),
  ('table.elims', 'Elimination marks', '.b6-tr .bar em b'), ('table.mpline', 'Match point line', '.b6-tr .mpm'), ('table.total', 'Points', '.b6-tr .t b'),
]
SQUAD = [('players', 'Players', '.b6-sq'), ('players.photo', 'Player photos', '.b6-ph img'), ('players.shadow', 'No-photo shadows', '.b6-ph.none')]
CARD_DAY = [('day.label', 'Day labels', '.b6-day span'), ('day.number', 'Day number', '.b6-day b')]
CARD_MAP = [('mapcard', 'Map card', '.b6-mapc'), ('mapcard.picture', 'Map picture', '.b6-mapc .br-slot'), ('mapcard.name', 'Map name', '.b6-mapc span')]
G = {
  'brhud': ('Battle royale HUD', [
    ('rail', 'Points rail', '.brh-rail'), ('rail.head', 'Rail header', '.brh-head'), ('rail.title', 'Rail title', '.brh-head .t', W), ('rail.match', 'Rail match line', '.brh-head .c'),
    ('rail.sub', 'Rail info bar', '.brh-sub'), ('rail.subtext', 'Rail info line', '.brh-sub span'), ('rail.rows', 'Rail rows', '.brh-row'), ('rail.bars', 'Points bars', '.brh-row .bkx'), ('rail.mpline', 'Match point line', '.brh-row .mpl'),
    ('rail.rank', 'Ranks', '.brh-row .rk'), ('rail.logo', 'Team logos', '.brh-row .br-tl'), ('rail.name', 'Team tags', '.brh-row .nm'),
    ('rail.mp', 'Match point tag', '.brh-row .mpt', W), ('rail.pips', 'Alive marks', '.brh-row .br-pips i'), ('rail.points', 'Points', '.brh-row .pt'), ('rail.key', 'Key', '.brh-key span'),
    ('chip', 'Match chip', '.brh-chip'), ('chip.match', 'Match block', '.brh-chip .m'), ('chip.number', 'Match number', '.brh-chip .m b'), ('chip.of', 'Match count', '.brh-chip .m span'),
    ('chip.map', 'Map picture', '.brh-chip .mapthumb'), ('chip.event', 'Map and event', '.brh-chip .e'), ('chip.mapname', 'Map name', '.brh-chip .e b'), ('chip.line', 'Event line', '.brh-chip .e span'),
    ('grid', 'Points grid', '.brh-gridbox'), ('grid.title', 'Grid title', '.brh-ghead .t', W), ('grid.match', 'Grid match line', '.brh-ghead .m'), ('grid.count', 'Alive count', '.brh-ghead .c'), ('grid.tiles', 'Tiles', '.brh-tile'),
    ('grid.lead', 'Leader tile', '.brh-tile.lead'), ('grid.rank', 'Ranks', '.brh-tile .rk'), ('grid.name', 'Team tags', '.brh-tile .nm'), ('grid.points', 'Points', '.brh-tile .pt'), ('grid.pips', 'Alive marks', '.brh-tile .br-pips i'),
    ('strip', 'Top strip', '.brh-strip'), ('strip.match', 'Strip match', '.brh-strip .m'), ('strip.teams', 'Strip teams', '.brh-strip .t'), ('strip.rank', 'Strip ranks', '.brh-strip .rk'),
    ('strip.logo', 'Strip logos', '.brh-strip .br-tl'), ('strip.name', 'Strip tags', '.brh-strip .nm'), ('strip.points', 'Strip points', '.brh-strip .pt'), ('strip.alive', 'Teams left', '.brh-strip .al'), ('strip.alivenum', 'Teams left number', '.brh-strip .al b'),
    ('popup', 'Standings pop-up', '.brh-pop'), ('popup.title', 'Pop-up title', '.brh-phead .a', W), ('popup.line', 'Pop-up line', '.brh-phead .b'), ('popup.match', 'Pop-up match', '.brh-phead .b b'),
    ('popup.body', 'Pop-up table', '.brh-pbody'), ('popup.rows', 'Pop-up rows', '.brh-pr'), ('popup.rank', 'Pop-up ranks', '.brh-pr .rk'), ('popup.logo', 'Pop-up logos', '.brh-pr .br-tl'),
    ('popup.name', 'Pop-up names', '.brh-pr .nm'), ('popup.pips', 'Pop-up alive marks', '.brh-pr .br-pips i'), ('popup.points', 'Pop-up points', '.brh-pr .pt'),
    ('elim', 'Team eliminated', '.brh-elim'), ('elim.cam', 'Kill-cam frame', '.brh-elim .cam'), ('elim.corners', 'Frame corners', '.brh-elim .c'), ('elim.logo', 'Team logo', '.brh-elim .br-tl'),
    ('elim.text', 'Text plate', '.brh-elim .tx'), ('elim.word', 'Eliminated word', '.brh-elim .tx em', W), ('elim.name', 'Team name', '.brh-elim .tx b'), ('elim.line', 'Points and teams left', '.brh-elim .tx span'),
    ('elim.place', 'Place', '.brh-elim .place'), ('elim.hazard', 'Hazard stripe', '.brh-elim .hz'),
  ], {'chip.map': 'map'}),
  'br-lobby|full': ('Starting soon', frame(True, emblem=True) + [
    ('countdown.label', 'Countdown label', '.b6-k2'), ('countdown', 'Countdown digits', '.b6-cd .dg'), ('countdown.colon', 'Colon', '.b6-cd .col'),
    ('facts', 'Facts', '.b6-facts'), ('facts.label', 'Fact labels', '.b6-facts span'), ('facts.value', 'Fact values', '.b6-facts b'), ('facts.small', 'Fact small text', '.b6-facts small'),
    ('standings.title', 'Standings title', '.b6-lsh'), ('standings', 'Standings rows', '.b6-lr'), ('standings.rank', 'Ranks', '.b6-lr .rk'), ('standings.logo', 'Team logos', '.b6-lr .br-tl'),
    ('standings.name', 'Team names', '.b6-lr .nm'), ('standings.points', 'Points', '.b6-lr .v b'), ('standings.unit', 'Points word', '.b6-lr small'),
    ('map', 'Tactical map', '.b6-mapwrap'), ('map.picture', 'Map picture', '.b6-tac .b6-tacmap'), ('map.letters', 'Grid letters', '.b6-tx span'), ('map.numbers', 'Grid numbers', '.b6-ty span'),
    ('map.jump', 'Jump marker', '.b6-tfx .jump text'), ('map.north', 'North arrow', '.b6-north i'), ('map.n', 'North letter', '.b6-north b'),
  ], {'header.logo': 'logo-esports', 'footer.ci': 'logo-ci', 'crate': 'item', 'emblem.picture': 'any', 'map.picture': 'map'}),
  'br-today|full': ("Today's matches", frame(True) + CARD_DAY + [
    ('stops', 'Matches', '.b6-stop'), ('stops.disc', 'Map discs', '.b6-disc'), ('stops.picture', 'Map pictures', '.b6-disc .br-slot'), ('stops.number', 'Match numbers', '.b6-disc .no'),
    ('stops.name', 'Map names', '.b6-dl b'), ('stops.status', 'Status tags', '.b6-dl .ss'), ('stops.winner', 'Winner tags', '.b6-dl .wn'), ('stops.logo', 'Winner logos', '.b6-dl .wn .br-tl'),
    ('stops.team', 'Winner names', '.b6-dl .wn em'), ('stops.win', 'Winner word', '.b6-dl .wn small'),
  ], {'header.logo': 'logo-esports', 'footer.ci': 'logo-ci', 'crate': 'item', 'stops.picture': 'map'}),
  'br-rankings|full': ('Match results', frame() + CARD_MAP + TABLE + SQUAD + [
    ('winner', 'Winner block', '.b6-win'), ('badge.place', 'Winner place', '.b6-badge .p'), ('badge', 'Winner plate', '.b6-badge .n'), ('badge.name', 'Winner name', '.b6-badge .n b'), ('badge.line', 'Winner line', '.b6-badge .n span'),
    ('key', 'Key', '.b6-key span'), ('key.marks', 'Key marks', '.b6-key i'), ('empty', 'Waiting note', '.b6-none', W),
  ], {'header.logo': 'logo-esports', 'footer.ci': 'logo-ci', 'crate': 'item', 'mapcard.picture': 'map'}),
  'br-overall|full': ('Overall standings', frame(True) + TABLE + [
    ('leader', 'Leader card', '.b6-ldc'), ('leader.label', 'Leader label', '.b6-ldc span', W), ('leader.name', 'Leader name', '.b6-ldc b'), ('leader.line', 'Leader points', '.b6-ldc em'),
    ('header.mp', 'Match point tag', '.b6-s .mpx'),
  ], {'header.logo': 'logo-esports', 'footer.ci': 'logo-ci', 'crate': 'item'}),
  'br-wwcd|full': ('WWCD', frame(header=False) + SQUAD + [
    ('flares', 'Flares', '.b6-flare'), ('shards', 'Shards', '.b6-shard'), ('word', 'Winner word', '.b6-ww .b6-lt'), ('word.depth', 'Word depth', '.b6-ww .dp'), ('word.face', 'Word face', '.b6-ww .fc'),
    ('subline', 'Winner line', '.b6-wl', W), ('team', 'Team plate', '.b6-wteam'), ('team.match', 'Match', '.b6-wteam .a'), ('team.name', 'Team name', '.b6-wteam .b'), ('team.logo', 'Team logo', '.b6-wteam .br-tl'),
    ('team.points', 'Points block', '.b6-wteam .c'), ('team.value', 'Points number', '.b6-wteam .c b'), ('team.unit', 'Points word', '.b6-wteam .c span', W),
    ('stats', 'Player plates', '.b6-wst > div'), ('stats.name', 'Player names', '.b6-wst b'), ('stats.label', 'Stat labels', '.b6-wst span'), ('stats.value', 'Stat numbers', '.b6-wst em'),
  ], {'logo': 'logo-esports', 'footer.ci': 'logo-ci', 'crate': 'item'}),
  'br-mvp|full': ('Match MVP', frame(True) + CARD_MAP + [
    ('hero', 'MVP', '.b6-hero'), ('hero.number', 'Big 1', '.b6-hero .one'), ('hero.dials', 'Dials', '.b6-hero .dial'), ('hero.photo', 'MVP photo', '.b6-hp'),
    ('hero.photoimg', 'MVP photo picture', '.b6-hp img'), ('hero.shadow', 'MVP shadow', '.b6-hp .b6-ph.none'), ('hero.stats', 'Stat plates', '.b6-nums div'), ('hero.values', 'Stat numbers', '.b6-nums b'),
    ('hero.name', 'Player name', '.b6-hn b'), ('hero.team', 'Team line', '.b6-hn span'), ('hero.logo', 'Team logo', '.b6-hn .br-tl'),
    ('others', 'Players 2 to 4', '.b6-side'), ('others.rank', 'Ranks', '.b6-side .rk'), ('others.photo', 'Photos', '.b6-sp2'), ('others.photoimg', 'Photo pictures', '.b6-sp2 img'), ('others.shadow', 'Shadows', '.b6-sp2 .b6-ph.none'),
    ('others.name', 'Names', '.b6-side .inf b'), ('others.line', 'Team and numbers', '.b6-side .inf span'), ('others.values', 'Numbers', '.b6-side .n3 em'), ('empty', 'Waiting note', '.b6-none', W),
  ], {'header.logo': 'logo-esports', 'footer.ci': 'logo-ci', 'crate': 'item', 'mapcard.picture': 'map'}),
  'br-champion|full': ('Champions', frame(header=False, emblem=True) + SQUAD + [
    ('rays', 'Rays', '.b6-rays'), ('word', 'Champions word', '.b6-cw .b6-lt'), ('word.depth', 'Word depth', '.b6-cw .dp'), ('word.face', 'Word face', '.b6-cw .fc'),
    ('team', 'Team plate', '.b6-cn'), ('team.logo', 'Team logo', '.b6-cn .br-tl'), ('team.name', 'Team name', '.b6-cn b'),
    ('stats', 'Stats', '.b6-cst div'), ('stats.value', 'Stat numbers', '.b6-cst b'),
    ('journey', 'Journey', '.b6-jr'), ('journey.label', 'Journey title', '.b6-jr .lab'), ('journey.sub', 'Journey line', '.b6-jr .lab span'), ('journey.marks', 'Match labels', '.b6-jr text'),
  ], {'logo': 'logo-esports', 'footer.ci': 'logo-ci', 'crate': 'item', 'emblem.picture': 'any'}),
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
