'use strict';
const $ = (selector) => document.querySelector(selector);
const stage = $('#stage');
const defaults = { large:false, motion:false, scenes:true, titles:true, dim:28, voice:true, voiceVolume:85, sfx:true, sfxVolume:35, music:false, musicVolume:15, length:'By Level', levels:{}, speed:'Normal', countdown:8, choices:3, random:true, hints:true, teams:false, names:['Team A','Team B'], scoring:false, font:'Elementary', backgroundStrength:'Automatic', projection:false, optional:['audio','hint','reveal'] };
let saved = {};
let persistence = true;
try { saved = JSON.parse(localStorage.getItem('calendar-heist-session') || '{}'); } catch { persistence = false; }
let settings = {...defaults,...saved.settings};
if(![5,8,10,12,16,20,'By Level'].includes(settings.length))settings.length='By Level';
const levels=['Easy','Standard','Challenge'], lengths=[8,12,16];
let pendingLevel=null, bank=null;
const selectedLevel=()=>settings.levels[tab]||'Easy';
const levelIndex=()=>levels.indexOf(bank?.level||selectedLevel());
const levelPicker=()=>select('level','Level',levels,pendingLevel||bank?.level||selectedLevel());
const questionLength=()=>settings.length==='By Level'?lengths[levelIndex()]:settings.length;
const counter=()=>game?`<div class="progress">Question ${game.index+1} of ${bank?.length||questionLength()} · ${bank?.level||selectedLevel()}</div>`:'';
let adventure = saved.adventure || null;
let media = {art:{}, decks:[], active:'week', activities:{}, font:null};
let db, manifest, audioContext, currentAudio, musicNode, lastMusic = 0;
let tab = 'home', phase = 'home', config = 'Display', artTarget = 'home', editDeck = 'week', contentPane = 'Decks';
let game = null, settingsReturn = null, paused = false, controlsHidden = settings.projection, titleReplay = false, pickMode = false;
let flash = {mode:'Full Week', index:0, order:[0,1,2,3,4,5,6], group:[0,1,2,3,4], words:true, auto:false, time:0};
let roundOptions = {conveyor:'Listening', conveyorAudioPrompt:true, stationary:false, pairs:3, forecast:false, charades:'Act It Out', door:'Between Two Days', switch:'Yesterday / Tomorrow', custom:'Picture Flash'};
let practice = {points:[0,0]};
let importDraft = null, batchDraft = null, itemOpen = null, message = '';
let fontError = '', uploadedFace = null, fontRequest = 0, lastFocusKey = '';
const fontOptions = ['Elementary','Balsamiq Sans','Humanist Sans','Classic Serif','Monospace','Uploaded Font'];
const optionalControls = {
  audio:'Replay Audio', hint:'Hint', reveal:'Reveal', 'prev-question':'Previous', restart:'Restart Round',
  title:'Show Title', full:'Full Screen', modes:'Round options and practice tools'
};
const accent = {
  home:'#64469d','week-review':'#276e52','calendar-conveyor':'#245e8d','weather-blackout':'#166c78',
  'freeze-frame-charades':'#962a64','three-door-dash':'#6c3c9b','yesterday-tomorrow-switch':'#2855a4',
  'stop-the-time-loop':'#885210','custom-practice':'#94473f', spelling:'#714b99', settings:'#55409a'
};
const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const actions = ['singing','flying a kite','playing basketball','swimming','dancing','riding a bike','cooking'];
const subjects = ['The student','The student','The student','The student','The student','She','The student'];
const order = ['week-review','calendar-conveyor','weather-blackout','freeze-frame-charades','three-door-dash','yesterday-tomorrow-switch','stop-the-time-loop'];
const instructions = [
  'Meet the seven days. Say the name of each weekday and read the week from Monday to Sunday.',
  'Listen to the weekday. Tap its calendar before it leaves the conveyor.',
  'Study the forecast. When it disappears, look at the weather picture and name its day.',
  'Study the weekly schedule. Watch a classmate act out an activity, or guess the day from a picture.',
  'Say the answer together. Open the door marked with the correct day.',
  'Point left for yesterday or right for tomorrow. Say and choose the correct day.',
  'Fill the missing days to fix the clock. Arrange the last cards to complete the week.'
];
const customModes = ['Mixed Quiz','Picture Flash','Listen and Tap','Picture-to-Word Match','Three-Door Quiz','Sequence Challenge'];
const allDays = days.map((_,i)=>i);
const mod = n => ((n%7)+7)%7;
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mix = values => {
  const result = [...values];
  if (settings.random) for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
};
const checked = x => x ? ' checked' : '';
// Keep punctuation adjacent to the text it belongs to, including imported text.
const sentence = value => esc(String(value ?? '').replace(/([^\s])\s+([?!.,;:。！？])/gu,'$1$2'));
const btn = (label, action, value='', cls='', attrs='') => `<button type="button" class="${cls}" data-act="${action}" data-val="${esc(value)}" ${attrs}>${sentence(label)}</button>`;
const select = (name, label, values, current, kind='option') => `<label>${esc(label)} <select data-${kind}="${name}">${values.map(v=>`<option${String(v)===String(current)?' selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
const scene = (id, type) => media.art[id]?.[type] || (type==='thumbnail' && media.art[id]?.title) || manifest.scenes[id][type];
const embeddedArt=new Map();
function registerArt(record){
  for(const value of Object.values(record)){
    if(value&&typeof value==='object')registerArt(value);
    else if(typeof value==='string'&&value.startsWith('data:image/png;base64,'))embeddedArt.set(value,null);
  }
}
function imageURL(src){
  if(!embeddedArt.has(src)||typeof URL.createObjectURL!=='function')return src;
  if(!embeddedArt.get(src)){
    const data=Uint8Array.from(atob(src.slice(src.indexOf(',')+1)),char=>char.charCodeAt(0));
    embeddedArt.set(src,URL.createObjectURL(new Blob([data],{type:'image/png'})));
  }
  return embeddedArt.get(src);
}
const fileImg = (src, alt='') => src ? `<img src="${esc(imageURL(src))}" alt="${esc(alt)}" draggable="false">` : '';
const week = id => manifest.weekdays[days[id].toLowerCase()];
const calendars = (id,words=true) => `<span class="calendar">${fileImg(week(id).calendarDateOnly,'November '+(id+2))}${words?`<b class="weekday-label">${days[id]}</b>`:''}</span>`;
const calendarReveal = id => `<div class="calendar-reveal">${calendars(id)}</div>`;
const figure = (src, alt='', mask=null) => src ? `<div class="clue">${fileImg(src,alt)}${mask ? `<span class="mask" style="left:${mask[0]}%;top:${mask[1]}%;width:${mask[2]}%;height:${mask[3]}%"></span>`:''}</div>` : '';
const grid = (nodes, cls='', max=nodes.length) => `<div class="grid ${nodes.length===7?'seven':''} ${cls}" style="--count:${Math.max(1,max)}">${nodes.join('')}</div>`;
const prompt = (title,sub='') => `<div class="prompt"><h1>${sentence(title)}</h1>${sub?`<p>${sentence(sub)}</p>`:''}</div>`;
const controls = html => `<div class="controls teacher row">${html}</div>`;
const deck = () => media.decks.find(d=>d.id===media.active);
const defaultItems = () => days.map((word,i)=>({word,order:i+1,clue:'',sentence:`It’s ${word}.`,picture:week(i).calendarDateOnly, answer:week(i).calendarDateOnly, audio:media.activities[i]?.audio}));
const items = () => (deck()?.items || defaultItems()).filter(x=>!x.disabled);
const ordered = xs => xs.length>=3 && xs.every(x=>x.order!=='' && x.order!=null && Number.isFinite(Number(x.order))) && new Set(xs.map(x=>Number(x.order))).size===xs.length;
function customPool(mode=roundOptions.custom) {
  const xs=items();
  if(mode==='Sequence Challenge') return ordered(xs)?[...xs].sort((a,b)=>a.order-b.order):[];
  if(mode==='Picture-to-Word Match') return xs.filter(x=>x.picture || x.clue);
  if(mode==='Three-Door Quiz') return xs.filter(x=>x.picture || x.clue || x.translation);
  return xs;
}
function playData() {
  if(adventure)return adventure;
  return practice;
}
function save() {
  if(adventure && order.includes(tab) && phase!=='intro'){
    adventure.where=tab;
    adventure.play={game,phase,options:roundOptions,flash,bank};
  }
  try {localStorage.setItem('calendar-heist-session',JSON.stringify({settings,adventure:adventure || saved.adventure}));} catch {persistence=false;}
}
async function loadMedia() {
  try {
    db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('calendar-heist-media',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('state');
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
    const result=await new Promise((resolve,reject)=>{
      const req=db.transaction('state').objectStore('state').get('media');
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    if(result)media={...media,...result};
  } catch {persistence=false;}
}
function storeMedia() {
  if(!db){persistence=false;return;}
  const tx=db.transaction('state','readwrite');
  tx.objectStore('state').put(media,'media');
  tx.onabort=()=>{persistence=false;$('#live').textContent='Browser storage is unavailable. Export your deck to keep a copy.';};
}
function stopAudio() {
  if(tab==='spelling')cancelSpellOpening();
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  if(musicNode){musicNode.stop();musicNode=null;}
}
function speak(word, clip) {
  stopAudio();
  if(!settings.voice){if($('#teacher-read'))teacherRead();return;}
  if(clip){
    currentAudio=new Audio(clip);currentAudio.volume=settings.voiceVolume/100;
    currentAudio.play().catch(()=>teacherRead());return;
  }
  if(!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)){teacherRead();return;}
  const utterance=new SpeechSynthesisUtterance(word);
  utterance.lang='en-US';utterance.rate=.83;utterance.volume=settings.voiceVolume/100;
  utterance.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))teacherRead();};
  window.speechSynthesis.speak(utterance);
}
function teacherRead(){
  const node=$('#teacher-read');
  if(!node||game?.done)return;
  const message='Audio unavailable. Check voice in Settings, then replay the prompt.';
  node.hidden=false;
  node.textContent=message;
  $('#live').textContent=message;
}
function tone(correct, music=false) {
  if(!(music?settings.music:settings.sfx))return;
  const AudioCtx=window.AudioContext || window.webkitAudioContext;
  if(!AudioCtx)return;
  audioContext ||= new AudioCtx();
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  const osc=audioContext.createOscillator(), gain=audioContext.createGain(), start=audioContext.currentTime;
  const vol=(music?settings.musicVolume:settings.sfxVolume)/100;
  osc.frequency.value=music?[261.63,329.63,392,523.25][Math.floor(Date.now()/2200)%4]:correct?659.25:220;
  if(!music && correct)osc.frequency.setValueAtTime(880,start+.09);
  gain.gain.setValueAtTime(.12*vol,start);
  gain.gain.exponentialRampToValueAtTime(.0001,start+.27);
  osc.connect(gain).connect(audioContext.destination);
  osc.start();osc.stop(start+.28);
  if(music) {musicNode=osc;osc.onended=()=>{if(musicNode===osc)musicNode=null;};}
}
function conveyorMoves() {
  return tab==='calendar-conveyor' && !game?.done && !roundOptions.stationary && !settings.motion &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function canPause() {
  return phase==='play' && (paused || conveyorMoves() || game?.timer>0 || (tab==='week-review' && flash.auto));
}
function background() {
  const play = ['play','results','lesson','spelling','spell-results'].includes(phase);
  const dim = play ? (settings.backgroundStrength==='Dimmed'?94:Math.max(28,settings.dim)) : Math.min(55,settings.dim);
  const sceneOn = settings.scenes && settings.backgroundStrength!=='Hidden';
  const exactScene=manifest.titleScenes[tab];
  stage.classList.toggle('exact-title-scene',!!exactScene);
  const edgeScene=sceneOn&&exactScene;
  stage.classList.toggle('viewport-scene',!!edgeScene);
  if(edgeScene){
    stage.style.setProperty('--viewport-scene',`url("${new URL(imageURL(exactScene),document.baseURI).href}")`);
    stage.style.setProperty('--viewport-tint',`rgb(247 241 252 / ${dim}%)`);
  }else{
    stage.style.removeProperty('--viewport-scene');
    stage.style.removeProperty('--viewport-tint');
  }
  stage.style.backgroundImage = sceneOn && !exactScene && tab!=='home' ? `linear-gradient(rgb(247 241 252 / ${dim}%),rgb(247 241 252 / ${dim}%)),url("${imageURL(scene(tab,'background'))}")` : 'none';
  stage.style.setProperty('--round-accent',accent[tab]||lessonAccents[lessonTabs.indexOf(tab)]);
  stage.classList.toggle('playing',play);
  document.documentElement.dataset.font = fontOptions.includes(settings.font) ? settings.font : 'Elementary';
  document.body.classList.toggle('large',settings.large);
  document.body.classList.toggle('motion-off',settings.motion);
  document.body.classList.toggle('paused',paused);
  document.body.classList.toggle('hide-controls',controlsHidden && tab!=='settings' && tab!=='home');
}
function progress() {
  const team = settings.teams && (adventure || settings.scoring) && !['home','settings'].includes(tab);
  if(!adventure && !team)return '';
  if(tab==='home'||tab==='settings')return '';
  const cards = adventure ? (adventure.cards || []).length : 0;
  return `<div class="progress row">${adventure ? btn((adventure.expanded?'Hide week · ':'Recovered week · ')+cards+'/7','progress') :''}
    ${adventure?.expanded ? days.map((d,i)=>`<span class="chip ${i<cards?'earned':''}">${i<cards?'✓ ':''}${d}</span>`).join(''):''}
    ${team ? settings.names.map((name,i)=>`<span class="chip">${esc(name)} · ${playData().points[i]}</span>${btn('Award Point','point',i,'teacher',`aria-label="Award Point to ${esc(name)}"`)}`).join(''):''}</div>`;
}
function render(restoreFocus=false) {
  const old=document.activeElement;
  const moreWasOpen = $('#round-more')?.open && $('#round-more')?.dataset.round===tab;
  const active=restoreFocus && old?.dataset.act ? [old.dataset.act,old.dataset.val] : null;
  const activeSetting=restoreFocus && old?.dataset.setting;
  $('#nav').innerHTML=missionNavigation();
  document.body.classList.toggle('mission-home',tab==='home');
  stage.dataset.view=tab;
  stage.dataset.phase=phase;
  stage.dataset.question=tab==='home'||phase==='intro'?'':game?.state||'';
  background();
  let content;
  if(tab==='home')content=homeView();
  else if(tab==='settings')content=settingsView();
  else if(tab==='spelling')content=spellingView();
  else if(lessonTabs.includes(tab))content=phase==='intro'?lessonIntro():lessonView();
  else if(phase==='intro')content=introView();
  else if(tab==='week-review' && !game && phase!=='results')content=reviewView();
  else if(phase==='results')content=resultsView();
  else content=roundView();
  stage.innerHTML=progress()+(phase==='play'?(pendingLevel?`<div class="panel row" role="status">Switch to ${pendingLevel}?${btn('Restart at This Level','level-restart','','primary')}${btn('Keep Playing','level-keep')}</div>`:'')+counter():'')+content;
  const activeArt=phase!=='intro'&&manifest.glowup.active[tab];
  const board=activeArt&&stage.querySelector('.board');
  if(board){
    board.classList.add('v2-art-board');
    board.style.setProperty('--screen-art',`url("${new URL(imageURL(activeArt),document.baseURI).href}")`);
  }
  arrangeControls(moreWasOpen);
  if(phase==='play'&&game&&!game.done&&game.selected!=null){
    const selected=stage.querySelector(`[data-act="answer"][data-val="${game.selected}"]`);
    selected?.classList.add(game.feedback.startsWith('Try')?'play-retry':'play-selected');
  }
  const emphasis = stage.querySelector('.board > .clue,.calendar-reveal,.board > .today,.board > .curtain,.board > .grid,.prompt');
  const key = [tab,phase,game?.index,game?.state,game?.done,flash.mode,flash.index].join('/');
  if(emphasis && key!==lastFocusKey){
    emphasis.classList.add('emphasis');
    stage.querySelector('.timer,.feedback.good')?.classList.add('emphasis');
  }
  lastFocusKey = key;
  if(activeSetting)stage.querySelector(`[data-setting="${activeSetting}"]`)?.focus({preventScroll:true});
  if(active){
    const target=[...document.querySelectorAll('button[data-act]')].find(el=>el.dataset.act===active[0]&&el.dataset.val===active[1]);
    if(target && target.getClientRects().length)target.focus({preventScroll:true});
    else {const heading=stage.querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
  }
}
function arrangeControls(moreWasOpen) {
  for(const button of stage.querySelectorAll('.tiles button,[data-act=flash-mode],[data-act=config],[data-act=content],[data-act=group]')){
    button.classList.add('magnify');
    if(button.classList.contains('primary'))button.setAttribute('aria-pressed','true');
  }
  if(tab==='home'||tab==='settings')return;
  const bar = stage.querySelector('.controls');
  if(!bar){
    if(controlsHidden)stage.insertAdjacentHTML('beforeend',`<div class="row">${btn('Show Controls','hide','','projection-handle')}</div>`);
    return;
  }
  const essentials = new Set(['audio','reveal','spell-check','spell-next','spell-back','spell-audio','spell-pause','spell-reveal','quick','quick-back','lesson-back','lesson-reveal','lesson-play','lesson-step','pause','next-question','next-round','flash-step','blackout','curtain']);
  const extras=[];
  for(const entry of [...bar.children]){
    const act = entry.dataset.act;
    if(act==='hide'){entry.remove();continue;}
    const secondary=['lesson-title','lesson-shuffle','lesson-studio','spell-setup','spell-shuffle','studio','full','title'];
    if((entry.querySelector('select[data-option=level]')||((lessonTabs.includes(tab)||tab==='spelling')&&!secondary.includes(act))) && !controlsHidden)continue;
    if(essentials.has(act) || controlsHidden && act==='reveal' ||
       controlsHidden && act==='audio' && (roundOptions.conveyor==='Listening' && tab==='calendar-conveyor' || roundOptions.custom==='Listen and Tap' && tab==='custom-practice'))continue;
    const group = act in optionalControls ? act : 'modes';
    const roundMode = !act || ['flash-mode','group','words','flash-auto','forecast','schedule','stationary','actor','studio'].includes(act);
    if(!controlsHidden && (settings.optional.includes(group) && (group!=='modes'||roundMode))){
      entry.classList.add('secondary');continue;
    }
    if(controlsHidden){entry.remove();continue;}
    extras.push(entry);
  }
  if(extras.length){
    const more=document.createElement('details');
    more.id='round-more';more.dataset.round=tab;more.open=!!moreWasOpen;
    more.innerHTML='<summary class="magnify">More</summary><div class="row more-items"></div>';
    more.lastElementChild.append(...extras);
    bar.append(more);
  }
  bar.insertAdjacentHTML('beforeend',btn(controlsHidden?'Show Controls':'Projection Mode','hide','','projection-handle'));
}
function navigate(id,{skip=false,keep=false}={}) {
  if(id==='spelling'){openSpelling();return;}
  if(lessonTabs.includes(id)){openLesson(id);return;}
  if(tab===id && id==='settings')return;
  stopAudio();flash.auto=false;titleReplay=false;message='';pickMode=false;
  if(id==='settings'){
    settingsReturn={tab,phase,paused};
    save();
    paused=true;tab=id;phase='settings';render();return;
  }
  save();
  settingsReturn=null;bank=null;pendingLevel=null;
  if(!keep && id!=='home' && id!=='custom-practice'){
    if(adventure){saved.adventure=adventure;adventure=null;}
    practice={points:[0,0]};
  }
  if(id==='custom-practice' && adventure){saved.adventure=adventure;adventure=null;}
  tab=id;paused=false;game=null;
  phase=id==='home'?'home':settings.titles&&!skip?'intro':'play';
  if(keep && adventure && order.includes(id)) {
    adventure.where=id;adventure.play=null;
    try {localStorage.setItem('calendar-heist-session',JSON.stringify({settings,adventure}));}catch{persistence=false;}
  }
  if(phase==='play')startRound();else render();
}
function startAdventure() {
  if((adventure||saved.adventure) && !confirm('Start a new adventure and replace saved class progress?'))return;
  adventure={where:order[0],cards:[],points:[0,0],expanded:false,play:null};
  saved.adventure=null;
  tab='home';phase='home';
  navigate(order[0],{keep:true});
}
function continueAdventure() {
  adventure ||= saved.adventure;
  if(!adventure)return;
  const snapshot=adventure.play;
  stopAudio();settingsReturn=null;tab=adventure.where;phase=snapshot?.phase || (settings.titles?'intro':'play');game=snapshot?.game || null;bank=snapshot?.bank||null;pendingLevel=null;
  if(game&&!bank&&phase==='play'){
    if(tab==='stop-the-time-loop'&&game.tail)game.tail=[...game.tail].sort((a,b)=>a-b);
    bank={level:selectedLevel(),length:game.tail?game.index+1:Math.max(questionLength(),game.index+1),cycles:{}};
  }
  if(snapshot){
    const options={...snapshot.options};
    if(!options.conveyorAudioPrompt)delete options.conveyor;
    roundOptions={...roundOptions,...options};flash={...flash,...snapshot.flash,auto:false};}
  paused=false;titleReplay=false;
  if(phase==='play' && !game && tab!=='week-review')startRound();else render();
}
const missionLandmarks=[
  ['Calendar Workshop','calendar-conveyor'],
  ['Weather Station','weather-blackout'],
  ['Theater Curtains','freeze-frame-charades'],
  ['Pastel Doors','three-door-dash'],
  ['Time Machine','yesterday-tomorrow-switch'],
  ['Clock Tower','stop-the-time-loop']
];
function missionNavigation(){
  const group=tab==='week-review'&&phase==='play'&&game?'Rounds':tab==='week-review'||lessonTabs.includes(tab)?'Teach':tab==='spelling'||tab==='custom-practice'?'Practice':order.includes(tab)?'Rounds':'';
  const menu=(label,ids)=>`<details name="mission-navigation" class="mission-menu"><summary ${group===label?'class="nav-current"':''}>${label}</summary>
    <div class="mission-menu-list">${ids.map(id=>btn(manifest.scenes[id].name,'nav',id,'',id===tab?'aria-current="page"':'')).join('')}</div></details>`;
  return btn('Map','nav','home','mission-play',tab==='home'?'aria-current="page"':'')+
    menu('Rounds',[...order,'spelling','custom-practice'])+
    menu('Teach',['week-review',...lessonTabs])+
    menu('Practice',['spelling','custom-practice'])+
    btn('Settings','nav','settings','',tab==='settings'?'aria-current="page"':'')+
    btn('Full Screen','full');
}
function missionProgress(session){
  const recovered=Math.min(7,session?.cards?.length||0);
  const movement=days.map((day,i)=>{
    const status=i<recovered?'Recovered':i===recovered?'Current':'Ahead';
    return `<li class="map-day map-day-${status.toLowerCase()}" ${status==='Current'?'aria-current="step"':''}>
      <abbr title="${day}">${day.slice(0,3).toUpperCase()}</abbr><span aria-hidden="true">${({Recovered:'✓',Current:'▶',Ahead:'•'})[status]}</span>
      <span class="sr"> ${status}</span></li>`;
  }).join('');
  return `<section class="mission-progress" aria-label="Calendar progress, ${recovered} of 7 cards recovered">
    <h2>Calendar Progress</h2><ol>${movement}</ol></section>`;
}
function homeView(){
  const session=adventure||saved.adventure;
  const hasSave=!!session;
  const map=manifest.missionMap;
  return `<section class="mission-map" aria-label="Mission Map" style="--mission-image:url('${esc(new URL(imageURL(map.landscape),document.baseURI).href)}')">
    <div class="mission-title"><h1>It’s a Fun Day!<span>The Calendar Heist</span></h1></div>
    <div class="mission-start">${btn('▶ Start Adventure','adventure','','mission-start-button')}${hasSave?btn('Continue Adventure','continue','','mission-continue'):''}</div>
    <ol class="mission-locations" aria-label="Mission locations">${missionLandmarks.map(([name,id],i)=>`<li class="mission-stop mission-stop-${i+1}">
      <button class="mission-location" data-act="nav" data-val="${id}" type="button">
        ${fileImg(map.landmarks[id])}<span>${name}</span></button></li>`).join('')}</ol>
    ${missionProgress(session)}
  </section>`;
}
function glowIntro(title,directions,tools,example=''){
  const illustration=manifest.titleScenes[tab]||media.art[tab]?.title||manifest.scenes[tab].background;
  const logo=manifest.windowLogos[tab];
  return `<section class="glow-intro">
    <div class="glow-intro-copy"><h1 class="window-title">${logo?fileImg(logo,title):esc(title)}</h1><p>${esc(directions)}</p>
      ${example?`<p class="glow-example">${esc(example)}</p>`:''}
      <div class="glow-intro-tools">${tools}</div></div>
    <div class="glow-intro-art">${fileImg(illustration)}</div></section>`;
}
function introView() {
  const idx=order.indexOf(tab);
  const example=tab==='calendar-conveyor'&&selectedLevel()==='Challenge'?'Example · “Today is Friday. Tap tomorrow.” The answer is Saturday.':'';
  return glowIntro(manifest.scenes[tab].name,instructions[idx]||'Choose a vocabulary deck and practice with pictures, spoken prompts, or sequences.',
    levelPicker()+btn(titleReplay?'Return to Round':'Start Round','start','','primary')+btn('Skip Intro','start'),example);
}
function reviewView() {
  const ids=flash.mode==='Individual Flash'?[flash.order[flash.index]]:flash.mode==='Group Flash'?flash.group:allDays;
  return prompt('What day is today?','Today is ___.   ·   It’s ___.')+`<div class="board review-board">${ids.length===1?`<button class="card flash-big" data-act="weekday" data-val="${ids[0]}">${calendars(ids[0],flash.words)}</button>`:grid(ids.map(id=>`<button class="card" data-act="weekday" data-val="${id}">${calendars(id,flash.words)}</button>`))}</div>`
  +controls(['Full Week','Individual Flash','Group Flash'].map(mode=>btn(mode,'flash-mode',mode,flash.mode===mode?'primary':'')).join('')
  +(flash.mode==='Group Flash'?btn('Weekdays','group','weekdays')+btn('Weekend','group','weekend')+days.map((d,i)=>btn(d.slice(0,3),'group',i,flash.group.includes(i)?'primary':'')).join(''):'')
  +(flash.mode==='Individual Flash'?btn('Previous','flash-step',-1)+btn('Next','flash-step',1)+btn('Shuffle','flash-shuffle')+btn(flash.auto?'Stop Auto-Advance':'Auto-Advance','flash-auto'):'')
  +btn('Quick Check','quick','','primary')+btn(flash.words?'Hide Word':'Show Word','words')+btn('Next Round','next-round','','primary')+commonControls(false));
}
function startRound() {
  const replaying=titleReplay;
  phase='play';titleReplay=false;
  if(replaying){paused=false;save();render();return;}
  paused=false;game=null;bank=null;pendingLevel=null;
  if(tab==='week-review'){save();render();return;}
  if(tab==='custom-practice' && roundOptions.custom==='Picture Flash') {newQuestion(0);return;}
  if(tab==='custom-practice' && roundOptions.custom==='Sequence Challenge' && !ordered(items())){render();return;}
  newQuestion(0,true);
}
function optionsFor(answer,pool,count) {
  const alternatives=mix(pool.filter(i=>i!==answer)).slice(0,count-1);
  if(settings.random)return mix([answer,...alternatives]);
  return [answer,...alternatives].sort((a,b)=>a-b);
}
function bankTarget(pool,index) {
  const cycle=Math.floor(index/pool.length);
  if(!bank.cycles[cycle]){
    const previous=bank.cycles[cycle-1]?.at(-1);
    const next=mix(pool);
    if(next.length>1 && next[0]===previous)next.push(next.shift());
    bank.cycles[cycle]=next;
  }
  return bank.cycles[cycle][index%pool.length];
}
function newQuestion(index, first=false) {
  stopAudio();
  const history=first?{}:game?.history || {};
  const custom=tab==='custom-practice', mode=roundOptions.custom;
  const entries=custom?customPool():null;
  const pool=custom?entries.map((_,i)=>i):allDays;
  const flashOnly=custom&&mode==='Picture Flash', sequence=custom&&mode==='Sequence Challenge';
  if(pool.length<(flashOnly?1:sequence?3:2)){game=null;render();return;}
  bank ||= {level:selectedLevel(),length:flashOnly?pool.length:questionLength(),cycles:{}};
  index=Math.max(0,index);
  if(index>=bank.length){finishRound();return;}
  const previous=history[index];
  if(previous){game={...previous,history};paused=false;save();render();if(isListening())replay();return;}
  const level=levelIndex(), count=[3,5,7][level];
  let direction=index%2?-1:1;
  const variant=Math.floor(index/pool.length);
  const answer=flashOnly?index:bankTarget(pool,index);
  if(level===2&&tab==='yesterday-tomorrow-switch'){
    if(answer<=1)direction=1;
    if(answer>=5)direction=-1;
  }
  game={index,answer,history,selected:null,done:false,hint:false,feedback:'',revealed:false,state:'question',timer:null,
    choices:optionsFor(answer,pool,count),variant};
  switch(tab){
    case 'calendar-conveyor':
      game.laneTime=0;game.delta=level===2?direction:0;game.today=mod(answer-game.delta);
      game.spoken=level===0?days[answer]:level===1?`Today is ${days[answer]}.`:`Today is ${days[game.today]}. Tap ${direction>0?'tomorrow':'yesterday'}.`;
      break;
    case 'weather-blackout': {
      const codes=Object.keys(manifest.weather);
      const shuffled=mix(codes);
      const weather=[...shuffled.slice(index%9),...shuffled.slice(0,index%9)].slice(0,count);
      game.pairs=game.choices.map((id,i)=>[id,weather[i]]);
      game.weather=game.pairs.find(pair=>pair[0]===answer)[1];
      game.reverse=level===2&&index%2===1;
      game.weatherChoices=game.pairs.map(([id,code])=>[id,code]);
      game.keepForecast=level===0;game.state='study';
      game.timer=settings.countdown?(settings.countdown+(level===0?5:0)):null;break;
    }
    case 'freeze-frame-charades':
      game.reverse=level===2&&index%3===2;
      game.actor=level===2?index%3===1:roundOptions.charades==='Act It Out';
      game.state='schedule';break;
    case 'three-door-dash':
      game.delta=direction*(level===2?2:1);
      game.choices=optionsFor(answer,level===2?[mod(answer-1),answer,mod(answer+1)]:allDays,3);
      break;
    case 'yesterday-tomorrow-switch':
    case 'week-review':
      game.delta=direction*(level===2?2:1);
      game.today=mod(answer-game.delta);
      break;
    case 'stop-the-time-loop': {
      if(index===bank.length-1){
        game.tail=allDays.slice(7-[3,4,7][level]);game.placed=[];game.choices=mix(game.tail);
      }else{
        const span=[3,4,6][level], gap=(index+variant)%span;
        game.sequence=Array.from({length:span},(_,i)=>mod(answer-gap+i));
        game.gaps=[gap];
        if(level===2&&index%2===1)game.gaps.push((gap+2)%span);
        game.gaps.sort((a,b)=>a-b);
        game.answers=game.gaps.map(i=>game.sequence[i]);game.filled=0;
        game.choices=optionsFor(game.answers[0],allDays,Math.min(count,5));
      }
      break;
    }
    case 'custom-practice': {
      if(sequence){
        const size=Math.min(pool.length,[3,4,7][level]);
        const start=answer%(pool.length-size+1);
        game.tail=pool.slice(start,start+size);game.placed=[];game.choices=mix(game.tail);
      }else if(!flashOnly){
        const entry=entries[answer];
        const formats=['Listen and Tap',...(entry.picture?['Picture-to-Word Match']:[]),...(entry.clue||entry.translation?['Clue-to-Word']:[])];
        game.format=mode==='Mixed Quiz'?formats[(level===0?0:index+variant)%formats.length]:mode;
        const clueFor=x=>game.format==='Picture-to-Word Match'&&x.picture?x.picture:
          game.format==='Listen and Tap'?null:x.clue||x.translation||x.picture;
        const clue=clueFor(entry);
        const others=pool.filter(i=>i!==answer&&entries[i].word.trim().toLowerCase()!==entry.word.trim().toLowerCase()&&(!clue||clueFor(entries[i])!==clue));
        const byWord=new Set();
        let candidates=mix(others).filter(i=>{const word=entries[i].word.trim().toLowerCase();if(byWord.has(word))return false;byWord.add(word);return true;});
        if(level===2&&entry.category)candidates.sort((a,b)=>Number(entries[b].category===entry.category)-Number(entries[a].category===entry.category));
        game.choices=mix([answer,...candidates.slice(0,(mode==='Three-Door Quiz'?3:count)-1)]);
      }
      break;
    }
  }
  paused=false;save();render();
  if(isListening())replay();
}
function isListening(){
  return tab==='calendar-conveyor'&&roundOptions.conveyor==='Listening'||tab==='custom-practice'&&(game?.format||roundOptions.custom)==='Listen and Tap';
}
function rememberQuestion() {
  if(!game)return;
  const {history,...snapshot}=game;
  history[game.index]=snapshot;
}
function finishRound() {
  stopAudio();
  phase='results';paused=false;
  if(adventure && order.includes(tab) && tab!=='week-review'){
    const idx=order.indexOf(tab);
    if(!adventure.cards.includes(idx)){adventure.cards.push(idx);if(tab==='stop-the-time-loop')adventure.cards.push(7);}
  }
  save();render();
}
function nextRound() {
  const idx=order.indexOf(tab);
  if(idx<0 || idx===order.length-1){navigate('home',{keep:true});return;}
  navigate(order[idx+1],{keep:!!adventure});
}
function replay() {
  if(tab==='week-review'&&!game){const i=flash.mode==='Individual Flash'?flash.order[flash.index]:0;speak(days[i],media.activities[i]?.audio);return;}
  if(!game)return;
  if(paused)return;
  if(tab==='custom-practice'){
    const entry=customPool()[game.answer];
    if(entry)speak(entry.word,entry.audio);
    return;
  }
  if(tab==='calendar-conveyor' && !game.done && roundOptions.conveyor==='Reading')return;
  if(tab==='calendar-conveyor'&&!game.done) speak(game.spoken||days[game.answer],levelIndex()===0?media.activities[game.answer]?.audio:null);
  else if(game.done) speak(days[game.answer],media.activities[game.answer]?.audio);
  else if(tab==='three-door-dash')speak(doorPrompt(game.answer));
  else if(tab==='yesterday-tomorrow-switch')speak(switchPrompt());
  else if(tab==='weather-blackout')speak(game.reverse?`What was the weather on ${days[game.answer]}?`:'Which day had this weather?');
  else if(tab==='freeze-frame-charades')speak(game.reverse?`Which activity is on ${days[game.answer]}?`:'What day is it?');
  else speak('Which day is missing?');
}
function choose(value) {
  if(paused || !game || game.done || game.state!=='question')return;
  if(!game.choices.includes(value))return;
  game.selected=value;game.feedback='';
  if(game.placed){render(true);return;}
  checkAnswer(value);
}
function checkAnswer(value) {
  if(value===(game.answers?.[game.filled]??game.answer)){
    if(game.answers&&++game.filled<game.answers.length){
      game.choices=optionsFor(game.answers[game.filled],allDays,5);game.feedback='One gap filled. Choose the next missing day.';game.hint=false;game.selected=null;save();render(true);return;
    }
    reveal(true);return;
  }
  game.feedback='Try again!';
  if(tab==='three-door-dash' && settings.hints)game.hint=true;
  tone(false);save();render(true);
}
function place(value) {
  if(paused || !game?.placed || game.done || !game.choices.includes(value) || game.placed.includes(value))return;
  const expected=game.tail;
  if(value!==expected[game.placed.length]){
    game.feedback='Try a different card for this space.';tone(false);render(true);return;
  }
  game.placed.push(value);game.selected=null;game.feedback='';
  if(game.placed.length===expected.length){
    if(tab==='stop-the-time-loop'){tone(true);finishRound();}
    else reveal(true);
  }else{tone(true);save();render(true);}
}
function reveal(correct=false) {
  if(!game || game.done)return;
  paused=false;
  if(tab==='stop-the-time-loop' && game.tail){finishRound();return;}
  if(game.answers)game.filled=game.answers.length;
  if(tab==='custom-practice' && game.tail)game.placed=[...game.tail];
  game.state='question';game.done=true;game.revealed=true;game.timer=null;game.feedback=correct?'Correct!':'Answer revealed.';
  if(correct)tone(true);
  save();render(true);
}
function commonControls(includeRound=true) {
  let main = levelPicker();
  if(canPause())main+=btn(paused?'Resume':'Pause','pause');
  if(includeRound && game){
    const canReplay = settings.voice || isListening();
    if(canReplay && (tab!=='calendar-conveyor'||game.done||roundOptions.conveyor==='Listening')) main+=btn('Replay Audio','audio');
    if(!game.done && game.state==='question' && settings.hints && !isListening()) main+=btn('Hint','hint');
    if(!game.done && game.state!=='study') main+=btn('Reveal','reveal');
    if(game.index>0)main+=btn('Previous','prev-question');
    main+=btn('Next','next-question','','primary')+btn('Restart Round','restart');
  }
  return main+btn('Show Title','title')+btn('Settings','nav','settings')+btn('Full Screen','full');
}
function activity(id,answer=false) {
  const item=media.activities[id]||{};
  return figure(answer?(item.answer||item.picture||week(id).activityClue):(item.picture||week(id).activityClue),
    answer?days[id]+' · '+actions[id]:'',item.picture&&(!answer||!item.answer)?item.mask:null);
}
function choices(cls='',classFor=(i)=>'') {
  return grid(game.choices.map((id,i)=>{
    const word = tab==='custom-practice'?customPool()[id].word:days[id];
    if(cls==='door')return `<button type="button" class="answer door glow-door" data-act="answer" data-val="${id}">
      ${fileImg(manifest.glowup.doors[i%3])}<span>${sentence(word)}</span></button>`;
    return btn(word,'answer',id,`answer ${cls} ${classFor(i)} ${game.selected===id?'chosen':''}`,`title="${esc(word)}"`);
  }),cls==='door'?'doors':'');
}
function doorPrompt(answer) {
  const prev=days[mod(answer-1)], next=days[mod(answer+1)];
  if(levelIndex()===2)return `What day comes two days ${game.delta>0?'after':'before'} ${days[mod(answer-game.delta)]}?`;
  return levelIndex()===1?`I come after ${prev} and before ${next}. What day am I?`:
    game.index%2?`What day comes before ${next}?`:`What day comes after ${prev}?`;
}
function switchPrompt() {
  if(levelIndex()===2)return `What day is two days ${game.delta>0?'later':'earlier'}?`;
  if(levelIndex()===0)return game.delta<0?`What comes before ${days[game.today]}?`:`What comes after ${days[game.today]}?`;
  return game.delta<0?'What day was yesterday?':'What day is tomorrow?';
}
function cardChoice(id){return `<button data-act="answer" data-val="${id}" class="card">${calendars(id)}</button>`;}
function forecast(reference=false) {
  const tiles=grid(game.pairs.map(([id,w])=>`<div class="card">${fileImg(manifest.weather[w].clue)}<b>${days[id]}</b></div>`),'forecast');
  return reference?`<section class="forecast-reference" aria-label="Forecast reference"><h2>Forecast reference</h2>${tiles}</section>`:tiles;
}
function finalSlots() {
  const isWeek=tab==='stop-the-time-loop', xs=isWeek?null:customPool();
  const name=id=>isWeek?days[id]:xs[id].word;
  const prefix=isWeek?allDays.slice(0,game.tail[0]):[];
  return grid((isWeek?prefix.map(id=>`<div class="card"><b>${days[id]}</b></div>`):[]).concat(game.tail.map((_,i)=>game.placed[i]!==undefined?`<div class="card earned"><b>${esc(name(game.placed[i]))}</b></div>`:btn('＋','slot',i,'answer slot',`aria-label="Place card in space ${i+1}"`))),'sequence')
    +(game.done?'':grid(game.choices.filter(id=>!game.placed.includes(id)).map(id=>btn(name(id),'answer',id,'answer '+(game.selected===id?'chosen':''),'draggable="true"')),'sequence'));
}
function hintView() {
  if(!game.hint || game.done)return '';
  if(tab==='weather-blackout')return forecast(true);
  if(tab==='freeze-frame-charades')return grid(allDays.map(id=>`<div class="card"><b>${days[id]}</b><span>${actions[id]}</span></div>`),'forecast');
  if(tab==='custom-practice'){
    const x=customPool()[game.answer];return `<p class="feedback">Hint · ${esc(x.clue||x.translation||x.word[0]+'…')}</p>`;
  }
  if(isListening())return '';
  const noAnswer=game.tail || game.answers || [game.answer];
  return `<div class="row panel">${days.map((d,i)=>`<span class="chip">${noAnswer.includes(i)?'___':d}</span>`).join('')}</div>`;
}
function roundView() {
  if(tab==='custom-practice')return customView();
  if(!game)return '';
  let title='',sub='',board='',extra='';
  const done=game.done, answer=game.answer;
  const schedule=()=>grid(allDays.map(id=>`<div class="card">${activity(id,false)}<b>${days[id]}</b><small>${actions[id]}</small></div>`),'forecast');
  const pictureChoices=(image,label)=>grid(game.choices.map(id=>`<button class="card" data-act="answer" data-val="${id}" aria-label="${label} ${game.choices.indexOf(id)+1}">${image(id)}</button>`));
  switch(tab){
    case 'week-review':
      title=done?`It’s ${days[answer]}.`:levelIndex()===0?'Which weekday matches this date?':levelIndex()===1?'Which day is missing?':`What day comes two days ${game.delta>0?'after':'before'} ${days[game.today]}?`;
      board=done?calendarReveal(answer): (levelIndex()===0?figure(week(answer).calendarDateOnly,'Calendar date'):levelIndex()===1?`<div class="panel today">${days[mod(answer-1)]} → ? → ${days[mod(answer+1)]}</div>`:'')+choices();
      extra=btn('Back to Flashcards','quick-back');break;
    case 'calendar-conveyor': {
      title=done?`It’s ${days[answer]}.`:roundOptions.conveyor==='Reading'?days[answer]:'Listen and tap';
      const motion=conveyorMoves();
      if(done)board=calendarReveal(answer);
      else {
        const duration=travelDuration();
        board=`<div class="lane ${motion?'moving':''}" style="--travel:${duration}s">${grid(game.choices.map(cardChoice)).replace('style="','style="animation-delay:-'+(game.laneTime||0)+'s;')}</div><small id="teacher-read" class="panel teacher" hidden></small>`;
      }
      extra=select('conveyor','Mode',['Listening','Reading'],roundOptions.conveyor)+select('speed','Speed',['Slow','Normal','Fast'],settings.speed,'setting')+btn(roundOptions.stationary?'Moving Belt':'Stationary Belt','stationary');
      break;
    }
    case 'weather-blackout':
      if(done){title=`It’s ${days[answer]}. It’s ${game.weather}.`;board=figure(manifest.weather[game.weather].clue,game.weather);}
      else if(game.state==='study'){title='Study the forecast';board=forecast();extra+=btn('Blackout Now','blackout','','primary');}
      else {
        title=game.reverse?`What was the weather on ${days[answer]}?`:game.index%2===0?`Which day was ${game.weather}?`:'Which day had this weather?';
        board=game.reverse?pictureChoices(id=>fileImg(manifest.weather[game.weatherChoices.find(pair=>pair[0]===id)[1]].clue),'Weather picture'):figure(manifest.weather[game.weather].clue,'Weather picture')+choices();
        if(game.keepForecast)board+=forecast(true);
      }
      extra+=btn(game.keepForecast?'Hide Forecast During Guess':'Keep Forecast Visible','forecast')+(game.state==='question'&&!done?btn('Show Forecast Again','hint'):'');
      break;
    case 'freeze-frame-charades':
      if(done){title=`It’s ${days[answer]}.`;sub=`${answer===5?'She’s':subjects[answer]+' is'} ${actions[answer]}.`;board=activity(answer,true);}
      else if(game.state==='schedule'){
        title='Study the activity schedule';
        board=schedule();
        extra+=btn(game.reverse?'Choose an Activity':game.actor?'Close Curtain':'Show Picture Clue','curtain','','primary');
      }else{
        title=game.reverse?`Which activity is on ${days[answer]}?`:'What day is it?';
        board=game.reverse?pictureChoices(id=>activity(id,false),'Activity picture'):(game.actor?'<div class="curtain">🎭 Act it out!</div>':activity(answer,false))+choices();
        if(levelIndex()===0)board+=schedule();
      }
      extra+=(levelIndex()<2?select('charades','Mode',['Act It Out','Picture Guess'],roundOptions.charades):'')
        +(done?'':btn('Actor Cue · Private Window','actor')+btn('Activity Schedule','schedule'));
      break;
    case 'three-door-dash':
      title=done?`It’s ${days[answer]}.`:doorPrompt(answer);
      board=done?calendarReveal(answer):choices('door');
      break;
    case 'yesterday-tomorrow-switch':
      title=done?`It’s ${days[answer]}.`:switchPrompt();
      board=(done?calendarReveal(answer):`<div class="today panel ${game.delta<0?'arrow-left':'arrow-right'}"><span aria-hidden="true">${game.delta<0?'←':'→'}</span><div>Today is ${days[game.today]}.${calendars(game.today)}</div></div>`+grid(game.choices.map(cardChoice)));
      
      break;
    case 'stop-the-time-loop':
      title=game.tail?(done?'The clock is repaired!':`Put ${game.tail.length} days in order.`):done?'Sequence repaired!':game.gaps?.length===2?'Fill the gaps from left to right.':'Which day is missing?';
      board=`<div class="row panel repair-status">${fileImg(manifest.ui.clock).replace('<img','<img class="clock"')}<strong>Clock repair · ${Math.min(bank?.length||questionLength(),game.index+(done?1:0))}/${bank?.length||questionLength()}</strong></div>`;
      if(game.tail)board+=finalSlots();
      else board+=grid((game.sequence||[mod(answer-1),answer,mod(answer+1)]).map((d,i)=>{
        const gap=(game.gaps||[1]).indexOf(i);
        return `<div class="card ${gap>=0&&!done&&gap>=game.filled?'glow-gap':''}"><b>${gap>=0&&!done&&gap>=game.filled?'?':days[d]}</b></div>`;
      }),'sequence')+(done?'':choices());
      break;
  }
  const forecastTimer=tab==='weather-blackout'&&game.timer!==null&&game.timer!==undefined;
  return (forecastTimer?`<div class="glow-prompt-row">${prompt(title,sub)}<span id="timer" class="timer" aria-label="Seconds remaining">${Math.ceil(game.timer)} s</span></div>`:prompt(title,sub))+`<div class="board ${done?'reveal':''} ${tab==='weather-blackout' && game.keepForecast && game.state==='question' && !done?'with-forecast':''}">${board}${game.hint && !(tab==='weather-blackout' && game.keepForecast)?hintView():''}</div>`
    +statusView(forecastTimer)+controls(extra+commonControls());
}
function statusView(timerAtPrompt=false){
  return `<div class="row">${!timerAtPrompt && game?.timer!==null && game?.timer!==undefined?`<span id="timer" class="timer">${Math.ceil(game.timer)} s</span>`:''}
   ${paused?'<span class="feedback">Paused</span>':''}
   ${game?.feedback?`<span role="status" class="feedback ${game.done?'good':''}">${esc(game.feedback)}</span>`:''}</div>`;
}
function customView() {
  const chosenMode=roundOptions.custom, mode=game?.format||chosenMode, pool=customPool();
  const chooser=select('active','Deck',[ 'Days of the Week',...media.decks.map(d=>d.name+' · '+d.id.slice(-4))],deck()?deck().name+' · '+deck().id.slice(-4):'Days of the Week')
    +select('custom','Practice',customModes,chosenMode)+btn('Content Studio','studio');
  if(!game || !pool[game.answer] || game.choices.length<2 && chosenMode!=='Picture Flash'){
    const need=mode==='Picture Flash'?1:mode==='Sequence Challenge'||mode==='Three-Door Quiz'?3:2;
    const detail=mode==='Sequence Challenge'?'Assign a unique order to at least three enabled items.':mode==='Picture-to-Word Match'?' Add a picture or written clue to each item.':mode==='Three-Door Quiz'?' Add a picture, clue, or translation to each item.':'';
    return prompt(mode)+`<div class="board"><p class="feedback">This activity needs at least ${need} distinct, usable ${need===1?'item':'items'}.${esc(detail)}</p></div>`+controls(chooser+commonControls(false));
  }
  const x=pool[game.answer];
  const show=game.done, pic=show?(x.answer||x.picture):x.picture, masked=(!show || !x.answer)&&x.mask;
  let title='', board='';
  if(mode==='Sequence Challenge'){title=show?'Sequence complete!':'Put these in order.';board=finalSlots();}
  else if(mode==='Picture Flash'){title=show||!x.picture&&!x.clue?x.word:'What is it?';board=figure(pic,'',masked)+(x.clue&&!show?`<p class="panel long-text">${sentence(x.clue)}</p>`:'');}
  else if(show){title=x.word;board=figure(pic,'',masked);}
  else {
    title=mode==='Listen and Tap'?'Listen and tap':mode==='Three-Door Quiz'?'Open the matching door':'Match the clue to a word';
    if(mode==='Listen and Tap')board='<small id="teacher-read" class="panel teacher" hidden></small>';
    else board=(mode==='Clue-to-Word'?'':figure(pic,'',masked))+((x.clue||x.translation)?`<p class="panel long-text">${sentence(x.clue||x.translation)}</p>`:'');
    board+=choices(mode==='Three-Door Quiz'?'door':'');
  }
  return prompt(title,show?[x.translation,x.sentence].filter(Boolean).join(' · '):'')+`<div class="board">${board}${hintView()}</div>`+statusView()+controls(chooser+commonControls());
}
function resultsView() {
  const finale=tab==='stop-the-time-loop';
  return prompt(finale?'The week is back!':'Round complete',finale?'Read all seven days aloud, starting with Monday.':'')+
    `<div class="board reveal">${finale?grid(allDays.map(id=>`<button data-act="weekday" data-val="${id}" class="card">${calendars(id)}</button>`)):fileImg(manifest.ui.clock).replace('<img','<img style="max-height:33vh"')}</div>`+
    controls(btn('Replay Round','restart')+btn(finale||tab==='custom-practice'?'Home':'Next Round',tab==='custom-practice'?'nav':'next-round',tab==='custom-practice'?'home':'','primary')+commonControls(false));
}
const switchSetting=(key,label)=>`<label><input type="checkbox" data-setting="${key}"${checked(settings[key])}> ${label}</label>`;
const slider=(key,label)=>`<label>${label} <input type="range" min="0" max="100" value="${settings[key]}" data-setting="${key}"></label>`;
const upload=(field,label,accept,extra='')=>`<label>${label}<input type="file" data-upload="${field}" accept="${accept}" ${extra}></label>`;
const imageTypes='image/png,image/jpeg,image/webp';
function fontSettings() {
  return `<fieldset class="font-settings"><legend>Font</legend><small>Elementary uses Comic Sans MS or Chalkboard SE when installed. The offline fallback is URW Gothic.</small>
    <div class="row left">${select('font','Typeface',fontOptions,settings.font,'setting')}
      ${btn('Restore Default','font-default')}</div>
    ${upload('font','Upload a font (.woff2, .woff, .ttf, .otf)','.woff2,.woff,.ttf,.otf')}
    ${media.font?.name?`<p>Uploaded: ${esc(media.font.name)}</p>`:''}
    ${fontError?`<p class="feedback" role="status">${esc(fontError)}</p>`:''}
    <div class="font-preview" aria-label="Live font preview"><p>What day is today?</p><p>It’s Wednesday.</p>
      <p>Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz</p>
      <p>0 1 2 3 4 5 6 7 8 9 · I l 1 · b d p q</p><p lang="zh-Hant">今天星期幾？</p></div>
    </fieldset>`;
}
async function loadUploadedFace(source) {
  if(!source || !('FontFace' in window))throw Error('Upload a supported font or select a built-in typeface.');
  const face=await new FontFace('Calendar Uploaded',`url("${source}")`).load();
  return face;
}
function useUploadedFace(face) {
  if(uploadedFace)document.fonts.delete(uploadedFace);
  document.fonts.add(face);
  uploadedFace=face;
}
async function restoreUploadedFont() {
  try {useUploadedFace(await loadUploadedFace(media.font?.data));}
  catch {
    settings.font='Elementary';
    fontError='The saved font could not be loaded. Elementary is now in use.';
    save();
  }
}
function setFont(value) {
  fontRequest++;
  fontError='';
  if(value==='Uploaded Font' && !uploadedFace){
    value='Elementary';
    fontError='Choose a font file to use an uploaded typeface.';
  }
  settings.font=value;
  save();render(true);
}
async function uploadFont(file) {
  const request=++fontRequest;
  try {
    const format=file.name.split('.').pop().toLowerCase();
    if(!['woff2','woff','ttf','otf'].includes(format))throw Error('Choose a WOFF2, WOFF, TTF, or OTF font.');
    const bytes=await file.arrayBuffer(), face=await new FontFace('Calendar Uploaded',bytes).load();
    if(request!==fontRequest)return;
    const reader=new FileReader();
    const data=await new Promise((resolve,reject)=>{
      reader.onload=()=>resolve(reader.result);
      reader.onerror=reject;
      reader.readAsDataURL(new Blob([bytes],{type:`font/${format}`}));
    });
    if(request!==fontRequest)return;
    useUploadedFace(face);
    media.font={name:file.name,data};
    storeMedia();
    setFont('Uploaded Font');
  } catch {
    if(request!==fontRequest)return;
    settings.font='Elementary';
    fontError='The file could not be loaded as a font. Elementary is now in use.';
    save();render();
  }
}
function settingsView(){
  let body='';
  const sections=['Display','Audio','Gameplay','Content','Saved Progress'];
  if(config==='Display')body=btn('Full Screen','full')+switchSetting('large','Large text')+switchSetting('motion','Reduced motion')+switchSetting('scenes','Scene backgrounds')+switchSetting('titles','Title intros')
    +select('backgroundStrength','Background Strength',['Automatic','Dimmed','Hidden'],settings.backgroundStrength,'setting')
    +switchSetting('projection','Start in Projection Mode')+fontSettings()
    +`<fieldset><legend>Optional controls shown by default</legend><p>Other applicable controls are available under More.</p>
    <div class="row left">${Object.entries(optionalControls).map(([key,label])=>`<label><input type="checkbox" data-optional="${key}"${checked(settings.optional.includes(key))}> ${label}</label>`).join('')}</div></fieldset>`;
  if(config==='Audio')body=[['voice','Voice'],['sfx','Sound effects'],['music','Background music']].map(([k,n])=>`<div class="row left">${switchSetting(k,n)}${slider(k+'Volume','Volume')}</div>`).join('')+btn('Preview Audio','audio-preview');
  if(config==='Gameplay')body=`<div class="formgrid">${select('length','Questions per round',['By Level',5,8,10,12,16,20],settings.length,'setting')}${select('speed','Conveyor speed',['Slow','Normal','Fast'],settings.speed,'setting')}${select('countdown','Study countdown',[0,3,5,8,10,15,20,30],settings.countdown,'setting')}${switchSetting('random','Shuffle questions and choices')}${switchSetting('hints','Enable hints')}${switchSetting('teams','Two-team play')}${switchSetting('scoring','Score standalone rounds')}${settings.names.map((n,i)=>`<label>Team ${i+1} name <input data-team="${i}" maxlength="30" value="${esc(n)}"></label>`).join('')}</div><p>Round length changes apply when starting or restarting a round. Set the countdown to 0 for manual timing.</p>`;
  if(config==='Saved Progress')body=`<p>${(adventure||saved.adventure)?'An adventure is saved.':'No adventure is saved.'}</p><div class="row left">${adventure||saved.adventure?btn('Resume Adventure','continue')+btn('Clear Progress','clear'):''}${btn('Start New Session','adventure')}</div><p>Use Content Studio to export custom decks for another computer.</p>`;
  if(config==='Content')body=studioView();
  const back=settingsReturn?.tab==='home'?'Return Home':settingsReturn?'Return to Round':'Return Home';
  return `<section class="settings panel stack"><div class="row left"><h1>Settings</h1>${btn(back,'settings-back','','primary')}</div>
  <div class="row left">${sections.map(s=>btn(s,'config',s,config===s?'primary':'')).join('')}</div><div class="section">${body}</div>
  ${message?`<p class="feedback" role="status">${esc(message)}</p>`:''}${!persistence?'<p class="feedback">Browser storage is unavailable. Export your deck before closing the game.</p>':''}</section>`;
}
function studioView(){
  const menu=['Decks','Scene Art','Activity Cards','Sentence Patterns'];
  let body='';
  if(contentPane==='Sentence Patterns')body=patternEditor();
  else if(contentPane==='Scene Art'){
    body=`<div class="row left"><label>Tab <select data-option="artTarget">${Object.entries(manifest.scenes).map(([id,v])=>`<option value="${id}" ${id===artTarget?'selected':''}>${esc(v.name)}</option>`).join('')}</select></label></div>
    <div class="preview">${[['title','Intro'],['thumbnail','Thumbnail'],['background','Stage']].map(([k,n])=>`<div>${n}${fileImg(scene(artTarget,k))}${upload('art','Upload '+n,imageTypes,`data-key="${k}"`)}${btn('Restore Default','restore-art',k)}</div>`).join('')}</div>`;
  } else if(contentPane==='Activity Cards') {
    body=`<p>Use a word-free clue image or position a mask over the printed label. An answer image can include the weekday.</p><div class="editor">${days.map((d,i)=>`<details data-detail="activity-${i}" ${itemOpen==='activity-'+i?'open':''}><summary>${d} · ${actions[i]}</summary>
    <div class="preview">${activity(i)}${activity(i,true)}</div>
    <div class="formgrid">${['picture','answer','audio'].map((k,j)=>upload('activity',['Clue image','Answer image','Weekday pronunciation'][j],k==='audio'?'audio/*':imageTypes,`data-index="${i}" data-key="${k}"`)).join('')}${maskInputs(media.activities[i]||{},'activity',i)}</div>
    <div class="row left">${btn('Preview Pronunciation','weekday',i)}${btn('Restore Default Card','restore-activity',i)}</div></details>`).join('')}</div>`;
  } else {
    const d=media.decks.find(x=>x.id===editDeck);
    body=`<div class="row left"><label>Edit deck <select data-option="editDeck"><option value="week">Days of the Week</option>${media.decks.map(x=>`<option value="${esc(x.id)}" ${x.id===editDeck?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>
    ${btn('New Deck','new-deck')}${upload('deck','Import Deck','application/json,.json')}${d?btn('Use in Practice','use-deck',d.id,'primary')+btn('Export Deck','export',d.id)+btn('Delete Deck','delete-deck',d.id):btn('Use in Practice','use-deck','week','primary')}</div>
    ${d?`<div class="row left"><label>Deck name <input data-deckname maxlength="80" value="${esc(d.name)}"></label>${btn('Add Item','add-item')}${upload('csv','Import CSV','.csv,text/csv')}${upload('batch','Match Images by Filename',imageTypes,'multiple')}</div>
    <p>CSV columns: word, translation, clue, sentence, category, order. Only word is required.</p><div class="editor">${d.items.map((x,i)=>itemEditor(x,i)).join('')}</div>`:'<p>Use Activity Cards to edit the weekday images and pronunciation. Create a new deck for your own vocabulary.</p>'}
    ${importDraft?importView():''}${batchDraft?batchView(d):''}`;
  }
  return `<h2>Content Studio</h2><div class="row left">${menu.map(n=>btn(n,'content',n,contentPane===n?'primary':'')).join('')}</div>${body}`;
}
function maskInputs(x,type,i){
  return `<fieldset><legend>Clue mask (%)</legend><label><input type="checkbox" data-mask="${type}" data-index="${i}" data-key="enable"${checked(x.mask)}> Cover printed label</label>
  <div class="row left">${['Left','Top','Width','Height'].map((n,j)=>`<label>${n} <input type="number" style="width:4em" min="0" max="100" data-mask="${type}" data-index="${i}" data-key="${j}" value="${x.mask?.[j]??[0,0,100,25][j]}"></label>`).join('')}</div></fieldset>`;
}
const fields=['word','translation','clue','sentence','category','order'];
function itemEditor(x,i){
  return `<details data-detail="item-${i}" ${itemOpen==='item-'+i?'open':''}><summary>${esc(x.word||'New item')}${x.disabled?' (disabled)':''}</summary>
  <div class="formgrid">${fields.map(k=>`<label>${k[0].toUpperCase()+k.slice(1)}<input ${k==='order'?'type="number"':''} data-item="${i}" data-field="${k}" value="${esc(x[k])}"></label>`).join('')}
   ${['picture','answer','audio'].map((k,j)=>upload('item',['Clue image','Answer image','Pronunciation'][j],k==='audio'?'audio/*':imageTypes,`data-index="${i}" data-key="${k}"`)).join('')}${maskInputs(x,'item',i)}</div>
  <div class="preview">${figure(x.picture,'Clue preview',x.mask)}${figure(x.answer,'Answer preview')}</div>
  <div class="row left">${btn('Preview Pronunciation','item-audio',i)}${btn(x.disabled?'Enable':'Disable','enable-item',i)}${btn('Duplicate','dup-item',i)}${btn('Move Up','move-item',i+':-1','',i?'':'disabled')}${btn('Move Down','move-item',i+':1','',i<media.decks.find(d=>d.id===editDeck).items.length-1?'':'disabled')}${btn('Delete Item','delete-item',i)}</div></details>`;
}
function importView(){
  return `<fieldset><legend>${importDraft.type==='csv'?'CSV preview':'Deck preview · '+esc(importDraft.name)}</legend><p>${importDraft.rows.length} items. Review and edit before accepting.</p>
    <div class="editor">${importDraft.rows.map((x,i)=>`<details ${i===0?'open':''}><summary>${esc(x.word||'Item '+(i+1))}</summary>
    <div class="formgrid">${fields.map(k=>`<label>${k}<input ${k==='order'?'type="number"':''} data-import="${i}" data-field="${k}" value="${esc(x[k])}"></label>`).join('')}</div>
    ${x.picture||x.answer?`<div class="preview">${figure(x.picture,'Clue preview',x.mask)}${figure(x.answer,'Answer preview')}</div>`:''}</details>`).join('')}</div>
    <div class="row left">${btn('Accept Import','accept-import','','primary')}${btn('Cancel','cancel-import')}</div></fieldset>`;
}
function batchView(d){
  if(!d)return '';
  return `<fieldset><legend>Confirm image matches</legend>
  ${batchDraft.map((x,i)=>`<div class="row left"><small>${esc(x.name)}</small><select data-batch="${i}"><option value="-1">Skip</option>${d.items.map((item,j)=>`<option value="${j}" ${x.match===j?'selected':''}>${esc(item.word)}</option>`).join('')}</select><select data-batch-kind="${i}"><option value="picture">Clue image</option><option value="answer" ${x.key==='answer'?'selected':''}>Answer image</option></select></div>`).join('')}
  <div class="row left">${btn('Apply Matches','accept-batch','','primary')}${btn('Cancel','cancel-batch')}</div></fieldset>`;
}
function csvRows(text){
  const s=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const rows=[];let row=[], value='', quoted=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c==='"'){
      if(quoted && s[i+1]==='"'){value+='"';i++;}
      else if(quoted || value==='')quoted=!quoted;
      else value+=c;
    } else if(!quoted && (c===',' || c==='\n')){
      row.push(value.trim());value='';
      if(c==='\n'){rows.push(row);row=[];}
    }else value+=c;
  }
  if(quoted)throw Error('A CSV field is missing a closing quotation mark.');
  rows.push([...row,value.trim()]);
  const head=rows.shift().map(s=>s.toLowerCase());
  if(!head.includes('word'))throw Error('Include a word column in the CSV header.');
  return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(fields.map(k=>[k,r[head.indexOf(k)]||''])));
}
function validateRows(rows){
  if(!Array.isArray(rows) || !rows.length || rows.length>1000)throw Error('Provide between 1 and 1,000 vocabulary items.');
  const clean=rows.map(x=>{
    if(!x || typeof x.word!=='string' || !x.word.trim())throw Error('Every item needs a word.');
    if(x.order!=='' && x.order!=null && !Number.isFinite(Number(x.order)))throw Error('Order values must be numbers.');
    const result=Object.fromEntries(fields.map(k=>[k,String(x[k]??'').trim()]));
    for(const k of ['picture','answer','audio']){
      if(!x[k])continue;
      const pattern=k==='audio'?/^data:audio\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/:/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
      if(typeof x[k]!=='string'||!pattern.test(x[k]))throw Error('Deck media must be embedded PNG, JPG, WebP, or audio.');
      result[k]=x[k];
    }
    if(x.mask){
      if(!Array.isArray(x.mask)||x.mask.length!==4||x.mask.some(n=>typeof n!=='number'||n<0||n>100))throw Error('Mask dimensions must be percentages from 0 to 100.');
      result.mask=[...x.mask];
    }
    result.disabled=!!x.disabled;
    return result;
  });
  return clean;
}
function readData(file,kind){
  const isAudio=kind==='audio';
  const mime=isAudio?/^audio\//:/^image\/(png|jpeg|webp)$/;
  if(!mime.test(file.type))return Promise.reject(Error(isAudio?'Choose an audio file.':'Choose a PNG, JPG, or WebP image.'));
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}
const edited=()=>media.decks.find(d=>d.id===editDeck);
function newDeck(name='New vocabulary deck',rows=[]){
  const id=globalThis.crypto?.randomUUID?.() || String(Date.now())+Math.random().toString(36).slice(2);
  media.decks.push({id,name,items:rows});editDeck=id;
  return id;
}
function exportDeck(d){
  const a=document.createElement('a');
  a.download=(d.name.replace(/[^\p{L}\p{N}]+/gu,'_')||'Vocabulary')+'.json';
  const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,name:d.name,items:d.items},null,2)],{type:'application/json'}));
  a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function persistEditor(){
  if(settingsReturn?.tab==='custom-practice' && editDeck===media.active)game=null;
  storeMedia();render();
}
function backFromSettings(){
  stopAudio();
  const last=settingsReturn;
  settingsReturn=null;message='';
  if(!last){navigate('home',{keep:true});return;}
  tab=last.tab;phase=last.phase;paused=last.paused;
  render();
  if(phase==='play'&&tab==='custom-practice'&&!game)startRound();
}
function actorCue(){
  if(!game || game.done)return;
  if(!confirm('Show the actor cue only after moving the game off the projector or blanking the classroom display. Open the cue now?'))return;
  const privateWindow=window.open('','CalendarHeistActor','popup,width=500,height=480');
  if(!privateWindow){message='Popup blocked. Use the activity selector on an unprojected screen.';$('#live').textContent=message;alert(message);return;}
  privateWindow.document.title='Actor cue';
  privateWindow.document.body.innerHTML=`<section style="font:700 24px system-ui;text-align:center;background:#fff4db;padding:20px"><p>${esc(actions[game.answer])}</p>${activity(game.answer,false).replace('<img','<img style="width:100%;max-height:320px;object-fit:contain"')}</section>`;
}
function travelDuration(){if(levelIndex()===0)return 32;return {Slow:32,Normal:22,Fast:13}[settings.speed];}
function blackout(){
  if(!game || tab!=='weather-blackout'||game.state!=='study')return;
  game.timer=null;game.state='question';save();render(true);
}
function togglePause(){
  paused=!paused;
  if(paused)stopAudio();
  render(true);
}
function finishOrNext(delta){
  if(!game)return;
  rememberQuestion();
  const ultimate=tab==='stop-the-time-loop' && game.tail || tab==='custom-practice' && roundOptions.custom==='Sequence Challenge' && game.index>=(bank?.length||questionLength())-1;
  if(delta>0 && ultimate && !game.done){game.feedback='Place the remaining cards, or choose Reveal.';render(true);return;}
  newQuestion(game.index+delta);
}
function showTitle(){
  stopAudio();titleReplay=phase;
  phase='intro';paused=true;render();
}
function reset(){
  if(tab==='week-review'&&game){bank=null;newQuestion(0,true);return;}
  if(tab==='week-review'){flash={...flash,index:0,order:allDays,auto:false};}
  if(tab==='custom-practice'||order.includes(tab))startRound();
}
async function fullscreen(){
  try {if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{alert('Use your browser’s full-screen command to enter projection mode.');}
}
function handleAction(action,val) {
  if(action.startsWith('spell-')){if(tab==='spelling')spellingAction(action,val);return;}
  if(action.startsWith('lesson-')){lessonAction(action,val);return;}
  const id=Number(val), d=edited();
  switch(action){
    case 'quick':flash.auto=false;bank=null;newQuestion(0,true);break;
    case 'quick-back':game=null;bank=null;phase='play';save();render();break;
    case 'level-keep':pendingLevel=null;render(true);break;
    case 'level-restart':
      if(pendingLevel){settings.levels[tab]=pendingLevel;pendingLevel=null;save();reset();}
      break;
    case 'nav':
      if(val==='spelling'){openSpelling();break;}
      if(lessonTabs.includes(val)){openLesson(val);break;}
      if(val==='home'||val==='settings'||val==='custom-practice'){navigate(val,{keep:val==='home'});break;}
      if(val===tab && phase==='intro')break;
      if(val===tab){showTitle();break;}
      navigate(val,{keep:!!adventure});break;
    case 'adventure':startAdventure();break;
    case 'continue':continueAdventure();break;
    case 'pick':pickMode=!pickMode;render(true);if(pickMode)stage.querySelector('.tiles').scrollIntoView({block:'nearest'});break;
    case 'full':fullscreen();break;
    case 'start':if(titleReplay){phase=titleReplay;titleReplay=false;paused=false;save();render();}else startRound();break;
    case 'title':showTitle();break;
    case 'hide':controlsHidden=!controlsHidden;render(true);$('.projection-handle')?.focus();break;
    case 'progress':if(adventure){adventure.expanded=!adventure.expanded;save();render(true);}break;
    case 'point':playData().points[id]++;save();render(true);break;
    case 'next-round':nextRound();break;
    case 'restart':reset();break;
    case 'font-default':setFont('Elementary');break;
    case 'audio':replay();break;
    case 'pause':togglePause();break;
    case 'reveal':reveal();break;
    case 'hint':if(game && !game.done){game.hint=!game.hint;render(true);}break;
    case 'answer':choose(id);break;
    case 'slot':if(game?.placed?.length===id && game.selected!==null)place(game.selected);break;
    case 'prev-question':finishOrNext(-1);break;
    case 'next-question':finishOrNext(1);break;
    case 'weekday':speak(days[id],media.activities[id]?.audio);break;
    case 'flash-mode':flash.mode=val;flash.auto=false;save();render(true);break;
    case 'flash-step':flash.index=mod(flash.index+id);flash.time=0;save();render(true);break;
    case 'flash-shuffle':{
      const previous=settings.random;settings.random=true;flash.order=mix(allDays);settings.random=previous;flash.index=0;save();render(true);break;
    }
    case 'flash-auto':flash.auto=!flash.auto;flash.time=0;save();render(true);break;
    case 'words':flash.words=!flash.words;save();render(true);break;
    case 'group':
      if(val==='weekdays')flash.group=[0,1,2,3,4];
      else if(val==='weekend')flash.group=[5,6];
      else if(flash.group.includes(id)){if(flash.group.length>1)flash.group=flash.group.filter(i=>i!==id);}
      else flash.group=[...flash.group,id].sort((a,b)=>a-b);
      save();render(true);break;
    case 'stationary':roundOptions.stationary=!roundOptions.stationary;game.laneTime=0;save();render(true);break;
    case 'forecast':game.keepForecast=!game.keepForecast;save();render(true);break;
    case 'blackout':blackout();break;
    case 'schedule':game.state='schedule';game.hint=false;save();render(true);break;
    case 'curtain':game.state='question';save();render(true);break;
    case 'actor':actorCue();break;
    case 'settings-back':backFromSettings();break;
    case 'config':config=val;message='';render(true);break;
    case 'content':contentPane=val;message='';itemOpen=null;render(true);break;
    case 'studio':config='Content';contentPane='Decks';editDeck=media.active;navigate('settings');break;
    case 'audio-preview':speak('Monday. Tuesday. Wednesday.');tone(true);break;
    case 'pattern-add':(media.patterns ||= []).push({question:'What do you see?',answer:'I see a calendar.'});persistEditor();break;
    case 'pattern-remove':if(confirm('Remove this custom sentence pattern?')){media.patterns.splice(id,1);persistEditor();}break;
    case 'pattern-audio':speak(media.patterns[id].answer,media.patterns[id].audio);break;
    case 'clear':if(confirm('Clear the saved adventure and team points?')){adventure=null;saved.adventure=null;save();render();}break;
    case 'new-deck':newDeck();itemOpen=null;persistEditor();break;
    case 'use-deck':media.active=val;storeMedia();navigate('custom-practice');break;
    case 'export':if(d)exportDeck(d);break;
    case 'delete-deck':
      if(!confirm('Delete this saved deck and its media?'))break;
      media.decks=media.decks.filter(x=>x.id!==val);
      if(media.active===val)media.active='week';
      if(settingsReturn?.tab==='custom-practice')game=null;
      editDeck='week';persistEditor();break;
    case 'add-item':d.items.push({word:'New word',order:'',disabled:false});itemOpen='item-'+(d.items.length-1);persistEditor();break;
    case 'enable-item':d.items[id].disabled=!d.items[id].disabled;itemOpen='item-'+id;persistEditor();break;
    case 'dup-item':d.items.splice(id+1,0,{...d.items[id],mask:d.items[id].mask?.slice(),order:''});itemOpen='item-'+(id+1);persistEditor();break;
    case 'delete-item':if(confirm('Delete this vocabulary item?')){d.items.splice(id,1);itemOpen=null;persistEditor();}break;
    case 'move-item':{
      const [i,direction]=val.split(':').map(Number), j=i+direction;
      [d.items[i],d.items[j]]=[d.items[j],d.items[i]];itemOpen='item-'+j;persistEditor();break;
    }
    case 'item-audio':speak(d.items[id].word,d.items[id].audio);break;
    case 'restore-art':if(media.art[artTarget])delete media.art[artTarget][val];persistEditor();break;
    case 'restore-activity':if(confirm('Restore this weekday’s original card and pronunciation?')){delete media.activities[id];itemOpen='activity-'+id;persistEditor();}break;
    case 'accept-import':
      try{
        const rows=validateRows(importDraft.rows);
        if(importDraft.type==='csv'){const target=media.decks.find(x=>x.id===importDraft.target);if(!target)throw Error('The destination deck was deleted.');target.items.push(...rows);}
        else newDeck(importDraft.name,rows);
        importDraft=null;message='Import accepted.';persistEditor();
      }catch(error){message=error.message;render();}
      break;
    case 'cancel-import':importDraft=null;render();break;
    case 'accept-batch':
      for(const x of batchDraft)if(x.match>=0 && d?.items[x.match])d.items[x.match][x.key]=x.data;
      batchDraft=null;message='Images matched.';persistEditor();break;
    case 'cancel-batch':batchDraft=null;render();break;
  }
}
async function handleUpload(el) {
  const f=el.files[0], {upload:type,key,index}=el.dataset, i=Number(index), d=edited();
  if(!f)return;
  if(type==='font'){await uploadFont(f);return;}
  try {
    if(type==='pattern'){const pattern=media.patterns[i];pattern[key]=await readData(f,key==='audio'?'audio':'picture');storeMedia();}
    if(type==='csv'){
      const rows=csvRows(await f.text());
      if(!rows.length||rows.length>1000)throw Error('Provide between 1 and 1,000 vocabulary items.');
      importDraft={type,rows,target:d.id};
    }
    if(type==='deck'){
      const data=JSON.parse(await f.text());
      if(data?.version!==1 || typeof data.name!=='string'||!data.name.trim())throw Error('Choose a Calendar Heist deck export.');
      importDraft={type,name:data.name.trim().slice(0,80),rows:validateRows(data.items)};
    }
    if(type==='batch'){
      const slug=x=>x.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
      batchDraft=await Promise.all([...el.files].map(async file=>{
        const base=file.name.replace(/\.[^.]+$/,'');
        const basename=base.replace(/[-_ ](clue|answer)$/i,'');
        return {name:file.name,data:await readData(file,'picture'),match:d.items.findIndex(x=>slug(x.word)===slug(basename)),key:/[-_ ]answer$/i.test(base)?'answer':'picture'};
      }));
    }
    if(type==='art'||type==='activity'||type==='item'){
      const target=artTarget;
      const data=await readData(f,key);
      if(type==='art'){media.art[target] ||= {};media.art[target][key]=data;}
      if(type==='activity'){media.activities[i] ||= {};media.activities[i][key]=data;itemOpen='activity-'+i;}
      if(type==='item'){d.items[i][key]=data;itemOpen='item-'+i;}
      storeMedia();
    }
    message='';
  }catch(error){message=error.message;}
  render();
}
function updateField(el) {
  const ds=el.dataset, val=el.value, i=Number(ds.index), d=edited();
  if(ds.option?.startsWith('spell')){spellField(ds.option,val);return;}
  if(ds.lesson){lessonField(ds.lesson,val);return;}
  if(ds.pattern!=null){media.patterns[Number(ds.pattern)][ds.key]=val.trim();storeMedia();return;}
  if(ds.upload){handleUpload(el);return;}
  if(ds.optional){
    settings.optional=el.checked?[...new Set([...settings.optional,ds.optional])]:settings.optional.filter(x=>x!==ds.optional);
    save();return;
  }
  if(ds.setting){
    if(ds.setting==='font'){setFont(val);return;}
    if(ds.setting==='projection')controlsHidden=el.checked;
    const k=ds.setting, v=el.type==='checkbox'?el.checked:!isNaN(Number(val))?Number(val):val;
    settings[k]=v;
    if(k==='speed'&&game)game.laneTime=0;
    if(!settings.voice)stopAudio();
    save();render();return;
  }
  if(ds.team!=null){settings.names[Number(ds.team)]=val.trim() || 'Team '+(Number(ds.team)+1);save();return;}
  if(ds.batch!=null){batchDraft[Number(ds.batch)].match=Number(val);return;}
  if(ds.batchKind!=null){batchDraft[Number(ds.batchKind)].key=val;return;}
  if(ds.import!=null){importDraft.rows[Number(ds.import)][ds.field]=val;return;}
  if(ds.deckname!=null){d.name=val.trim()||'New vocabulary deck';storeMedia();return;}
  if(ds.item!=null){
    d.items[Number(ds.item)][ds.field]=ds.field==='word'?val.trim()||'New word':val;
    itemOpen='item-'+ds.item;
    if(ds.field==='word')el.closest('details').querySelector('summary').textContent=d.items[Number(ds.item)].word+(d.items[Number(ds.item)].disabled?' (disabled)':'');
    if(settingsReturn?.tab==='custom-practice' && editDeck===media.active)game=null;
    storeMedia();return;
  }
  if(ds.mask){
    const x=ds.mask==='activity'?(media.activities[i] ||= {}):d.items[i];
    if(ds.key==='enable')x.mask=el.checked?(x.mask||[0,0,100,25]):null;
    else {x.mask ||= [0,0,100,25];x.mask[Number(ds.key)]=Math.max(0,Math.min(100,Number(val)));}
    itemOpen=ds.mask+'-'+i;persistEditor();return;
  }
  switch(ds.option){
    case 'artTarget':artTarget=val;break;
    case 'editDeck':editDeck=val;itemOpen=null;batchDraft=null;break;
    case 'active':media.active=media.decks.find(x=>x.name+' · '+x.id.slice(-4)===val)?.id||'week';storeMedia();startRound();return;
    case 'custom':roundOptions.custom=val;startRound();return;
    case 'level':
      if(game && (phase==='play'||titleReplay)){pendingLevel=val===bank?.level?null:val;render();return;}
      settings.levels[tab]=val;bank=null;save();render();return;
    case 'charades':roundOptions.charades=val;if(game&&levelIndex()<2)game.actor=val==='Act It Out';save();render();return;
    case 'conveyor':roundOptions.conveyor=val;save();render();if(val==='Listening')replay();return;
    default: if(ds.option)roundOptions[ds.option]=val;else return;
  }
  save();render();
}
let clockTick=performance.now(), sinceSave=0;
function pulse(){
  const now=performance.now(), elapsed=Math.min(.3,(now-clockTick)/1000);
  clockTick=now;
  if(tab==='spelling'){if(phase==='spelling')spellPulse(elapsed);return;}
  if(paused||phase!=='play'||document.hidden)return;
  if(settings.music && now-lastMusic>2200){lastMusic=now;tone(true,true);}
  if(tab==='week-review' && !game && flash.auto){
    flash.time+=elapsed;
    if(flash.time>=Math.max(3,settings.countdown||4)){
      flash.time=0;flash.index=mod(flash.index+1);save();render();
      speak(days[flash.order[flash.index]],media.activities[flash.order[flash.index]]?.audio);
    }
  }
  if(!game||game.done)return;
  if(game.timer>0){
    game.timer=Math.max(0,game.timer-elapsed);
    if(game.timer===0){blackout();return;}
    const timer=$('#timer');if(timer)timer.textContent=Math.ceil(game.timer)+' s';
  }
  if(conveyorMoves()){
    game.laneTime=(game.laneTime||0)+elapsed;
    if(game.laneTime>=travelDuration()){game.laneTime=0;render();}
  }
  sinceSave+=elapsed;
  if(sinceSave>2){sinceSave=0;save();}
}
function installEvents(){
  bindSpellingDrag();
  document.addEventListener('click',e=>{const node=e.target.closest('[data-act]');if(node&&!node.disabled)handleAction(node.dataset.act,node.dataset.val||'');});
  document.addEventListener('change',e=>updateField(e.target));
  stage.addEventListener('dragstart',e=>{const card=e.target.closest('[data-act=answer][draggable=true]');if(card)e.dataTransfer.setData('text/plain',card.dataset.val);});
  stage.addEventListener('dragover',e=>{if(e.target.closest('[data-act=slot]'))e.preventDefault();});
  stage.addEventListener('drop',e=>{
    const slot=e.target.closest('[data-act=slot]');
    if(!slot)return;
    e.preventDefault();
    const value=e.dataTransfer.getData('text/plain');
    if(value && game?.placed?.length===Number(slot.dataset.val))place(Number(value));
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      const menu=e.target.closest('.mission-menu[open]');
      if(menu){menu.open=false;menu.querySelector('summary').focus();return;}
    }
    if(e.target.closest('input, textarea, select, [contenteditable]') || e.altKey||e.metaKey||e.ctrlKey)return;
    if(['home','settings',...lessonTabs].includes(tab))return;
    if(tab==='spelling'){spellKeydown(e);return;}
    const key=e.key;
    if(key.toLowerCase()==='h'){e.preventDefault();handleAction('hide','');return;}
    if(phase==='intro'){if(key==='Enter' && !e.target.closest('button, summary')){e.preventDefault();handleAction('start','');}return;}
    if(phase==='results'){if(key==='ArrowRight'){e.preventDefault();nextRound();}return;}
    if(canPause() && (key.toLowerCase()==='p' || key===' ' && !e.target.closest('button, summary'))){e.preventDefault();togglePause();}
    else if(key.toLowerCase()==='r'){e.preventDefault();replay();}
    else if(key==='Enter' && !e.target.closest('button') && game?.selected!==null && game?.selected!==undefined){
      e.preventDefault();if(!paused){if(game.placed)place(game.selected);else if(!game.done)checkAnswer(game.selected);}
    }else if(/^[1-3]$/.test(key) && game?.choices?.length===3 && !paused && !game.done && game.state==='question'){
      e.preventDefault();game.selected=game.choices[Number(key)-1];game.feedback='';render();
    }else if(key==='ArrowLeft'||key==='ArrowRight'){
      e.preventDefault();const direction=key==='ArrowLeft'?-1:1;
      if(tab==='week-review'&&!game&&flash.mode==='Individual Flash')handleAction('flash-step',String(direction));
      else if(game)finishOrNext(direction);
    }
  });
  window.addEventListener('pagehide',save);
  window.addEventListener('visibilitychange',()=>{if(document.hidden){stopAudio();save();}});
  setInterval(pulse,100);
}
const lessonTabs=['vocabulary','sentence-patterns','weather','actions'];
const lessonModes={
  vocabulary:['Full Week','Individual Flash','Group Flash','Custom Vocabulary'],
  'sentence-patterns':['Model','Practice','Build a Sentence'],
  weather:['Teach','Picture Guess','Forecast Practice'],
  actions:['Action Gallery','Picture Guess','Private Charades Cue']
};
const lessonAccents=['#288061','#7546a1','#176c88','#9b356c'];
const lessons={};
let returnGame=null, privateCue=null;
const verbs=['sing','fly a kite','play basketball','swim','dance','ride a bike','cook'];
const who=['She','He','He','She','She','She','He'];
const actionLine=i=>`${who[i]}’s ${actions[i]}.`;
const lessonState=()=>lessons[tab] ||= {mode:lessonModes[tab][0],index:0,order:[...allDays],group:[...allDays],words:true,deck:'week',groupName:'Days',pattern:0,target:'2',shown:false,size:3,forecast:Object.keys(manifest.weather).slice(0,7),sentences:false};
function openLesson(id){
  if(tab===id)return;
  stopAudio();privateCue?.close();privateCue=null;
  if(!lessonTabs.includes(tab)){
    save();
    returnGame={tab,phase,paused};
  }
  tab=id;phase=settings.titles?'intro':'lesson';paused=true;render();
}
function closeLesson(){
  stopAudio();privateCue?.close();privateCue=null;
  if(!returnGame){navigate('home',{keep:true});return;}
  ({tab,phase,paused}=returnGame);returnGame=null;
  if(phase==='play'&&(game||tab==='week-review'))paused=true;
  render();
}
function lessonIntro(){
  const title=manifest.scenes[tab].name;
  const desc={vocabulary:'Show the whole week, flash one calendar, or open your vocabulary deck.',
    'sentence-patterns':'Model the question and answer, then hide the answer for speaking practice.',
    weather:'Teach the weather words, guess by picture, or build a class forecast.',
    actions:'Review the activity pictures, guess the action, or give one student a private charades cue.'};
  return glowIntro(title,desc[tab],btn('Open '+title,'lesson-open','','primary')+lessonBack());
}
const lessonBack=()=>btn(['play','spelling','spell-results'].includes(returnGame?.phase)?'Back to Game':'Back','lesson-back');
const modeTabs=()=>lessonModes[tab].map(mode=>btn(mode,'lesson-mode',mode,'magnify '+(lessonState().mode===mode?'primary':''))).join('');
const lessonButtons=()=>btn('Previous','lesson-step',-1)+btn('Next','lesson-step',1);
const lessonAudio=()=>btn('Replay Audio','lesson-play','word');
const labelImage=(image,label)=>`<div class="card">${image}${label?`<b>${sentence(label)}</b>`:''}</div>`;
const weatherImage=(key)=>fileImg(manifest.weather[key].clue,'Weather picture');
const weatherFigure=(key)=>figure(manifest.weather[key].clue,'Weather picture');
const lessonCard=(image,label,id)=>`<button class="card" data-act="lesson-card" data-val="${id}">${image}${label?`<b>${sentence(label)}</b>`:''}</button>`;
function vocabPool(st){
  return st.deck==='week'?defaultItems():(media.decks.find(d=>d.id===st.deck)?.items||[]).filter(x=>!x.disabled);
}
function vocabularyLesson(st){
  let body='', tools='';
  if(st.mode==='Custom Vocabulary'){
    const list=vocabPool(st), item=list[st.index%list.length];
    body=item?figure(item.picture,'Vocabulary picture',st.words?null:item.mask)+(st.words?prompt(item.word,item.translation):''):prompt('Choose a vocabulary deck');
    tools=`<label>Deck <select data-lesson="deck"><option value="week">Days of the Week</option>${media.decks.map(d=>`<option value="${esc(d.id)}" ${d.id===st.deck?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label>`+lessonButtons()+lessonAudio()+btn('Content Studio','studio');
  }else if(st.mode==='Individual Flash'){
    const id=st.order[st.index];
    body=`<div class="glow-flash"><div class="calendar-reveal">${calendars(id,false)}</div>${st.words?`<div class="glow-word">${esc(days[id])}</div>`:''}</div>`;
    tools=lessonButtons()+btn('Shuffle','lesson-shuffle')+lessonAudio();
  }else{
    const ids=st.mode==='Group Flash'?st.group:allDays;
    body=grid(ids.map(id=>lessonCard(calendars(id,st.words),'',id)));
    if(st.mode==='Group Flash')tools=btn('Weekdays','lesson-group','weekdays')+btn('Weekend','lesson-group','weekend')+
      allDays.map(i=>btn(days[i],'lesson-group',i,st.group.includes(i)?'primary':'')).join('');
  }
  return [prompt('Vocabulary'),body,tools+btn(st.words?'Hide Word':'Show Word','lesson-words')];
}
function models(st){
  const target=st.target, i=Number(target)||0;
  if(st.groupName==='Days'){
    const tomorrow=st.pattern===1, alt=st.pattern===2;
    return {q:tomorrow?'What day is tomorrow?':'What day is today?',lead:tomorrow?'Tomorrow is ':alt?'Today is ':'It’s ',word:days[i],picture:figure(week(i).calendarDateOnly,'Calendar date')};
  }
  if(st.groupName==='Weather')return {q:'How’s the weather?',lead:'It’s ',word:target,picture:weatherFigure(target)};
  if(st.groupName==='Actions')return {q:'What is she doing?',lead:'She’s ',word:actions[i],picture:activity(i)};
  const custom=media.patterns?.[st.pattern];
  return custom?{q:custom.question,lead:'',word:custom.answer,picture:figure(custom.picture,'Sentence clue'),audio:custom.audio,custom:true}:null;
}
function sentenceLesson(st){
  const m=models(st);
  const val=(key,label,candidates,value)=>`<label>${label} <select data-lesson="${key}">${candidates.map(([id,name])=>`<option value="${esc(id)}" ${String(value)===String(id)?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
  let tools=select('sentenceGroup','Group',['Days','Weather','Actions',...(media.patterns?.length?['Custom']:[])],st.groupName,'lesson');
  if(st.groupName==='Days')tools+=val('pattern','Pattern',[[0,'What day is today? · It’s …'],[2,'What day is today? · Today is …'],[1,'What day is tomorrow?']],st.pattern);
  if(st.groupName==='Custom')tools+=val('pattern','Pattern',(media.patterns||[]).map((x,i)=>[i,x.question]),st.pattern);
  if(st.mode==='Build a Sentence'&&st.groupName!=='Custom'){
    const options=st.groupName==='Weather'?Object.keys(manifest.weather).map(k=>[k,k]):allDays.map(i=>[i,st.groupName==='Days'?days[i]:verbs[i]]);
    tools+=val('target','Word or action',options,st.target);
  }
  if(!m)return [prompt('Sentence Patterns'),'',tools+btn('Content Studio','lesson-studio')];
  const shown=st.mode!=='Practice'||st.shown;
  const line=shown?m.custom?m.word:m.lead+m.word+'.':m.custom?'___':m.lead+'___.';
  return [prompt(m.q),m.picture+`<p class="lesson-line panel">${sentence(line)}</p>`,
    tools+btn('Play Question','lesson-play','question')+btn('Play Answer','lesson-play','answer')+(shown?'':btn('Reveal','lesson-reveal','both','primary'))+btn('Content Studio','lesson-studio')];
}
function weatherLesson(st){
  const keys=Object.keys(manifest.weather), key=keys[st.index];
  if(st.mode==='Teach'){
    const tiles=keys.map((w,i)=>lessonCard(weatherImage(w),w,i));
    return [prompt('Weather'),st.large?weatherFigure(key)+prompt(key):grid(tiles,'lesson-gallery',5),st.large?lessonButtons()+lessonAudio()+btn('All Weather Cards','lesson-gallery'): ''];
  }
  if(st.mode==='Picture Guess')return [prompt('How’s the weather?'),weatherFigure(key)+`<p class="lesson-line panel">It’s ${st.shown?key:'___'}.</p>`,lessonButtons()+btn('Reveal','lesson-reveal','both','primary')];
  const selected=st.forecast[st.index%st.size];
  const targetDay=st.index%st.size;
  const ids=allDays.slice(0,st.size);
  const weatherQuestion=st.sentences?`How’s the weather on ${days[targetDay]}?`:`Which day is ${selected}?`;
  const matches=ids.filter(i=>st.forecast[i]===selected).map(i=>days[i]);
  const answer=st.sentences?`It’s ${selected}.`:matches.length===1?`It’s ${matches[0]}.`:matches.join(' and ')+'.';
  return [prompt(weatherQuestion),grid(ids.map(i=>labelImage(weatherImage(st.forecast[i]),days[i])),'forecast')+(st.shown?prompt(answer):''),
    select('size','Forecast days',[3,5,7],st.size,'lesson')+ids.map(i=>select('weather'+i,days[i],keys,st.forecast[i],'lesson')).join('')+
    lessonButtons()+btn(st.sentences?'Ask Which Day':'Ask How’s the Weather','lesson-toggle')+btn('Reveal','lesson-reveal','both','primary')];
}
function actionLesson(st){
  const i=st.index;
  if(st.mode==='Action Gallery')return [prompt('Actions'),st.large?activity(i)+prompt(st.sentences?actionLine(i):verbs[i]):grid(allDays.map(j=>lessonCard(activity(j),st.sentences?actionLine(j):verbs[j],j)),'lesson-gallery',4),
    btn(st.sentences?'Show Action Phrases':'Show Model Sentences','lesson-toggle')+(st.large?lessonButtons()+lessonAudio()+btn('Back to Gallery','lesson-gallery'):'')];
  const actor=st.mode==='Private Charades Cue';
  const showAction=st.shown==='action'||st.shown==='both';
  const showDay=st.shown==='day'||st.shown==='both';
  const board=actor&&!st.shown?'<div class="curtain">🎭 Act it out!</div>':activity(i,false);
  return [prompt(actor?'What is the actor doing?':'What action can you see?'),board+`<p class="lesson-line panel">${showAction?sentence(actionLine(i)):'The action is ___. '}${showDay?' · '+days[i]:''}</p>`,
    lessonButtons()+(actor?btn('Send Actor to Private Cue','lesson-cue'):'')+btn('Reveal Action','lesson-reveal','action')+btn('Reveal Weekday','lesson-reveal','day')+btn('Reveal Both','lesson-reveal','both','primary')];
}
function lessonView(){
  const st=lessonState();
  const view=[vocabularyLesson,sentenceLesson,weatherLesson,actionLesson][lessonTabs.indexOf(tab)](st);
  return view[0]+(!controlsHidden?`<div class="row lesson-tabs">${modeTabs()}</div>`:'')
    +`<div class="board lesson-board">${view[1]}</div>`+controls(view[2]+btn('Show Title','lesson-title')+btn('Full Screen','full')+lessonBack());
}
function lessonAction(action,val){
  if(action==='lesson-back'){closeLesson();return;}
  if(action==='lesson-open'){phase='lesson';render();return;}
  if(action==='lesson-title'){stopAudio();phase='intro';render();return;}
  if(action==='lesson-studio'){config='Content';contentPane='Sentence Patterns';navigate('settings');return;}
  const st=lessonState(), i=Number(val);
  if(action!=='lesson-play')stopAudio();
  switch(action){
    case 'lesson-mode':st.mode=val;st.index=0;st.large=false;st.shown=false;break;
    case 'lesson-toggle':st.sentences=!st.sentences;st.shown=false;break;
    case 'lesson-words':st.words=!st.words;break;
    case 'lesson-gallery':st.large=false;break;
    case 'lesson-reveal':st.shown=val||true;break;
    case 'lesson-shuffle':{
      const prior=settings.random;settings.random=true;st.order=mix(allDays);settings.random=prior;st.index=0;break;
    }
    case 'lesson-step':{
      const count=tab==='weather'?st.mode==='Forecast Practice'?st.size:Object.keys(manifest.weather).length:tab==='vocabulary'&&st.mode==='Custom Vocabulary'?vocabPool(st).length:7;
      if(count)st.index=(st.index+i+count)%count;
      st.shown=false;privateCue?.close();privateCue=null;break;
    }
    case 'lesson-group':
      st.group=val==='weekdays'?[0,1,2,3,4]:val==='weekend'?[5,6]:st.group.includes(i)?st.group.length===1?st.group:st.group.filter(x=>x!==i):[...st.group,i].sort((a,b)=>a-b);
      break;
    case 'lesson-card':
      if(tab==='weather'||tab==='actions'){st.large=true;st.index=i;speak(tab==='weather'?Object.keys(manifest.weather)[i]:st.sentences?actionLine(i):verbs[i]);}
      else speak(days[i],media.activities[i]?.audio);
      break;
    case 'lesson-play':
      if(tab==='sentence-patterns'){const m=models(st);if(m)speak(val==='question'?m.q:m.custom?m.word:m.lead+m.word+'.',val==='answer'?m.audio:null);}
      if(tab==='weather')speak(Object.keys(manifest.weather)[st.index]);
      if(tab==='actions')speak(st.sentences?actionLine(st.index):verbs[st.index]);
      if(tab==='vocabulary'){
        if(st.mode==='Custom Vocabulary'){const x=vocabPool(st)[st.index];if(x)speak(x.word,x.audio);}
        else {const j=st.order[st.index];speak(days[j],media.activities[j]?.audio);}
      }
      return;
    case 'lesson-cue':
      if(!confirm('Move the private cue window to the teacher screen or blank the projector before opening it. Continue?'))return;
      privateCue=window.open('','calendarActor','popup,width=430,height=360');
      if(!privateCue){alert('Allow popups to open the private actor cue.');return;}
      privateCue.document.title='Private actor cue';
      privateCue.document.body.innerHTML=`<div style="font: bold 30px system-ui;text-align:center"><p>${esc(verbs[st.index])}</p>${activity(st.index)}</div>`;
      return;
  }
  render(true);
}
function lessonField(key,value){
  const st=lessonState();
  if(key==='sentenceGroup'){st.groupName=value;st.pattern=0;st.target=value==='Weather'?'windy':value==='Actions'?'5':'2';}
  else if(key.startsWith('weather'))st.forecast[Number(key.slice(7))]=value;
  else st[key]=['size','pattern'].includes(key)?Number(value):value;
  if(key==='deck'||key==='size')st.index=0;
  st.shown=false;render();
}
function patternEditor(){
  return btn('Add Sentence Pattern','pattern-add')+(media.patterns||[]).map((x,i)=>`<fieldset class="stack"><legend>Pattern ${i+1}</legend>
    <label>Question <input data-pattern="${i}" data-key="question" value="${esc(x.question)}"></label>
    <label>Example answer <input data-pattern="${i}" data-key="answer" value="${esc(x.answer)}"></label>
    ${figure(x.picture,'Sentence image')}
    ${upload('pattern','Clue image',imageTypes,`data-index="${i}" data-key="picture"`)}
    ${upload('pattern','Answer audio','audio/*',`data-index="${i}" data-key="audio"`)}
    ${btn('Preview Audio','pattern-audio',i)}${btn('Remove Pattern','pattern-remove',i)}</fieldset>`).join('');
}

const spellModes=['Fill the Gaps','Unscramble the Word','Listen and Spell'];
const spellTopics=['Days of the Week','Weather','Actions','Custom Vocabulary','Mixed Topics'];
const spellColors=['blue','mint','lilac','peach'];
const spellDefaults={mode:spellModes[0],topic:spellTopics[0],deckId:'active',level:'Easy',timing:{},listenTask:spellModes[1]};
let spellOptions={...spellDefaults,...settings.spelling};
let spellSession=null, spellReturn=null, spellSuspended=false, spellOrderRequest=0;
let spellAudioWatch=null, spellDrag=null;
const spellLetter=char=>/^\p{L}$/u.test(char);
const spellKey=word=>word.normalize('NFC').toLocaleLowerCase('en');
const spelled=()=>spellSession?.questions[spellSession.index];
const spellSeconds=level=>[45,35,25][levels.indexOf(level)];

function spellPool(topic,deckId='active'){
  const weekdayItems=days.map((word,i)=>({word,picture:week(i).calendarDateOnly,pronunciation:media.activities[i]?.audio,sentence:`It’s ${word}.`}));
  const weatherItems=Object.entries(manifest.weather).map(([word,art])=>({word,picture:art.clue,sentence:`It’s ${word}.`}));
  const actionItems=verbs.map((word,i)=>({word,picture:week(i).activityClue,sentence:actionLine(i)}));
  const customDeck=deckId==='active'?deck():media.decks.find(d=>d.id===deckId);
  const custom=(customDeck?.items||[]).filter(x=>!x.disabled&&typeof x.word==='string').map(x=>({...x,pronunciation:x.audio}));
  const candidates={
    'Days of the Week':weekdayItems,'Weather':weatherItems,'Actions':actionItems,
    'Custom Vocabulary':custom,'Mixed Topics':[...weekdayItems,...weatherItems,...actionItems,...custom]
  }[topic]||[];
  const used=new Set();
  return candidates.flatMap(item=>{
    const word=item.word.normalize('NFC').trim().replace(/\s+/g,' ');
    const chars=[...word];
    const key=spellKey(word);
    if(chars.length>48 || chars.filter(spellLetter).length<2 || !chars.every(ch=>spellLetter(ch)||" '-’‐‑".includes(ch)) || used.has(key))return [];
    used.add(key);
    return [{...item,word}];
  });
}
function spellShuffle(xs){
  const out=[...xs];
  for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
function spellQuestion(entry,index,options){
  const chars=[...entry.word];
  const letterIndices=chars.flatMap((ch,i)=>spellLetter(ch)?[i]:[]);
  const level=levels.indexOf(options.level);
  const task=options.mode===spellModes[2]?options.listenTask:options.mode;
  const count=task===spellModes[0]?Math.min(letterIndices.length,[1+index%2,3+index%2,Math.max(4,Math.ceil(letterIndices.length*.7))][level]):letterIndices.length;
  const blanks=spellShuffle(letterIndices).slice(0,count).sort((a,b)=>a-b);
  const tiles=blanks.map((i,id)=>({id,char:chars[i]}));
  const distractorCount=level===1&&index%3===1?1:level===2&&index%2===0?2:0;
  const unused=spellShuffle([...'abcdefghijklmnopqrstuvwxyz'].filter(l=>!letterIndices.some(i=>spellKey(chars[i])===l)));
  for(const ch of unused.slice(0,distractorCount))tiles.push({id:tiles.length,char:ch});
  const tray=spellShuffle(tiles.map(tile=>tile.id));
  if(tray.length>1 && tray.length===count && tray.every((id,i)=>spellKey(tiles[id].char)===spellKey(chars[blanks[i]]))){
    const diff=tray.findIndex(id=>spellKey(tiles[id].char)!==spellKey(tiles[tray[0]].char));
    if(diff>0)[tray[0],tray[diff]]=[tray[diff],tray[0]];
  }
  return {entry,chars,blanks,tiles,tray,placed:{},marks:{},selected:null,cursor:blanks[0], result:'',feedback:'',
    timed:options.timing[options.level]==='Timed',remaining:spellSeconds(options.level),ready:false,expired:false,audioNotice:false};
}
function spellBuild(options){
  const pool=spellPool(options.topic,options.deckId);
  if(!pool.length)return null;
  const length=settings.length==='By Level'?lengths[levels.indexOf(options.level)]:settings.length;
  const entries=[];
  while(entries.length<length){
    const cycle=spellShuffle(pool);
    if(options.level==='Challenge')cycle.sort((a,b)=>Number(b.word.length>=9)-Number(a.word.length>=9));
    if(cycle.length>1&&entries.at(-1)?.word===cycle[0].word)cycle.push(cycle.shift());
    entries.push(...cycle);
  }
  return {options:{...options,timing:{...options.timing}},index:0,length,questions:entries.slice(0,length).map((entry,i)=>spellQuestion(entry,i,options))};
}
function spellSetup(){
  return select('spellMode','Mode',spellModes,spellOptions.mode)+select('spellTopic','Topic',spellTopics,spellOptions.topic)
    +select('spellLevel','Level',levels,spellOptions.level)
    +select('spellTiming','Timing',['Untimed','Timed'],spellOptions.timing[spellOptions.level]||'Untimed')
    +(['Custom Vocabulary','Mixed Topics'].includes(spellOptions.topic)?`<label>Deck <select data-option="spellDeck">
      <option value="active">Active deck</option>${media.decks.map(d=>`<option value="${esc(d.id)}" ${d.id===spellOptions.deckId?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label>`:'')
    +(spellOptions.mode===spellModes[2]?select('spellTask','Letter task',spellModes.slice(0,2),spellOptions.listenTask):'');
}
function openSpelling(){
  if(tab==='spelling')return;
  if(tab==='settings'&&settingsReturn?.tab==='spelling'){backFromSettings();return;}
  if(lessonTabs.includes(tab)&&returnGame?.tab==='spelling'){closeLesson();return;}
  stopAudio();privateCue?.close();privateCue=null;
  if(['play','results','lesson','intro'].includes(phase)&&tab!=='settings'){
    save();
    spellReturn={tab,phase,paused,returnGame,titleReplay,pendingLevel};
  }else if(tab==='settings'&&settingsReturn){
    spellReturn={...settingsReturn,returnGame,titleReplay,pendingLevel};
    settingsReturn=null;
  }else spellReturn=null;
  tab='spelling';phase='intro';paused=false;
  spellSession=null;spellSuspended=false;
  render();
}
function returnFromSpelling(){
  stopAudio();spellSession=null;spellSuspended=false;
  const snapshot=spellReturn;
  spellReturn=null;
  if(!snapshot){navigate('home',{keep:true});return;}
  ({tab,phase,paused,returnGame,titleReplay,pendingLevel}=snapshot);
  render();
}
function startSpelling(){
  stopAudio();spellSession=spellBuild(spellOptions);spellSuspended=false;phase='spelling';
  spellOpenQuestion();
}
function spellIsListening(){return spellSession?.options.mode===spellModes[2];}
function spellOpenQuestion(){
  render();
  const q=spelled();
  if(!q||q.ready)return;
  if(spellIsListening())spellSpeak(q,true);
  else q.ready=true;
}
function cancelSpellOpening(){
  clearTimeout(spellAudioWatch);
  spellAudioWatch=null;
  spellOrderRequest++;
  const q=spelled();
  if(q)q.ready=true;
}
function spellSpeak(q,opening=false){
  if(spellSuspended||spelled()!==q)return;
  stopAudio();
  const token=spellOrderRequest;
  if(opening)q.ready=false;
  const valid=()=>token===spellOrderRequest&&tab==='spelling'&&spelled()===q;
  const finish=(failed=false)=>{
    if(!valid())return;
    clearTimeout(spellAudioWatch);spellAudioWatch=null;
    if(failed){
      q.audioNotice=true;
      const notice=$('#spell-audio-notice');
      if(notice)notice.hidden=false;
    }
    if(opening)q.ready=true;
  };
  const started=()=>{if(valid()){clearTimeout(spellAudioWatch);spellAudioWatch=null;}};
  spellAudioWatch=setTimeout(()=>{
    if(valid()){finish(true);stopAudio();}
  },5000);
  if(!settings.voice){finish(true);return;}
  try{
    if(q.entry.pronunciation){
      currentAudio=new Audio(q.entry.pronunciation);
      currentAudio.volume=settings.voiceVolume/100;
      currentAudio.onplaying=started;currentAudio.onended=()=>finish();currentAudio.onerror=()=>finish(true);
      currentAudio.play().catch(()=>finish(true));return;
    }
    if('speechSynthesis' in window&&'SpeechSynthesisUtterance' in window){
      const u=new SpeechSynthesisUtterance(q.entry.word);
      u.lang='en-US';u.rate=.83;u.volume=settings.voiceVolume/100;
      u.onstart=started;u.onend=()=>finish();u.onerror=()=>finish(true);
      window.speechSynthesis.speak(u);return;
    }
  }catch{finish(true);return;}
  finish(true);
}
function spellSprite(key){
  return fileImg(manifest.spelling.tiles[key],'');
}
function spellTile(q,id,state,marker=''){
  const char=q.tiles[id].char;
  return spellSprite(state||spellColors[id%4])+`<span>${esc(char)}</span>${marker?`<small aria-hidden="true">${marker}</small>`:''}`;
}
function spellSlots(q){
  let word=[];
  const words=[];
  for(const [i,ch] of q.chars.entries()){
    if(ch===' '){words.push(word);word=[];continue;}
    if(!spellLetter(ch)){word.push(`<span class="spell-punctuation">${esc(ch)}</span>`);continue;}
    if(!q.blanks.includes(i)){
      word.push(`<span class="spell-tile spell-locked" aria-label="Given letter ${esc(ch)}">${spellSprite('locked')}<span>${esc(ch)}</span></span>`);
      continue;
    }
    const id=q.placed[i], filled=id!==undefined;
    const state=id===q.selected&&filled?'selected':q.marks[i]||'';
    const marker=q.marks[i]==='correct'?'✓':q.marks[i]==='retry'?'×':'';
    const aria=filled?`Slot ${i+1}, ${q.tiles[id].char}${marker==='✓'?', correct':marker?', try again':''}`:`Blank slot ${i+1}`;
    const tile=filled?spellTile(q,id,state,marker):'<span>_</span>';
    word.push(`<button type="button" class="spell-tile spell-slot ${i===q.cursor?'spell-cursor':''}" data-act="spell-slot" data-val="${i}" ${filled?`data-spell-drag="${id}" draggable="${spellEditable(q)}"`:''} aria-label="${esc(aria)}" ${spellEditable(q)?'':'disabled'}>${tile}</button>`);
  }
  words.push(word);
  return words.map(chars=>`<div class="spell-word">${chars.join('')}</div>`).join('');
}
function spellBank(q){
  const placed=new Set(Object.values(q.placed));
  return q.tray.filter(id=>!placed.has(id)).map(id=>`<button type="button" class="spell-tile" data-act="spell-tile" data-val="${id}" aria-label="Letter ${esc(q.tiles[id].char)}" aria-pressed="${q.selected===id}" data-spell-drag="${id}" draggable="${spellEditable(q)}" ${spellEditable(q)?'':'disabled'}>${spellTile(q,id,q.selected===id?'selected':'')}</button>`).join('');
}
function spellingView(){
  const back=btn(spellReturn?'Back to Game':'Home','spell-back');
  if(phase==='intro')return glowIntro('Spelling Game','Drag letters into the slots, tap a tile and a slot, or type the letters.',
    spellSetup()+btn('Start Spelling','spell-start','','primary')+back);
  const q=spelled();
  if(!q)return prompt('Add an eligible spelling entry','This topic needs at least one enabled word or phrase with 2–48 characters and at least two letters. Spaces, hyphens, and apostrophes are allowed.')
    +controls(btn('Change Setup','spell-setup')+btn('Content Studio','studio')+back);
  if(phase==='spell-results'){
    const correct=spellSession.questions.filter(item=>item.result==='correct').length;
    return prompt('Spelling round complete',`${correct} of ${spellSession.length} spelled correctly.`)+controls(btn('Play Again','spell-start','','primary')+btn('Change Setup','spell-setup')+back);
  }
  const {level,mode,listenTask}=spellSession.options;
  const concealed=!q.result;
  const title=!concealed?q.entry.word:spellIsListening()?'Listen and spell':mode===spellModes[0]?'Fill the gaps':'Unscramble the word';
  const picture=spellIsListening()&&concealed?'':figure(q.entry.picture,'Spelling picture clue',q.entry.mask);
  const timer=q.timed?`<span class="timer" id="spell-timer">${Math.ceil(q.remaining)} s</span>`:'<span class="chip">Untimed</span>';
  const feedback=`${q.feedback?`<span role="status" class="feedback ${q.result==='correct'?'good':''}">${esc(q.feedback)}</span>`:''}`;
  const expiry=q.expired?`<div class="panel row" role="status"><strong>Time is up.</strong>${btn('Add Time','spell-add')}${btn('Continue Untimed','spell-untimed')}${btn('Retry','spell-retry')}${btn('Reveal','spell-reveal')}</div>`:'';
  const startTip=spellIsListening()&&concealed?(listenTask===spellModes[0]?'Fill the gaps using the tiles.':'Put the tiles in order.'):'';
  const actionsRow=btn('Check Spelling','spell-check','','primary',spellEditable(q)?'':'disabled')+
    btn('Clear Tiles','spell-clear','','',spellEditable(q)?'':'disabled')+btn('Shuffle','spell-shuffle','','',spellEditable(q)?'':'disabled')+
    (settings.hints?btn('Hint','spell-hint','','',spellEditable(q)?'':'disabled'):'')+
    (concealed?btn('Reveal','spell-reveal'):'');
  return `<div class="progress row"><strong>${level} · Question ${spellSession.index+1} of ${spellSession.length}</strong>${timer}</div>`
    +prompt(title,concealed?startTip:q.entry.sentence)
    +`<div class="board spell-board">${picture}<div class="panel spell-play"><div class="spell-slots" aria-label="Spelling slots">${spellSlots(q)}</div>
    <div class="spell-bank" aria-label="Letter bank" data-act="spell-bank">${concealed?spellBank(q):''}</div></div>
    <p id="spell-audio-notice" class="panel" ${q.audioNotice?'':'hidden'}>Audio is unavailable. Check Voice in Settings or replay the audio.</p>
    ${feedback}${expiry}</div>`
    +controls((spellIsListening()||!concealed?btn('Replay Audio','spell-audio'):'')
      +(q.timed&&!q.expired&&concealed?btn(spellSuspended?'Resume':'Pause','spell-pause'):'')+actionsRow
      +btn('Previous','spell-prev','','',spellSession.index>0?'':'disabled')+btn('Next','spell-next','','primary')
      +btn('Change Setup','spell-setup')+btn('Settings','nav','settings')+btn('Full Screen','full')+back);
}
function spellEditable(q){return q&&!q.result&&!q.expired&&!spellSuspended;}
function spellPlace(q,id,index){
  if(!spellEditable(q)||!q.tiles[id]||!q.blanks.includes(index))return;
  const from=q.blanks.find(i=>q.placed[i]===id);
  const occupied=q.placed[index];
  if(from!==undefined){
    if(occupied===undefined)delete q.placed[from];
    else q.placed[from]=occupied;
    delete q.marks[from];
  }
  q.placed[index]=id;delete q.marks[index];
  q.selected=null;
  q.cursor=q.blanks.find(i=>i>index&&q.placed[i]===undefined)??q.blanks.find(i=>q.placed[i]===undefined)??index;
  q.feedback='';
}
function spellReturnTile(q,id){
  const index=q.blanks.find(i=>q.placed[i]===id);
  if(!spellEditable(q)||index===undefined)return;
  delete q.placed[index];delete q.marks[index];
  q.cursor=index;q.selected=null;q.feedback='';
}
function spellCheck(q){
  if(!spellEditable(q))return;
  for(const i of q.blanks){
    const tile=q.tiles[q.placed[i]];
    if(tile)q.marks[i]=spellKey(tile.char)===spellKey(q.chars[i])?'correct':'retry';
  }
  if(q.blanks.every(i=>q.marks[i]==='correct')){
    q.result='correct';q.feedback='✓ Correct spelling!';stopAudio();tone(true);spellSpeak(q);
  }else q.feedback='Keep the checked letters and try the remaining slots.';
}
function spellReveal(q){
  if(!q||q.result)return;
  const available=[...q.tiles];
  q.placed={};q.marks={};q.selected=null;
  for(const i of q.blanks){
    const j=available.findIndex(tile=>spellKey(tile.char)===spellKey(q.chars[i]));
    q.placed[i]=available.splice(j,1)[0].id;q.marks[i]='correct';
  }
  q.expired=false;q.result='reveal';q.feedback='Spelling revealed.';
  spellSuspended=false;spellSpeak(q);
}
function spellHint(q){
  if(!spellEditable(q)||spellIsListening()){
    if(spellIsListening())spellSpeak(q);
    return;
  }
  const i=q.blanks.find(ix=>spellKey(q.tiles[q.placed[ix]]?.char||'')!==spellKey(q.chars[ix]));
  if(i===undefined)return;
  const target=spellKey(q.chars[i]);
  const id=q.tiles.find(tile=>spellKey(tile.char)===target&&
    !q.blanks.some(ix=>q.placed[ix]===tile.id&&spellKey(q.chars[ix])===target))?.id;
  if(id!==undefined){spellPlace(q,id,i);q.marks[i]='correct';q.feedback='One letter placed.';}
}
function spellingAction(action,value){
  if(action==='spell-start'){startSpelling();return;}
  if(action==='spell-back'){returnFromSpelling();return;}
  if(action==='spell-setup'){stopAudio();phase='intro';spellSuspended=false;render();return;}
  const q=spelled(), n=Number(value);
  if(!q)return;
  switch(action){
    case 'spell-prev':
    case 'spell-next':{
      const idx=spellSession.index+(action==='spell-next'?1:-1);
      if(idx<0)return;
      stopAudio();spellSuspended=false;
      if(idx>=spellSession.length){phase='spell-results';render();return;}
      spellSession.index=idx;spellOpenQuestion();return;
    }
    case 'spell-tile':
      if(!spellEditable(q))return;
      q.selected=q.selected===n?null:n;break;
    case 'spell-slot':
      if(!spellEditable(q))return;
      q.cursor=n;
      if(q.selected!==null&&q.selected!==q.placed[n])spellPlace(q,q.selected,n);
      else if(q.placed[n]!==undefined&&q.selected===q.placed[n])spellReturnTile(q,q.selected);
      else q.selected=q.placed[n]??null;
      break;
    case 'spell-bank':
      if(q.selected!==null)spellReturnTile(q,q.selected);
      break;
    case 'spell-audio':spellSpeak(q,!q.ready);return;
    case 'spell-pause':spellSuspended=!spellSuspended;if(spellSuspended)stopAudio();break;
    case 'spell-reveal':spellReveal(q);break;
    case 'spell-hint':spellHint(q);break;
    case 'spell-check':spellCheck(q);break;
    case 'spell-clear':
      if(!spellEditable(q))return;
      q.placed={};q.marks={};q.selected=null;q.cursor=q.blanks[0];q.feedback='';break;
    case 'spell-shuffle':
      if(!spellEditable(q))return;
      q.tray=spellShuffle(q.tray);q.selected=null;break;
    case 'spell-add':q.expired=false;q.remaining+=15;spellSuspended=false;break;
    case 'spell-untimed':q.expired=false;q.timed=false;spellSuspended=false;break;
    case 'spell-retry':{
      stopAudio();spellSuspended=false;
      spellSession.questions[spellSession.index]=spellQuestion(q.entry,spellSession.index,spellSession.options);
      spellOpenQuestion();return;
    }
  }
  render(true);
}
function spellField(key,value){
  if(key==='spellTiming')spellOptions.timing={...spellOptions.timing,[spellOptions.level]:value};
  else spellOptions={...spellOptions,[{spellMode:'mode',spellTopic:'topic',spellLevel:'level',spellTask:'listenTask',spellDeck:'deckId'}[key]]:value};
  settings.spelling=spellOptions;save();render();
}
function spellPulse(elapsed){
  const q=spelled();
  if(!spellEditable(q)||!q.timed||!q.ready||document.hidden)return;
  q.remaining=Math.max(0,q.remaining-elapsed);
  if(q.remaining===0){q.expired=true;stopAudio();render();return;}
  const label=$('#spell-timer');
  if(label)label.textContent=Math.ceil(q.remaining)+' s';
}
function spellKeydown(e){
  const q=spelled();
  if(phase!=='spelling'||!spellEditable(q))return;
  const key=e.key;
  if(spellLetter(key)){
    e.preventDefault();
    const occupied=new Set(Object.values(q.placed));
    const id=q.tray.find(id=>!occupied.has(id)&&spellKey(q.tiles[id].char)===spellKey(key));
    if(id!==undefined)spellPlace(q,id,q.cursor);
    else q.feedback='That letter is unavailable in the tile bank.';
  }else if(key==='Backspace'){
    e.preventDefault();
    const index=q.placed[q.cursor]!==undefined?q.cursor:q.blanks.filter(i=>i<q.cursor&&q.placed[i]!==undefined).at(-1);
    if(index!==undefined)spellReturnTile(q,q.placed[index]);
  }else if(key==='ArrowLeft'||key==='ArrowRight'){
    e.preventDefault();
    const i=q.blanks.indexOf(q.cursor)+(key==='ArrowRight'?1:-1);
    q.cursor=q.blanks[Math.max(0,Math.min(q.blanks.length-1,i))];
  }else if(key==='Enter'&&!e.target.closest('button')){
    e.preventDefault();spellCheck(q);
  }else return;
  render(true);
}
function bindSpellingDrag(){
  stage.addEventListener('dragstart',e=>{
    const tile=e.target.closest('[data-spell-drag][draggable=true]');
    if(tab==='spelling'&&tile&&spellEditable(spelled())){
      spellDrag=Number(tile.dataset.spellDrag);
      e.dataTransfer.setData('text/plain',String(spellDrag));
      e.dataTransfer.effectAllowed='move';
    }
  });
  stage.addEventListener('dragend',()=>{spellDrag=null;});
  stage.addEventListener('dragover',e=>{
    if(tab==='spelling'&&spellDrag!==null&&e.target.closest('[data-act=spell-slot], [data-act=spell-bank]'))e.preventDefault();
  });
  stage.addEventListener('drop',e=>{
    const target=e.target.closest('[data-act=spell-slot], [data-act=spell-bank]');
    if(tab!=='spelling'||spellDrag===null||!target)return;
    e.preventDefault();
    const q=spelled();
    if(target.dataset.act==='spell-slot')spellPlace(q,spellDrag,Number(target.dataset.val));
    else spellReturnTile(q,spellDrag);
    spellDrag=null;render();
  });
}

(async()=>{
  try {
    manifest=window.CALENDAR_MANIFEST || await fetch('assets/asset-manifest.json').then(r=>r.json());
    if(window.CALENDAR_MANIFEST)registerArt(manifest);
    await loadMedia();
    if(settings.font==='Uploaded Font')await restoreUploadedFont();
    if(adventure){saved.adventure=adventure;adventure=null;}
    installEvents();render();
  } catch(error){stage.textContent='The game could not load its artwork. Open the standalone HTML or keep the assets folder beside index.html.';console.error(error);}
})();
