const API_BASE = "https://perps.standx.com/api";
const WS_URL_PRICE = "ws://198.46.175.142:8888/crypto/ws/price";
const WS_URL_GOLD = "ws://198.46.175.142:8888/crypto/ws/gold";
const SIGN_VERSION = "v1";
const BARK_BASE = "https://api.day.app/T8o673fCYtSqpLkryPZWmb/";
const VAR_ORDER_URL_FRAGMENT = "/api/orders/new/";
const VAR_ORDER_BROADCAST_URLS = ["https://omni.variational.io/*"];
const textEncoder = new TextEncoder();
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = (() => {
  const map = new Map();
  for (let i = 0; i < BASE58_ALPHABET.length; i += 1) {
    map.set(BASE58_ALPHABET[i], i);
  }
  return map;
})();

let ws = null;
let wsState = "disconnected";
let wsRetry = 0;
let wsRetryTimer = null;
let lastSpread = null;
let spreadChannel = "price";
const spreadPorts = new Set();

function broadcastSpread(message) {
  spreadPorts.forEach((port) => {
    try {
      port.postMessage(message);
    } catch {
      // Ignore ports that are already closed.
    }
  });
}

function getWsUrl() {
  return spreadChannel === "gold" ? WS_URL_GOLD : WS_URL_PRICE;
}

function setSpreadChannel(channel) {
  const next = channel === "gold" ? "gold" : "price";
  if (next === spreadChannel) {
    return;
  }
  spreadChannel = next;
  lastSpread = null;
  closeWs();
  connectWs();
}

function setWsState(state) {
  wsState = state;
  broadcastSpread({ type: "SPREAD_STATUS", status: state });
}

function handleWsMessage(event) {
  let payload;
  try {
    payload = JSON.parse(event.data);
  } catch {
    return;
  }
  if (!payload || typeof payload !== "object") {
    return;
  }
  const next = {};
  if ("diff" in payload) {
    next.diff = payload.diff;
  }
  if ("avgSpread" in payload) {
    next.avgSpread = payload.avgSpread;
  }
  if (!("diff" in next) && !("avgSpread" in next)) {
    return;
  }
  lastSpread = { ...(lastSpread || {}), ...next };
  broadcastSpread({ type: "SPREAD_UPDATE", data: lastSpread });
}

function scheduleWsReconnect() {
  if (wsRetryTimer || spreadPorts.size === 0) {
    return;
  }
  const delay = Math.min(10000, 1000 * Math.pow(2, wsRetry));
  wsRetryTimer = setTimeout(() => {
    wsRetryTimer = null;
    wsRetry = Math.min(wsRetry + 1, 5);
    connectWs();
  }, delay);
}

function connectWs() {
  if (spreadPorts.size === 0) {
    return;
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    ws = new WebSocket(getWsUrl());
  } catch {
    setWsState("error");
    scheduleWsReconnect();
    return;
  }
  const activeSocket = ws;
  setWsState("connecting");
  activeSocket.addEventListener("open", () => {
    if (activeSocket !== ws) {
      return;
    }
    wsRetry = 0;
    setWsState("connected");
    if (lastSpread) {
      broadcastSpread({ type: "SPREAD_UPDATE", data: lastSpread });
    }
  });
  activeSocket.addEventListener("message", (event) => {
    if (activeSocket !== ws) {
      return;
    }
    handleWsMessage(event);
  });
  activeSocket.addEventListener("error", () => {
    if (activeSocket !== ws) {
      return;
    }
    setWsState("error");
  });
  activeSocket.addEventListener("close", () => {
    if (activeSocket !== ws) {
      return;
    }
    ws = null;
    setWsState("disconnected");
    scheduleWsReconnect();
  });
}

function closeWs() {
  if (ws) {
    try {
      ws.close();
    } catch {
      // Ignore.
    }
    ws = null;
  }
  if (wsRetryTimer) {
    clearTimeout(wsRetryTimer);
    wsRetryTimer = null;
  }
  wsRetry = 0;
  setWsState("disconnected");
}

