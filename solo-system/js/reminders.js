/* ============================================================
   REMINDERS — web push, so a nudge arrives even when the app is closed.
   Needs: a player key (cloud save), VAPID keys on the server, and on iPhone
   the app added to the Home Screen (iOS 16.4+).
   ============================================================ */
import { store } from './store.js';

const b64 = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const isStandaloneIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window.navigator.standalone || matchMedia('(display-mode: standalone)').matches);

export function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('/sw.js');
}

async function post(body) {
  const r = await fetch('/api/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hunter-key': store.key },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Server said ${r.status}`);
  return j;
}

export async function status() {
  if (!supported()) return { ok: false, why: isStandaloneIOS() ? 'On iPhone, open the app from your Home Screen (Share → Add to Home Screen) first.' : 'This browser does not support notifications.' };
  if (!store.key) return { ok: false, why: 'Connect your player key under Sync & data first.' };
  try {
    const cfg = await (await fetch('/api/push')).json();
    if (!cfg.configured) return { ok: false, why: 'The server is not set up for reminders yet (see README).' };
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    return { ok: true, publicKey: cfg.publicKey, subscribed: !!sub && Notification.permission === 'granted', denied: Notification.permission === 'denied' };
  } catch (e) { return { ok: false, why: 'Could not reach the server.' }; }
}

/** Ask permission, subscribe this device, and send the chosen hours to the server. */
export async function enable(prefs) {
  const st = await status();
  if (!st.ok) throw new Error(st.why);
  if (st.denied) throw new Error('Notifications are blocked for this site. Allow them in your browser or phone settings.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permission was not granted.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(st.publicKey) });
  await post({ action: 'subscribe', sub: sub.toJSON(), tzo: new Date().getTimezoneOffset(), morning: prefs.morning, evening: prefs.evening });
}

export async function disable() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try { await post({ action: 'unsubscribe', endpoint: sub.endpoint }); } catch { /* the local unsubscribe below is what matters */ }
  await sub.unsubscribe();
}

/** Push changed hours (or a changed time zone) to the server. Silent if not subscribed. */
export async function sync(prefs) {
  try {
    if (!supported() || !store.key || !prefs.enabled || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await post({ action: 'subscribe', sub: sub.toJSON(), tzo: new Date().getTimezoneOffset(), morning: prefs.morning, evening: prefs.evening });
  } catch { /* try again next time */ }
}

export async function test() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) throw new Error('This device is not subscribed yet.');
  await post({ action: 'test', endpoint: sub.endpoint });
}
