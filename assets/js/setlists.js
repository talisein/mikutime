// Every concert's setlist from concerts.json, newest first, with a filter.

import { bindQuery, dateRange, esc, fold, getJSON, langPicker, seriesLabel, songResolver, titleIn } from "./concert-data.js";

function setlistTable(concert, resolve, songsPage, lang) {
  let html =
    "<table><thead><tr><th>№</th><th>Title</th><th>Singer</th><th>Producer</th></tr></thead><tbody>";
  let lastPos;
  for (const entry of concert.setlist) {
    const song = resolve(entry) || { name: entry.song, producer: entry.producer || "", singers: [] };
    // Rotations repeat a position; number it once.
    const pos = entry.pos === lastPos ? "" : esc(String(entry.pos).padStart(2, "0"));
    lastPos = entry.pos;
    const extra = [entry.remix, entry.variant].filter(Boolean).map((s) => ` <span class="muted">${esc(s)}</span>`);
    const link = `${songsPage}?q=${encodeURIComponent(song.name)}`;
    html += `<tr><td class="num">${pos}</td><td><a href="${esc(link)}">${esc(titleIn(song, lang))}</a>${extra.join("")}</td>`;
    html += `<td>${esc(song.singers.join(", "))}</td><td>${esc(song.producer)}</td></tr>`;
  }
  return html + "</tbody></table>";
}

function render(root, concerts, resolve) {
  const input = root.querySelector("input");
  const count = root.querySelector(".data-count");
  const body = root.querySelector(".data-body");

  let sections = [];
  let tokens = [];

  function filter() {
    let n = 0;
    concerts.forEach((c, i) => {
      const match = tokens.every((t) => c.haystack.includes(t));
      sections[i].hidden = !match;
      if (match) n++;
    });
    count.textContent = tokens.length ? `${n} of ${concerts.length} concerts` : `${concerts.length} concerts`;
  }

  function draw(lang) {
    body.innerHTML = concerts
      .map(
        (c) =>
          `<section id="${esc(c.tour)}"><h2>${esc(c.name)}</h2>` +
          `<p class="muted">${dateRange(c.date, c.last_date)} · ${esc(seriesLabel(c.series))}</p>` +
          setlistTable(c, resolve, root.dataset.songs, lang) +
          "</section>",
      )
      .join("");
    sections = [...body.children];
    filter();
  }

  draw(langPicker(root.querySelector(".lang-picker"), draw));
  bindQuery(input, (q) => {
    tokens = fold(q).split(/\s+/).filter(Boolean);
    filter();
  });

  // The target didn't exist when the browser first looked for it. Tour
  // keys are plain ASCII, so the hash needs no decoding.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

async function load(root) {
  const src = root.dataset.src;
  try {
    const [songs, concerts] = await Promise.all([getJSON(src, "songs.json"), getJSON(src, "concerts.json")]);
    // Upcoming concerts are listed before their setlist is known; skip them.
    const list = concerts.data
      .filter((c) => c.setlist.length)
      .map((c) => ({
        ...c,
        haystack: fold(
          [c.name, c.tour, c.tour_display, seriesLabel(c.series), c.date.slice(0, 4), c.last_date && c.last_date.slice(0, 4)]
            .filter(Boolean)
            .join("\n"),
        ),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    render(root, list, songResolver(songs.data));
  } catch (err) {
    console.error(err);
    root.querySelector(".data-body").innerHTML =
      `<p>Couldn't load the setlists from <a href="${esc(src)}">${esc(src)}</a>.</p>`;
  }
}

document.querySelectorAll(".setlists").forEach(load);