function hexToBytes(hex) {
  const cleanHex = hex.trim();
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Hex string must have an even length.");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function base64ToBytes(base64) {
  const normalized = base64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base58ToBytes(value) {
  let num = 0n;
  for (const char of value) {
    const digit = BASE58_MAP.get(char);
    if (digit === undefined) {
      throw new Error("Invalid base58 character.");
    }
    num = num * 58n + BigInt(digit);
  }

  const bytes = [];
  while (num > 0n) {
    bytes.push(Number(num & 0xffn));
    num >>= 8n;
  }
  bytes.reverse();

  let leadingZeros = 0;
  for (const char of value) {
    if (char === "1") {
      leadingZeros += 1;
    } else {
      break;
    }
  }

  if (leadingZeros > 0) {
    return new Uint8Array([...new Array(leadingZeros).fill(0), ...bytes]);
  }
  return new Uint8Array(bytes);
}

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function normalizePrivateKey(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const prefixMatch = trimmed.match(/^([a-zA-Z0-9_-]+):(.*)$/);
  const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : "";
  const rawValue = prefixMatch ? prefixMatch[2].trim() : trimmed;

  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    try {
      const list = JSON.parse(rawValue);
      if (!Array.isArray(list)) {
        throw new Error("Private key JSON must be an array.");
      }
      const bytes = Uint8Array.from(list.map((entry) => Number(entry)));
      return normalizePrivateKeyBytes(bytes);
    } catch (error) {
      throw new Error(`Invalid JSON private key: ${String(error)}`);
    }
  }

  const hexCandidate = rawValue.startsWith("0x") ? rawValue.slice(2) : rawValue;
  if (/^[0-9a-fA-F]+$/.test(hexCandidate) && hexCandidate.length % 2 === 0) {
    return normalizePrivateKeyBytes(hexToBytes(hexCandidate));
  }

  if (prefix === "base58" || prefix === "b58") {
    return normalizePrivateKeyBytes(base58ToBytes(rawValue));
  }

  if (prefix === "base64" || prefix === "b64") {
    return normalizePrivateKeyBytes(base64ToBytes(rawValue));
  }

  const bytesFromBase64 = tryDecode(() => base64ToBytes(rawValue));
  if (bytesFromBase64) {
    const normalized = normalizePrivateKeyBytes(bytesFromBase64, true);
    if (normalized) {
      return normalized;
    }
  }

  const bytesFromBase58 = tryDecode(() => base58ToBytes(rawValue));
  if (bytesFromBase58) {
    const normalized = normalizePrivateKeyBytes(bytesFromBase58, true);
    if (normalized) {
      return normalized;
    }
  }

  throw new Error("Private key must be a 32-byte Ed25519 seed (base64, hex, base58, or JSON array).");
}

