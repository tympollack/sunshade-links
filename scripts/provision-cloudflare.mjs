#!/usr/bin/env node

/**
 * Idempotent provisioning script for SunShade Links Cloudflare infrastructure:
 * - Validates API Token and Account permissions upfront
 * - KV Namespaces (LINKS_KV)
 * - Cloudflare Queues (links-telemetry-queue)
 * - Cloudflare Pages project (sunshade-links) & custom domains
 * - Worker service & custom domain attachments (links.sunshade.icu & links-stag.sunshade.icu)
 * - Proxied DNS CNAME records in the sunshade.icu zone
 *
 * Required environment variables:
 *   CLOUDFLARE_API_TOKEN   - Cloudflare API token with Pages, Workers, KV, Queues & DNS permissions
 *   CLOUDFLARE_ACCOUNT_ID  - Cloudflare Account ID
 *
 * Optional environment variables:
 *   CLOUDFLARE_ZONE_ID     - Zone ID for sunshade.icu (auto-discovered if omitted)
 */

const CF_API = 'https://api.cloudflare.com/client/v4';
const PAGES_PROJECT_NAME = 'sunshade-links';
const WORKER_SERVICE_PROD = 'sunshade-links';
const WORKER_SERVICE_STAG = 'sunshade-links-stag';
const PRODUCTION_DOMAIN = 'links.sunshade.icu';
const STAGING_DOMAIN = 'links-stag.sunshade.icu';
const ROOT_ZONE = 'sunshade.icu';

const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();

if (!apiToken || !accountId) {
  console.error('Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set.');
  console.error('Export both variables and re-run: node scripts/provision-cloudflare.mjs');
  process.exitCode = 1;
  process.exit(1);
}

