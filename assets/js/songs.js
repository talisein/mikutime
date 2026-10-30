// Song search over songs.json, with the concerts each song was played at.

import { bindQuery, esc, fold, getJSON, langPicker, songResolver, titleIn } from "./concert-data.js";

function render(root, songs) {
  const input = root.querySelector("input");
  const count = root.querySelector(".data-count");
  const body = root.querySelector(".data-body");
  const setlists = root.dataset.setlists;
  const open = new Set();
  let shown = [];
  let lang = langPicker(root.querySelector(".lang-picker"), (l) => {
    lang = l;
    draw();
  });

  const detail = (song) => {
    if (!song.played.length) return "<p>Not in any setlist yet.</p>";
    const items = song.played.map(({ concert, remixes }) => {
      const remix = remixes.length ? ` <span class="muted">${esc(remixes.join(", "))}</span>` : "";
      return `<li><a href="${esc(setlists)}#${esc(concert.tour)}">${esc(concert.name)}</a>${remix}</li>`;
    });
    return `<ul>${items.join("")}</ul>`;
  };

  function draw() {
    let html =
      "<table><thead><tr><th>Title</th><th>Singers</th><th>Producer</th><th>Played</th><th>VocaDB</th></tr></thead><tbody>";
    const titled = shown.map((song) => [titleIn(song, lang), song]);
    titled.sort(([a], [b]) => a.localeCompare(b, lang === "ja" ? "ja" : "en"));
    for (const [title, song] of titled) {
      const isOpen = open.has(song);
      const minor = song.minor_roles ? ` <span class="muted">(${esc(song.minor_roles.join(", "))})</span>` : "";
      const disambiguation = song.disambiguation ? ` <span class="muted">${esc(song.disambiguation)}</span>` : "";
      const vocadb = song.vocadb_id ? `<a href="https://vocadb.net/S/${esc(song.vocadb_id)}">${esc(song.vocadb_id)}</a>` : "";
      html += `<tr><td><button type="button" class="linkish" data-i="${song.i}" aria-expanded="${isOpen}">${esc(title)}</button>${disambiguation}</td>`;
      html += `<td>${esc(song.singers.join(", "))}${minor}</td><td>${esc(song.producer)}</td>`;
      html += `<td class="num">${song.played.length}</td><td>${vocadb}</td></tr>`;
      if (isOpen) html += `<tr class="song-detail"><td colspan="5">${detail(song)}</td></tr>`;
    }
    body.innerHTML = html + "</tbody></table>";
  }

  body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    const song = songs[b.dataset.i];
    if (open.has(song)) open.delete(song);
    else open.add(song);
    draw();
  });

  bindQuery(input, (q) => {
    const needle = fold(q.trim());
    shown = songs.filter((s) => s.haystack.includes(needle));
    count.textContent = needle ? `${shown.length} of ${songs.length} songs` : `${songs.length} songs`;
    draw();
  });
}

async function load(root) {
  const src = root.dataset.src;
  try {
    const [songs, concerts] = await Promise.all([getJSON(src, "songs.json"), getJSON(src, "concerts.json")]);
    const list = songs.data
      .map((song) => ({
        ...song,
        haystack: fold([song.name, song.romaji_name, song.jp_name].filter(Boolean).join("\n")),
        played: [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((song, i) => (song.i = i));

    const resolve = songResolver(list);
    const newestFirst = [...concerts.data].sort((a, b) => b.date.localeCompare(a.date));
    for (const concert of newestFirst) {
      const seen = new Map();
      for (const entry of concert.setlist) {
        const song = resolve(entry);
        if (!song) continue;
        if (!seen.has(song)) {
          seen.set(song, { concert, remixes: [] });
          song.played.push(seen.get(song));
        }
        if (entry.remix) seen.get(song).remixes.push(entry.remix);
      }
    }
    render(root, list);
  } catch (err) {
    console.error(err);
    root.querySelector(".data-body").innerHTML =
      `<p>Couldn't load the songs from <a href="${esc(src)}">${esc(src)}</a>.</p>`;
  }
}

document.querySelectorAll(".songs").forEach(load);
