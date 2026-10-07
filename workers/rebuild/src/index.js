// Nightly cron: pings the Cloudflare Pages deploy hook, which rebuilds the
// site and pulls fresh events from every group's feed.
export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(rebuild(env));
  },
};

async function rebuild(env) {
  const res = await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' });
  if (!res.ok) throw new Error(`Deploy hook returned ${res.status}: ${await res.text()}`);
  console.log('Rebuild triggered');
}