async function cfRequest(path, options = {}) {
  const res = await fetch(`${CF_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok && payload.success, status: res.status, payload };
}

function parseErrorMessage(payload, defaultMsg) {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    return payload.errors.map((e) => `[${e.code || 'error'}] ${e.message}`).join(', ');
  }
  return defaultMsg;
}

async function verifyAuth() {
  console.log('[cf:provision] Verifying Cloudflare API token credentials...');

  // 1. Try Account Token verification (for Account-Owned API Tokens: Manage account > Account API tokens)
  let verify = await cfRequest(`/accounts/${accountId}/tokens/verify`);

  // 2. Fallback to User Token verification (for User API Tokens: My Profile > API Tokens)
  if (!verify.ok) {
    const userVerify = await cfRequest('/user/tokens/verify');
    if (userVerify.ok) {
      verify = userVerify;
    }
  }

  // 3. Fallback to direct resource check in case token lacks Tokens:Read self-inspection permission
  if (!verify.ok) {
    const kvCheck = await cfRequest(`/accounts/${accountId}/storage/kv/namespaces?per_page=1`);
    if (kvCheck.ok) {
      console.log(`[cf:provision] API Token validated via direct Account KV access.`);
      return;
    }

    const pagesCheck = await cfRequest(`/accounts/${accountId}/pages/projects?per_page=1`);
    if (pagesCheck.ok) {
      console.log(`[cf:provision] API Token validated via direct Account Pages access.`);
      return;
    }

    const detail = parseErrorMessage(verify.payload, `HTTP ${verify.status}`);
    throw new Error(
      `API Token verification failed: ${detail}.\n` +
      `  -> Ensure you clicked the blue "Update token" button in Cloudflare Dashboard to save your changes.\n` +
      `  -> If Cloudflare rolled or generated a new token secret, ensure $env:CLOUDFLARE_API_TOKEN is set to the new secret.\n` +
      `  -> Check that CLOUDFLARE_ACCOUNT_ID is correct and matches your Cloudflare account.`
    );
  }

  console.log(`[cf:provision] API Token verified (status: ${verify.payload.result?.status || 'active'}).`);
}

async function resolveZoneId() {
  if (process.env.CLOUDFLARE_ZONE_ID) return process.env.CLOUDFLARE_ZONE_ID.trim();

  const zones = await cfRequest(`/zones?name=${encodeURIComponent(ROOT_ZONE)}`);
  if (!zones.ok) {
    const detail = parseErrorMessage(zones.payload, `HTTP ${zones.status}`);
    throw new Error(
      `Failed to list zones for "${ROOT_ZONE}": ${detail}.\n` +
      `  -> Ensure token has "Zone > Zone > Read" permission, or set CLOUDFLARE_ZONE_ID explicitly.`
    );
  }

  const zone = Array.isArray(zones.payload.result) ? zones.payload.result[0] : null;
  if (!zone) {
    throw new Error(`Could not find zone "${ROOT_ZONE}" in your Cloudflare account. Set CLOUDFLARE_ZONE_ID explicitly.`);
  }
  return zone.id;
}

async function ensureKvNamespace(title) {
  const list = await cfRequest(`/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
  if (!list.ok) {
    const detail = parseErrorMessage(list.payload, `HTTP ${list.status}`);
    throw new Error(
      `Failed to list KV namespaces: ${detail}.\n` +
      `  -> Ensure token has "Account > Workers KV Storage > Edit" permission.`
    );
  }

  const existing = Array.isArray(list.payload.result)
    ? list.payload.result.find((ns) => ns.title === title)
    : null;

  if (existing) {
    console.log(`[cf:provision] KV namespace "${title}" already exists (ID: ${existing.id}).`);
    return existing;
  }

  const created = await cfRequest(`/accounts/${accountId}/storage/kv/namespaces`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

  if (!created.ok) {
    const detail = parseErrorMessage(created.payload, `HTTP ${created.status}`);
    throw new Error(
      `Failed to create KV namespace "${title}": ${detail}.\n` +
      `  -> Ensure token has "Account > Workers KV Storage > Edit" permission.`
    );
  }

  console.log(`[cf:provision] Created KV namespace "${title}" (ID: ${created.payload.result.id}).`);
  return created.payload.result;
}

async function ensureQueue(queueName) {
  const list = await cfRequest(`/accounts/${accountId}/queues`);
  if (!list.ok) {
    const detail = parseErrorMessage(list.payload, `HTTP ${list.status}`);
    throw new Error(
      `Failed to list Queues: ${detail}.\n` +
      `  -> Ensure token has "Account > Workers Queues > Edit" permission.`
    );
  }

  const existing = Array.isArray(list.payload.result)
    ? list.payload.result.find((q) => q.queue_name === queueName)
    : null;

  if (existing) {
    console.log(`[cf:provision] Queue "${queueName}" already exists (ID: ${existing.queue_id || existing.id}).`);
    return existing;
  }

  const created = await cfRequest(`/accounts/${accountId}/queues`, {
    method: 'POST',
    body: JSON.stringify({ queue_name: queueName }),
  });

  if (!created.ok) {
    const detail = parseErrorMessage(created.payload, `HTTP ${created.status}`);
    throw new Error(
      `Failed to create Queue "${queueName}": ${detail}.\n` +
      `  -> Ensure token has "Account > Workers Queues > Edit" permission.`
    );
  }

  console.log(`[cf:provision] Created Queue "${queueName}" (ID: ${created.payload.result.queue_id || created.payload.result.id}).`);
  return created.payload.result;
}

async function ensurePagesProject(projectName) {
  const existing = await cfRequest(`/accounts/${accountId}/pages/projects/${projectName}`);
  if (existing.ok) {
    console.log(`[cf:provision] Pages project "${projectName}" already exists.`);
    return existing.payload.result;
  }

  const created = await cfRequest(`/accounts/${accountId}/pages/projects`, {
    method: 'POST',
    body: JSON.stringify({
      name: projectName,
      production_branch: 'main',
    }),
  });

  if (!created.ok) {
    const detail = parseErrorMessage(created.payload, `HTTP ${created.status}`);
    throw new Error(
      `Failed to create Pages project "${projectName}": ${detail}.\n` +
      `  -> Ensure token has "Account > Cloudflare Pages > Edit" permission.`
    );
  }

  console.log(`[cf:provision] Created Pages project "${projectName}".`);
  return created.payload.result;
}

async function ensurePagesDomain(projectName, domainName) {
  const list = await cfRequest(`/accounts/${accountId}/pages/projects/${projectName}/domains`);
  const existing = list.ok && Array.isArray(list.payload.result)
    ? list.payload.result.find((d) => d.name === domainName)
    : null;

  if (existing) {
    console.log(`[cf:provision] Custom domain "${domainName}" is already bound to Pages "${projectName}" (status: ${existing.status}).`);
    return;
  }

  const added = await cfRequest(`/accounts/${accountId}/pages/projects/${projectName}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: domainName }),
  });

  if (!added.ok) {
    console.log(`[cf:provision] Pages domain "${domainName}" status: ${added.payload.errors?.[0]?.message || added.status}`);
    return;
  }

  console.log(`[cf:provision] Bound custom domain "${domainName}" to Pages "${projectName}".`);
}

async function ensureWorkerDomain(hostname, serviceName, environment, zoneId) {
  const list = await cfRequest(`/accounts/${accountId}/workers/domains`);
  const existing = list.ok && Array.isArray(list.payload.result)
    ? list.payload.result.find((d) => d.hostname === hostname)
    : null;

  if (existing) {
    console.log(`[cf:provision] Worker custom domain "${hostname}" is already bound to service "${existing.service}" (${existing.environment || 'production'}).`);
    return;
  }

  const res = await cfRequest(`/accounts/${accountId}/workers/domains`, {
    method: 'PUT',
    body: JSON.stringify({
      hostname,
      service: serviceName,
      environment,
      zone_id: zoneId,
      enabled: true,
    }),
  });

  if (res.ok) {
    console.log(`[cf:provision] Attached Worker custom domain "${hostname}" to service "${serviceName}".`);
  } else {
    console.log(`[cf:provision] Worker custom domain attachment for "${hostname}" note: ${res.payload.errors?.[0]?.message || 'will bind upon initial worker deploy'}.`);
  }
}

async function upsertCnameRecord(zoneId, hostname, target) {
  const list = await cfRequest(
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`
  );
  if (!list.ok) {
    const detail = parseErrorMessage(list.payload, `HTTP ${list.status}`);
    throw new Error(
      `Failed to query DNS records for "${hostname}": ${detail}.\n` +
      `  -> Ensure token has "Zone > DNS > Edit" permission.`
    );
  }

  const existing = Array.isArray(list.payload.result) ? list.payload.result[0] : null;

  const body = {
    type: 'CNAME',
    name: hostname,
    content: target,
    proxied: true,
    ttl: 1,
  };

  if (existing) {
    if (existing.content === target && existing.proxied === true) {
      console.log(`[cf:provision] DNS CNAME ${hostname} -> ${target} already configured.`);
      return;
    }
    const updated = await cfRequest(`/zones/${zoneId}/dns_records/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!updated.ok) {
      const detail = parseErrorMessage(updated.payload, `HTTP ${updated.status}`);
      throw new Error(`Failed to update DNS record ${hostname}: ${detail}`);
    }
    console.log(`[cf:provision] Updated DNS CNAME ${hostname} -> ${target}.`);
    return;
  }

  const created = await cfRequest(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!created.ok) {
    const detail = parseErrorMessage(created.payload, `HTTP ${created.status}`);
    throw new Error(`Failed to create DNS record ${hostname}: ${detail}`);
  }
  console.log(`[cf:provision] Created DNS CNAME ${hostname} -> ${target}.`);
}

async function main() {
  console.log('[cf:provision] Starting SunShade Links Cloudflare provisioning...');

  // 1. Verify API Token & Account access
  await verifyAuth();

  // 2. Provision KV Namespaces
  const kvProd = await ensureKvNamespace('LINKS_KV');
  const kvStag = await ensureKvNamespace('LINKS_KV_STAGING');
  console.log(`[cf:provision] KV Namespaces confirmed: LINKS_KV=${kvProd.id}, LINKS_KV_STAGING=${kvStag.id}`);

  // 3. Provision Telemetry Queues
  const qMain = await ensureQueue('links-telemetry-queue');
  const qStag = await ensureQueue('links-telemetry-queue-staging');
  const qProd = await ensureQueue('links-telemetry-queue-prod');
  console.log(`[cf:provision] Queues confirmed: links-telemetry-queue=${qMain.queue_id || qMain.id}`);

  // 4. Provision Cloudflare Pages Project & Custom Domains
  await ensurePagesProject(PAGES_PROJECT_NAME);
  await ensurePagesDomain(PAGES_PROJECT_NAME, PRODUCTION_DOMAIN);
  await ensurePagesDomain(PAGES_PROJECT_NAME, STAGING_DOMAIN);

  // 5. Resolve Cloudflare Zone
  const zoneId = await resolveZoneId();
  console.log(`[cf:provision] Resolved zone "${ROOT_ZONE}" (ID: ${zoneId}).`);

  // 6. Worker Custom Domains & Proxied DNS CNAMEs
  await ensureWorkerDomain(PRODUCTION_DOMAIN, WORKER_SERVICE_PROD, 'production', zoneId);
  await ensureWorkerDomain(STAGING_DOMAIN, WORKER_SERVICE_STAG, 'staging', zoneId);

  await upsertCnameRecord(zoneId, PRODUCTION_DOMAIN, `${PAGES_PROJECT_NAME}.pages.dev`);
  await upsertCnameRecord(zoneId, STAGING_DOMAIN, `staging.${PAGES_PROJECT_NAME}.pages.dev`);

  console.log('[cf:provision] SunShade Links Cloudflare infrastructure successfully provisioned.');
}

main().catch((err) => {
  console.error(`[cf:provision] Provisioning failed:\n${err.message}`);
  process.exitCode = 1;
});