async function sendBarkNotification(payload) {
  const id = payload && typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) {
    throw new Error("Missing notification id.");
  }
  const spread = payload && payload.spread !== undefined && payload.spread !== null
    ? String(payload.spread)
    : "--";
  const success = payload && payload.success ? "true" : "false";
  const status = payload && typeof payload.status === "string" && payload.status.trim()
    ? payload.status.trim()
    : (payload && payload.success ? "success" : "failed");
  const detailValue = payload && payload.details !== undefined && payload.details !== null
    ? payload.details
    : "";
  let detailText = "";
  if (detailValue) {
    if (typeof detailValue === "string") {
      detailText = detailValue;
    } else {
      try {
        detailText = JSON.stringify(detailValue);
      } catch {
        detailText = String(detailValue);
      }
    }
    detailText = detailText.replace(/\s+/g, " ").trim();
    if (detailText.length > 200) {
      detailText = `${detailText.slice(0, 197)}...`;
    }
  }
  const title = "StandX Auto Order";
  const body = detailText
    ? `ID:${id} Spread:${spread} Success:${success} Status:${status} Detail:${detailText}`
    : `ID:${id} Spread:${spread} Success:${success} Status:${status}`;
  const url = `${BARK_BASE}${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
  const response = await fetch(url, { method: "GET" });
  return response;
}

function buildVarOrderPayload(details, ok, error) {
  return {
    type: "VAR_ORDER_REQUEST",
    ok: Boolean(ok),
    status: typeof details.statusCode === "number" ? details.statusCode : 0,
    url: details.url || "",
    method: details.method || "",
    error: error || ""
  };
}

function logVarOrderEvent(event, details, ok, error) {
  const info = {
    event,
    ok: Boolean(ok),
    statusCode: typeof details.statusCode === "number" ? details.statusCode : 0,
    tabId: typeof details.tabId === "number" ? details.tabId : null,
    method: details.method || "",
    url: details.url || "",
    initiator: details.initiator || "",
    documentUrl: details.documentUrl || "",
    timeStamp: details.timeStamp
  };
  if (error) {
    info.error = String(error);
  }
  const prefix = "[StandX Var]";
  if (ok) {
    console.info(prefix, info);
    return;
  }
  console.warn(prefix, info);
}

function sendVarOrderMessage(tabId, payload, onFailure) {
  if (!chrome.tabs || !chrome.tabs.sendMessage) {
    if (onFailure) {
      onFailure("tabs_api_unavailable");
    }
    return;
  }
  try {
    chrome.tabs.sendMessage(tabId, payload, () => {
      if (chrome.runtime.lastError) {
        if (onFailure) {
          onFailure(chrome.runtime.lastError.message || "send_failed");
        }
      }
    });
  } catch (error) {
    if (onFailure) {
      onFailure(String(error));
    }
  }
}

function broadcastVarOrderMessage(payload, details, excludeTabId) {
  if (!chrome.tabs || !chrome.tabs.query) {
    console.warn("[StandX Var] broadcast skipped (tabs api unavailable).");
    return;
  }
  chrome.tabs.query({ url: VAR_ORDER_BROADCAST_URLS }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.warn("[StandX Var] broadcast query failed.", chrome.runtime.lastError.message);
      return;
    }
    if (!Array.isArray(tabs) || tabs.length === 0) {
      console.warn("[StandX Var] broadcast skipped (no matching tabs).", {
        url: details.url || "",
        documentUrl: details.documentUrl || ""
      });
      return;
    }
    let sent = 0;
    tabs.forEach((tab) => {
      if (!tab || typeof tab.id !== "number") {
        return;
      }
      if (typeof excludeTabId === "number" && tab.id === excludeTabId) {
        return;
      }
      sendVarOrderMessage(tab.id, payload);
      sent += 1;
    });
    console.info("[StandX Var] broadcast sent.", { sent, excludeTabId });
  });
}

function notifyVarOrderResponse(details, ok, error) {
  if (!details) {
    return;
  }
  const payload = buildVarOrderPayload(details, ok, error);
  const tabId = typeof details.tabId === "number" ? details.tabId : -1;
  if (tabId >= 0) {
    sendVarOrderMessage(tabId, payload, (reason) => {
      console.warn("[StandX Var] direct send failed, broadcasting.", { tabId, reason });
      broadcastVarOrderMessage(payload, details, tabId);
    });
    return;
  }
  console.warn("[StandX Var] invalid tabId, broadcasting.", { tabId });
  broadcastVarOrderMessage(payload, details);
}

function tryDecode(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function normalizePrivateKeyBytes(bytes, allowNull = false) {
  if (bytes.length === 64) {
    return bytes.slice(0, 32);
  }
  if (bytes.length === 32) {
    return bytes;
  }
  if (allowNull) {
    return null;
  }
  throw new Error("Private key must be a 32-byte Ed25519 seed (base64, hex, base58, or JSON array).");
}

async function importEd25519PrivateKey(seed) {
  const pkcs8Prefix = hexToBytes("302e020100300506032b657004220420");
  const pkcs8 = concatBytes(pkcs8Prefix, seed);
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
}

function randomRequestId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function buildSignatureHeaders(payload, privateKeySeed) {
  if (!crypto.subtle || !crypto.subtle.importKey) {
    throw new Error("WebCrypto is unavailable for request signing.");
  }
  const requestId = randomRequestId();
  const timestamp = Date.now();
  const message = `${SIGN_VERSION},${requestId},${timestamp},${payload}`;
  const signingKey = await importEd25519PrivateKey(privateKeySeed);
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign({ name: "Ed25519" }, signingKey, textEncoder.encode(message))
  );
  return {
    "x-request-sign-version": SIGN_VERSION,
    "x-request-id": requestId,
    "x-request-timestamp": String(timestamp),
    "x-request-signature": bytesToBase64(signatureBytes)
  };
}

async function getToken() {
  const result = await chrome.storage.sync.get({ standxToken: "" });
  return (result.standxToken || "").trim();
}

async function getPrivateKey() {
  const result = await chrome.storage.sync.get({ standxPrivateKey: "" });
  return (result.standxPrivateKey || "").trim();
}

async function fetchWithToken(path, options = {}) {
  const token = await getToken();
  if (!token) {
    throw new Error("Token not set. Open extension options and paste your token.");
  }

  const { sign, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  headers.set("accept", "application/json, text/plain, */*");
  headers.set("authorization", `Bearer ${token}`);

  if (sign) {
    const payload = typeof fetchOptions.body === "string" ? fetchOptions.body : "";
    if (!payload) {
      throw new Error("Signed request requires a JSON body.");
    }
    const privateKeyValue = await getPrivateKey();
    if (!privateKeyValue) {
      throw new Error("Private key not set. Open extension options and paste your Ed25519 seed.");
    }
    const privateKeySeed = normalizePrivateKey(privateKeyValue);
    const signatureHeaders = await buildSignatureHeaders(payload, privateKeySeed);
    Object.entries(signatureHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: "include",
    referrer: "https://standx.com/",
    mode: "cors"
  });

  return response;
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return { error: "Failed to parse JSON", details: String(error) };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (message.type === "GET_POSITIONS") {
    (async () => {
      try {
        const response = await fetchWithToken("/query_positions", { method: "GET" });
        const data = await safeReadJson(response);
        sendResponse({ ok: response.ok, status: response.status, data });
      } catch (error) {
        sendResponse({ ok: false, status: 0, error: String(error) });
      }
    })();
    return true;
  }

  if (message.type === "NEW_ORDER") {
    (async () => {
      try {
        const side = message.side === "sell" ? "sell" : "buy";
        const qty = typeof message.qty === "string" ? message.qty.trim() : "";
        const symbol = typeof message.symbol === "string" && message.symbol.trim()
          ? message.symbol.trim()
          : "BTC-USD";

        if (!qty || Number.isNaN(Number(qty)) || Number(qty) <= 0) {
          sendResponse({ ok: false, status: 0, error: "Invalid qty. Enter a number greater than 0." });
          return;
        }

        const payload = {
          symbol,
          side,
          qty,
          price: "0",
          time_in_force: "gtc",
          order_type: "market",
          reduce_only: false
        };

        const response = await fetchWithToken("/new_order", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(payload),
          sign: true
        });

        const data = await safeReadJson(response);
        sendResponse({ ok: response.ok, status: response.status, data });
      } catch (error) {
        sendResponse({ ok: false, status: 0, error: String(error) });
      }
    })();
    return true;
  }

  if (message.type === "BARK_NOTIFY") {
    (async () => {
      try {
        const response = await sendBarkNotification(message);
        sendResponse({ ok: response.ok, status: response.status });
      } catch (error) {
        sendResponse({ ok: false, status: 0, error: String(error) });
      }
    })();
    return true;
  }

  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  if (!port || port.name !== "standx-spread") {
    return;
  }
  spreadPorts.add(port);
  port.postMessage({ type: "SPREAD_STATUS", status: wsState });
  if (lastSpread) {
    port.postMessage({ type: "SPREAD_UPDATE", data: lastSpread });
  }
  connectWs();

  port.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "SPREAD_SUBSCRIBE") {
      setSpreadChannel(message.channel);
    }
  });

  port.onDisconnect.addListener(() => {
    spreadPorts.delete(port);
    if (spreadPorts.size === 0) {
      closeWs();
    }
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

if (chrome.webRequest && chrome.webRequest.onCompleted) {
  chrome.webRequest.onCompleted.addListener((details) => {
    if (!details || !details.url || !details.url.includes(VAR_ORDER_URL_FRAGMENT)) {
      return;
    }
    const ok = typeof details.statusCode === "number"
      && details.statusCode >= 200
      && details.statusCode < 300;
    const error = ok ? "" : `status_${details.statusCode}`;
    logVarOrderEvent("completed", details, ok, error);
    notifyVarOrderResponse(details, ok, error);
  }, { urls: ["https://omni.variational.io/*"] });

  chrome.webRequest.onErrorOccurred.addListener((details) => {
    if (!details || !details.url || !details.url.includes(VAR_ORDER_URL_FRAGMENT)) {
      return;
    }
    const error = details.error || "request_failed";
    logVarOrderEvent("error", details, false, error);
    notifyVarOrderResponse(details, false, error);
  }, { urls: ["https://omni.variational.io/*"] });
}
