// Helpers shared by the pages built from concert-data.39music.dance.
// See https://concert-data.39music.dance/ for the JSON schemas.

export const SERIES = {
  MIKU_EXPO: "Miku Expo",
  MAGICAL_MIRAI: "Magical Mirai",
  MIKU_WITH_YOU: "Miku With You",
  SNOW_MIKU: "Snow Miku",
  MIKUPA: "Mikupa",
  MIKUFES: "Miku FES",
  JAPAN_TOUR: "Japan Tour",
  GALAXY: "Galaxy Live",
};

// Unknown codes read as title case: MIKUSGIVINGS_DAY -> Mikusgivings Day.
export const seriesLabel = (code) =>
  SERIES[code] ||
  code.toLowerCase().replace(/(^|_)(\w)/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase());

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function getJSON(src, file) {
  return fetch(src + file).then((r) => {
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
    return r.json();
  });
}

// For substring matching: full-width forms, case and Latin accents are
// ignored, so "#kokoro" finds "＃Kokoro" and "ryo" finds "ryō". Kana voicing
// marks are outside U+0300-036F and survive.
export const fold = (s) =>
  s.normalize("NFKC").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");

// Maps a setlist entry to its songs.json entry.
export function songResolver(songs) {
  const byId = new Map();
  const byName = new Map();
  for (const song of songs) {
    if (song.vocadb_id) byId.set(song.vocadb_id, song);
    if (!byName.has(song.name)) byName.set(song.name, []);
    byName.get(song.name).push(song);
  }
  return (entry) =>
    byId.get(entry.song_vocadb_id) ||
    (byName.get(entry.song) || []).find((s) => !entry.producer || s.producer === entry.producer);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2025-08-01", "2025-08-31" -> "1–31 Aug 2025"
export function dateRange(first, last) {
  const [y1, m1, d1] = first.split("-").map(Number);
  if (!last || last === first) return `${d1} ${MONTHS[m1 - 1]} ${y1}`;
  const [y2, m2, d2] = last.split("-").map(Number);
  if (y1 !== y2) return `${d1} ${MONTHS[m1 - 1]} ${y1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  return `${d1}–${d2} ${MONTHS[m2 - 1]} ${y2}`;
}

export const LANGS = { en: "English", ja: "Japanese", romaji: "Romaji" };

// A song's title in the preferred language, falling back to English.
export function titleIn(song, lang) {
  if (lang === "ja") return song.jp_name || song.name;
  if (lang === "romaji") return song.romaji_name || song.name;
  return song.name;
}

// Fills el with language bubbles. Returns the remembered choice and calls
// onChange with each new one.
export function langPicker(el, onChange) {
  let lang = "en";
  try {
    lang = localStorage.getItem("titleLang") || lang;
  } catch {}
  if (!LANGS[lang]) lang = "en";
  el.innerHTML = Object.entries(LANGS)
    .map(([code, label]) => `<button type="button" data-lang="${code}" aria-pressed="${code === lang}">${label}</button>`)
    .join("");
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (!b || b.dataset.lang === lang) return;
    lang = b.dataset.lang;
    for (const other of el.children) other.setAttribute("aria-pressed", other === b);
    try {
      localStorage.setItem("titleLang", lang);
    } catch {}
    onChange(lang);
  });
  return lang;
}

// Keeps ?q= in the address bar in step with a search box. Waits for a
// pause in typing, so slow phones don't redraw on every key and Safari's
// limit of 100 replaceState calls per 30 seconds isn't hit.
export function bindQuery(input, onChange) {
  const clear = input.parentElement.querySelector(".search-clear");
  // Anything typed while the data loaded wins over ?q=.
  const q = new URLSearchParams(location.search).get("q");
  if (q && !input.value) input.value = q;
  let timer;

  function apply() {
    clearTimeout(timer);
    onChange(input.value);
    const url = new URL(location.href);
    if (input.value) url.searchParams.set("q", input.value);
    else url.searchParams.delete("q");
    try {
      history.replaceState(null, "", url);
    } catch {}
  }

  input.addEventListener("input", () => {
    clear.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(apply, 200);
  });
  clear.addEventListener("click", () => {
    input.value = "";
    clear.hidden = true;
    apply();
    input.focus();
  });
  clear.hidden = !input.value;
  onChange(input.value);
}
