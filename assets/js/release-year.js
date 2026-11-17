// A bar chart of one concert's setlist by each song's original release year.
// The concert comes from the path (/setlists/release_year/ME2026EU, served
// by static/_redirects) or the hash (/setlists/release_year/#ME2026EU).

import { dateRange, esc, getJSON, langPicker, seriesLabel, songResolver, titleIn } from "./concert-data.js";

function wantedTour(base) {
  const path = decodeURIComponent(location.pathname);
  const rest = path.startsWith(base) ? path.slice(base.length).replace(/\/+$/, "") : "";
  return (rest || decodeURIComponent(location.hash.slice(1))).toLowerCase();
}

// { years: [{ year, songs: [song|entry...] }], undated: [...] }
function countYears(concert, resolve) {
  const byYear = new Map();
  const undated = [];
  for (const entry of concert.setlist) {
    const song = resolve(entry);
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
  let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Songs by release year">`;
  for (let v = 0; v <= max; v += step) {
    const y = yOf(v).toFixed(1);
    s += `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/>`;
    s += `<text class="tick" x="${ml - 8}" y="${(+y + 4).toFixed(1)}" text-anchor="end">${v}</text>`;
  }
  years.forEach(({ year, songs }, i) => {
    const n = songs.length;
    const cx = ml + slot * (i + 0.5);
    const x = cx - bw / 2;
    const tip = `${year}: ${plural(n)}\n` + songs.map((song) => titleIn(song, lang)).join("\n");
    s += `<g class="bar" tabindex="${n ? 0 : -1}" data-tip="${esc(tip)}">`;
    s += `<rect class="hit" x="${(cx - slot / 2).toFixed(1)}" y="${mt}" width="${slot.toFixed(1)}" height="${ph}"/>`;
    if (n) {
      const top = yOf(n), r = Math.min(4, mt + ph - top), base = mt + ph;
      // Rounded at the top, square on the baseline.
      s += `<path class="mark" d="M${x.toFixed(1)},${base} V${(top + r).toFixed(1)} Q${x.toFixed(1)},${top.toFixed(1)} ${(x + r).toFixed(1)},${top.toFixed(1)} H${(x + bw - r).toFixed(1)} Q${(x + bw).toFixed(1)},${top.toFixed(1)} ${(x + bw).toFixed(1)},${(top + r).toFixed(1)} V${base} Z"/>`;
      s += `<text class="val" x="${cx.toFixed(1)}" y="${(top - 6).toFixed(1)}" text-anchor="middle">${n}</text>`;
    }
    const label = short ? `’${String(year % 100).padStart(2, "0")}` : year;
    // Too narrow even for '08: label every other year.
    if (slot >= 24 || year % 2 === 0)
      s += `<text class="tick" x="${cx.toFixed(1)}" y="${mt + ph + 20}" text-anchor="middle">${label}</text>`;
    s += "</g>";
  });
  return s + `<line class="base" x1="${ml}" x2="${W - mr}" y1="${mt + ph}" y2="${mt + ph}"/></svg>`;
}

function renderConcert(root, concert, resolve, lang) {
  const { years, undated } = countYears(concert, resolve);
  const setlists = root.dataset.setlists;
  let html =
    `<h2>${esc(concert.name)}</h2>` +
    `<p class="muted">${dateRange(concert.date, concert.last_date)} · ${esc(seriesLabel(concert.series))}` +
    ` · <a href="${esc(setlists)}#${esc(concert.tour)}">Setlist</a></p>`;
  const width = root.querySelector(".data-body").clientWidth;
  html += years.length ? chartSVG(years, lang, width) : "<p>None of these songs has a known release date.</p>";
  if (undated.length)
    html += `<p class="muted">No release date: ${undated.map((s) => esc(titleIn(s, lang))).join(", ")}</p>`;
  html += "<details><summary>Table</summary><table><thead><tr><th>Year</th><th>Songs</th><th>Titles</th></tr></thead><tbody>";
  for (const { year, songs } of years)
    html += `<tr><td>${year}</td><td class="num">${songs.length}</td><td>${songs.map((s) => esc(titleIn(s, lang))).join(", ")}</td></tr>`;
  root.querySelector(".data-body").innerHTML = html + "</tbody></table></details>";
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

// One tooltip for every bar: hover on a mouse, tap to toggle on touch, focus
// on a keyboard.
function bindTooltip(root) {
  const tip = document.getElementById("chart-tip");
  let pinned = null;
  const show = (bar, x, y) => {
    const [head, ...rest] = bar.dataset.tip.split("\n");
    tip.replaceChildren(Object.assign(document.createElement("b"), { textContent: head }), rest.join("\n"));
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - r.width - 8))}px`;
    tip.style.top = `${Math.max(8, y - r.height - 10)}px`;
  };
  const hide = () => {
    tip.hidden = true;
    pinned = null;
  };
  root.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const bar = e.target.closest(".bar");
    if (bar) show(bar, e.clientX, e.clientY);
    else if (!pinned) tip.hidden = true;
  });
  root.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && !pinned && hide());
  root.addEventListener("click", (e) => {
    const bar = e.target.closest(".bar");
    if (!bar || bar === pinned) return hide();
    pinned = bar;
    show(bar, e.clientX, e.clientY);
  });
  root.addEventListener("focusin", (e) => {
    const bar = e.target.closest(".bar");
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    show(bar, r.left + r.width / 2, r.top);
  });
  root.addEventListener("focusout", hide);
  addEventListener("scroll", () => !tip.hidden && hide(), { passive: true });
}

async function load(root) {
  const src = root.dataset.src;
  try {
    const [songs, concerts] = await Promise.all([getJSON(src, "songs.json"), getJSON(src, "concerts.json")]);
    const list = concerts.data.filter((c) => c.setlist.length).sort((a, b) => b.date.localeCompare(a.date));
    const wanted = wantedTour(root.dataset.base);
    const concert = wanted && list.find((c) => c.tour.toLowerCase() === wanted);
    if (!concert) return renderIndex(root, list, wanted);
    document.title = `${concert.name} · ${document.title}`;
    const resolve = songResolver(songs.data);
    let lang;
    const draw = (l) => renderConcert(root, concert, resolve, (lang = l));
    draw(langPicker(root.querySelector(".lang-picker"), draw));
    // Redraw at the new width; phones rotating, windows resizing.
    let lastWidth = root.clientWidth;
    new ResizeObserver(() => {
      if (root.clientWidth === lastWidth) return;
      lastWidth = root.clientWidth;
      draw(lang);
    }).observe(root);
    bindTooltip(root);
  } catch (err) {
    console.error(err);
    root.querySelector(".data-body").innerHTML =
      `<p>Couldn't load the setlists from <a href="${esc(src)}">${esc(src)}</a>.</p>`;
  }
}

document.querySelectorAll(".release-years").forEach(load);
