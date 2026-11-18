"use strict";

// Generate a small PCM WAV locally: three short tones, with a fade to avoid clicks.
function errorTone() {
  const rate = 16000;
  const duration = 0.85;
  const samples = Math.round(rate * duration);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples * 2, true);
  const tones = [[0, 0.16, 880], [0.25, 0.16, 660], [0.50, 0.25, 880]];
  for (let index = 0; index < samples; index++) {
    const time = index / rate;
    let value = 0;
    for (const [start, length, frequency] of tones) {
      const elapsed = time - start;
      if (elapsed >= 0 && elapsed < length) {
        const fade = Math.min(1, elapsed / 0.008, (length - elapsed) / 0.008);
        value = Math.sin(2 * Math.PI * frequency * elapsed) * fade * 0.24;
      }
    }
    view.setInt16(44 + index * 2, Math.round(value * 32767), true);
  }
  return "data:audio/wav;base64," + btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

const tone = errorTone();
const played = new Map();
let playback = Promise.resolve();
function enqueueSound(eventId) {
  if (played.has(eventId)) return played.get(eventId);
  let resolveStarted;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  played.set(eventId, started);
  if (played.size > 64) played.delete(played.keys().next().value);
  playback = playback.catch(() => {}).then(async () => {
    let audio;
    let timer;
    try {
      audio = new Audio(tone);
      const ended = new Promise((resolve) => {
        audio.addEventListener("ended", resolve, { once: true });
        audio.addEventListener("error", resolve, { once: true });
      });
      const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Audio timeout")), 2500);
      });
      await Promise.race([audio.play(), timeout]);
      resolveStarted({ ok: true, started: true });
      await Promise.race([ended, timeout]);
    } catch { resolveStarted({ ok: false, started: false }); }
    finally {
      clearTimeout(timer);
      if (audio) audio.pause();
    }
  });
  return started;
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const fromWorker = sender.id === chrome.runtime.id && !sender.tab &&
    (!sender.url || sender.url === chrome.runtime.getURL("background.js"));
  if (!fromWorker || message?.app !== "fb-unsave-all" || message.target !== "error-audio" ||
      message.type !== "play" || typeof message.eventId !== "string" || !message.eventId || message.eventId.length > 100) return false;
  enqueueSound(message.eventId).then(reply);
  return true;
});
