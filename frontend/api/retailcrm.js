const readBodyText = async (req) => {
  if (req.body != null) {
    if (typeof req.body === "string") return req.body;
    try {
      return JSON.stringify(req.body);
    } catch {
      return "";
    }
  }

  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
};

const tryParseJson = (text) => {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const normalizeOrigin = (value) => String(value || "").trim().toLowerCase();

const isOriginAllowed = (origin, allowList) => {
  if (!allowList || !allowList.length) return true;
  const o = normalizeOrigin(origin);
  if (!o) return false;
  return allowList.some((a) => o === normalizeOrigin(a));
};

const pickAttribution = (payload) => {
  const a = payload && payload.attribution && typeof payload.attribution === "object" ? payload.attribution : {};
  const fields = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "yclid",
    "gclid",
    "fbclid",
    "ya_client_id",
  ];
  const out = {};
  for (const f of fields) {
    const v = a[f];
    if (typeof v === "string" && v.trim()) out[f] = v.trim();
  }
  return out;
};

const buildComment = (payload) => {
  const parts = [];
  if (payload && payload.event) parts.push(`event=${payload.event}`);
  if (payload && payload.pageUrl) parts.push(`url=${payload.pageUrl}`);
  if (payload && payload.referrer) parts.push(`ref=${payload.referrer}`);
  if (payload && payload.visitorId) parts.push(`visitorId=${payload.visitorId}`);

  const attribution = pickAttribution(payload);
  const attrKeys = Object.keys(attribution);
  if (attrKeys.length) {
    parts.push(
      `attribution=${attrKeys
        .map((k) => `${k}:${String(attribution[k]).replace(/\s+/g, " ")}`)
        .join(",")}`,
    );
  }

  return parts.join(" | ");
};

const retailcrmRequest = async ({ baseUrl, apiKey, path, bodyParams }) => {
  const url = `${String(baseUrl).replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-api-key": apiKey,
    },
    body: bodyParams.toString(),
  });
  const text = await res.text();
  let json = undefined;
  try {
    json = JSON.parse(text);
  } catch {}
  return { ok: res.ok, status: res.status, text, json };
};

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const allowOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const origin = req.headers.origin || req.headers.referer || "";
  if (!isOriginAllowed(origin, allowOrigins)) {
    res.status(403).json({ ok: false, error: "origin_not_allowed" });
    return;
  }

  const raw = await readBodyText(req);
  const payload = typeof req.body === "object" && req.body ? req.body : tryParseJson(raw) || {};

  const baseUrl = process.env.RETAILCRM_BASE_URL;
  const apiKey = process.env.RETAILCRM_API_KEY;
  const site = process.env.RETAILCRM_SITE_CODE;
  const entity = (process.env.RETAILCRM_ENTITY || "leads").trim().toLowerCase();

  if (!baseUrl || !apiKey) {
    res.status(500).json({ ok: false, error: "retailcrm_not_configured" });
    return;
  }

  const externalIdBase =
    payload && payload.visitorId ? `kit:${String(payload.visitorId)}` : `kit:${Date.now()}`;
  const comment = buildComment(payload);

  try {
    if (entity === "orders") {
      const order = {
        externalId: `${externalIdBase}:${String(payload.event || "event")}`,
        customerComment: comment,
      };
      const params = new URLSearchParams();
      if (site) params.set("site", site);
      params.set("order", JSON.stringify(order));
      const r = await retailcrmRequest({ baseUrl, apiKey, path: "/api/v5/orders/create", bodyParams: params });
      res.status(r.ok ? 200 : 502).json({ ok: r.ok, retailcrm: r.json || r.text });
      return;
    }

    const lead = {
      externalId: `${externalIdBase}:${String(payload.event || "event")}`,
      comment,
    };
    const params = new URLSearchParams();
    if (site) params.set("site", site);
    params.set("lead", JSON.stringify(lead));
    const r = await retailcrmRequest({ baseUrl, apiKey, path: "/api/v5/leads/create", bodyParams: params });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, retailcrm: r.json || r.text });
  } catch {
    res.status(500).json({ ok: false, error: "exception" });
  }
};
