/**
 * GET /api/todoist
 * Header: x-todoist-token: <personal API token>
 *
 * Fetches the hunter's active (uncompleted) Todoist tasks and normalizes them
 * to the same shape /api/ics returns, so the client can merge both sources
 * with one code path.
 *
 * Todoist retired the old /rest/v2/ endpoints in February 2026 in favor of a
 * single unified /api/v1/ API. The task and project object fields (content,
 * project_id, due, priority, description) are unchanged — only the base URL
 * and the fact that list endpoints now come back cursor-paginated rather than
 * as a bare array.
 *
 * The token travels as a header, never a query string, since Vercel logs
 * query strings and a Todoist token grants write access to the account —
 * more sensitive than a Schoology calendar link.
 */

const BASE = 'https://api.todoist.com/api/v1';
const MAX_PAGES = 10;   // a personal account's open tasks fit in far fewer than this

function projectMap(projects) {
  const m = {};
  (projects || []).forEach((p) => { m[p.id] = p.name; });
  return m;
}

/** Todoist gives either a plain date or a full datetime; keep both cases distinct
 *  the same way the ICS parser does, so downstream day-math stays consistent. */
function normalizeDue(due) {
  if (!due) return { due: null, allDay: false };
  if (due.datetime) return { due: due.datetime, allDay: false };
  if (due.date) return { due: `${due.date}T23:59:00`, allDay: true };
  return { due: null, allDay: false };
}

/** The old API returned a bare array; the new one wraps it as { results, next_cursor }.
 *  Accept either shape so a future change on Todoist's side degrades gracefully
 *  instead of silently returning zero tasks. */
function itemsOf(body) {
  if (Array.isArray(body)) return { items: body, cursor: null };
  if (Array.isArray(body?.results)) return { items: body.results, cursor: body.next_cursor || null };
  if (Array.isArray(body?.data)) return { items: body.data, cursor: body.next_cursor || null };
  return { items: [], cursor: null };
}

/** Follows cursor pagination until Todoist stops sending one, capped so a
 *  misbehaving response can't loop forever. */
async function fetchAllPages(path, auth) {
  let all = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = cursor ? `${BASE}${path}?cursor=${encodeURIComponent(cursor)}` : `${BASE}${path}`;
    const r = await fetch(url, auth);
    if (!r.ok) return { ok: false, status: r.status };
    const body = await r.json();
    const { items, cursor: next } = itemsOf(body);
    all = all.concat(items);
    if (!next) return { ok: true, items: all };
    cursor = next;
  }
  return { ok: true, items: all };   // stopped at the page cap rather than looping forever
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const token = req.headers['x-todoist-token'] || '';
  if (!token) return res.status(400).json({ error: 'No Todoist token supplied.' });

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  try {
    const taskPage = await fetchAllPages('/tasks', auth);

    if (taskPage.status === 401 || taskPage.status === 403) {
      return res.status(401).json({ error: 'Todoist rejected that token. Copy a fresh one from Settings \u2192 Integrations \u2192 Developer.' });
    }
    if (taskPage.status === 410) {
      return res.status(502).json({ error: 'Todoist has retired this API endpoint again. This app needs an update \u2014 let whoever set it up know.' });
    }
    if (!taskPage.ok) {
      return res.status(502).json({ error: `Todoist returned ${taskPage.status}.` });
    }

    const projPage = await fetchAllPages('/projects', auth);
    const projects_ = projectMap(projPage.ok ? projPage.items : []);

    const events = taskPage.items.map((t) => {
      const { due, allDay } = normalizeDue(t.due);
      return {
        uid: `${t.id}`,
        title: t.content || 'Untitled task',
        course: projects_[t.project_id] || '',
        notes: (t.description || '').slice(0, 400),
        due,
        allDay,
        priority: t.priority || 1,   // 4 = Todoist's own "urgent", folded into ranking client-side
      };
    });

    return res.status(200).json({ count: events.length, events, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: `Could not reach Todoist: ${e.message}` });
  }
};
