// A bar chart of one concert's setlist by each song's original release year.
// The concert comes from the path (/setlists/release_year/ME2026EU, served
// by static/_redirects) or the hash (/setlists/release_year/#ME2026EU).

import { dateRange, esc, getJSON, langPicker, seriesLabel, songResolver, titleIn } from "./concert-data.js";

// Tour keys are plain ASCII, so neither part needs decoding (and a stray
// "%" can't throw).
function wantedTour(base) {
  const path = location.pathname;
  const rest = path.startsWith(base) ? path.slice(base.length).replace(/\/+$/, "") : "";
  return (rest || location.hash.slice(1)).toLowerCase();
}

// Counts songs, not performances: a song played twice counts once.
// { years: [{ year, songs: [...] }], undated: [...] }
function countYears(concert, resolve) {
  const byYear = new Map();
  const undated = [];
  const seen = new Set();
  for (const entry of concert.setlist) {
    const song = resolve(entry);
    const key = song || `${entry.song}\n${entry.producer || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const year = song && song.publish_date && Number(song.publish_date.slice(0, 4));
    if (!year) {
      undated.push(song || { name: entry.song });
      continue;
    }
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(song);
  }
  const years = [];
  if (byYear.size) {
    const keys = [...byYear.keys()];
    for (let y = Math.min(...keys); y <= Math.max(...keys); y++) years.push({ year: y, songs: byYear.get(y) || [] });
  }
  return { years, undated };
}

const plural = (n) => `${n} song${n === 1 ? "" : "s"}`;
const titles = (songs, lang) => songs.map((s) => titleIn(s, lang));

// Drawn at the container's own width, so text stays at its CSS size on a
// phone instead of shrinking with a fixed viewBox.
function chartSVG(years, lang, width) {
  const W = Math.max(280, Math.round(width)), H = Math.round(Math.min(320, Math.max(220, W * 0.5)));
  const ml = 28, mr = 4, mt = 20, mb = 32;
  const pw = W - ml - mr, ph = H - mt - mb;
  const max = Math.max(1, ...years.map((y) => y.songs.length));
  const step = max > 10 ? Math.ceil(max / 5) : 1;
  const slot = pw / years.length;
  const bw = Math.min(28, slot - 6);
  const yOf = (v) => mt + ph - (v / max) * ph;
  // Four-digit years need ~34px each; below that, '08.
  const short = slot < 34;
  let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Songs by release year">`;
  for (let v = 0; v <= max; v += step) {
    const y = yOf(v).toFixed(1);
    s += `<line class="grid" aria-hidden="true" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/>`;
    s += `<text class="tick" aria-hidden="true" x="${ml - 8}" y="${(+y + 4).toFixed(1)}" text-anchor="end">${v}</text>`;
  }
  years.forEach(({ year, songs }, i) => {
    const n = songs.length;
    const cx = ml + slot * (i + 0.5);
    const x = cx - bw / 2;
    const names = titles(songs, lang);
    const tip = [`${year}: ${plural(n)}`, ...names].join("\n");
    const label = `${year}: ${plural(n)}${n ? ". " + names.join(", ") : ""}`;
    // Empty years aren't tab stops; the hover still says "0 songs".
    s += `<g class="bar" role="img" aria-label="${esc(label)}" data-tip="${esc(tip)}"${n ? ' tabindex="0"' : ""}>`;
    s += `<rect class="hit" x="${(cx - slot / 2).toFixed(1)}" y="${mt}" width="${slot.toFixed(1)}" height="${ph}"/>`;
    if (n) {
      const top = yOf(n), r = Math.min(4, mt + ph - top), base = mt + ph;
      // Rounded at the top, square on the baseline.
      s += `<path class="mark" d="M${x.toFixed(1)},${base} V${(top + r).toFixed(1)} Q${x.toFixed(1)},${top.toFixed(1)} ${(x + r).toFixed(1)},${top.toFixed(1)} H${(x + bw - r).toFixed(1)} Q${(x + bw).toFixed(1)},${top.toFixed(1)} ${(x + bw).toFixed(1)},${(top + r).toFixed(1)} V${base} Z"/>`;
      s += `<text class="val" x="${cx.toFixed(1)}" y="${(top - 6).toFixed(1)}" text-anchor="middle">${n}</text>`;
    }
    const tick = short ? `’${String(year % 100).padStart(2, "0")}` : year;
    // Too narrow even for '08: label every other year.
    if (slot >= 24 || year % 2 === 0)
      s += `<text class="tick" x="${cx.toFixed(1)}" y="${mt + ph + 20}" text-anchor="middle">${tick}</text>`;
    s += "</g>";
  });
  return s + `<line class="base" aria-hidden="true" x1="${ml}" x2="${W - mr}" y1="${mt + ph}" y2="${mt + ph}"/></svg>`;
}

// One tooltip for every bar: hover with a mouse, tap to pin on touch (or
// click), keyboard focus. Returns hide(), for redraws.
function bindTooltip(root) {
  const tip = document.getElementById("chart-tip");
  let pinned = null;
  // Only keyboard focus shows a tip; a clicked bar is focused too, and
  // dismissing it by a second click must stick.
  const keyboardBar = () => {
    const el = document.activeElement;
    return el && root.contains(el) && el.matches(".bar:focus-visible") ? el : null;
  };
  const show = (bar, x, y) => {
    const [head, ...rest] = bar.dataset.tip.split("\n");
    tip.replaceChildren(Object.assign(document.createElement("b"), { textContent: head }), rest.join("\n"));
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - r.width - 8))}px`;
    tip.style.top = `${Math.max(8, y - r.height - 10)}px`;
  };
  const showAt = (bar) => {
    const r = bar.getBoundingClientRect();
    show(bar, r.left + r.width / 2, r.top);
  };
  const hide = () => {
    tip.hidden = true;
    pinned = null;
  };
  // Hover falls back to the pinned or keyboard-focused bar, if any.
  const settle = () => {
    const bar = pinned || keyboardBar();
    if (bar && bar.isConnected) showAt(bar);
    else hide();
  };

  root.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || pinned) return;
    const bar = e.target.closest(".bar");
    if (bar) show(bar, e.clientX, e.clientY);
    else settle();
  });
  root.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && settle());
  root.addEventListener("click", (e) => {
    const bar = e.target.closest(".bar");
    if (!bar || bar === pinned) return hide();
    pinned = bar;
    show(bar, e.clientX, e.clientY);
  });
  root.addEventListener("focusin", (e) => {
    const bar = e.target.closest(".bar");
    if (bar && bar.matches(":focus-visible")) {
      pinned = null;
      showAt(bar);
    }
  });
  root.addEventListener("focusout", (e) => {
    if (!root.contains(e.relatedTarget)) hide();
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && hide());
  // Tabbing to a bar can scroll it into view: follow it rather than hide.
  addEventListener(
    "scroll",
    () => {
      if (tip.hidden) return;
      const bar = keyboardBar();
      if (bar) showAt(bar);
      else hide();
    },
    { passive: true },
  );
  return hide;
}

// The header and table are built once and only their text changes, so a
// language switch keeps the table open; a resize replaces only the chart.
function renderConcert(root, concert, resolve, initialLang) {
  const { years, undated } = countYears(concert, resolve);
  const body = root.querySelector(".data-body");
  body.innerHTML =
    `<h2>${esc(concert.name)}</h2>` +
    `<p class="muted">${dateRange(concert.date, concert.last_date)} · ${esc(seriesLabel(concert.series))}` +
    ` · <a href="${esc(root.dataset.setlists)}#${esc(concert.tour)}">Setlist</a></p>` +
    '<div class="chart-box"></div><p class="muted undated" hidden></p>' +
    "<details><summary>Table</summary><table><thead><tr><th>Year</th><th>Songs</th><th>Titles</th></tr></thead><tbody></tbody></table></details>";
  const box = body.querySelector(".chart-box");
  const undatedLine = body.querySelector(".undated");
  const tbody = body.querySelector("tbody");
  const hideTip = bindTooltip(root);
  let lang = initialLang;
  let drawnWidth = -1;

  function drawChart() {
    hideTip();
    drawnWidth = box.clientWidth;
    box.innerHTML = years.length
      ? chartSVG(years, lang, drawnWidth)
      : "<p>None of these songs has a known release date.</p>";
  }

  function drawText() {
    undatedLine.hidden = !undated.length;
    undatedLine.textContent = `No release date: ${titles(undated, lang).join(", ")}`;
    tbody.innerHTML = years
      .map(({ year, songs }) =>
        `<tr><td>${year}</td><td class="num">${songs.length}</td><td>${esc(titles(songs, lang).join(", "))}</td></tr>`)
      .join("");
  }

  drawChart();
  drawText();

  // Redraw at the new width: phones rotating, windows resizing. Compared
  // against the width actually drawn, so a no-op resize never redraws.
  let frame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => box.clientWidth !== drawnWidth && drawChart());
  }).observe(box);

  return (l) => {
    lang = l;
    drawChart();
    drawText();
  };
}

function renderIndex(root, concerts, wanted) {
  const base = root.dataset.base;
  root.querySelector(".lang-row").hidden = true;
  root.querySelector(".data-body").innerHTML =
    (wanted ? `<p>No concert with a setlist is called “${esc(wanted)}”.</p>` : "") +
    "<ul>" +
    concerts
      .map((c) => `<li><a href="${esc(base + c.tour)}">${esc(c.name)}</a> <span class="muted">${dateRange(c.date, c.last_date)}</span></li>`)
      .join("") +
    "</ul>";
}

async function load(root) {
  const src = root.dataset.src;
  try {
    const [songs, concerts] = await Promise.all([getJSON(src, "songs.json"), getJSON(src, "concerts.json")]);
    const list = concerts.data.filter((c) => c.setlist.length).sort((a, b) => b.date.localeCompare(a.date));
    const wanted = wantedTour(root.dataset.base);
    const concert = wanted && list.find((c) => c.tour.toLowerCase() === wanted);
    // The page is drawn once; a new #TOUR means a fresh page.
    addEventListener("hashchange", () => location.reload());
    if (!concert) return renderIndex(root, list, wanted);
    document.title = `${concert.name} · ${document.title}`;
    const picker = root.querySelector(".lang-picker");
    let redraw = () => {};
    const lang = langPicker(picker, (l) => redraw(l));
    redraw = renderConcert(root, concert, songResolver(songs.data), lang);
  } catch (err) {
    console.error(err);
    root.querySelector(".data-body").innerHTML =
      `<p>Couldn't load the setlists from <a href="${esc(src)}">${esc(src)}</a>.</p>`;
  }
}

document.querySelectorAll(".release-years").forEach(load);
