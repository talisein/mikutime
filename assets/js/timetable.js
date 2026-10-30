// Renders the upcoming-show timetable from concert-data.39music.dance.
// See https://concert-data.39music.dance/ for the events.json and
// concerts.json schemas.

import { SERIES, esc, getJSON } from "./concert-data.js";

// Intl only gives "GMT+9" for these in English locales.
const ABBR = { "Asia/Tokyo": "JST", "Asia/Seoul": "KST" };

const cityName = (tz) => tz.split("/").pop().replace(/_/g, " ");

function zoneAbbr(tz, unix) {
  if (ABBR[tz]) return ABBR[tz];
  let abbr;
  for (const locale of ["en-US", "en-GB"]) {
    abbr = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date(unix * 1000))
      .find((p) => p.type === "timeZoneName").value;
    if (!abbr.startsWith("GMT+") && !abbr.startsWith("GMT-")) break;
  }
  return abbr;
}

const formatters = {};
function parts(unix, tz) {
  const fmt = (formatters[tz] ??= new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }));
  const p = {};
  for (const { type, value } of fmt.formatToParts(new Date(unix * 1000))) p[type] = value;
  return p;
}

// Weekday is italicized when the date differs from the venue's, like the
// old tables did.
function timeCell(unix, tz, venueTz, cls) {
  const p = parts(unix, tz);
  const v = parts(unix, venueTz);
  const sameDay = p.year === v.year && p.month === v.month && p.day === v.day;
  const weekday = sameDay ? p.weekday : `<em>${p.weekday}</em>`;
  return `<td class="${cls}">${weekday}&nbsp;${p.day}&nbsp;${p.month} ${p.hour}:${p.minute}&nbsp;${p.dayPeriod}</td>`;
}

const gcalTime = (unix) =>
  new Date(unix * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function calendarLink(ev, title) {
  const q = new URLSearchParams({
    text: title,
    dates: `${gcalTime(ev.start_unix)}/${gcalTime(ev.start_unix + ev.duration_minutes * 60)}`,
    ctz: ev.tz,
  });
  if (ev.location_name) q.set("location", ev.location_name);
  return `https://calendar.google.com/calendar/u/0/r/eventedit?${q}`;
}

function tourLabel(tour, concert) {
  const m = /^[A-Za-z]+(\d{4})([A-Z]*)$/.exec(tour);
  const series = concert && SERIES[concert.series];
  if (m && series) return [series, m[2], m[1]].filter(Boolean).join(" ");
  return (concert && concert.tour_display) || tour;
}

const expired = (ev, now) => now > ev.start_unix + ev.duration_minutes * 60;

// Shown when nothing is scheduled: midnight 31 August in Japan.
function birthday(now) {
  let year = new Date(now * 1000).getUTCFullYear();
  let ev;
  do {
    ev = {
      start_unix: Date.UTC(year, 7, 30, 15) / 1000,
      duration_minutes: 24 * 60,
      tz: "Asia/Tokyo",
      location_name: "Miku's Birthday",
    };
    year++;
  } while (expired(ev, now));
  const label = `Miku's Birthday ${year - 1}`;
  return { id: "birthday", label, name: label, events: [ev] };
}

function buildTours(events, concerts, now) {
  const byTour = new Map();
  for (const ev of events) {
    if (!byTour.has(ev.tour)) byTour.set(ev.tour, []);
    byTour.get(ev.tour).push(ev);
  }
  const tours = [];
  for (const [id, evs] of byTour) {
    evs.sort((a, b) => a.start_unix - b.start_unix);
    const upcoming = evs.find((ev) => !expired(ev, now));
    if (!upcoming) continue;
    const concert = concerts.get(id);
    tours.push({
      id,
      label: tourLabel(id, concert),
      name: (concert && concert.name) || id,
      events: evs,
      sortKey: upcoming.start_unix,
    });
  }
  tours.sort((a, b) => a.sortKey - b.sortKey);
  if (!tours.length) tours.push(birthday(now));
  return tours;
}

function renderTable(tour, now) {
  const first = tour.events[0];
  const venueTz = first.tz;
  const youTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const head = (label, tz, cls) =>
    `<th class="${cls}">${esc(label)}<br><small>${esc(zoneAbbr(tz, first.start_unix))}</small></th>`;

  // Venue zones can change within a tour, so the venue header names none.
  const sameVenueTz = tour.events.every((ev) => ev.tz === venueTz);
  let html = `<p class="tt-name">${esc(tour.name)}</p><table><thead><tr><th>Show</th>`;
  html += sameVenueTz ? head("Venue", venueTz, "venue") : `<th class="venue">Venue<br><small>local</small></th>`;
  html += head(`You (${cityName(youTz)})`, youTz, "you");
  html += `<th class="discord">Discord</th></tr></thead><tbody>`;

  for (const ev of tour.events) {
    const cls = expired(ev, now) ? "past" : "";
    let venue = ev.location_link
      ? `<a href="${esc(ev.location_link)}">${esc(ev.location_name)}</a>`
      : esc(ev.location_name);
    if (ev.city) venue = `${esc(ev.city)} (${venue})`;
    const code = `<t:${ev.start_unix}:F>`;
    html += `<tr class="${cls}"><td>${venue}<br><small><a href="${esc(calendarLink(ev, tour.name))}">Calendar</a></small></td>`;
    html += timeCell(ev.start_unix, ev.tz, ev.tz, "venue");
    html += timeCell(ev.start_unix, youTz, ev.tz, "you");
    html += `<td class="discord"><button type="button" data-copy="${esc(code)}" title="Copy"><code>${esc(code)}</code></button></td></tr>`;
  }
  return html + "</tbody></table>";
}

function render(root, tours, now) {
  const bar = root.querySelector(".tt-tours");
  const body = root.querySelector(".tt-body");

  function select(id) {
    const tour = tours.find((t) => t.id === id) || tours[0];
    for (const b of bar.children) b.setAttribute("aria-selected", b.dataset.tour === tour.id);
    body.innerHTML = renderTable(tour, now);
    return tour;
  }

  bar.innerHTML = tours
    .map((t) => `<button type="button" role="tab" data-tour="${esc(t.id)}" title="${esc(t.name)}">${esc(t.label)}</button>`)
    .join("");
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tour]");
    if (!b) return;
    const tour = select(b.dataset.tour);
    history.replaceState(null, "", `#${tour.id}`);
  });
  body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b || !navigator.clipboard) return;
    navigator.clipboard.writeText(b.dataset.copy).then(() => {
      b.classList.add("copied");
      setTimeout(() => b.classList.remove("copied"), 1200);
    });
  });
  window.addEventListener("hashchange", () => select(location.hash.slice(1)));
  select(location.hash.slice(1));
}

async function load(root) {
  const src = root.dataset.src;
  // ?now=2026-11-13 previews the page as of another date.
  const override = Date.parse(new URLSearchParams(location.search).get("now"));
  const now = (Number.isNaN(override) ? Date.now() : override) / 1000;
  try {
    const [events, concerts] = await Promise.all([
      getJSON(src, "events.json"),
      // Only used for names; the table still works without it.
      getJSON(src, "concerts.json").catch(() => ({ data: [] })),
    ]);
    const byTour = new Map(concerts.data.map((c) => [c.tour, c]));
    render(root, buildTours(events.data, byTour, now), now);
  } catch (err) {
    console.error(err);
    root.querySelector(".tt-body").innerHTML =
      `<p>Couldn't load the schedule from <a href="${esc(src)}">${esc(src)}</a>.</p>`;
  }
}

document.querySelectorAll(".timetable").forEach(load);
