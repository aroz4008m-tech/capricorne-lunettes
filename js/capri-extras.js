// Repris de Capri (mochiiwuff/capri-desktop, licence PolyForm Noncommercial 1.0.0).
// reminders.js (lecture des rappels) et voice.js (ses sons).
// Seuls changements : 'import'/'export' retirés, et la sauvegarde passe par le navigateur (localStorage).
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const fmt = (str, vars = {}) => str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ===== reminders.js =====
// Reminders she keeps for you. You ask in her chat, in any of her languages ("rappelle-moi dans
// 20 min de sortir le linge", "remind me at 6pm to call mom", "напомни через 15 минут выключить
// духовку"): parseReminder reads when and what straight off your message, so it works the same on
// the smallest model. They're kept in her settings and survive a restart; one that came due while
// she was off, she brings up when she's back.

const TRIGGER = /(rappelle[- ]?(?:moi|nous)|fais[- ]moi penser|pense à me (?:le )?(?:rappeler|dire)|n['’]oublie pas de me (?:le )?(?:rappeler|dire)|mets[- ]moi un rappel|remind me|set (?:a|an) (?:reminder|alarm)|recu[eé]rd(?:a|e)me|recordarme|av[ií]same|pon(?:me)? un recordatorio|me lembr[ae]|lembr[ae][- ]me|me avis[ae]|cri[ae] um lembrete|напомни(?:те)?(?: мне)?|поставь напоминание)/i;

// small numbers said in words (in 5 of her languages)
const WORDS = {
  un: 1, une: 1, a: 1, an: 1, one: 1, uno: 1, una: 1, um: 1, uma: 1, один: 1, одна: 1, одну: 1,
  deux: 2, two: 2, dos: 2, dois: 2, duas: 2, два: 2, две: 2,
  trois: 3, three: 3, tres: 3, três: 3, три: 3,
  quatre: 4, four: 4, cuatro: 4, quatro: 4, четыре: 4,
  cinq: 5, five: 5, cinco: 5, пять: 5,
  dix: 10, ten: 10, diez: 10, dez: 10, десять: 10,
  quinze: 15, fifteen: 15, quince: 15, пятнадцать: 15,
  vingt: 20, twenty: 20, veinte: 20, vinte: 20, двадцать: 20,
  trente: 30, thirty: 30, treinta: 30, trinta: 30, тридцать: 30,
  quarante: 40, forty: 40, cuarenta: 40, quarenta: 40, сорок: 40,
  cinquante: 50, fifty: 50, cincuenta: 50, cinquenta: 50, пятьдесят: 50,
};
const NUM = `(\\d+(?:[.,]\\d+)?|${Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|')})`;
const UNIT = '(secondes?|seconds?|secs?|segundos?|секунд[уы]?|сек|s|minutes?|minutos?|mins?|mn|минут[уы]?|мин|m|heures?|hours?|hrs?|horas?|час(?:а|ов)?|ч|h)';
const SOON = '(?<![\\p{L}])(?:dans|in|en|em|daqui a|dentro de|через)';
// "dans 20 min", "in 1 hour and 30 minutes", "через 2 часа"
const IN = new RegExp(`${SOON}\\s+${NUM}\\s*${UNIT}(?![\\p{L}])(?:\\s*(?:et|and|y|e|и)?\\s*${NUM}\\s*${UNIT}(?![\\p{L}]))?`, 'iu');
// "dans 1h30"
const IN_HM = new RegExp(`${SOON}\\s+(\\d{1,2})\\s*h\\s*(\\d{1,2})(?!\\d)`, 'iu');
// "dans une demi-heure", "in half an hour", "через полчаса", "dans un quart d'heure"
const IN_HALF = new RegExp(`${SOON}\\s+(?:une |a |an |um |uma )?(demi[- ]heure|half an hour|media hora|meia hora|полчаса|quart d['’]heure|quarter of an hour|cuarto de hora|четверть часа)`, 'iu');
// "через час", "через минуту"
const IN_ONE = /через\s+(час|минуту)(?![\p{L}])/iu;
// "à 18h30", "at 6:30 pm", "a las 18:00", "às 18h", "в 18:00", or a bare "18h30" / "18:30" / "6pm"
const AT = /(?:(?:à|a|at|a las|a la|às|as|в|к)\s+)?(?<![\d:])(\d{1,2})(?:\s*(?:h|:|\.)\s*(\d{2})?|\s*(?:heures?|hours?|horas?|час(?:а|ов)?)\b)?\s*(a\.?m\.?|p\.?m\.?)?(?![\d\p{L}])/iu;
// words, start and end, in any alphabet (\b only knows ASCII: not "amanhã", not Cyrillic)
const word = (list, flags = 'iu') => new RegExp(`(?<![\\p{L}])(?:${list})(?![\\p{L}])`, flags);
const NOON = word('(?:(?:à|at|a|al|ao|в)\\s+)?(?:midi|noon|mediod[ií]a|meio-dia|полдень)');
const MIDNIGHT = word('(?:(?:à|at|a|al|в)\\s+)?(?:minuit|midnight|medianoche|meia-noite|полночь)');
const TOMORROW = word('demain|tomorrow|amanh[ãa]|завтра|(?<!de la\\s)mañana');
const PM = word("ce soir|du soir|de l['’]après-midi|cet après-midi|tonight|this evening|in the evening|this afternoon|in the afternoon|de la tarde|de la noche|esta tarde|esta noche|da tarde|da noite|hoje à noite|вечера|дня");
const AM = word('du matin|ce matin|in the morning|de la mañana|da manhã|de manhã|утра');
const POLITE = word("s['’]il te pla[iî]t|stp|svp|please|pls|plz|por favor|пожалуйста", 'giu');
// what comes before what to remind you of, once the rest is gone
const LEAD = new RegExp("^(?:[\\s,:;.!?-]|d['’]|qu['’]|(?:capri|de que|de|que|pour|à|to|that|about|of|for|para|pra|me|о|об|что|чтобы|мне)(?![\\p{L}]))+", 'iu');

const MAX_MS = 7 * 24 * 3600 * 1000;

function number(word) {
  if (!word) return NaN;
  const n = Number(word.replace(',', '.'));
  return Number.isFinite(n) ? n : WORDS[word.toLowerCase()] ?? NaN;
}

function unitMs(unit) {
  const u = unit.toLowerCase();
  if (/^(s|sec|secs|seconde|secondes|second|seconds|segundo|segundos|секунд|секунду|секунды|сек)$/.test(u)) return 1000;
  if (/^(h|hr|hrs|heure|heures|hour|hours|hora|horas|час|часа|часов|ч)$/.test(u)) return 3600 * 1000;
  return 60 * 1000;
}

// When, read off text: { at (ms), spans: the parts of the text that said it }, or null.
function parseWhen(text, now = Date.now()) {
  let m = IN_HM.exec(text);
  if (m) return { at: now + (Number(m[1]) * 60 + Number(m[2])) * 60000, spans: [m] };
  m = IN.exec(text);
  if (m) {
    let ms = number(m[1]) * unitMs(m[2]);
    if (m[3] && m[4]) ms += number(m[3]) * unitMs(m[4]);
    if (Number.isFinite(ms) && ms > 0) return { at: now + ms, spans: [m] };
  }
  m = IN_HALF.exec(text);
  if (m) return { at: now + (/quart|quarter|cuarto|четверть/i.test(m[1]) ? 15 : 30) * 60000, spans: [m] };
  m = IN_ONE.exec(text);
  if (m) return { at: now + (/час/i.test(m[1]) ? 60 : 1) * 60000, spans: [m] };

  // a time of day, today or tomorrow
  const spans = [];
  let h = null, min = 0;
  const noon = NOON.exec(text) || MIDNIGHT.exec(text);
  if (noon) {
    h = NOON.test(noon[0]) ? 12 : 0;
    spans.push(noon);
  } else {
    m = AT.exec(text);
    if (m && Number(m[1]) <= 23 && (m[2] === undefined || Number(m[2]) <= 59)) {
      // a bare number only counts as a time with a "h", ":", am/pm or "at" in front
      const said = /[h:.]|heure|hour|hora|час|am|pm|a\.m|p\.m/i.test(m[0].slice(String(m[1]).length)) || /^\s*(à|a|at|a las|a la|às|as|в|к)\s/i.test(m[0]);
      if (said) {
        h = Number(m[1]);
        min = Number(m[2] || 0);
        const ampm = (m[3] || '').toLowerCase().replace(/\./g, '');
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        if (!ampm && h < 12) {
          if (PM.test(text)) h += 12;
          else if (!AM.test(text) && !TOMORROW.test(text) && h > 0) {
            // "at 6", said in the afternoon: the next 6 o'clock to come
            const at6 = new Date(now);
            at6.setHours(h, min, 0, 0);
            if (at6.getTime() <= now && at6.getTime() + 12 * 3600000 > now) h += 12;
          }
        }
        spans.push(m);
      }
    }
  }
  if (h === null) return null;
  const d = new Date(now);
  d.setHours(h, min, 0, 0);
  const tomorrow = TOMORROW.exec(text);
  if (tomorrow) {
    d.setDate(d.getDate() + 1);
    spans.push(tomorrow);
  } else if (d.getTime() <= now) {
    d.setDate(d.getDate() + 1); // already past today: tomorrow
  }
  return { at: d.getTime(), spans };
}

// A reminder asked for in text: { at (ms, or null if it doesn't say when), text: what to remind
// you of ('' if nothing) }, or null if it isn't asking for one.
function parseReminder(text, now = Date.now()) {
  const trigger = TRIGGER.exec(text);
  if (!trigger) return null;
  const when = parseWhen(text, now);
  let what = text;
  for (const m of [trigger, ...(when?.spans || [])]) what = what.replace(m[0], ' ');
  what = what.replace(PM, ' ').replace(AM, ' ').replace(TOMORROW, ' ').replace(POLITE, ' ');
  what = what.replace(/\s+/g, ' ').replace(LEAD, '').replace(/[\s,;:.!?]+$/, '').trim().slice(0, 140);
  const at = when && when.at - now >= 5000 && when.at - now <= MAX_MS ? when.at : null;
  return { at, text: what };
}

// When a reminder is for, as she says it: the time, with the day if it isn't today.
function clock(at, lang = 'en') {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(lang, sameDay ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

// The ones she keeps: [{ id, at, text, made }], saved in her settings (main.js shows them in her

// ===== voice.js =====
// Capri's sounds, synthesized with Web Audio so nothing has to ship with the repo.
// Any file dropped in the custom sounds folder (tray > Son) named after a cue
// (teleport-out.mp3, done.wav, alert.ogg...) replaces the synth for that cue.


// a minor-pentatonic set for the talking blips; three detuned voices = a chorus of minds
const BLIP_NOTES = [62, 65, 67, 69, 72, 74, 77, 79];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const CUES = ['teleport-out', 'teleport-in', 'done', 'alert', 'error', 'hello', 'blip', 'tick', 'star', 'land', 'rise', 'bolt', 'charge', 'possess', 'throw', 'crash', 'remind', 'jealous', 'purr'];

class Voice {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.7;
    this.custom = new Map(); // cue -> AudioBuffer
    this.lastBlip = 0;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    // soft clip so stacked cues never get harsh
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
    }
    shaper.curve = curve;
    this.master.connect(shaper).connect(ctx.destination);
    this.noise = this.makeNoise();
    return ctx;
  }

  configure({ muted, volume }) {
    if (typeof muted === 'boolean') this.muted = muted;
    if (typeof volume === 'number') {
      this.volume = volume;
      if (this.master) this.master.gain.value = volume;
    }
  }

  async loadCustom(list) {
    const ctx = this.ensure();
    this.custom.clear();
    for (const { name, url } of list) {
      if (!CUES.includes(name)) continue;
      try {
        const data = await (await fetch(url)).arrayBuffer();
        this.custom.set(name, await ctx.decodeAudioData(data));
      } catch (err) {
        console.warn('[capri] could not load sound', name, err);
      }
    }
  }

  play(cue, opts = {}) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (ctx.state === 'suspended') ctx.resume();
    const custom = this.custom.get(cue);
    if (custom) {
      const src = ctx.createBufferSource();
      src.buffer = custom;
      src.connect(this.master);
      src.start();
      return;
    }
    const fn = {
      'teleport-out': () => this.zap(false),
      'teleport-in': () => this.zap(true),
      done: () => this.done(),
      alert: () => this.alert(),
      error: () => this.error(),
      hello: () => this.hello(),
      blip: () => this.blip(opts.mood),
      tick: () => this.tick(),
      star: () => this.star(),
      land: () => this.land(),
      rise: () => this.rise(),
      bolt: () => this.bolt(opts.soft),
      charge: () => this.charge(),
      possess: () => this.possess(),
      throw: () => this.whoosh(opts.power ?? 0.6),
      crash: () => this.crash(opts.power ?? 0.6),
      remind: () => this.remind(),
      jealous: () => this.hiss(),
      purr: () => this.purr(),
    }[cue];
    fn?.();
  }

  makeNoise() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  env(gain, t, a, peak, d) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  osc(type, freq, t, dur, peak, dest = this.master) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    this.env(g, t, 0.004, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noiseBurst(t, dur, peak, from, to, q = 2) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.005, peak, dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, rand(0, 0.5));
    src.stop(t + dur + 0.05);
  }

  // teleport: saw sweep + filtered noise, upward when leaving, downward when landing
  zap(arriving) {
    const t = this.ctx.currentTime;
    const o = this.osc('sawtooth', arriving ? 1600 : 180, t, 0.22, 0.12);
    o.frequency.exponentialRampToValueAtTime(arriving ? 140 : 2400, t + 0.2);
    this.noiseBurst(t, 0.2, 0.22, arriving ? 6000 : 400, arriving ? 500 : 7000, 3);
    // bit-crushy stutter
    for (let i = 0; i < 4; i++) this.osc('square', rand(800, 3200), t + 0.02 + i * 0.035, 0.02, 0.05);
    if (arriving) this.osc('triangle', 70, t + 0.16, 0.18, 0.3);
  }

  blip(mood = 'talk') {
    const now = performance.now();
    if (now - this.lastBlip < 45) return;
    this.lastBlip = now;
    const t = this.ctx.currentTime;
    const base = pick(BLIP_NOTES) + (mood === 'alert' ? 5 : mood === 'error' ? -7 : 0);
    const f = midi(base);
    this.osc('square', f, t, 0.035, 0.035);
    this.osc('triangle', f * 1.498, t + 0.004, 0.03, 0.025); // a fifth up
    this.osc('square', f * 0.501, t + 0.008, 0.03, 0.018);   // an octave down, slightly off
  }

  // petted: a purr, a low buzz trembling twenty-odd times a second, swelling and fading
  purr() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(54, 62), t);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(21, 25);
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    const g = ctx.createGain();
    this.env(g, t, 0.12, 0.22, 0.95);
    o.connect(lp).connect(trem).connect(g).connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.15);
    lfo.stop(t + 1.15);
  }

  tick() {
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.03, 0.06, 3000, 9000, 8);
  }

  // red lightning: a buzz under a crackle of tiny bursts (soft: the small hacking sparks)
  bolt(soft = false) {
    const t = this.ctx.currentTime;
    const k = soft ? 0.35 : 1;
    const o = this.osc('sawtooth', 62, t, 0.3 * k + 0.05, 0.08 * k);
    o.frequency.setValueAtTime(58, t + 0.05);
    for (let i = 0; i < (soft ? 3 : 8); i++) {
      this.noiseBurst(t + i * rand(0.02, 0.045), 0.025, 0.14 * k, rand(2500, 6000), rand(4000, 9000), 6);
    }
  }

  // charging up before the red light goes up: a buzz swelling and climbing, crackling more and more
  charge() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.7);
    for (let i = 0; i < 6; i++) this.noiseBurst(t + 0.08 + i * 0.09, 0.02, 0.04 + i * 0.016, 3000, 7000, 6);
  }

  // the window she took over laughs with all her voices: three falling chirps, each a detuned
  // chord, over a hiss
  possess() {
    const t = this.ctx.currentTime;
    [79, 76, 72].forEach((n, i) => {
      const at = t + i * 0.11;
      this.osc('square', midi(n), at, 0.07, 0.05);
      this.osc('square', midi(n) * 1.012, at + 0.004, 0.06, 0.035);
      this.osc('triangle', midi(n - 12), at + 0.008, 0.07, 0.04);
    });
    this.noiseBurst(t, 0.3, 0.05, 1200, 5000, 3);
  }

  // the launch into the victory pose: a quick upward whoosh
  rise() {
    const t = this.ctx.currentTime;
    const o = this.osc('sawtooth', 160, t, 0.2, 0.07);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
    this.noiseBurst(t, 0.18, 0.12, 500, 6000, 2);
  }

  // thrown: air rushing past, a falling saw under it, harder the faster she goes
  whoosh(power) {
    const t = this.ctx.currentTime;
    const k = 0.4 + power * 0.6;
    this.noiseBurst(t, 0.28, 0.16 * k, 300, 3200 + power * 3000, 1.4);
    const o = this.osc('sawtooth', 420 + power * 300, t, 0.22, 0.05 * k);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
    for (let i = 0; i < 3; i++) this.osc('square', rand(1500, 3800), t + 0.03 + i * 0.03, 0.015, 0.03 * k);
  }

  // slamming into something: a heavy thump, glass crunching, her signal glitching out for a moment
  crash(power) {
    const t = this.ctx.currentTime;
    const k = 0.35 + power * 0.65;
    const o = this.osc('triangle', 130, t, 0.22, 0.34 * k);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    this.noiseBurst(t, 0.12, 0.22 * k, 2400, 300, 1.2);
    if (power > 0.25) {
      for (let i = 0; i < 6; i++) this.noiseBurst(t + 0.02 + i * rand(0.012, 0.03), 0.02, 0.12 * k, rand(5000, 9000), rand(6000, 10000), 9);
    }
    for (let i = 0; i < 4; i++) this.osc('square', rand(700, 2600), t + 0.05 + i * 0.028, 0.018, 0.04 * k);
  }

  // a reminder: three bright notes going up, softer than an alert, with a shimmer
  remind() {
    const t = this.ctx.currentTime;
    [76, 81, 88].forEach((n, i) => {
      this.osc('triangle', midi(n), t + i * 0.12, 0.35, 0.08);
      this.osc('sine', midi(n + 12), t + i * 0.12 + 0.01, 0.25, 0.025);
    });
    this.noiseBurst(t + 0.3, 0.4, 0.02, 8000, 12000, 6);
  }

  // jealous: a hiss over a low growl that wobbles, like a cat about to swipe
  hiss() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(3500, t);
    bp.frequency.linearRampToValueAtTime(6500, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, rand(0, 0.5));
    src.stop(t + 0.5);
    const growl = this.osc('sawtooth', 72, t, 0.4, 0.07);
    for (let i = 1; i <= 8; i++) growl.frequency.setValueAtTime(i % 2 ? 64 : 80, t + i * 0.045);
  }

  // touching down: a soft digital thump
  land() {
    const t = this.ctx.currentTime;
    const o = this.osc('triangle', 150, t, 0.14, 0.22);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    this.noiseBurst(t, 0.06, 0.08, 1800, 400, 1.5);
  }

  // the satellite: two soft, high pings and a shimmer
  star() {
    const t = this.ctx.currentTime;
    this.osc('sine', midi(93), t, 0.9, 0.05);
    this.osc('sine', midi(100), t + 0.14, 1.2, 0.035);
    this.noiseBurst(t + 0.05, 0.6, 0.015, 9000, 12000, 6);
  }

  hello() {
    const t = this.ctx.currentTime;
    [69, 76, 81].forEach((n, i) => this.osc('square', midi(n), t + i * 0.06, 0.07, 0.06));
    this.noiseBurst(t + 0.18, 0.08, 0.06, 2000, 8000, 5);
  }

  // bright arpeggio and a glitchy tail
  done() {
    const t = this.ctx.currentTime;
    [64, 68, 71, 75, 76].forEach((n, i) => {
      this.osc('triangle', midi(n + 12), t + i * 0.07, 0.28, 0.09);
      this.osc('square', midi(n), t + i * 0.07, 0.12, 0.035);
    });
    for (let i = 0; i < 7; i++) this.osc('square', rand(1200, 4200), t + 0.4 + i * 0.03, 0.018, 0.035);
  }

  alert() {
    const t = this.ctx.currentTime;
    for (let r = 0; r < 2; r++) {
      this.osc('square', 988, t + r * 0.28, 0.09, 0.07);
      this.osc('square', 740, t + r * 0.28 + 0.11, 0.11, 0.07);
    }
  }

  error() {
    const t = this.ctx.currentTime;
    const o = this.osc('sawtooth', 110, t, 0.32, 0.14);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.3);
    this.noiseBurst(t, 0.25, 0.15, 900, 200, 1.2);
    for (let i = 0; i < 5; i++) this.noiseBurst(t + 0.05 + i * 0.05, 0.02, 0.12, 4000, 4000, 10);
  }
}

// ===== util.js (les outils d'animation de Capri : attendre, tweens) =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 4),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
};
function tween(target, to, ms, easing = ease.out) {
  const from = {};
  for (const k of Object.keys(to)) from[k] = target[k];
  const start = performance.now();
  return new Promise((resolve) => {
    if (ms <= 0) { Object.assign(target, to); resolve(); return; }
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const e = easing(t);
      for (const k of Object.keys(to)) target[k] = from[k] + (to[k] - from[k]) * e;
      if (t < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
}
