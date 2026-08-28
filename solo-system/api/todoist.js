/**
 * GET /api/todoist
 * Header: x-todoist-token: <personal API token>
 *
 * Fetches the hunter's active (uncompleted) Todoist tasks and normalizes them
 * to the same shape /api/ics returns, so the client can merge both sources
 * with one code path.
 *
 * The token travels as a header, never a query string, since Vercel logs
 * query strings and a Todoist token grants write access to the account —
 * more sensitive than a Schoology calendar link.
 */

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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const token = req.headers['x-todoist-token'] || '';
  if (!token) return res.status(400).json({ error: 'No Todoist token supplied.' });

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  try {
    const [taskRes, projRes] = await Promise.all([
      fetch('https://api.todoist.com/rest/v2/tasks', auth),
      fetch('https://api.todoist.com/rest/v2/projects', auth),
    ]);

    if (taskRes.status === 401 || taskRes.status === 403) {
      return res.status(401).json({ error: 'Todoist rejected that token. Copy a fresh one from Settings \u2192 Integrations \u2192 Developer.' });
    }
    if (!taskRes.ok) {
      return res.status(502).json({ error: `Todoist returned ${taskRes.status}.` });
    }

    const tasks = await taskRes.json();
    const projects = projRes.ok ? await projRes.json() : [];
    const projects_ = projectMap(projects);

    const events = tasks.map((t) => {
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
