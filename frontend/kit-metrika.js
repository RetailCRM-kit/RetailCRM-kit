(() => {
  const DEFAULTS = {
    counterId: 107263856,
    startChatGoal: "Start_chat_Retail",
    nightFormGoal: "Night_form_chat_Retail",
    nightStartHourMsk: 21,
    nightEndHourMsk: 9,
    debug: false,
    emitToDataLayer: true,
    emitToDomEvent: true,
    startChatEventName: "kit_start_chat_retail",
    nightFormEventName: "kit_night_form_chat_retail",
    startChatWebhookUrl: "",
    nightFormWebhookUrl: "",
    webhookUseBeacon: true,
    webhookTimeoutMs: 3500,
    attributionTtlMs: 1000 * 60 * 60 * 24 * 30,
    domChatDetection: true,
    domChatRootTextPatterns: ["ваш консультант", "online"],
    domChatRootAttrPatterns: ["retail", "crm", "chat", "widget", "consult"],
    websocketDetection: false,
    dedupeTtlMs: 1000 * 60 * 60 * 24 * 14,
    startChatDedupeScope: "dialog",
    nightFormDedupeScope: "dialog",
    nightSuccessTextPatterns: ["спасибо", "заявк", "отправлен", "успешн"],
  };

  const parseBoolean = (value) => {
    if (value == null) return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
    return undefined;
  };

  const parseNumber = (value) => {
    if (value == null) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  const getCurrentScriptUrl = () => {
    const current = document.currentScript;
    if (current && current.src) return current.src;
    const scripts = document.getElementsByTagName("script");
    for (let i = scripts.length - 1; i >= 0; i -= 1) {
      const s = scripts[i];
      if (s && s.src && /kit-metrika\.js/i.test(s.src)) return s.src;
    }
    return "";
  };

  const getConfigFromQuery = () => {
    const url = getCurrentScriptUrl();
    if (!url) return {};
    try {
      const u = new URL(url, window.location.href);
      const p = u.searchParams;
      const nightSuccessTextPatterns = p.getAll("nightSuccessText").filter(Boolean);
      const config = {
        counterId: parseNumber(p.get("counter")) ?? parseNumber(p.get("counterId")),
        startChatGoal: p.get("startGoal") ?? p.get("startChatGoal"),
        nightFormGoal: p.get("nightGoal") ?? p.get("nightFormGoal"),
        nightStartHourMsk: parseNumber(p.get("nightStartHourMsk")) ?? parseNumber(p.get("nightStart")),
        nightEndHourMsk: parseNumber(p.get("nightEndHourMsk")) ?? parseNumber(p.get("nightEnd")),
        debug: parseBoolean(p.get("debug")),
        startChatWebhookUrl: p.get("startWebhook") ?? p.get("startChatWebhookUrl"),
        nightFormWebhookUrl: p.get("nightWebhook") ?? p.get("nightFormWebhookUrl"),
        webhookUseBeacon: parseBoolean(p.get("webhookUseBeacon")),
        webhookTimeoutMs: parseNumber(p.get("webhookTimeoutMs")),
        attributionTtlMs: parseNumber(p.get("attributionTtlMs")),
        startChatDedupeScope: p.get("startChatDedupeScope"),
        nightFormDedupeScope: p.get("nightFormDedupeScope"),
        dedupeTtlMs: parseNumber(p.get("dedupeTtlMs")),
        nightSuccessTextPatterns: nightSuccessTextPatterns.length ? nightSuccessTextPatterns : undefined,
      };
      Object.keys(config).forEach((k) => config[k] == null && delete config[k]);
      return config;
    } catch {
      return {};
    }
  };

  const resolveConfig = () => {
    const fromQuery = getConfigFromQuery();
    const fromGlobal =
      typeof window.KIT_METRIKA_CONFIG === "object" && window.KIT_METRIKA_CONFIG
        ? window.KIT_METRIKA_CONFIG
        : {};
    return { ...DEFAULTS, ...fromQuery, ...fromGlobal };
  };

  const config = resolveConfig();

  const log = (...args) => {
    if (!config.debug) return;
    try {
      console.log("[kit-metrika]", ...args);
    } catch {}
  };

  const getOrCreateVisitorId = () => {
    const key = "kit_metrika_visitor_id";
    try {
      const existing = localStorage.getItem(key);
      if (existing) return String(existing);
    } catch {}

    try {
      const bytes = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      try {
        localStorage.setItem(key, hex);
      } catch {}
      return hex;
    } catch {
      return String(Date.now());
    }
  };

  const getOrCreateAttribution = () => {
    const key = "kit_metrika_attribution";
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = safeJsonParse(raw);
        if (parsed && typeof parsed === "object" && typeof parsed.ts === "number") {
          if (Date.now() - parsed.ts < Number(config.attributionTtlMs)) return parsed;
        }
      }
    } catch {}
    const fresh = { ts: Date.now() };
    try {
      localStorage.setItem(key, JSON.stringify(fresh));
    } catch {}
    return fresh;
  };

  const writeAttribution = (attrs) => {
    if (!attrs || typeof attrs !== "object") return;
    const current = getOrCreateAttribution();
    const next = { ...current, ...attrs, ts: Date.now() };
    try {
      localStorage.setItem("kit_metrika_attribution", JSON.stringify(next));
    } catch {}
  };

  const captureAttributionFromUrl = () => {
    let params;
    try {
      params = new URLSearchParams(location.search || "");
    } catch {
      return;
    }

    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid", "gclid", "fbclid"];
    const attrs = {};
    for (const k of keys) {
      const v = params.get(k);
      if (v && String(v).trim()) attrs[k] = String(v).trim();
    }

    try {
      const yid = typeof window.ym === "function" ? window.ym(Number(config.counterId), "getClientID") : undefined;
      if (typeof yid === "string" && yid.trim()) attrs.ya_client_id = yid.trim();
    } catch {}

    if (Object.keys(attrs).length) writeAttribution(attrs);
  };

  const getAttribution = () => {
    const a = getOrCreateAttribution();
    const out = { ...a };
    delete out.ts;
    return out;
  };

  const postWebhook = (url, payload) => {
    if (!url) return { status: "skipped" };
    const u = String(url);
    let body = "";
    try {
      body = JSON.stringify(payload && typeof payload === "object" ? payload : { payload });
    } catch {
      body = "{}";
    }

    try {
      if (config.webhookUseBeacon && navigator && typeof navigator.sendBeacon === "function") {
        const ok = navigator.sendBeacon(u, new Blob([body], { type: "application/json" }));
        return { status: ok ? "sent" : "error" };
      }
    } catch {}

    if (typeof window.fetch !== "function") return { status: "error" };

    try {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timeoutMs = Number(config.webhookTimeoutMs);
      const timeout =
        controller && Number.isFinite(timeoutMs) && timeoutMs > 0
          ? window.setTimeout(() => controller.abort(), timeoutMs)
          : null;

      void window
        .fetch(u, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          mode: "no-cors",
          credentials: "omit",
          keepalive: true,
          signal: controller ? controller.signal : undefined,
        })
        .catch((e) => log("webhook ошибка:", e))
        .finally(() => timeout && window.clearTimeout(timeout));

      return { status: "sent" };
    } catch (e) {
      log("webhook ошибка:", e);
      return { status: "error", error: e };
    }
  };

  const pendingYmQueue = [];
  let pendingYmTimer = null;

  const scheduleYmFlush = () => {
    if (pendingYmTimer) return;
    pendingYmTimer = window.setInterval(() => {
      const ymFn = typeof window.ym === "function" ? window.ym : undefined;
      if (!ymFn) return;
      const items = pendingYmQueue.splice(0, pendingYmQueue.length);
      for (const item of items) {
        try {
          ymFn(Number(config.counterId), "reachGoal", String(item.goalName), item.params);
          item.onSent && item.onSent();
          log("доставлено из очереди:", item.goalName);
        } catch (e) {
          log("ошибка ym при доставке из очереди:", e);
        }
      }
      if (pendingYmQueue.length === 0) {
        window.clearInterval(pendingYmTimer);
        pendingYmTimer = null;
      }
    }, 300);
  };

  const mskHour = () => {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const mskMs = utcMs + 3 * 60 * 60 * 1000;
    return new Date(mskMs).getUTCHours();
  };

  const isNightMsk = () => {
    const h = mskHour();
    const start = Number(config.nightStartHourMsk);
    const end = Number(config.nightEndHourMsk);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    if (start === end) return true;
    if (start < end) return h >= start && h < end;
    return h >= start || h < end;
  };

  const safeJsonParse = (value) => {
    if (typeof value !== "string") return undefined;
    const s = value.trim();
    if (!s) return undefined;
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

  const includesAny = (haystack, needles) => {
    const h = normalizeText(haystack);
    return needles.some((n) => h.includes(normalizeText(n)));
  };

  const storageGet = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return undefined;
      const parsed = safeJsonParse(raw);
      if (!parsed || typeof parsed !== "object") return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  };

  const storageSet = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  };

  const tryGetRetailDialogIdFromStorage = () => {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k) continue;
        keys.push(k);
      }
    } catch {}

    const candidates = keys.filter((k) => /retail|crm|chat|widget/i.test(k));
    for (const k of candidates) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = safeJsonParse(raw);
        if (parsed && typeof parsed === "object") {
          const flat = JSON.stringify(parsed);
          const m =
            flat.match(/"conversationId"\s*:\s*"([^"]+)"/i) ||
            flat.match(/"dialogId"\s*:\s*"([^"]+)"/i) ||
            flat.match(/"sessionId"\s*:\s*"([^"]+)"/i) ||
            flat.match(/"visitorId"\s*:\s*"([^"]+)"/i) ||
            flat.match(/"userId"\s*:\s*"([^"]+)"/i);
          if (m && m[1]) return `ls:${k}:${m[1]}`;
        }

        const s = String(raw);
        const m = s.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
        if (m) return `ls:${k}:${m[0]}`;
      } catch {}
    }

    try {
      if (navigator && navigator.userAgent) return `ua:${navigator.userAgent}`;
    } catch {}
    return `page:${location.hostname}${location.pathname}`;
  };

  const getScopeKey = (scope) => {
    if (scope === "page") return `page:${location.href}`;
    if (scope === "browser") return `visitor:${getOrCreateVisitorId()}`;
    if (scope === "visitor") return `visitor:${getOrCreateVisitorId()}`;
    const dialogId = tryGetRetailDialogIdFromStorage();
    if (typeof dialogId === "string" && dialogId.startsWith("ls:")) return `dialog:${dialogId}`;
    return `visitor:${getOrCreateVisitorId()}`;
  };

  const buildDedupeKey = (goalName, scope) =>
    `kit_metrika_goal_fired:${String(goalName)}:${getScopeKey(scope)}`;

  const isGoalAlreadyFired = (goalName, scope) => {
    const key = buildDedupeKey(goalName, scope);
    const record = storageGet(key);
    if (!record || typeof record !== "object") return false;
    const ts = Number(record.ts);
    if (!Number.isFinite(ts)) return false;
    if (Date.now() - ts > Number(config.dedupeTtlMs)) return false;
    return true;
  };

  const markGoalFired = (goalName, scope, meta) => {
    const key = buildDedupeKey(goalName, scope);
    storageSet(key, { ts: Date.now(), meta: meta ?? null });
  };

  const reachGoal = (goalName, params) => {
    const ymFn = typeof window.ym === "function" ? window.ym : undefined;
    if (!ymFn) {
      return { status: "queued" };
    }
    try {
      ymFn(Number(config.counterId), "reachGoal", String(goalName), params);
      return { status: "sent" };
    } catch (e) {
      log("ошибка ym:", e);
      return { status: "error", error: e };
    }
  };

  const emitSignal = (eventName, goalName, meta) => {
    let emitted = false;

    if (config.emitToDataLayer) {
      try {
        const dl = (window.dataLayer = window.dataLayer || []);
        if (Array.isArray(dl)) {
          dl.push({
            event: String(eventName),
            kitMetrikaGoal: String(goalName),
            kitMetrikaMeta: meta && typeof meta === "object" ? meta : undefined,
          });
          emitted = true;
        }
      } catch {}
    }

    if (config.emitToDomEvent) {
      try {
        const evt = new CustomEvent(String(eventName), {
          detail: { goalName: String(goalName), meta: meta ?? null },
        });
        window.dispatchEvent(evt);
        emitted = true;
      } catch {}
    }

    return emitted;
  };

  const inMemoryFired = new Set();

  const fireGoalOnce = (goalName, scope, meta, signalEventName) => {
    if (!goalName) return;
    const dedupeKey = buildDedupeKey(goalName, scope);
    if (inMemoryFired.has(dedupeKey) || isGoalAlreadyFired(goalName, scope)) {
      log("пропуск (дедуп):", goalName, scope);
      return false;
    }
    inMemoryFired.add(dedupeKey);

    const emitted = signalEventName ? emitSignal(signalEventName, goalName, meta) : false;
    const result = reachGoal(goalName, meta && typeof meta === "object" ? meta : undefined);

    if (result.status === "sent") {
      markGoalFired(goalName, scope, meta);
      log("зафиксировано:", goalName, scope, { ym: "sent", signal: emitted, meta: meta ?? null });
      return true;
    }

    if (result.status === "queued") {
      pendingYmQueue.push({
        goalName,
        params: meta && typeof meta === "object" ? meta : undefined,
        onSent: () => markGoalFired(goalName, scope, meta),
      });
      scheduleYmFlush();
      log("в очереди (ym еще грузится):", goalName, scope, { signal: emitted, meta: meta ?? null });
      return true;
    }

    if (emitted) {
      log("сигнал отправлен без ym:", goalName, scope, meta ?? null);
      return true;
    }

    log("цель не отправлена:", goalName, scope, meta ?? null);
    return true;
  };

  const fireStartChat = (meta) => {
    const fired = fireGoalOnce(
      config.startChatGoal,
      config.startChatDedupeScope,
      meta,
      config.startChatEventName,
    );
    if (!fired) return;
    const payload = {
      event: "start_chat",
      goalName: String(config.startChatGoal),
      counterId: Number(config.counterId),
      visitorId: getOrCreateVisitorId(),
      attribution: getAttribution(),
      pageUrl: String(location.href),
      referrer: String(document.referrer || ""),
      ts: new Date().toISOString(),
      meta: meta && typeof meta === "object" ? meta : undefined,
    };
    const r = postWebhook(config.startChatWebhookUrl, payload);
    if (config.debug) log("webhook start_chat:", r.status);
  };

  const fireNightForm = (meta) => {
    if (!isNightMsk()) {
      log("не ночь по МСК, пропуск Night_form_chat_Retail");
      return;
    }
    const fired = fireGoalOnce(
      config.nightFormGoal,
      config.nightFormDedupeScope,
      meta,
      config.nightFormEventName,
    );
    if (!fired) return;
    const payload = {
      event: "night_form",
      goalName: String(config.nightFormGoal),
      counterId: Number(config.counterId),
      visitorId: getOrCreateVisitorId(),
      attribution: getAttribution(),
      pageUrl: String(location.href),
      referrer: String(document.referrer || ""),
      ts: new Date().toISOString(),
      meta: meta && typeof meta === "object" ? meta : undefined,
    };
    const r = postWebhook(config.nightFormWebhookUrl, payload);
    if (config.debug) log("webhook night_form:", r.status);
  };

  const looksLikeChatSend = (url, bodyText) => {
    const u = normalizeText(url);
    const b = normalizeText(bodyText);
    const urlSignals = ["chat", "message", "retail", "crm", "widget"];
    const bodySignals = ["message", "text", "content", "body", "client"];
    return includesAny(u, urlSignals) && includesAny(b, bodySignals);
  };

  const looksLikeNightFormSuccess = (url, bodyText, responseText) => {
    const u = normalizeText(url);
    const b = normalizeText(bodyText);
    const r = normalizeText(responseText);
    const urlSignals = ["form", "lead", "request", "callback", "chat", "widget", "retail", "crm"];
    const bodySignals = ["form", "lead", "request", "phone", "email", "name"];
    const successSignals = ["ok", "success", "true", "created", "accepted", "200"];
    const textSignals = (config.nightSuccessTextPatterns ?? DEFAULTS.nightSuccessTextPatterns).map(
      (x) => String(x),
    );
    if (!includesAny(u, urlSignals)) return false;
    if (!includesAny(b, bodySignals) && !includesAny(r, successSignals) && !includesAny(r, textSignals))
      return false;
    if (includesAny(r, successSignals) || includesAny(r, textSignals)) return true;
    return false;
  };

  const installFetchHook = () => {
    if (typeof window.fetch !== "function") return;
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input && input.url ? input.url : "";
      const method =
        (init && init.method) || (input && input.method) || (input && input instanceof Request ? input.method : "");
      const body = init && typeof init.body === "string" ? init.body : "";
      const isPost = normalizeText(method) === "post";

      if (isPost && looksLikeChatSend(url, body)) {
        fireStartChat({ source: "fetch", url });
      }

      return original(input, init).then(async (res) => {
        if (isPost && isNightMsk()) {
          try {
            const clone = res.clone();
            const text = await clone.text();
            if (looksLikeNightFormSuccess(url, body, text)) {
              fireNightForm({ source: "fetch", url });
            }
          } catch {}
        }
        return res;
      });
    };
  };

  const installXhrHook = () => {
    if (typeof XMLHttpRequest === "undefined") return;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
      try {
        this.__kit_metrika = { method: String(method || ""), url: String(url || ""), body: "" };
      } catch {}
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function send(body) {
      try {
        if (this.__kit_metrika) this.__kit_metrika.body = typeof body === "string" ? body : "";
      } catch {}

      try {
        const meta = this.__kit_metrika;
        const method = normalizeText(meta && meta.method);
        const url = meta && meta.url;
        if (method === "post" && looksLikeChatSend(url, meta && meta.body)) {
          fireStartChat({ source: "xhr", url });
        }
      } catch {}

      try {
        this.addEventListener(
          "load",
          () => {
            try {
              const meta = this.__kit_metrika;
              const method = normalizeText(meta && meta.method);
              const url = meta && meta.url;
              const responseText = typeof this.responseText === "string" ? this.responseText : "";
              if (method === "post" && isNightMsk() && looksLikeNightFormSuccess(url, meta && meta.body, responseText)) {
                fireNightForm({ source: "xhr", url });
              }
            } catch {}
          },
          { once: true },
        );
      } catch {}

      return originalSend.call(this, body);
    };
  };

  const installWebSocketHook = () => {
    if (!config.websocketDetection) return;
    if (typeof window.WebSocket !== "function") return;

    const OriginalWebSocket = window.WebSocket;

    const WrappedWebSocket = function WebSocket(url, protocols) {
      const ws =
        protocols !== undefined ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
      try {
        const originalSend = ws.send.bind(ws);
        ws.send = (data) => {
          try {
            const payload = typeof data === "string" ? data : "";
            const socketUrl = typeof url === "string" ? url : "";
            if (payload && includesAny(socketUrl, ["retail", "crm", "chat", "widget"])) {
              if (includesAny(payload, ["message", "text", "content", "body"]) && !includesAny(payload, ["typing"])) {
                fireStartChat({ source: "ws", url: socketUrl });
              }
            }
          } catch {}
          return originalSend(data);
        };
      } catch {}
      return ws;
    };

    try {
      WrappedWebSocket.prototype = OriginalWebSocket.prototype;
      Object.defineProperty(WrappedWebSocket, "CONNECTING", { value: OriginalWebSocket.CONNECTING });
      Object.defineProperty(WrappedWebSocket, "OPEN", { value: OriginalWebSocket.OPEN });
      Object.defineProperty(WrappedWebSocket, "CLOSING", { value: OriginalWebSocket.CLOSING });
      Object.defineProperty(WrappedWebSocket, "CLOSED", { value: OriginalWebSocket.CLOSED });
    } catch {}

    try {
      window.WebSocket = WrappedWebSocket;
    } catch {}
  };

  const installPostMessageHook = () => {
    window.addEventListener("message", (event) => {
      const data = event && event.data;
      if (data == null) return;

      const rawText = typeof data === "string" ? data : undefined;
      const obj = typeof data === "object" ? data : safeJsonParse(rawText);

      const asString = () => {
        if (rawText) return rawText;
        try {
          return JSON.stringify(obj);
        } catch {
          return "";
        }
      };

      const s = normalizeText(asString());
      if (!s) return;

      const chatSignals = ["chat", "message", "send", "sent", "retail", "crm"];
      const formSignals = ["form", "lead", "request", "callback", "submit", "success", "ok", "created"];

      if (includesAny(s, chatSignals) && includesAny(s, ["send", "sent", "message"])) {
        fireStartChat({ source: "postMessage", origin: event.origin || "" });
      }

      if (isNightMsk() && includesAny(s, formSignals) && includesAny(s, ["success", "ok", "created", "sent"])) {
        fireNightForm({ source: "postMessage", origin: event.origin || "" });
      }
    });
  };

  const installDomTextObserver = () => {
    const patterns = (config.nightSuccessTextPatterns ?? DEFAULTS.nightSuccessTextPatterns).map((s) =>
      String(s).toLowerCase(),
    );

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const nodes = [];
        if (m.addedNodes && m.addedNodes.length) nodes.push(...m.addedNodes);
        if (m.type === "characterData" && m.target) nodes.push(m.target);
        for (const node of nodes) {
          const text =
            node && node.nodeType === Node.TEXT_NODE
              ? node.textContent
              : node && node.textContent
                ? node.textContent
                : "";
          if (!text) continue;
          const t = normalizeText(text);
          if (!t) continue;
          if (isNightMsk() && patterns.some((p) => t.includes(p))) {
            fireNightForm({ source: "dom", match: patterns.find((p) => t.includes(p)) || "" });
            return;
          }
        }
      }
    });

    try {
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    } catch {}
  };

  const isEditableElement = (el) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "input") {
      const type = String(el.getAttribute("type") || "text").toLowerCase();
      return ["text", "search", "email", "tel", "url"].includes(type);
    }
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") return true;
    return false;
  };

  const getEditableValue = (el) => {
    if (!el) return "";
    if (typeof el.value === "string") return el.value;
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") return el.textContent || "";
    return "";
  };

  const elementMatchesPatterns = (el, patterns) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const p = patterns.map((x) => normalizeText(x)).filter(Boolean);
    if (!p.length) return false;

    const id = normalizeText(el.id);
    const className = normalizeText(el.className);
    const ariaLabel = normalizeText(el.getAttribute ? el.getAttribute("aria-label") : "");
    const role = normalizeText(el.getAttribute ? el.getAttribute("role") : "");
    const testId = normalizeText(el.getAttribute ? el.getAttribute("data-testid") : "");
    const name = normalizeText(el.getAttribute ? el.getAttribute("name") : "");
    const placeholder = normalizeText(el.getAttribute ? el.getAttribute("placeholder") : "");

    const composite = [id, className, ariaLabel, role, testId, name, placeholder].filter(Boolean).join(" ");
    return p.some((needle) => composite.includes(needle));
  };

  const findChatRoot = (startEl) => {
    const maxUp = 12;
    let el = startEl && startEl.nodeType === Node.ELEMENT_NODE ? startEl : startEl && startEl.parentElement;
    const attrPatterns = config.domChatRootAttrPatterns ?? DEFAULTS.domChatRootAttrPatterns;
    const textPatterns = config.domChatRootTextPatterns ?? DEFAULTS.domChatRootTextPatterns;

    for (let i = 0; i < maxUp && el; i += 1) {
      if (elementMatchesPatterns(el, attrPatterns)) return el;
      try {
        const t = normalizeText(el.textContent || "");
        if (t && includesAny(t, textPatterns)) return el;
      } catch {}
      el = el.parentElement;
    }
    return null;
  };

  const installDomChatStartDetector = () => {
    if (!config.domChatDetection) return;

    let lastSendAttempt = { ts: 0, text: "" };

    const recordSendAttempt = (target) => {
      const root = findChatRoot(target);
      if (!root) return false;

      const editable =
        (isEditableElement(target) && target) ||
        (root.querySelector && root.querySelector('textarea, input[type="text"], input[type="search"], [contenteditable="true"]'));
      const text = normalizeText(getEditableValue(editable));
      if (!text) return false;

      lastSendAttempt = { ts: Date.now(), text };
      fireStartChat({ source: "dom", via: "sendAttempt", textLen: text.length });
      return true;
    };

    document.addEventListener(
      "keydown",
      (e) => {
        const key = e && e.key ? String(e.key) : "";
        if (key !== "Enter") return;
        if (e && (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)) return;
        const t = e && e.target;
        if (!isEditableElement(t)) return;
        recordSendAttempt(t);
      },
      true,
    );

    document.addEventListener(
      "click",
      (e) => {
        const t = e && e.target;
        if (!t || t.nodeType !== Node.ELEMENT_NODE) return;
        const btn =
          (t.closest && t.closest('button, [role="button"], input[type="submit"], button[type="submit"]')) || null;
        if (!btn) return;
        const label = normalizeText(btn.getAttribute ? btn.getAttribute("aria-label") : "");
        const txt = normalizeText(btn.textContent || "");
        const isSend =
          includesAny(label, ["send", "отправ", "написать"]) ||
          includesAny(txt, ["send", "отправ", "написать"]) ||
          (btn.getAttribute && normalizeText(btn.getAttribute("type")) === "submit");
        if (!isSend) return;
        recordSendAttempt(btn);
      },
      true,
    );

    const observer = new MutationObserver((mutations) => {
      const now = Date.now();
      if (!lastSendAttempt.ts || now - lastSendAttempt.ts > 15000) return;
      for (const m of mutations) {
        if (!m.addedNodes || !m.addedNodes.length) continue;
        for (const node of m.addedNodes) {
          if (!node) continue;
          const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
          if (!el) continue;
          const root = findChatRoot(el);
          if (!root) continue;
          const text = normalizeText(el.textContent || "");
          if (!text) continue;
          if (text.includes(lastSendAttempt.text.slice(0, 16))) {
            fireStartChat({ source: "dom", via: "messageRendered", textLen: lastSendAttempt.text.length });
            lastSendAttempt = { ts: 0, text: "" };
            return;
          }
        }
      }
    });

    try {
      observer.observe(document.documentElement, { subtree: true, childList: true });
    } catch {}
  };

  const init = () => {
    captureAttributionFromUrl();
    installFetchHook();
    installXhrHook();
    installWebSocketHook();
    installPostMessageHook();
    installDomTextObserver();
    installDomChatStartDetector();

    window.kitMetrika = {
      fireStartChat,
      fireNightForm,
      config: { ...config },
      isNightMsk,
      mskHour,
    };

    log("инициализировано", { counterId: config.counterId });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
