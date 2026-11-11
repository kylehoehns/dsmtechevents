// Cloudflare's cron (wrangler.jsonc "triggers") starts the event refresh.
// GitHub's own schedule drops runs under load, the early-morning one most;
// Cloudflare's fires on time. The Worker only asks GitHub to run
// refresh.yml, the same as `gh workflow run refresh.yml`: the fetch and the
// push stay on GitHub.
//
// It signs in as a GitHub App ("dsmtechevents refresh") that can do two
// things on this repo: start workflows (Actions: write) and open issues
// (Issues: write). Its client ID and private key are the Worker secrets
// REFRESH_APP_CLIENT_ID and REFRESH_APP_KEY. Each run trades the key for a
// token that lasts an hour, so there is no long-lived token to expire.
//
// When GitHub refuses the run, the App opens one "Refresh trigger broken"
// issue (reused while it stays broken) and closes it once a run is accepted.
// If the App can't sign in at all, it can't open an issue either: that
// failure is thrown, so it shows in the Worker's logs, and GitHub's own
// schedule keeps the refresh going meanwhile.
const API = 'https://api.github.com';
const REPO = 'kylehoehns/dsmtechevents';
const TITLE = 'Refresh trigger broken';

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text = (s) => new TextEncoder().encode(s);

// A JWT signed with the App's key, which GitHub trades for a token. The key
// must be PKCS#8 ("BEGIN PRIVATE KEY"); GitHub hands out PKCS#1 ("BEGIN RSA
// PRIVATE KEY"), which `openssl pkcs8 -topk8 -nocrypt -in app.pem` converts.
async function appJwt(clientId, pem, now = Date.now()) {
  if (pem.includes('BEGIN RSA PRIVATE KEY')) throw new Error('REFRESH_APP_KEY is PKCS#1; convert it with `openssl pkcs8 -topk8 -nocrypt -in app.pem`');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sec = Math.floor(now / 1000);
  // Backdated a minute for clock drift; GitHub allows at most ten minutes.
  const body = `${b64url(text(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.${b64url(text(JSON.stringify({ iat: sec - 60, exp: sec + 540, iss: clientId })))}`;
  return `${body}.${b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, text(body)))}`;
}

async function github(path, auth, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${auth}`, Accept: 'application/vnd.github+json', 'User-Agent': 'dsmtechevents-worker', 'X-GitHub-Api-Version': '2022-11-28' },
    body: init.body && JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export async function startRefresh(env) {
  if (!env.REFRESH_APP_CLIENT_ID || !env.REFRESH_APP_KEY) throw new Error('REFRESH_APP_CLIENT_ID and REFRESH_APP_KEY must be set');
  const jwt = await appJwt(env.REFRESH_APP_CLIENT_ID, env.REFRESH_APP_KEY);
  const { id } = await github(`/repos/${REPO}/installation`, jwt);
  const { token } = await github(`/app/installations/${id}/access_tokens`, jwt, { method: 'POST' });
  // The REST list, not search, which can miss an issue opened seconds ago.
  const open = (await github(`/repos/${REPO}/issues?state=open&per_page=100`, token)).find((i) => !i.pull_request && i.title === TITLE);
  try {
    await github(`/repos/${REPO}/actions/workflows/refresh.yml/dispatches`, token, { method: 'POST', body: { ref: 'main' } });
  } catch (err) {
    const body = `Cloudflare's cron asked GitHub to run refresh.yml and GitHub refused:\n\n\`\`\`\n${err.message}\n\`\`\`\n\nGitHub's own schedule still runs the refresh, but it drops runs (most often the early-morning one). This issue closes itself once the cron's request is accepted again.`;
    if (open) await github(`/repos/${REPO}/issues/${open.number}/comments`, token, { method: 'POST', body: { body } });
    else await github(`/repos/${REPO}/issues`, token, { method: 'POST', body: { title: TITLE, body } });
    throw err;
  }
  if (open) {
    await github(`/repos/${REPO}/issues/${open.number}/comments`, token, { method: 'POST', body: { body: 'Fixed: the cron started a refresh.' } });
    await github(`/repos/${REPO}/issues/${open.number}`, token, { method: 'PATCH', body: { state: 'closed' } });
  }
}
