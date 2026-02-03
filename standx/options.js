import { getPublicKey, signAsync } from "./vendor/secp256k1.js";
import { keccak_256 } from "./vendor/sha3.js";

const API_BASE = "https://api.standx.com";
const DEFAULT_CHAIN = "bsc";
const TOKEN_EXPIRES_SECONDS = 604800;
const PKCS8_PREFIX = "302e020100300506032b657004220420";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const textEncoder = new TextEncoder();

const walletPrivateKeyField = document.getElementById("wallet-private-key");
const tokenField = document.getElementById("token");
const privateKeyField = document.getElementById("private-key");
const notifyIdField = document.getElementById("notify-id");
const saveButton = document.getElementById("save");
const statusLabel = document.getElementById("status");

const setStatus = (message, type) => {
  statusLabel.textContent = message;
  statusLabel.classList.remove("success");
  if (type) {
    statusLabel.classList.add(type);
  }
};

const concatBytes = (...arrays) => {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  arrays.forEach((arr) => {
    out.set(arr, offset);
    offset += arr.length;
  });
  return out;
};

const hexToBytes = (hex) => {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) {
    throw new Error("Hex string must have an even length.");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const bytesToHex = (bytes) => {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const base64UrlToBytes = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const base58Encode = (bytes) => {
  let num = 0n;
  bytes.forEach((byte) => {
    num = (num << 8n) + BigInt(byte);
  });

  let encoded = "";
  while (num > 0n) {
    const rem = num % 58n;
    num /= 58n;
    encoded = BASE58_ALPHABET[Number(rem)] + encoded;
  }

  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      leadingZeros += 1;
    } else {
      break;
    }
  }

  return `${"1".repeat(leadingZeros)}${encoded || ""}`;
};

const parseJwtPayload = (token) => {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid signed data token.");
  }
  const payloadBytes = base64UrlToBytes(parts[1]);
  const payloadJson = new TextDecoder().decode(payloadBytes);
  return JSON.parse(payloadJson);
};

const normalizeWalletPrivateKey = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Wallet private key is required.");
  }
  const raw = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("Wallet private key must be a 32-byte hex string.");
  }
  return hexToBytes(raw);
};

const toChecksumAddress = (address) => {
  const normalized = address.toLowerCase().replace(/^0x/, "");
  const hash = bytesToHex(keccak_256(textEncoder.encode(normalized)));
  let result = "0x";
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char >= "0" && char <= "9") {
      result += char;
    } else {
      result += Number.parseInt(hash[i], 16) >= 8 ? char.toUpperCase() : char;
    }
  }
  return result;
};

const getWalletAddress = (privateKeyBytes) => {
  const publicKey = getPublicKey(privateKeyBytes, false);
  const hash = keccak_256(publicKey.slice(1));
  return toChecksumAddress(`0x${bytesToHex(hash.slice(-20))}`);
};

const buildEthereumMessageHash = (message) => {
  const messageBytes = textEncoder.encode(message);
  const prefix = `\x19Ethereum Signed Message:\n${messageBytes.length}`;
  const prefixBytes = textEncoder.encode(prefix);
  return keccak_256(concatBytes(prefixBytes, messageBytes));
};

const signEthereumMessage = async (privateKeyBytes, message) => {
  const hash = buildEthereumMessageHash(message);
  const signature = await signAsync(hash, privateKeyBytes);
  const compact = signature.toCompactRawBytes();
  if (typeof signature.recovery !== "number") {
    throw new Error("Signature recovery is unavailable.");
  }
  const full = new Uint8Array(65);
  full.set(compact, 0);
  full[64] = signature.recovery + 27;
  return `0x${bytesToHex(full)}`;
};

const generateEd25519Seed = () => {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return seed;
};

const getEd25519PublicKey = async (seed) => {
  if (!crypto.subtle) {
    throw new Error("WebCrypto is unavailable for Ed25519 key generation.");
  }
  const pkcs8 = concatBytes(hexToBytes(PKCS8_PREFIX), seed);
  const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  if (!jwk || !jwk.x) {
    throw new Error("Failed to derive Ed25519 public key.");
  }
  return base64UrlToBytes(jwk.x);
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && (data.error || data.message)
      ? (data.error || data.message)
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
};

const prepareSignIn = async (address, requestId) => {
  const url = `${API_BASE}/v1/offchain/prepare-signin?chain=${encodeURIComponent(DEFAULT_CHAIN)}`;
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, requestId })
  });
  if (!data || data.success === false || !data.signedData) {
    throw new Error("Failed to fetch signed data.");
  }
  return data.signedData;
};

const login = async (signature, signedData) => {
  const url = `${API_BASE}/v1/offchain/login?chain=${encodeURIComponent(DEFAULT_CHAIN)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      signature,
      signedData,
      expiresSeconds: TOKEN_EXPIRES_SECONDS
    })
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
};

const loadSettings = async () => {
  const stored = await chrome.storage.sync.get({
    standxToken: "",
    standxPrivateKey: "",
    standxNotifyId: "",
    standxWalletPrivateKey: ""
  });
  tokenField.value = stored.standxToken || "";
  privateKeyField.value = stored.standxPrivateKey || "";
  notifyIdField.value = stored.standxNotifyId || "";
  walletPrivateKeyField.value = stored.standxWalletPrivateKey || "";
};

const generateAndSave = async () => {
  saveButton.disabled = true;
  setStatus("Generating token...", "");
  try {
    const walletKeyValue = walletPrivateKeyField.value.trim();
    const walletKeyBytes = normalizeWalletPrivateKey(walletKeyValue);
    const notifyId = notifyIdField.value.trim();

    const walletAddress = getWalletAddress(walletKeyBytes);
    const ed25519Seed = generateEd25519Seed();
    const ed25519PublicKey = await getEd25519PublicKey(ed25519Seed);
    const requestId = base58Encode(ed25519PublicKey);
    const signedData = await prepareSignIn(walletAddress, requestId);
    const payload = parseJwtPayload(signedData);
    const message = payload && typeof payload.messageToSign === "string" && payload.messageToSign.trim()
      ? payload.messageToSign
      : payload && typeof payload.message === "string"
        ? payload.message
        : "";
    if (!message) {
      throw new Error("Signed data payload is missing the message.");
    }
    const signature = await signEthereumMessage(walletKeyBytes, message);
    let loginResponse = await login(signature, signedData);
    if (loginResponse && loginResponse.data && !loginResponse.data.token && signature.startsWith("0x")) {
      const messageText = String(loginResponse.data.message || loginResponse.data.error || "");
      if (messageText.includes("Signature verification failed")) {
        loginResponse = await login(signature.slice(2), signedData);
      }
    }
    if (!loginResponse || !loginResponse.data || !loginResponse.data.token) {
      const messageText = loginResponse && loginResponse.data
        ? (loginResponse.data.message || loginResponse.data.error || "")
        : "";
      throw new Error(messageText || "Login did not return a token.");
    }

    const token = loginResponse.data.token;
    const ed25519SeedValue = base58Encode(ed25519Seed);

    tokenField.value = token;
    privateKeyField.value = ed25519SeedValue;

    await chrome.storage.sync.set({
      standxToken: token,
      standxPrivateKey: ed25519SeedValue,
      standxNotifyId: notifyId,
      standxWalletPrivateKey: walletKeyValue
    });

    setStatus("Generated and saved.", "success");
    setTimeout(() => setStatus("", ""), 2000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "");
  } finally {
    saveButton.disabled = false;
  }
};

saveButton.addEventListener("click", generateAndSave);

loadSettings();
