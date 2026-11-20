'use strict';
const $ = id => document.getElementById(id);
const zone = 'America/Edmonton';
const clock = new Intl.DateTimeFormat('en-CA', {timeZone:zone, dateStyle:'medium', timeStyle:'short'});
$('date').textContent = new Intl.DateTimeFormat('en-CA', {timeZone:zone, weekday:'long', month:'long', day:'numeric'}).format(new Date());
const forecast = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
  latitude:55.17, longitude:-118.79, timezone:zone, forecast_days:7,
  current:'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
  hourly:'temperature_2m,weather_code,precipitation_probability',
  daily:'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max'
});
const warnings = 'https://api.weather.gc.ca/collections/weather-alerts/items?' + new URLSearchParams({
  f:'json', bbox:'-118.81,55.15,-118.77,55.19', limit:100
});
const state = {};
const degree = value => Number.isFinite(value) ? Math.round(value) + '°' : '—';
const number = (value, unit) => Number.isFinite(value) ? Math.round(value) + unit : '—';
const codes = {0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Freezing fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Heavy freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Heavy freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Light rain showers',81:'Rain showers',82:'Heavy rain showers',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Thunderstorm with heavy hail'};
const condition = code => codes[code] || 'Conditions unavailable';
const dayName = time => new Intl.DateTimeFormat('en-CA',{weekday:'short',timeZone:'UTC'}).format(new Date(time+'T12:00Z'));
const speakTemp = n => Number.isFinite(n) ? Math.round(n) + ' degrees Celsius' : 'unavailable';
function element(tag, content, style) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  if (style) node.className = style;
  return node;
}
function link(title, href, allowed) {
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' && allowed.some(host => url.hostname === host || url.hostname.endsWith('.'+host))) {
      const a = element('a',title);
      a.href = url.href;
      return a;
    }
  } catch {}
  return element('span',title);
}
async function request(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9500);
  try {
    const response = await fetch(url,{signal:controller.signal,cache:'no-store'});
    if (!response.ok) throw new Error('HTTP '+response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}
function priorWeather() {
  try {
    const saved = JSON.parse(localStorage.getItem('ewecast-weather'));
    if (saved && Date.now() - saved.at < 6*3600000) return saved;
  } catch {}
}
function renderWeather(data, at, cached) {
  const {current:c,hourly:h,daily:d} = data;
  if (!Number.isFinite(c?.temperature_2m) || !h?.time?.length || !d?.time?.length) throw new Error('Incomplete forecast');
  $('temp').textContent = degree(c.temperature_2m)+'C';
  $('conditions').textContent = condition(c.weather_code);
  $('details').textContent = 'Feels like '+degree(c.apparent_temperature)+' · Wind '+number(c.wind_speed_10m,' km/h');
  $('weather-time').textContent = (cached ? 'Saved forecast from ' : 'Forecast checked ') + clock.format(at);
  const hours = h.time.map((time,i) => ({time,i})).filter(({time}) => time >= c.time.slice(0,13)).slice(0,12);
  $('hours').replaceChildren(...hours.map(({time,i}) => {
    const hour = element('div',undefined,'hour');
    hour.append(element('span', time.slice(11)),element('strong',degree(h.temperature_2m[i])),element('span',number(h.precipitation_probability[i],'% precip.')));
    return hour;
  }));
  $('days').replaceChildren(...d.time.map((time,i) => {
    const row = element('div',undefined,'row day');
    row.append(element('span',i===0?'Today':i===1?'Tomorrow':dayName(time)),element('span',condition(d.weather_code[i])),element('span',degree(d.temperature_2m_max[i])+' / '+degree(d.temperature_2m_min[i])));
    return row;
  }));
  $('forecast').hidden = false;
  state.weather = (cached?'From a saved forecast checked '+clock.format(at)+'. ':'')+
    'In Grande Prairie, it is '+speakTemp(c.temperature_2m)+'. '+condition(c.weather_code)+'. '+
    'Today, a high of '+speakTemp(d.temperature_2m_max[0])+' and a low of '+speakTemp(d.temperature_2m_min[0])+'. '+
    (d.time[1]?'Tomorrow, '+condition(d.weather_code[1]).toLowerCase()+', with a high of '+speakTemp(d.temperature_2m_max[1])+'.':'');
}
async function loadWeather() {
  try {
    const data = await request(forecast);
    const at = Date.now();
    renderWeather(data,at,false);
    try { localStorage.setItem('ewecast-weather',JSON.stringify({data,at})); } catch {}
  } catch {
    const saved = priorWeather();
    if (saved) {
      try { renderWeather(saved.data,saved.at,true); return; } catch {}
    }
    $('temp').textContent = '—';
    $('conditions').textContent = 'Forecast unavailable. Try Refresh.';
    $('details').textContent = '';
    $('weather-time').textContent = '';
    $('forecast').hidden = true;
    state.weather = 'The Grande Prairie forecast is unavailable.';
  }
}
function renderAlerts(id, items, label, stamp, hosts) {
  const box = $(id);
  box.replaceChildren(element('p',items.length ? label : label+' reports no active alerts in this feed.'));
  if (stamp) box.append(element('small','Checked '+clock.format(stamp)));
  for (const item of items) {
    const card = element('div',undefined,'alert');
    card.append(link(item.title,item.url,hosts));
    box.append(card);
  }
}
async function loadWarnings() {
  try {
    const data = await request(warnings);
    if (!Array.isArray(data.features) || data.links?.some(l=>l.rel==='next')) throw new Error('Incomplete alerts');
    const titles = new Map();
    for (const {properties:p} of data.features) {
      const title = p?.headline_en || [p?.risk_colour_en,p?.event_en || p?.alert_name_en || p?.alert_type].filter(Boolean).join(' ') || 'Weather alert';
      titles.set(title,{title,url:p?.web_en || 'https://weather.gc.ca/index_e.html?alertTableFilterProv=AB&layers=alert'});
    }
    const items = [...titles.values()];
    renderAlerts('alerts',items,'Environment Canada · Grande Prairie area',Date.now(),['weather.gc.ca']);
    state.alerts = items.length ? 'Environment Canada weather alerts. '+items.slice(0,4).map(x=>x.title).join('. ')+'. See the app for official details.' : 'Environment Canada reports no active weather alerts for the Grande Prairie area.';
  } catch {
    $('alerts').textContent = 'Grande Prairie weather alerts could not be checked. Open Official weather alerts below.';
    state.alerts = 'Grande Prairie weather alerts could not be checked. Consult Environment Canada directly.';
  }
}
async function loadFeeds() {
  try {
    const data = await request('./feeds.json');
    const at = Date.parse(data.checked);
    const age = Date.now()-at;
    if (age >= -300000 && age < 2*3600000 && Array.isArray(data.emergency)) {
      renderAlerts('emergency',data.emergency,'Alberta Emergency Alert · Province-wide feed',at,['alberta.ca']);
      state.emergency = data.emergency.length ? 'The Alberta emergency feed has active alerts. Check the affected areas in the official alert links.' : 'The Alberta Emergency Alert feed reports no active provincial alerts.';
    } else unavailableEmergency();
    if (age >= -300000 && age < 6*3600000 && Array.isArray(data.news) && data.news.length) {
      $('news-status').textContent = 'CBC Edmonton · Checked '+clock.format(at);
      $('news').replaceChildren(...data.news.map(item => {
        const li = element('li');
        li.append(link(item.title,item.url,['cbc.ca']));
        return li;
      }));
      state.news = 'Now, Alberta headlines from CBC Edmonton. '+data.news.slice(0,4).map(item=>item.title).join('. ')+'.';
    } else unavailableNews();
  } catch {
    unavailableEmergency();
    unavailableNews();
  }
}
function unavailableEmergency() {
  $('emergency').textContent = 'Alberta emergency feed unavailable or out of date. Check Alberta Emergency Alert directly.';
  state.emergency = 'Alberta emergency alerts could not be verified. Check Alberta Emergency Alert directly.';
}
function unavailableNews() {
  $('news-status').textContent = 'Headlines unavailable. Open CBC Edmonton below.';
  $('news').replaceChildren();
  state.news = 'Alberta headlines are unavailable.';
}
let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  $('refresh').disabled = true;
  $('refresh').textContent = 'Checking…';
  try { await Promise.all([loadWeather(),loadWarnings(),loadFeeds()]); }
  finally {
    refreshing = false;
    $('refresh').disabled = false;
    $('refresh').textContent = '↻ Refresh';
  }
}
const synth = window.speechSynthesis;
let session = 0;
let timer;
let utterance;
let audioContext;
let playingSource;
let worker;
let pendingVoice;
function endVoice(message, cancel = true) {
  session++;
  clearTimeout(timer);
  if (cancel) synth?.cancel();
  pendingVoice?.cancel();
  playingSource?.stop();
  playingSource = undefined;
  audioContext?.close().catch(()=>{});
  audioContext = undefined;
  utterance = undefined;
  $('hero').classList.remove('speaking');
  $('play').disabled = false;
  $('stop').disabled = true;
  $('device-voice').hidden = true;
  $('voice').textContent = message;
}
function voiceLines() {
  return ['Hi, it’s Casty. '+(state.weather || 'The forecast is still loading.'),
    state.alerts || 'Weather alerts are still being checked.',
    state.emergency || 'Alberta alerts are still being checked.',
    state.news || 'Headlines are still loading.', 'That’s your EweCast briefing.'];
}
function voiceParts() {
  return voiceLines().flatMap((line,section) =>
    line.replace(/([.!?])\s+/g,'$1\n').split('\n')
      .map(text => ({text:text.trim(),section}))
      .filter(part => part.text));
}
function beginVoice(message) {
  $('play').disabled = true;
  $('stop').disabled = false;
  $('voice').textContent = message;
  return ++session;
}
function markSpeaking(index, device = false) {
  $('hero').classList.add('speaking');
  $('voice').textContent = (index === 3 ? 'Reading headlines' : index === 4 ? 'Wrapping up' : 'Reading weather and safety')+
    (device ? ' · Device voice' : ' · Kokoro Heart');
}
function speakWithDevice(parts = voiceParts()) {
  endVoice('');
  if (!synth || !window.SpeechSynthesisUtterance) {
    endVoice('Spoken briefings are unavailable in this browser.');
    return;
  }
  const token = beginVoice('Starting device voice…');
  const voices = synth.getVoices();
  const voice = voices.find(v=>/^Moira|^Karen|^Samantha|^Ava|^Serena/i.test(v.name) && v.lang.startsWith('en')) ||
    voices.find(v=>v.lang==='en-CA') || voices.find(v=>v.lang.startsWith('en'));
  function next(index) {
    if (token !== session) return;
    if (index === parts.length) { endVoice('Briefing complete.',false); return; }
    const {text,section} = parts[index];
    utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice?.lang || 'en-CA';
    if (voice) utterance.voice = voice;
    utterance.rate = .97;
    const failed = () => {
      if (token !== session) return;
      endVoice('Tap Use device voice to start playback, or check your media volume.');
      $('device-voice').hidden = false;
    };
    timer = setTimeout(failed,6500);
    utterance.onstart = () => {
      if (token !== session) return;
      clearTimeout(timer);
      timer = setTimeout(failed,12000+text.length*190);
      markSpeaking(section,true);
    };
    utterance.onerror = failed;
    utterance.onend = () => {
      if (token !== session) return;
      clearTimeout(timer);
      next(index+1);
    };
    try { synth.speak(utterance); } catch { failed(); }
  }
  next(0);
}
function generateVoice(text, firstSection) {
  return new Promise((resolve,reject) => {
    const starting = !worker;
    worker ||= new Worker('./voice-worker.js',{type:'module'});
    let timeout = setTimeout(() => fail('Voice loading timed out'), starting ? 25000 : 9000);
    function cleanup() {
      clearTimeout(timeout);
      pendingVoice = undefined;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
    }
    function fail(message) {
      cleanup();
      worker.terminate();
      worker = undefined;
      reject(new Error(message));
    }
    pendingVoice = {cancel: () => fail('Stopped')};
    worker.onmessage = ({data}) => {
      if (data.failed) { fail('Voice generation failed'); return; }
      if (data.wav) { cleanup(); resolve(data.wav); return; }
      if (firstSection && data.progress !== undefined) $('voice').textContent = 'Downloading Casty’s voice… '+data.progress+'%';
      if (data.generating) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fail('Voice generation timed out'),9000);
        if (firstSection) $('voice').textContent = 'Preparing Casty’s briefing…';
      }
    };
    worker.onerror = () => fail('Voice worker failed');
    worker.onmessageerror = () => fail('Voice worker message failed');
    try { worker.postMessage({text}); } catch { fail('Voice worker unavailable'); }
  });
}
async function speak() {
  const token = beginVoice('Loading Casty’s voice…');
  $('device-voice').hidden = false;
  const parts = voiceParts();
  let index = 0;
  const Audio = window.AudioContext || window.webkitAudioContext;
  try {
    const context = audioContext = new Audio();
    timer = setTimeout(() => {
      if (token === session) speakWithDevice(parts.slice(index));
    },36000);
    await context.resume(); // Unlock audio during the Start briefing tap.
    if (token !== session) return;
    clearTimeout(timer);
    for (; index < parts.length; index++) {
      if (token !== session) return;
      if (index) $('voice').textContent = 'Preparing the next part…';
      const wav = await generateVoice(parts[index].text,index===0);
      if (token !== session) return;
      const buffer = await context.decodeAudioData(wav);
      if (token !== session) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      markSpeaking(parts[index].section);
      await new Promise(resolve => {
        source.onended = resolve;
        source.start();
        playingSource = source;
      });
      if (token === session) {
        playingSource = undefined;
        $('hero').classList.remove('speaking');
      }
    }
    if (token === session) endVoice('Briefing complete.',false);
  } catch {
    if (token !== session) return;
    speakWithDevice(parts.slice(index));
  }
}
$('play').addEventListener('click',speak);
$('device-voice').addEventListener('click',()=>speakWithDevice());
$('stop').addEventListener('click',()=>endVoice('Briefing stopped.'));
$('refresh').addEventListener('click',refresh);
addEventListener('online',refresh);
document.addEventListener('visibilitychange',()=>{if (!document.hidden) refresh();});
setInterval(()=>{if (!document.hidden) refresh();},5*60000);
if (location.protocol === 'file:') $('voice').textContent = 'Open the hosted EweCast site in Safari for live updates.';
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
refresh();
