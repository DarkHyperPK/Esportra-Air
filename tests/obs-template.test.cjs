const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultTemplate, validateTemplate, templateRundown, templateRows } = require('../src/obs-template');
const { pushTemplate } = require('../src/obs-template-push');
const id = '5e182c34-49f8-40d3-bf6c-88b576c20c45';
function config() { return { showId: id, selectedMatchId: id, matchCode: 'FINAL', rundownVersion: 1, rundown: [{ id: 'opening', title: 'Opening', type: 'pre_show', overlay: 'starting-soon' }, { id: 'map', title: 'Map', type: 'match', overlay: 'ingame' }] }; }

test('producers can add local screens to any match, retain them after reload and use them in production without editing the published plan',()=>{
  const show=config(),before=structuredClone(show),draft=defaultTemplate(show,id);
  draft.items.push({id:'air_06100000-0000-4000-8000-000000000601',title:'Scoreboard',overlay:'scoreboard',x:0,y:0,width:1920,height:1080,background:''});
  const saved=validateTemplate(draft,show,id);assert.deepEqual(show,before);assert.equal(defaultTemplate(show,id,saved).items.length,3);
  const applied=templateRundown(show,saved);const normalized=require('../src/rundown-config').normalizeRundown(applied.rundown);assert.equal(normalized.at(-1).name,'Scoreboard');assert.equal(normalized.at(-1).mode,'manual');assert.equal(normalized.at(-1).transition.name,'Fade');
  const empty={...show,rundown:[]},local={...defaultTemplate(empty,id),items:[draft.items.at(-1)]};assert.equal(validateTemplate(local,empty,id).items.length,1);
  assert.throws(()=>validateTemplate({...draft,items:Array.from({length:51},(_,index)=>({...draft.items.at(-1),id:`air_${require('node:crypto').randomUUID()}`}))},show,id));
});
test('local template edits and order leave the published show unchanged until explicitly applied', () => {
  const show = config(), draft = defaultTemplate(show, id);
  draft.items.reverse(); draft.items[0].title = 'Map one'; draft.items[0].width = 960;
  const valid = validateTemplate(draft, show, id);
  assert.equal(show.rundown[0].title, 'Opening');
  assert.equal(templateRundown(show, valid).rundown[0].title, 'Map one');
  assert.equal(valid.revision, 1);
  assert.deepEqual(defaultTemplate(show, id, valid).items.map(item => item.id), ['map','opening']);
  const outputs = []; const registry = { list: () => outputs, add: input => outputs.push({ ...input, url: 'http://localhost:5300/o/'+id }) };
  const rows = templateRows(valid, registry); assert.equal(rows.length, 2); assert.ok(rows[0].url.includes('/o/'));
});
test('stale pairing, changed published screens, duplicate items and invalid canvas cannot be saved or sent', () => {
  const show = config(), draft = defaultTemplate(show, id);
  assert.throws(() => validateTemplate({ ...draft, context: { ...draft.context, nodeId: '00000000-0000-4000-8000-000000000061' } }, show, id));
  assert.throws(() => validateTemplate(draft, { ...show, rundownVersion: 2 }, id));
  assert.throws(() => validateTemplate({ ...draft, items: [draft.items[0], draft.items[0]] }, show, id));
  assert.throws(() => validateTemplate({ ...draft, items: draft.items.map(item => ({ ...item, x: 1900 })) }, show, id));
  assert.throws(() => validateTemplate({ ...draft, items: draft.items.map(item => ({ ...item, url: 'https://other.invalid/' })) }, show, id));
});
function fixture({ active = false, collision = false, invalidVideo = false } = {}) {
  const calls = [], scenes = new Map(collision ? [['Air · Opening', []]] : []), inputs = new Map([['Game video', { inputName: 'Game video', inputKind: invalidVideo ? 'browser_source' : 'game_capture' }]]);
  let nextId = 1, owned = {};
  const socket = { call: async (name, value = {}) => {
    calls.push({ name, value });
    if (name === 'GetStreamStatus' || name === 'GetRecordStatus') return { outputActive: active };
    if (name === 'GetSceneList') return { scenes: [...scenes.keys()].map(sceneName => ({ sceneName })) };
    if (name === 'GetInputList') return { inputs: [...inputs.values()] };
    if (name === 'CreateScene') scenes.set(value.sceneName, []);
    if (name === 'CreateInput') { const sceneItemId = nextId++; inputs.set(value.inputName, { inputName: value.inputName, inputKind: value.inputKind, settings: value.inputSettings }); scenes.get(value.sceneName).push({ sourceName: value.inputName, sceneItemId }); return { sceneItemId }; }
    if (name === 'GetInputSettings') return { inputSettings: inputs.get(value.inputName).settings };
    if (name === 'SetInputSettings') Object.assign(inputs.get(value.inputName).settings, value.inputSettings);
    if (name === 'GetSceneItemList') return { sceneItems: scenes.get(value.sceneName) };
    if (name === 'CreateSceneItem') { const sceneItemId = nextId++; scenes.get(value.sceneName).push({ sourceName: value.sourceName, sceneItemId }); return { sceneItemId }; }
    return {};
  } };
  const rows = [{ id: 'opening', sceneName: 'Air · Opening', url: 'http://localhost:5300/o/'+id, x: 20, y: 10, width: 960, height: 540, background: 'Game video' }];
  return { calls, rows, run: (stillAllowed) => pushTemplate({ socket, rows, owned, saveOwned: next => { owned = JSON.parse(JSON.stringify(next)); }, stillAllowed }) };
}
test('explicit push creates HUD and chosen video automatically, never takes Program, and repeated push preserves OBS layout edits', async () => {
  const f = fixture(); await f.run();
  assert.equal(f.calls.filter(call => call.name === 'CreateScene').length, 1);
  assert.equal(f.calls.filter(call => call.name === 'CreateInput').length, 1);
  assert.equal(f.calls.find(call => call.name === 'CreateInput').value.inputSettings.shutdown, false);
  assert.equal(f.calls.find(call => call.name === 'CreateSceneItem').value.sourceName, 'Game video');
  const transforms = f.calls.filter(call => call.name === 'SetSceneItemTransform').length;
  await f.run();
  assert.equal(f.calls.filter(call => call.name === 'CreateInput').length, 1);
  assert.equal(f.calls.filter(call => call.name === 'SetSceneItemTransform').length, transforms);
  assert.equal(f.calls.some(call => ['SetCurrentProgramScene','StartStream','RemoveScene','RemoveInput'].includes(call.name)), false);
});
test('streaming, unowned scene collisions and stale scope block template mutations', async () => {
  for (const options of [{ active: true }, { collision: true }, { invalidVideo: true }]) { const f = fixture(options); await assert.rejects(f.run()); assert.equal(f.calls.some(call => call.name.startsWith('Create')), false); }
  const f = fixture(); await assert.rejects(f.run(() => false)); assert.equal(f.calls.length, 0);
});
