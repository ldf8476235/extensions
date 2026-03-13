(() => {
  const URL_KEYWORD = "perpetual";
  if (!window.location.href.toLowerCase().includes(URL_KEYWORD)) {
    return;
  }
  if (document.getElementById("var-toggle-root")) {
    return;
  }

  const STORAGE_KEY = "varHideChartEnabled";
  const HEDGE_ACCOUNTS_KEY = "varHedgeAccounts";
  const HEDGE_API_URL_KEY = "varHedgeApiUrl";
  const HEDGE_PANEL_POSITION_KEY = "varHedgePanelPosition";
  const HEDGE_CONFIG_HIDDEN_KEY = "varHedgeConfigHidden";
  const DEFAULT_HEDGE_API_URL = "http://localhost:8787/api/var/hedge-history/latest";
  const PAGE_QTY_SELECTOR = 'input[data-testid="quantity-input"]';
  const PAGE_QTY_XPATH = "/html/body/div[1]/div[1]/div[2]/div/div/div[5]/div[1]/div/span/div/div/input";
  const PAGE_TPSL_TOGGLE_XPATH = "/html/body/div[1]/div[1]/div[2]/div/div/div[6]/div[2]/button/span";
  const PAGE_POST_WRITE_TOGGLE_OFF_XPATH = "/html/body/div[1]/div[1]/div[2]/div/div/div[6]/div[3]/div/button/span";
  const PAGE_BUY_PRICE_SELECTOR = '[data-testid="ask-price-display"]';
  const PAGE_SELL_PRICE_SELECTOR = '[data-testid="bid-price-display"]';
  const PAGE_SUBMIT_SELECTOR = '[data-testid="submit-button"]';
  const PAGE_SUBMIT_XPATH = "/html/body/div[1]/div[1]/div[2]/div/div/button";
  const PAGE_POSITIONS_ROW_SELECTOR = '[data-testid="positions-table-row"]';
  const CREATE_TPSL_TRIGGER_LABEL = "createtp/sl";
  const CREATE_TPSL_SUBMIT_LABEL = "createtp&sl";
  const AUTO_RESIZE_LABEL = "autoresize";
  const OPEN_SPLIT_MIN_QTY = 0.08;
  const OPEN_SPLIT_MAX_QTY = 0.15;
  const OPEN_SPLIT_DECIMALS = 2;
  const OPEN_SPLIT_INTERVAL_MIN_MS = 300;
  const OPEN_SPLIT_INTERVAL_MAX_MS = 500;
  const OPEN_SPLIT_FILL_TIMEOUT_MS = 4200;
  const OPEN_SPLIT_FILL_INTERVAL_MS = 120;
  const OPEN_SPLIT_FILL_MIN_DELTA = 0.01;
  const chartSelectorHints = [
    "#chart-container",
    "#tv_chart_container",
    "iframe[id^=\"tradingview_\"]",
    "iframe[data-widget-options]",
    "iframe[title*=\"financial chart\" i]",
    "iframe[src*=\"tradingview\" i]"
  ];
  const chartAncestorSelector = [
    "#chart-container",
    "#tv_chart_container"
  ].join(", ");
  const hiddenChartElements = new Map();
  let hideChartEnabled = true;
  let chartScanScheduled = false;

  const blankChartFrame = (frame) => {
    if (!frame || frame.dataset.varChartBlanked === "1") {
      return;
    }
    const src = frame.getAttribute("src");
    if (src) {
      frame.dataset.varChartSrc = src;
    }
    const srcdoc = frame.getAttribute("srcdoc");
    if (srcdoc) {
      frame.dataset.varChartSrcdoc = srcdoc;
    }
    frame.dataset.varChartBlanked = "1";
    frame.setAttribute("src", "about:blank");
    frame.removeAttribute("srcdoc");
  };

  const restoreChartFrame = (frame) => {
    if (!frame || frame.dataset.varChartBlanked !== "1") {
      return;
    }
    const src = frame.dataset.varChartSrc;
    if (src) {
      frame.setAttribute("src", src);
    } else {
      frame.removeAttribute("src");
    }
    const srcdoc = frame.dataset.varChartSrcdoc;
    if (srcdoc) {
      frame.setAttribute("srcdoc", srcdoc);
    }
    delete frame.dataset.varChartBlanked;
    delete frame.dataset.varChartSrc;
    delete frame.dataset.varChartSrcdoc;
  };

  const collectChartTargets = () => {
    const targets = new Set();
    chartSelectorHints.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => targets.add(el));
    });
    return Array.from(targets);
  };

  const resolveChartContainer = (el) => {
    if (!el) {
      return null;
    }
    if (el.id === "chart-container" || el.id === "tv_chart_container") {
      return el;
    }
    const ancestor = chartAncestorSelector ? el.closest(chartAncestorSelector) : null;
    return ancestor || el;
  };

  const hideChartElements = () => {
    if (!hideChartEnabled) {
      return;
    }
    const targets = collectChartTargets();
    targets.forEach((target) => {
      const container = resolveChartContainer(target);
      if (!container) {
        return;
      }
      if (!hiddenChartElements.has(container)) {
        hiddenChartElements.set(container, { display: container.style.display });
      }
      container.dataset.varChartHidden = "1";
      container.style.display = "none";
      if (container.tagName === "IFRAME") {
        blankChartFrame(container);
      } else {
        container.querySelectorAll("iframe").forEach((frame) => blankChartFrame(frame));
      }
    });

    for (const [container] of hiddenChartElements) {
      if (!document.contains(container)) {
        hiddenChartElements.delete(container);
      }
    }
  };

  const restoreChartElements = () => {
    for (const [container, meta] of hiddenChartElements) {
      if (!document.contains(container)) {
        hiddenChartElements.delete(container);
        continue;
      }
      container.style.display = meta.display || "";
      delete container.dataset.varChartHidden;
      if (container.tagName === "IFRAME") {
        restoreChartFrame(container);
      } else {
        container.querySelectorAll("iframe").forEach((frame) => restoreChartFrame(frame));
      }
    }
    hiddenChartElements.clear();
  };

  const scheduleChartScan = () => {
    if (!hideChartEnabled || chartScanScheduled) {
      return;
    }
    chartScanScheduled = true;
    requestAnimationFrame(() => {
      chartScanScheduled = false;
      hideChartElements();
    });
  };

  const persistHideSetting = (enabled) => {
    if (!chrome.storage || !chrome.storage.sync) {
      return;
    }
    chrome.storage.sync.set({ [STORAGE_KEY]: enabled });
  };

  const saveHedgeSettings = (accountsText, apiUrl, configHidden) => new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.sync) {
      resolve();
      return;
    }
    chrome.storage.sync.set(
      {
        [HEDGE_ACCOUNTS_KEY]: accountsText,
        [HEDGE_API_URL_KEY]: apiUrl,
        [HEDGE_CONFIG_HIDDEN_KEY]: Boolean(configHidden)
      },
      () => {
        resolve();
      }
    );
  });

  const saveHedgePanelPosition = (position) => new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.sync) {
      resolve();
      return;
    }
    chrome.storage.sync.set(
      {
        [HEDGE_PANEL_POSITION_KEY]: position
      },
      () => {
        resolve();
      }
    );
  });

  const loadHideSetting = () => new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.sync) {
      resolve(true);
      return;
    }
    chrome.storage.sync.get({ [STORAGE_KEY]: true }, (stored) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(true);
        return;
      }
      resolve(Boolean(stored[STORAGE_KEY]));
    });
  });

  const loadHedgeSettings = () => new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.sync) {
      resolve({
        accountsText: "",
        apiUrl: DEFAULT_HEDGE_API_URL
      });
      return;
    }
    chrome.storage.sync.get(
      {
        [HEDGE_ACCOUNTS_KEY]: "",
        [HEDGE_API_URL_KEY]: DEFAULT_HEDGE_API_URL,
        [HEDGE_PANEL_POSITION_KEY]: null,
        [HEDGE_CONFIG_HIDDEN_KEY]: false
      },
      (stored) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({
            accountsText: "",
            apiUrl: DEFAULT_HEDGE_API_URL,
            panelPosition: null,
            configHidden: false
          });
          return;
        }
        resolve({
          accountsText: String(stored[HEDGE_ACCOUNTS_KEY] || ""),
          apiUrl: String(stored[HEDGE_API_URL_KEY] || DEFAULT_HEDGE_API_URL),
          panelPosition:
            stored[HEDGE_PANEL_POSITION_KEY] &&
            Number.isFinite(Number(stored[HEDGE_PANEL_POSITION_KEY].left)) &&
            Number.isFinite(Number(stored[HEDGE_PANEL_POSITION_KEY].top))
              ? {
                  left: Number(stored[HEDGE_PANEL_POSITION_KEY].left),
                  top: Number(stored[HEDGE_PANEL_POSITION_KEY].top)
                }
              : null,
          configHidden: Boolean(stored[HEDGE_CONFIG_HIDDEN_KEY])
        });
      }
    );
  });

  const root = document.createElement("div");
  root.id = "var-toggle-root";
  root.innerHTML = `
    <style id="var-toggle-style">
      #var-toggle-root {
        position: fixed;
        top: 84px;
        right: 16px;
        z-index: 2147483647;
      }
      #var-toggle-button {
        border: 1px solid #2a2d35;
        border-radius: 999px;
        background: #1f232b;
        color: #f5f7fa;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      #var-toggle-button.is-hidden {
        background: #b42318;
        border-color: #b42318;
      }
    </style>
    <button id="var-toggle-button" type="button" aria-label="切换K线显示状态"></button>
  `;
  (document.body || document.documentElement).appendChild(root);

  const toggleButton = root.querySelector("#var-toggle-button");

  const updateToggleButton = () => {
    if (!toggleButton) {
      return;
    }
    toggleButton.textContent = hideChartEnabled ? "K线已隐藏 · 点击显示" : "K线已显示 · 点击隐藏";
    toggleButton.classList.toggle("is-hidden", hideChartEnabled);
    toggleButton.setAttribute("aria-pressed", hideChartEnabled ? "true" : "false");
  };

  const setHideChartEnabled = (enabled, options = {}) => {
    hideChartEnabled = Boolean(enabled);
    updateToggleButton();
    if (hideChartEnabled) {
      scheduleChartScan();
    } else {
      restoreChartElements();
    }
    if (options.persist !== false) {
      persistHideSetting(hideChartEnabled);
    }
  };

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      setHideChartEnabled(!hideChartEnabled);
    });
  }

  const parseAccountFilters = (text) =>
    String(text || "")
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const createHedgePanel = () => {
    const panel = document.createElement("div");
    panel.id = "var-hedge-panel-root";
    panel.innerHTML = `
      <style id="var-hedge-panel-style">
        #var-hedge-panel-root {
          position: fixed;
          top: 124px;
          right: 16px;
          width: 300px;
          z-index: 2147483647;
          background: transparent;
          border: none;
          border-radius: 0;
          color: #e2e8f0;
          box-shadow: none;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          padding: 0;
          pointer-events: none;
        }
        #var-hedge-panel-root h4 {
          margin: 0 0 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: move;
          user-select: none;
          pointer-events: auto;
        }
        #var-hedge-panel-root .row {
          display: grid;
          gap: 4px;
          margin-bottom: 8px;
        }
        #var-hedge-panel-root label {
          font-size: 11px;
          color: #94a3b8;
        }
        #var-hedge-panel-root textarea,
        #var-hedge-panel-root input {
          width: 100%;
          border: 1px solid #475569;
          background: #0b1220;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 6px 8px;
          font-size: 12px;
          box-sizing: border-box;
        }
        #var-hedge-panel-root textarea {
          min-height: 56px;
          resize: vertical;
        }
        #var-hedge-panel-root .actions {
          display: flex;
          gap: 6px;
          margin-bottom: 8px;
        }
        #var-hedge-panel-root button {
          border: 1px solid #475569;
          background: #1e293b;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          pointer-events: auto;
        }
        #var-hedge-panel-root button:hover {
          background: #334155;
        }
        #var-hedge-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 10px;
          padding: 8px;
          pointer-events: auto;
          backdrop-filter: blur(2px);
        }
        #var-hedge-config-toggle {
          padding: 4px 8px;
          font-size: 11px;
        }
        #var-hedge-config-block {
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 10px;
          padding: 8px;
          margin-bottom: 8px;
          pointer-events: auto;
          backdrop-filter: blur(2px);
        }
        #var-hedge-panel-status {
          font-size: 11px;
          color: #94a3b8;
          margin-bottom: 8px;
          background: rgba(15, 23, 42, 0.45);
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 8px;
          padding: 6px;
        }
        #var-hedge-panel-log {
          max-height: 120px;
          overflow: auto;
          margin-bottom: 8px;
          background: rgba(2, 6, 23, 0.55);
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 8px;
          padding: 6px;
          display: grid;
          gap: 4px;
          font-size: 10px;
          line-height: 1.35;
          pointer-events: auto;
        }
        #var-hedge-panel-log .log-line {
          color: #cbd5e1;
          word-break: break-all;
        }
        #var-hedge-panel-log .log-line.log-warn {
          color: #fca5a5;
        }
        #var-hedge-panel-log .log-line.log-error {
          color: #f87171;
        }
        #var-hedge-panel-list {
          max-height: 260px;
          overflow: auto;
          display: grid;
          gap: 6px;
        }
        #var-hedge-panel-list .item {
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 8px;
          padding: 6px;
          font-size: 12px;
          line-height: 1.35;
          background: rgba(17, 24, 39, 0.5);
          pointer-events: none;
        }
        #var-hedge-panel-list .item .muted {
          color: #94a3b8;
          font-size: 11px;
        }
        #var-hedge-panel-list .item .actions-inline {
          margin-top: 6px;
          display: flex;
          gap: 6px;
        }
        #var-hedge-panel-list .item .apply-risk-button {
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(30, 41, 59, 0.65);
          color: #e2e8f0;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          pointer-events: auto;
        }
        #var-hedge-panel-list .item .apply-risk-button:hover {
          background: rgba(51, 65, 85, 0.8);
        }
        #var-hedge-panel-list .item .apply-risk-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        #var-hedge-panel-list .item .open-order-button {
          border: 1px solid rgba(34, 197, 94, 0.45);
          background: rgba(34, 197, 94, 0.2);
          color: #dcfce7;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          pointer-events: auto;
        }
        #var-hedge-panel-list .item .open-order-button:hover {
          background: rgba(34, 197, 94, 0.28);
        }
        #var-hedge-panel-list .item .open-order-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        #var-hedge-panel-list .item .close-order-button {
          border: 1px solid rgba(239, 68, 68, 0.5);
          background: rgba(239, 68, 68, 0.2);
          color: #fee2e2;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          pointer-events: auto;
        }
        #var-hedge-panel-list .item .close-order-button:hover {
          background: rgba(239, 68, 68, 0.28);
        }
        #var-hedge-panel-list .item .close-order-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        #var-hedge-panel-list .side-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 1px 8px;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.5;
          border: 1px solid transparent;
        }
        #var-hedge-panel-list .side-long {
          color: #22c55e;
          background: rgba(34, 197, 94, 0.16);
          border-color: rgba(34, 197, 94, 0.45);
        }
        #var-hedge-panel-list .side-short {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.16);
          border-color: rgba(239, 68, 68, 0.45);
        }
        #var-hedge-panel-list .side-neutral {
          color: #cbd5e1;
          background: rgba(148, 163, 184, 0.12);
          border-color: rgba(148, 163, 184, 0.35);
        }
      </style>
      <div id="var-hedge-panel-header">
        <h4 id="var-hedge-panel-title" style="margin:0;">对冲分组快照</h4>
        <button id="var-hedge-config-toggle" type="button">设置</button>
      </div>
      <div id="var-hedge-config-block">
        <div class="row">
          <label for="var-hedge-accounts">账号（逗号或换行）</label>
          <textarea id="var-hedge-accounts" placeholder="例如：12(512), 5(505)"></textarea>
        </div>
        <div class="row">
          <label for="var-hedge-api-url">接口地址</label>
          <input id="var-hedge-api-url" />
        </div>
        <div class="actions">
          <button id="var-hedge-save" type="button">保存</button>
          <button id="var-hedge-refresh" type="button">刷新</button>
        </div>
      </div>
      <div id="var-hedge-panel-status">等待刷新</div>
      <div id="var-hedge-panel-log"></div>
      <div id="var-hedge-panel-list"></div>
    `;

    (document.body || document.documentElement).appendChild(panel);
    return panel;
  };

  const hedgePanel = createHedgePanel();
  const hedgeAccountsInput = hedgePanel.querySelector("#var-hedge-accounts");
  const hedgeApiInput = hedgePanel.querySelector("#var-hedge-api-url");
  const hedgeConfigBlock = hedgePanel.querySelector("#var-hedge-config-block");
  const hedgeConfigToggle = hedgePanel.querySelector("#var-hedge-config-toggle");
  const hedgeSaveButton = hedgePanel.querySelector("#var-hedge-save");
  const hedgeRefreshButton = hedgePanel.querySelector("#var-hedge-refresh");
  const hedgeStatus = hedgePanel.querySelector("#var-hedge-panel-status");
  const hedgeLogBox = hedgePanel.querySelector("#var-hedge-panel-log");
  const hedgeList = hedgePanel.querySelector("#var-hedge-panel-list");
  const hedgePanelTitle = hedgePanel.querySelector("#var-hedge-panel-title");
  let hedgeConfigHidden = false;
  let hedgeRefreshing = false;
  const HEDGE_LOG_MAX_LINES = 120;

  const setRefreshing = (refreshing) => {
    hedgeRefreshing = Boolean(refreshing);
    if (hedgeRefreshButton) {
      hedgeRefreshButton.disabled = hedgeRefreshing;
      hedgeRefreshButton.textContent = hedgeRefreshing ? "刷新中..." : "刷新";
    }
  };

  const setRefreshProgress = (step, total, text) => {
    if (!hedgeStatus) {
      return;
    }
    hedgeStatus.textContent = `刷新进度 ${step}/${total}：${text}`;
  };

  const stringifyLogPayload = (payload) => {
    if (payload === undefined) {
      return "";
    }
    if (typeof payload === "string") {
      return payload;
    }
    try {
      const json = JSON.stringify(payload);
      return json.length > 420 ? `${json.slice(0, 420)}...` : json;
    } catch (_error) {
      return String(payload);
    }
  };

  const appendHedgeLog = (level, message, payload) => {
    if (!hedgeLogBox) {
      return;
    }
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const item = document.createElement("div");
    item.className = `log-line log-${level}`;
    const payloadText = stringifyLogPayload(payload);
    item.textContent = `[${hh}:${mm}:${ss}] [${String(level || "info").toUpperCase()}] ${message}${payloadText ? ` | ${payloadText}` : ""}`;
    hedgeLogBox.appendChild(item);
    while (hedgeLogBox.childElementCount > HEDGE_LOG_MAX_LINES) {
      hedgeLogBox.removeChild(hedgeLogBox.firstElementChild);
    }
    hedgeLogBox.scrollTop = hedgeLogBox.scrollHeight;
  };

  const logHedgeInfo = (message, payload) => {
    if (payload !== undefined) {
      console.info(`[var] ${message}`, payload);
    } else {
      console.info(`[var] ${message}`);
    }
    appendHedgeLog("info", message, payload);
  };

  const logHedgeWarn = (message, payload) => {
    if (payload !== undefined) {
      console.warn(`[var] ${message}`, payload);
    } else {
      console.warn(`[var] ${message}`);
    }
    appendHedgeLog("warn", message, payload);
  };

  const setConfigHidden = (hidden, options = {}) => {
    hedgeConfigHidden = Boolean(hidden);
    if (hedgeConfigBlock) {
      hedgeConfigBlock.style.display = hedgeConfigHidden ? "none" : "";
    }
    if (hedgeConfigToggle) {
      hedgeConfigToggle.textContent = hedgeConfigHidden ? "设置" : "收起";
    }
    if (options.persist !== false && hedgeAccountsInput && hedgeApiInput) {
      const apiUrl = String(hedgeApiInput.value || "").trim() || DEFAULT_HEDGE_API_URL;
      void saveHedgeSettings(hedgeAccountsInput.value, apiUrl, hedgeConfigHidden);
    }
  };

  const clampHedgePanelPosition = (left, top) => {
    const panelWidth = hedgePanel.offsetWidth || 300;
    const panelHeight = hedgePanel.offsetHeight || 280;
    const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);
    return {
      left: Math.min(Math.max(8, left), maxLeft),
      top: Math.min(Math.max(8, top), maxTop)
    };
  };

  const applyHedgePanelPosition = (left, top) => {
    const next = clampHedgePanelPosition(left, top);
    hedgePanel.style.left = `${next.left}px`;
    hedgePanel.style.top = `${next.top}px`;
    hedgePanel.style.right = "auto";
    return next;
  };

  if (hedgePanelTitle) {
    hedgePanelTitle.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();

      const rect = hedgePanel.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;

      const onMouseMove = (moveEvent) => {
        const targetLeft = moveEvent.clientX - offsetX;
        const targetTop = moveEvent.clientY - offsetY;
        applyHedgePanelPosition(targetLeft, targetTop);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        const rectAfter = hedgePanel.getBoundingClientRect();
        const next = clampHedgePanelPosition(rectAfter.left, rectAfter.top);
        void saveHedgePanelPosition(next);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }

  window.addEventListener("resize", () => {
    const rect = hedgePanel.getBoundingClientRect();
    applyHedgePanelPosition(rect.left, rect.top);
  });

  const escapeHtml = (value) =>
    String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, (char) => {
      if (char === "&") {
        return "&amp;";
      }
      if (char === "<") {
        return "&lt;";
      }
      if (char === ">") {
        return "&gt;";
      }
      if (char === '"') {
        return "&quot;";
      }
      return "&#39;";
    });

  const formatRiskPrice = (value) => {
    if (value === null || value === undefined) {
      return "--";
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return "--";
    }
    return String(Math.floor(num / 100) * 100);
  };

  const hasRiskValue = (value) => {
    const text = String(value || "").trim();
    return Boolean(text && text !== "--");
  };

  const parsePositiveNumber = (value) => {
    const num = Number(String(value || "").trim());
    if (!Number.isFinite(num) || num <= 0) {
      return null;
    }
    return num;
  };

  const parseSignedNumber = (value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }
    const normalized = text
      .replace(/[−–—‒﹣－]/g, "-")
      .replace(/,/g, "");
    const direct = Number(normalized);
    if (Number.isFinite(direct)) {
      return direct;
    }
    const matched = normalized.match(/[-+]?\d*\.?\d+/);
    if (!matched) {
      return null;
    }
    const fallback = Number(matched[0]);
    return Number.isFinite(fallback) ? fallback : null;
  };

  const extractSignedNumberTokens = (value) => {
    const text = String(value || "").trim();
    if (!text) {
      return [];
    }
    const normalized = text
      .replace(/[−–—‒﹣－]/g, "-")
      .replace(/,/g, "");
    const matches = normalized.match(/[-+]?\d*\.?\d+/g);
    if (!matches || matches.length === 0) {
      return [];
    }
    return matches
      .map((token) => ({
        token,
        value: Number(token)
      }))
      .filter((item) => Number.isFinite(item.value) && item.value !== 0);
  };

  const normalizeCellText = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const normalizeNumericText = (value) => String(value || "").replace(/[$,]/g, "").trim();

  const getDecimalPlaces = (value) => {
    const text = String(value || "").trim();
    const dotIndex = text.indexOf(".");
    if (dotIndex < 0) {
      return 0;
    }
    const fraction = text.slice(dotIndex + 1).replace(/[^0-9]/g, "");
    return fraction.length;
  };

  const formatNumberByScale = (value, scale) => {
    if (!Number.isFinite(value)) {
      return "";
    }
    const precision = Math.max(0, Math.min(8, scale));
    const fixed = value.toFixed(precision);
    return fixed.replace(/(\.\d*?[1-9])0+$/g, "$1").replace(/\.0+$/g, "");
  };

  const sumPositiveTexts = (values) =>
    values.reduce((acc, item) => {
      const parsed = parsePositiveNumber(item);
      return acc + (parsed || 0);
    }, 0);

  const randomBetween = (min, max) => min + Math.random() * (max - min);

  const getRandomOpenSplitIntervalMs = () => {
    const minMs = Number.isFinite(OPEN_SPLIT_INTERVAL_MIN_MS) ? OPEN_SPLIT_INTERVAL_MIN_MS : 300;
    const maxMs = Number.isFinite(OPEN_SPLIT_INTERVAL_MAX_MS) ? OPEN_SPLIT_INTERVAL_MAX_MS : 500;
    const lower = Math.max(0, Math.min(minMs, maxMs));
    const upper = Math.max(lower, Math.max(minMs, maxMs));
    return Math.round(randomBetween(lower, upper));
  };

  const buildOpenSlices = (totalQtyText) => {
    const totalQty = parsePositiveNumber(totalQtyText);
    if (!totalQty) {
      return [];
    }
    const minSplit = Number.isFinite(OPEN_SPLIT_MIN_QTY) ? OPEN_SPLIT_MIN_QTY : 0.08;
    const maxSplit = Number.isFinite(OPEN_SPLIT_MAX_QTY) ? OPEN_SPLIT_MAX_QTY : 0.15;
    const lower = Math.max(0.0001, Math.min(minSplit, maxSplit));
    const upper = Math.max(lower, Math.max(minSplit, maxSplit));

    if (totalQty <= upper) {
      return [String(totalQtyText).trim()];
    }

    const scale = Number.isFinite(OPEN_SPLIT_DECIMALS) ? Math.max(0, Math.min(8, OPEN_SPLIT_DECIMALS)) : 2;
    const slices = [];
    let remaining = totalQty;
    const epsilon = Math.pow(10, -(scale + 1));

    while (remaining > epsilon) {
      let next = Math.min(randomBetween(lower, upper), remaining);
      // Keep the tail either zero or >= lower, to avoid tiny leftover slices.
      if (remaining - next < lower && remaining - next > epsilon) {
        next = remaining;
      }
      const normalized = Number(next.toFixed(scale));
      if (!Number.isFinite(normalized) || normalized <= 0) {
        break;
      }
      slices.push(formatNumberByScale(normalized, scale));
      remaining = Number((remaining - normalized).toFixed(scale + 2));
    }

    if (!slices.length) {
      return [String(totalQtyText).trim()];
    }

    const totalFromSlices = slices.reduce((acc, item) => acc + (Number(item) || 0), 0);
    const diff = Number((totalQty - totalFromSlices).toFixed(scale + 2));
    if (Math.abs(diff) > epsilon) {
      const last = Number(slices[slices.length - 1] || 0);
      const merged = Number((last + diff).toFixed(scale));
      slices[slices.length - 1] = formatNumberByScale(merged, scale);
    }

    return slices.filter((item) => parsePositiveNumber(item));
  };

  const isInputLikeElement = (el) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    const tag = String(el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea";
  };

  const isHtmlInputElementLike = (el) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    return String(el.tagName || "").toLowerCase() === "input";
  };

  const getElementWindow = (el) => (el && el.ownerDocument && el.ownerDocument.defaultView) || window;

  const formatQuantityForInput = (value) => {
    if (value === null || value === undefined) {
      return "--";
    }
    const raw = String(value).trim();
    if (!raw) {
      return "--";
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      return "--";
    }
    return raw;
  };

  const isEditableInput = (el) => {
    if (!isInputLikeElement(el)) {
      return false;
    }
    if (el.disabled || el.readOnly) {
      return false;
    }
    if (el.getAttribute("aria-hidden") === "true") {
      return false;
    }
    if (el.type === "hidden") {
      return false;
    }
    const win = getElementWindow(el);
    const style = win.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    if (el.clientWidth <= 0 || el.clientHeight <= 0) {
      return false;
    }
    return true;
  };

  const getVisibleInputs = (selector, root = document) => {
    if (!root || typeof root.querySelectorAll !== "function") {
      return [];
    }
    return Array.from(root.querySelectorAll(selector)).filter((el) => isEditableInput(el));
  };

  const isInsideVarPanel = (node) => {
    if (!node || typeof node.closest !== "function") {
      return false;
    }
    return Boolean(node.closest("#var-hedge-panel-root") || node.closest("#var-toggle-root"));
  };

  const normalizeText = (value) => String(value || "").toLowerCase().replace(/\s+/g, "");

  const includesAnyKeyword = (value, keywords) => {
    const text = normalizeText(value);
    if (!text) {
      return false;
    }
    return keywords.some((keyword) => text.includes(keyword));
  };

  const scoreInputByKeywords = (input, rawKeywords) => {
    if (!input) {
      return 0;
    }
    const keywords = rawKeywords.map((keyword) => normalizeText(keyword)).filter(Boolean);
    if (!keywords.length) {
      return 0;
    }

    let score = 0;
    const directAttrs = [
      input.getAttribute("placeholder"),
      input.getAttribute("aria-label"),
      input.getAttribute("name"),
      input.getAttribute("id"),
      input.getAttribute("data-testid"),
      input.className
    ];
    directAttrs.forEach((value) => {
      if (includesAnyKeyword(value, keywords)) {
        score += 40;
      }
    });

    const prevSiblingText = input.previousElementSibling ? input.previousElementSibling.textContent : "";
    if (includesAnyKeyword(prevSiblingText, keywords)) {
      score += 35;
    }

    const scopedNodes = [
      input.closest("label"),
      input.closest('[class*="field" i]'),
      input.closest('[class*="form" i]'),
      input.closest('[class*="row" i]'),
      input.parentElement
    ].filter(Boolean);

    const visited = new Set();
    scopedNodes.forEach((node, index) => {
      if (visited.has(node)) {
        return;
      }
      visited.add(node);
      if (includesAnyKeyword(node.textContent, keywords)) {
        score += Math.max(8, 28 - index * 4);
      }
    });

    return score;
  };

  const findBestPriceInputByKeywords = (inputs, keywords, excludedInput = null) => {
    let best = null;
    let bestScore = 0;

    inputs.forEach((input) => {
      if (input === excludedInput) {
        return;
      }
      const score = scoreInputByKeywords(input, keywords);
      if (score > bestScore) {
        best = input;
        bestScore = score;
      }
    });

    return bestScore > 0 ? best : null;
  };

  const findInputBySelectors = (selectors) => {
    for (const selector of selectors) {
      const hit = getVisibleInputs(selector)[0];
      if (hit) {
        return hit;
      }
    }
    return null;
  };

  const findInputByLabelKeywords = (keywords) => {
    const lowerKeywords = keywords.map((item) => item.toLowerCase());
    const labelCandidates = Array.from(
      document.querySelectorAll("label, span, div, p, strong, h1, h2, h3, h4, h5")
    );

    for (const node of labelCandidates) {
      if (isInsideVarPanel(node)) {
        continue;
      }
      const text = String(node.textContent || "").trim().toLowerCase();
      if (!text || !lowerKeywords.some((key) => text.includes(key))) {
        continue;
      }

      if (typeof node.getAttribute === "function") {
        const forId = node.getAttribute("for");
        if (forId) {
          const byFor = document.getElementById(forId);
          if (isEditableInput(byFor)) {
            return byFor;
          }
        }
      }

      const scopes = [
        node.closest("label"),
        node.closest('[class*="form" i]'),
        node.closest('[class*="field" i]'),
        node.closest('[class*="row" i]'),
        node.parentElement
      ].filter(Boolean);

      for (const scope of scopes) {
        const withTestId = getVisibleInputs('input[data-testid="price-input"], textarea', scope)[0];
        if (withTestId) {
          return withTestId;
        }
        const generic = getVisibleInputs("input, textarea", scope)[0];
        if (generic) {
          return generic;
        }
      }
    }

    return null;
  };

  const getPriceInputContextText = (input) => {
    const scopes = [
      input.closest("label"),
      input.closest('[class*="row" i]'),
      input.closest('[class*="item" i]'),
      input.closest('[class*="field" i]'),
      input.closest("li"),
      input.closest("tr"),
      input.parentElement,
      input.parentElement ? input.parentElement.parentElement : null
    ].filter(Boolean);

    const visited = new Set();
    const chunks = [];
    scopes.forEach((scope) => {
      if (visited.has(scope) || isInsideVarPanel(scope)) {
        return;
      }
      visited.add(scope);
      const text = String(scope.textContent || "").trim();
      if (text) {
        chunks.push(text);
      }
    });
    return normalizeText(chunks.join(" "));
  };

  const classifyPriceInputsByRowSemantic = (inputs) => {
    let takeProfitInput = null;
    let stopLossInput = null;
    let bestTpScore = 0;
    let bestSlScore = 0;

    inputs.forEach((input) => {
      const context = getPriceInputContextText(input);
      if (!context) {
        return;
      }

      let tpScore = 0;
      let slScore = 0;
      if (context.includes("takeprofit")) {
        tpScore += 120;
      }
      if (context.includes("stoploss")) {
        slScore += 120;
      }
      if (context.includes("tp")) {
        tpScore += 80;
      }
      if (context.includes("sl")) {
        slScore += 80;
      }
      if (context.includes("gain")) {
        tpScore += 45;
      }
      if (context.includes("loss")) {
        slScore += 45;
      }
      if (context.includes("止盈")) {
        tpScore += 90;
      }
      if (context.includes("止损")) {
        slScore += 90;
      }

      if (tpScore > bestTpScore) {
        bestTpScore = tpScore;
        takeProfitInput = input;
      }
      if (slScore > bestSlScore) {
        bestSlScore = slScore;
        stopLossInput = input;
      }
    });

    if (takeProfitInput && stopLossInput && takeProfitInput === stopLossInput) {
      const another = inputs.find((item) => item !== takeProfitInput);
      if (another) {
        if (bestTpScore >= bestSlScore) {
          stopLossInput = another;
        } else {
          takeProfitInput = another;
        }
      }
    }

    return {
      takeProfitInput,
      stopLossInput,
      bestTpScore,
      bestSlScore
    };
  };

  const getQuantityInputCandidates = (root = document) =>
    Array.from(root.querySelectorAll(PAGE_QTY_SELECTOR)).filter((el) => !isInsideVarPanel(el));

  const collectAccessibleDocuments = () => {
    const docs = [];
    const queue = [document];
    const visited = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);
      docs.push(current);
      const frames = Array.from(current.querySelectorAll("iframe, frame"));
      frames.forEach((frame) => {
        try {
          const subDoc = frame.contentDocument;
          if (subDoc && !visited.has(subDoc)) {
            queue.push(subDoc);
          }
        } catch (_error) {
          // Ignore cross-origin frame access errors.
        }
      });
    }

    return docs;
  };

  const getAllQuantityInputCandidates = () => {
    const all = [];
    const docs = collectAccessibleDocuments();
    docs.forEach((doc) => {
      getQuantityInputCandidates(doc).forEach((input) => {
        if (!all.includes(input)) {
          all.push(input);
        }
      });
    });
    return all;
  };

  const findElementByXPath = (xpath, doc = document) => {
    if (!xpath) {
      return null;
    }
    try {
      const result = doc.evaluate(
        xpath,
        doc,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result ? result.singleNodeValue : null;
    } catch (_error) {
      return null;
    }
  };

  const findInputByXPath = (xpath, doc = document) => {
    const node = findElementByXPath(xpath, doc);
    return isHtmlInputElementLike(node) ? node : null;
  };

  const findInputByXPathInAllDocuments = (xpath) => {
    const docs = collectAccessibleDocuments();
    for (const doc of docs) {
      const input = findInputByXPath(xpath, doc);
      if (input) {
        return input;
      }
    }
    return null;
  };

  const findElementByXPathInAllDocuments = (xpath) => {
    const docs = collectAccessibleDocuments();
    for (const doc of docs) {
      const node = findElementByXPath(xpath, doc);
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        return node;
      }
    }
    return null;
  };

  const findQuantityInput = () => {
    const byXPath = findInputByXPathInAllDocuments(PAGE_QTY_XPATH);
    if (byXPath && !isInsideVarPanel(byXPath)) {
      return byXPath;
    }
    const allCandidates = getAllQuantityInputCandidates();
    const visibleEditable = allCandidates.find((el) => isEditableInput(el));
    if (visibleEditable) {
      return visibleEditable;
    }
    return allCandidates[0] || null;
  };

  const findQuantityInputNear = (anchorInput) => {
    if (!anchorInput) {
      return null;
    }
    const scopeCandidates = [
      anchorInput.closest("form"),
      anchorInput.closest('[class*="order" i]'),
      anchorInput.closest('[class*="panel" i]'),
      anchorInput.closest('[class*="card" i]'),
      anchorInput.closest('[class*="section" i]'),
      anchorInput.parentElement,
      anchorInput.parentElement ? anchorInput.parentElement.parentElement : null
    ].filter(Boolean);

    for (const scope of scopeCandidates) {
      const list = getQuantityInputCandidates(scope);
      const visibleEditable = list.find((el) => isEditableInput(el));
      if (visibleEditable) {
        return visibleEditable;
      }
      if (list[0]) {
        return list[0];
      }
    }
    return null;
  };

  const findRiskInputs = () => {
    const quantitySelectors = [
      PAGE_QTY_SELECTOR,
      'input[name*="quantity" i]',
      'input[name*="qty" i]',
      'input[name*="size" i]',
      'input[id*="quantity" i]',
      'input[id*="qty" i]',
      'input[id*="size" i]',
      'input[placeholder*="仓位"]',
      'input[placeholder*="数量"]'
    ];
    const stopLossSelectors = [
      'input[data-testid="stop-loss-price-input"]',
      'input[name*="stop" i]',
      'input[id*="stop" i]',
      'input[placeholder*="止损"]',
      'input[aria-label*="止损"]'
    ];
    const takeProfitSelectors = [
      'input[data-testid="take-profit-price-input"]',
      'input[name*="profit" i]',
      'input[id*="profit" i]',
      'input[placeholder*="止盈"]',
      'input[aria-label*="止盈"]'
    ];

    let stopLossInput =
      findInputBySelectors(stopLossSelectors) || findInputByLabelKeywords(["止损", "stop loss", "stop-loss"]);
    let takeProfitInput =
      findInputBySelectors(takeProfitSelectors) || findInputByLabelKeywords(["止盈", "take profit", "take-profit"]);

    const visiblePriceInputs = getVisibleInputs('input[data-testid="price-input"]');
    const rowSemantic = classifyPriceInputsByRowSemantic(visiblePriceInputs);

    if (rowSemantic.takeProfitInput && rowSemantic.stopLossInput) {
      takeProfitInput = rowSemantic.takeProfitInput;
      stopLossInput = rowSemantic.stopLossInput;
    } else {
      if (!takeProfitInput && rowSemantic.takeProfitInput) {
        takeProfitInput = rowSemantic.takeProfitInput;
      }
      if (!stopLossInput && rowSemantic.stopLossInput) {
        stopLossInput = rowSemantic.stopLossInput;
      }
    }

    if (!stopLossInput && visiblePriceInputs.length > 0) {
      stopLossInput =
        findBestPriceInputByKeywords(visiblePriceInputs, ["止损", "止损价", "stoploss", "sl"]) ||
        (visiblePriceInputs.length > 1 ? visiblePriceInputs[1] : visiblePriceInputs[0]);
    }
    if (!takeProfitInput && visiblePriceInputs.length > 0) {
      takeProfitInput =
        findBestPriceInputByKeywords(
          visiblePriceInputs,
          ["止盈", "止盈价", "takeprofit", "tp"],
          stopLossInput || null
        ) ||
        visiblePriceInputs.find((el) => el !== stopLossInput) ||
        visiblePriceInputs[0] ||
        null;
    }

    if (stopLossInput && takeProfitInput && stopLossInput === takeProfitInput) {
      const another = visiblePriceInputs.find((el) => el !== stopLossInput);
      if (another) {
        if (visiblePriceInputs.indexOf(stopLossInput) === 0) {
          takeProfitInput = stopLossInput;
          stopLossInput = another;
        } else {
          takeProfitInput = another;
        }
      }
    }

    if (!stopLossInput && takeProfitInput) {
      const another = visiblePriceInputs.find((el) => el !== takeProfitInput);
      if (another) {
        stopLossInput = another;
      }
    }

    const quantityInput =
      findQuantityInputNear(takeProfitInput || stopLossInput) ||
      findQuantityInput() ||
      findInputBySelectors(quantitySelectors) ||
      findInputByLabelKeywords(["仓位", "数量", "size", "quantity", "qty", "position size"]);

    return {
      quantityInput: quantityInput || null,
      stopLossInput: stopLossInput || null,
      takeProfitInput: takeProfitInput || null
    };
  };

  const isVisibleElement = (el) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    const win = getElementWindow(el);
    const style = win.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return el.clientWidth > 0 && el.clientHeight > 0;
  };

  const getVisibleRiskPriceInputs = () => {
    const all = [];
    const docs = collectAccessibleDocuments();
    docs.forEach((doc) => {
      getVisibleInputs('input[data-testid="price-input"]', doc).forEach((input) => {
        if (!all.includes(input)) {
          all.push(input);
        }
      });
    });
    return all;
  };

  const hasVisibleRiskPriceInputs = () => getVisibleRiskPriceInputs().length > 0;

  const findTpSlToggleButton = () => {
    const titleSelectors = [
      'button[title*="Take Profit / Stop Loss" i]',
      'button[title*="Take Profit/Stop Loss" i]',
      'button[title*="Take Profit" i][title*="Stop Loss" i]'
    ];
    const docs = collectAccessibleDocuments();

    for (const doc of docs) {
      for (const selector of titleSelectors) {
        const hit = Array.from(doc.querySelectorAll(selector)).find(
          (el) => !isInsideVarPanel(el) && isVisibleElement(el)
        );
        if (hit) {
          return hit;
        }
      }

      const byText = Array.from(doc.querySelectorAll("button")).find((el) => {
        if (isInsideVarPanel(el) || !isVisibleElement(el)) {
          return false;
        }
        const text = normalizeText(el.textContent || "");
        return (
          text.includes("takeprofit/stoploss") ||
          text.includes("takeprofitstoploss") ||
          (text.includes("takeprofit") && text.includes("stoploss"))
        );
      });
      if (byText) {
        return byText;
      }
    }

    return null;
  };

  const hasClassToken = (el, token) => {
    if (!el || !token) {
      return false;
    }
    if (el.classList && typeof el.classList.contains === "function") {
      return el.classList.contains(token);
    }
    const classText = String(el.className || "");
    return classText.split(/\s+/).includes(token);
  };

  const isButtonDisabled = (button) => {
    if (!button) {
      return false;
    }
    if (button.disabled) {
      return true;
    }
    return button.getAttribute("aria-disabled") === "true";
  };

  const isButtonClickable = (button) => Boolean(button) && !isButtonDisabled(button);

  const hasBuyActiveStyle = (button) =>
    hasClassToken(button, "text-green") ||
    hasClassToken(button, "border-green") ||
    hasClassToken(button, "fill-green");

  const hasSellActiveStyle = (button) =>
    hasClassToken(button, "text-red") ||
    hasClassToken(button, "border-red") ||
    hasClassToken(button, "fill-red");

  const getButtonSemanticText = (button) => normalizeText(button ? button.textContent || "" : "");

  const hasAnyTextKeyword = (text, keywords) =>
    keywords.some((keyword) => text.includes(normalizeText(keyword)));

  const isLikelyRiskSettingButton = (button) => {
    const text = getButtonSemanticText(button);
    if (!text) {
      return false;
    }
    return (
      text.includes("takeprofit/stoploss") ||
      text.includes("takeprofitstoploss") ||
      text.includes("reduceonly") ||
      text.includes("autoresize") ||
      text === "mark" ||
      text.includes("trigger")
    );
  };

  const getSharedPanelScore = (button, anchorInput) => {
    if (!button || !anchorInput || button.ownerDocument !== anchorInput.ownerDocument) {
      return 0;
    }
    let node = anchorInput.parentElement;
    let depth = 0;
    while (node && depth < 10) {
      if (node.contains(button)) {
        return Math.max(0, 120 - depth * 12);
      }
      node = node.parentElement;
      depth += 1;
    }
    return 0;
  };

  const describeButtonBrief = (button) => {
    if (!button) {
      return {
        exists: false
      };
    }
    const rawText = String(button.textContent || "").replace(/\s+/g, " ").trim();
    return {
      exists: true,
      tag: String(button.tagName || "").toLowerCase(),
      text: rawText.slice(0, 80),
      testId: String(button.getAttribute("data-testid") || ""),
      className: String(button.className || "").slice(0, 120),
      disabled: isButtonDisabled(button)
    };
  };

  const findPageSideButtons = () => {
    let buyButton = null;
    let sellButton = null;

    const docs = collectAccessibleDocuments();
    for (const doc of docs) {
      const buyAnchor = doc.querySelector(PAGE_BUY_PRICE_SELECTOR);
      const sellAnchor = doc.querySelector(PAGE_SELL_PRICE_SELECTOR);
      if (buyAnchor && typeof buyAnchor.closest === "function") {
        const candidate = buyAnchor.closest("button");
        if (candidate && !candidate.closest("#var-hedge-panel-root")) {
          buyButton = candidate;
        }
      }
      if (sellAnchor && typeof sellAnchor.closest === "function") {
        const candidate = sellAnchor.closest("button");
        if (candidate && !candidate.closest("#var-hedge-panel-root")) {
          sellButton = candidate;
        }
      }
      if (buyButton && sellButton) {
        return { buyButton, sellButton };
      }
    }

    for (const doc of docs) {
      const candidates = Array.from(doc.querySelectorAll("button")).filter(
        (button) => !button.closest("#var-hedge-panel-root")
      );
      if (!buyButton) {
        buyButton = candidates.find((button) => /\bbuy\b/i.test(button.textContent || "")) || null;
      }
      if (!sellButton) {
        sellButton = candidates.find((button) => /\bsell\b/i.test(button.textContent || "")) || null;
      }
      if (buyButton && sellButton) {
        break;
      }
    }

    return { buyButton, sellButton };
  };

  const getPageSideState = () => {
    const { buyButton, sellButton } = findPageSideButtons();
    let currentSide = null;
    if (buyButton && sellButton) {
      const buyDisabled = isButtonDisabled(buyButton);
      const sellDisabled = isButtonDisabled(sellButton);
      if (buyDisabled && !sellDisabled) {
        currentSide = "buy";
      } else if (sellDisabled && !buyDisabled) {
        currentSide = "sell";
      } else if (hasBuyActiveStyle(buyButton) && !hasSellActiveStyle(sellButton)) {
        currentSide = "buy";
      } else if (hasSellActiveStyle(sellButton) && !hasBuyActiveStyle(buyButton)) {
        currentSide = "sell";
      }
    }
    return { buyButton, sellButton, currentSide };
  };

  const resolveTargetPageSide = (rawSide) => {
    const sideValue = String(rawSide || "").toLowerCase();
    if (
      sideValue.includes("开多") ||
      sideValue.includes("buy") ||
      sideValue.includes("long") ||
      sideValue === "多"
    ) {
      return "buy";
    }
    if (
      sideValue.includes("开空") ||
      sideValue.includes("sell") ||
      sideValue.includes("short") ||
      sideValue === "空"
    ) {
      return "sell";
    }
    return "";
  };

  const ensurePageSide = async (rawSide) => {
    const targetSide = resolveTargetPageSide(rawSide);
    if (!targetSide) {
      return { ok: true, reason: "unknown_side_skip", targetSide: "" };
    }
    const { buyButton, sellButton, currentSide } = getPageSideState();
    const targetButton = targetSide === "buy" ? buyButton : sellButton;
    if (!targetButton) {
      return { ok: false, reason: "side_button_missing", targetSide };
    }
    if (currentSide === targetSide) {
      return { ok: true, reason: "already_target_side", targetSide };
    }
    if (!isButtonClickable(targetButton)) {
      return { ok: false, reason: "side_button_disabled", targetSide };
    }

    await clickElementLikeUser(targetButton);
    const switched = await waitForCondition(() => {
      const state = getPageSideState();
      return state.currentSide === targetSide;
    }, {
      timeoutMs: 1200,
      intervalMs: 80
    });
    if (switched) {
      return { ok: true, reason: "switched", targetSide };
    }

    if (typeof targetButton.click === "function") {
      targetButton.click();
    }
    const switchedByNative = await waitForCondition(() => {
      const state = getPageSideState();
      return state.currentSide === targetSide;
    }, {
      timeoutMs: 1000,
      intervalMs: 80
    });
    if (switchedByNative) {
      return { ok: true, reason: "switched_by_native_click", targetSide };
    }

    return { ok: false, reason: "switch_timeout", targetSide };
  };

  const findPageSubmitButton = (targetSide) => {
    const docs = collectAccessibleDocuments();
    const isSideAware = targetSide === "buy" || targetSide === "sell";
    const sideValue = targetSide === "sell" ? "sell" : "buy";
    const sideClass = sideValue === "sell" ? "bg-red" : "bg-green";
    const sideRegex = sideValue === "sell" ? /\bsell\b/i : /\bbuy\b/i;
    const sideKeywords = sideValue === "sell"
      ? ["sell", "short", "开空", "做空", "卖出"]
      : ["buy", "long", "开多", "做多", "买入"];
    const actionKeywords = ["open", "order", "开仓", "下单", "confirm", "确认"];

    let bestCandidate = null;
    let bestScore = -Infinity;

    const matchesTargetSide = (button) => {
      if (!isSideAware) {
        return true;
      }
      const text = getButtonSemanticText(button);
      return hasClassToken(button, sideClass) || sideRegex.test(button.textContent || "") || hasAnyTextKeyword(text, sideKeywords);
    };

    const xpathNode = findElementByXPathInAllDocuments(PAGE_SUBMIT_XPATH);
    if (xpathNode && xpathNode.nodeType === Node.ELEMENT_NODE) {
      const xpathButton = String(xpathNode.tagName || "").toLowerCase() === "button"
        ? xpathNode
        : (typeof xpathNode.closest === "function" ? xpathNode.closest("button") : null);
      if (
        xpathButton &&
        !xpathButton.closest("#var-hedge-panel-root") &&
        isVisibleElement(xpathButton) &&
        !isLikelyRiskSettingButton(xpathButton) &&
        matchesTargetSide(xpathButton)
      ) {
        return xpathButton;
      }
    }

    const evaluateCandidate = (button, anchorInput) => {
      if (!button || button.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      if (button.closest("#var-hedge-panel-root")) {
        return;
      }
      if (!isVisibleElement(button)) {
        return;
      }
      if (button.querySelector('input[type="checkbox"]')) {
        return;
      }
      if (isLikelyRiskSettingButton(button)) {
        return;
      }

      const text = getButtonSemanticText(button);
      const testId = normalizeText(button.getAttribute("data-testid") || "");
      const hasSideText = isSideAware
        ? sideRegex.test(button.textContent || "") || hasAnyTextKeyword(text, sideKeywords)
        : false;
      const hasActionText = hasAnyTextKeyword(text, actionKeywords);
      const hasOppositeText = isSideAware
        ? (sideValue === "sell" ? /\bbuy\b/i.test(button.textContent || "") : /\bsell\b/i.test(button.textContent || ""))
        : false;

      let score = 0;
      if (button.matches(PAGE_SUBMIT_SELECTOR)) {
        score += 240;
      }
      if (testId.includes("submit")) {
        score += 120;
      } else if (testId.includes("order")) {
        score += 80;
      }
      if (isSideAware && hasClassToken(button, sideClass)) {
        score += 90;
      }
      if (isSideAware && hasSideText) {
        score += 65;
      }
      if (hasActionText) {
        score += 45;
      }
      if (isSideAware && hasOppositeText && !hasSideText) {
        score -= 80;
      }
      if (button.querySelector(PAGE_BUY_PRICE_SELECTOR) || button.querySelector(PAGE_SELL_PRICE_SELECTOR)) {
        score -= 120;
      }
      if (!isButtonDisabled(button)) {
        score += 18;
      } else {
        score -= 36;
      }
      score += getSharedPanelScore(button, anchorInput);

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = button;
      }
    };

    for (const doc of docs) {
      const seen = new Set();
      const append = (button) => {
        if (!button || seen.has(button)) {
          return;
        }
        seen.add(button);
        const qtyInDoc = getQuantityInputCandidates(doc)[0] || null;
        evaluateCandidate(button, qtyInDoc);
      };

      Array.from(doc.querySelectorAll(PAGE_SUBMIT_SELECTOR)).forEach((button) => append(button));
      Array.from(doc.querySelectorAll('button[data-testid*="submit" i], button[data-testid*="order" i]')).forEach((button) => append(button));

      Array.from(doc.querySelectorAll("button")).forEach((button) => {
        const text = getButtonSemanticText(button);
        if (!isSideAware || hasClassToken(button, sideClass) || hasAnyTextKeyword(text, sideKeywords)) {
          append(button);
        }
      });
    }

    return bestCandidate;
  };

  const clickPageSubmitWithRetry = async (targetSide, options = {}) => {
    const attempts = Number.isFinite(Number(options.attempts)) ? Math.max(1, Number(options.attempts)) : 8;
    const waitMs = Number.isFinite(Number(options.waitMs)) ? Math.max(40, Number(options.waitMs)) : 220;
    const debugLabel = String(options.debugLabel || "").trim();
    let sawCandidate = false;
    let sawDisabled = false;

    for (let index = 0; index < attempts; index += 1) {
      const fallbackNoSide = index >= Math.floor(attempts / 2);
      const submitButton = findPageSubmitButton(fallbackNoSide ? "" : targetSide);
      if (!submitButton) {
        if (index === 0 || index === attempts - 1) {
          logHedgeInfo("submit attempt no button", {
            debugLabel,
            targetSide,
            attempt: index + 1,
            attempts,
            fallbackNoSide
          });
        }
        await sleep(waitMs);
        continue;
      }
      sawCandidate = true;
      if (!isButtonClickable(submitButton)) {
        sawDisabled = true;
        if (index === 0 || index === attempts - 1) {
          logHedgeInfo("submit attempt button disabled", {
            debugLabel,
            targetSide,
            attempt: index + 1,
            attempts,
            fallbackNoSide,
            button: describeButtonBrief(submitButton)
          });
        }
        await sleep(waitMs);
        continue;
      }
      logHedgeInfo("submit attempt click", {
        debugLabel,
        targetSide,
        attempt: index + 1,
        attempts,
        fallbackNoSide,
        button: describeButtonBrief(submitButton)
      });
      await clickElementLikeUser(submitButton);
      await sleep(60);
      return { ok: true, reason: "submit_clicked" };
    }

    if (!sawCandidate) {
      logHedgeWarn("submit retry failed: missing button", {
        debugLabel,
        targetSide,
        attempts,
        waitMs
      });
      return { ok: false, reason: "submit_button_missing" };
    }
    if (sawDisabled) {
      logHedgeWarn("submit retry failed: button disabled", {
        debugLabel,
        targetSide,
        attempts,
        waitMs
      });
      return { ok: false, reason: "submit_button_disabled" };
    }
    logHedgeWarn("submit retry failed: not clickable", {
      debugLabel,
      targetSide,
      attempts,
      waitMs
    });
    return { ok: false, reason: "submit_button_not_clickable" };
  };

  const executeOpenOrderWithSplit = async (baseQtyText, side) => {
    const submitSide = resolveTargetPageSide(side);
    if (!submitSide) {
      logHedgeWarn("open split aborted: unknown side", {
        baseQtyText,
        side
      });
      return {
        ok: false,
        reason: "unknown_side",
        submitSide: "",
        totalBatches: 0,
        submittedBatches: 0
      };
    }

    const slices = buildOpenSlices(baseQtyText);
    if (!slices.length) {
      logHedgeWarn("open split aborted: invalid qty", {
        baseQtyText,
        side,
        submitSide
      });
      return {
        ok: false,
        reason: "invalid_qty",
        submitSide,
        totalBatches: 0,
        submittedBatches: 0
      };
    }

    logHedgeInfo("open split plan", {
      baseQtyText,
      side,
      submitSide,
      totalBatches: slices.length,
      slices
    });

    const waitForSliceFillReady = async ({ rawSide, beforeAbsQty, sliceQtyText, debugLabel }) => {
      const sliceQty = parsePositiveNumber(sliceQtyText);
      const beforeAbs = Number.isFinite(Number(beforeAbsQty)) ? Math.max(0, Number(beforeAbsQty)) : 0;
      if (!sliceQty) {
        return {
          ok: false,
          reason: "slice_fill_invalid_qty",
          beforeAbs,
          sliceQtyText
        };
      }
      const qtyStep = Math.pow(10, -Math.max(0, Math.min(8, OPEN_SPLIT_DECIMALS)));
      const minDelta = Math.max(OPEN_SPLIT_FILL_MIN_DELTA, sliceQty - qtyStep * 0.9);
      const matched = await waitForCondition(() => {
        const state = getOpenPositionStateBySide(rawSide);
        if (!state) {
          return null;
        }
        const currentAbs = Number.isFinite(state.absQty) ? Math.max(0, state.absQty) : 0;
        const delta = currentAbs - beforeAbs;
        if (delta >= minDelta) {
          return {
            state,
            currentAbs,
            delta
          };
        }
        return null;
      }, {
        timeoutMs: OPEN_SPLIT_FILL_TIMEOUT_MS,
        intervalMs: OPEN_SPLIT_FILL_INTERVAL_MS
      });

      if (matched) {
        return {
          ok: true,
          reason: "slice_fill_ready",
          beforeAbs,
          minDelta,
          sliceQty,
          state: matched.state,
          currentAbs: matched.currentAbs,
          delta: matched.delta,
          debugLabel
        };
      }

      const latest = getOpenPositionStateBySide(rawSide);
      const latestAbs = latest && Number.isFinite(latest.absQty) ? Math.max(0, latest.absQty) : null;
      const latestDelta = latestAbs === null ? null : latestAbs - beforeAbs;
      return {
        ok: false,
        reason: "slice_fill_not_ready",
        beforeAbs,
        minDelta,
        sliceQty,
        latestAbs,
        latestDelta,
        state: latest,
        debugLabel
      };
    };

    let submittedBatches = 0;
    for (let index = 0; index < slices.length; index += 1) {
      const sliceQty = slices[index];
      const debugLabel = `batch-${index + 1}/${slices.length}`;
      logHedgeInfo("open split batch start", {
        debugLabel,
        sliceQty,
        submitSide
      });
      const sideEnsure = await ensurePageSide(side);
      if (!sideEnsure.ok) {
        logHedgeWarn("open split batch failed: side ensure", {
          debugLabel,
          sliceQty,
          submitSide,
          sideEnsure
        });
        return {
          ok: false,
          reason: "side_switch_before_submit_failed",
          submitSide,
          totalBatches: slices.length,
          submittedBatches,
          failedBatch: index + 1,
          sideEnsure
        };
      }
      const beforeState = getOpenPositionStateBySide(side);
      const beforeAbsQty = beforeState && Number.isFinite(beforeState.absQty) ? Math.max(0, beforeState.absQty) : 0;
      const { quantityInput } = findRiskInputs();
      const qtySync = await syncQuantityWithRetry(sliceQty, {
        preferredInput: quantityInput || null,
        attempts: 4,
        waitMs: 100
      });
      if (!qtySync.ok) {
        logHedgeWarn("open split batch failed: qty sync", {
          debugLabel,
          sliceQty,
          submitSide,
          qtySync
        });
        return {
          ok: false,
          reason: "slice_qty_sync_failed",
          submitSide,
          totalBatches: slices.length,
          submittedBatches,
          failedBatch: index + 1,
          sliceQty,
          qtySync
        };
      }

      const submitResult = await clickPageSubmitWithRetry(submitSide, {
        attempts: 10,
        waitMs: 220,
        debugLabel
      });
      if (!submitResult.ok) {
        logHedgeWarn("open split batch submit failed", {
          debugLabel,
          sliceQty,
          submitSide,
          submitResult
        });
        const remainTexts = slices.slice(index);
        const mergedRemainQty = sumPositiveTexts(remainTexts);
        const mergedQtyText = formatNumberByScale(
          mergedRemainQty,
          OPEN_SPLIT_DECIMALS
        );
        if (parsePositiveNumber(mergedQtyText)) {
          const { quantityInput: mergedQtyInput } = findRiskInputs();
          const mergedQtySync = await syncQuantityWithRetry(mergedQtyText, {
            preferredInput: mergedQtyInput || null,
            attempts: 4,
            waitMs: 120
          });
          if (mergedQtySync.ok) {
            const mergedSideEnsure = await ensurePageSide(side);
            if (mergedSideEnsure.ok) {
              logHedgeInfo("open split merge fallback start", {
                debugLabel,
                mergedQtyText,
                submitSide
              });
              const mergedSubmit = await clickPageSubmitWithRetry(submitSide, {
                attempts: 12,
                waitMs: 260,
                debugLabel: `${debugLabel}-merge`
              });
              if (mergedSubmit.ok) {
                const mergedFillReady = await waitForSliceFillReady({
                  rawSide: side,
                  beforeAbsQty,
                  sliceQtyText: mergedQtyText,
                  debugLabel: `${debugLabel}-merge`
                });
                if (!mergedFillReady.ok) {
                  logHedgeWarn("open split merge fallback fill not ready", {
                    debugLabel,
                    mergedQtyText,
                    submitSide,
                    mergedFillReady
                  });
                  return {
                    ok: false,
                    reason: "slice_fill_not_ready",
                    submitSide,
                    totalBatches: slices.length,
                    submittedBatches,
                    failedBatch: index + 1,
                    sliceQty: mergedQtyText,
                    fillReady: mergedFillReady
                  };
                }
                logHedgeInfo("open split merge fallback success", {
                  debugLabel,
                  mergedQtyText,
                  submitSide,
                  fillDelta: mergedFillReady.delta,
                  fillMinDelta: mergedFillReady.minDelta
                });
                return {
                  ok: true,
                  reason: "submitted_with_merge_fallback",
                  submitSide,
                  totalBatches: slices.length,
                  submittedBatches: submittedBatches + 1,
                  merged: {
                    fromBatch: index + 1,
                    mergedQtyText
                  }
                };
              }
            }
          }
        }
        return {
          ok: false,
          reason: "slice_submit_failed",
          submitSide,
          totalBatches: slices.length,
          submittedBatches,
          failedBatch: index + 1,
          sliceQty,
          submitResult
        };
      }
      const fillReady = await waitForSliceFillReady({
        rawSide: side,
        beforeAbsQty,
        sliceQtyText: sliceQty,
        debugLabel
      });
      if (!fillReady.ok) {
        logHedgeWarn("open split batch fill not ready", {
          debugLabel,
          sliceQty,
          submitSide,
          fillReady
        });
        return {
          ok: false,
          reason: "slice_fill_not_ready",
          submitSide,
          totalBatches: slices.length,
          submittedBatches,
          failedBatch: index + 1,
          sliceQty,
          fillReady
        };
      }
      submittedBatches += 1;
      logHedgeInfo("open split batch submitted", {
        debugLabel,
        submittedBatches,
        totalBatches: slices.length,
        sliceQty,
        submitSide,
        fillDelta: fillReady.delta,
        fillMinDelta: fillReady.minDelta
      });
      if (index < slices.length - 1) {
        await waitForCondition(() => {
          const nextSubmit = findPageSubmitButton(submitSide);
          return !nextSubmit || isButtonClickable(nextSubmit);
        }, {
          timeoutMs: 1200,
          intervalMs: 80
        });
      }
      if (index < slices.length - 1) {
        await sleep(getRandomOpenSplitIntervalMs());
      }
    }

    return {
      ok: true,
      reason: "submitted",
      submitSide,
      totalBatches: slices.length,
      submittedBatches
    };
  };

  const resolvePositionSideByText = (value) => {
    const text = normalizeText(value);
    if (!text) {
      return "";
    }
    if (
      text.includes("short") ||
      text.includes("sell") ||
      text.includes("开空") ||
      text.includes("做空") ||
      text === "空"
    ) {
      return "sell";
    }
    if (
      text.includes("long") ||
      text.includes("buy") ||
      text.includes("开多") ||
      text.includes("做多") ||
      text === "多"
    ) {
      return "buy";
    }
    return "";
  };

  const extractPagePositionsByDom = () => {
    const docs = collectAccessibleDocuments();
    const rows = [];
    docs.forEach((doc) => {
      Array.from(doc.querySelectorAll(PAGE_POSITIONS_ROW_SELECTOR)).forEach((row) => {
        if (!isInsideVarPanel(row) && isVisibleElement(row) && !rows.includes(row)) {
          rows.push(row);
        }
      });
    });

    return rows.map((row) => {
      const cells = Array.from(row.querySelectorAll(":scope > div"));
      if (!cells.length) {
        return null;
      }
      const symbolEl = row.querySelector("a span[title]")
        || row.querySelector("a [title]")
        || row.querySelector("a span")
        || cells[0]
        || null;
      const symbol = normalizeCellText(symbolEl && symbolEl.textContent);
      const cellTexts = cells.map((cell) => normalizeCellText(cell.textContent));
      let sideText = "";
      for (const text of cellTexts) {
        if (resolvePositionSideByText(text)) {
          sideText = text;
          break;
        }
      }
      if (!sideText) {
        const sideNodeText = normalizeCellText(row.querySelector('[data-testid*="side" i]')?.textContent || "");
        if (resolvePositionSideByText(sideNodeText)) {
          sideText = sideNodeText;
        }
      }

      let bestQtyCandidate = null;
      cells.forEach((cell, cellIndex) => {
        const rawText = normalizeCellText(cell.textContent);
        if (!rawText) {
          return;
        }
        const numericText = normalizeNumericText(rawText);
        const lowerText = normalizeText(rawText);
        const tokens = extractSignedNumberTokens(numericText);
        if (!tokens.length) {
          return;
        }

        tokens.forEach((token) => {
          const absValue = Math.abs(token.value);
          let score = 0;
          if (lowerText.includes("btc")) {
            score += 120;
          }
          if (absValue <= 10) {
            score += 85;
          } else if (absValue <= 100) {
            score += 60;
          } else if (absValue <= 500) {
            score += 32;
          } else if (absValue >= 1000) {
            score -= 120;
          }
          if (/liquidation|liq|entry|mark|price|pnl|funding|roi|usd|usdc|%/i.test(lowerText)) {
            score -= 140;
          }
          if (cellIndex === 2) {
            score += 16;
          } else if (cellIndex === 1) {
            score += 8;
          }
          if (String(token.token).startsWith("-")) {
            score += 16;
          }

          if (!bestQtyCandidate || score > bestQtyCandidate.score) {
            bestQtyCandidate = {
              qtyText: token.token,
              qtyNumberRaw: token.value,
              score,
              sourceText: rawText,
              sourceCellIndex: cellIndex
            };
          }
        });
      });

      if (!bestQtyCandidate || bestQtyCandidate.score < -20) {
        return null;
      }
      const qtyText = bestQtyCandidate.qtyText;
      const qtyNumberRaw = bestQtyCandidate.qtyNumberRaw;
      if (qtyNumberRaw === null || qtyNumberRaw === 0) {
        return null;
      }
      const sideFromTextDetected = resolvePositionSideByText(sideText);
      let qtyNumber = qtyNumberRaw;
      if (sideFromTextDetected === "sell" && qtyNumber > 0) {
        qtyNumber = -qtyNumber;
      } else if (sideFromTextDetected === "buy" && qtyNumber < 0) {
        qtyNumber = Math.abs(qtyNumber);
      }
      const sideFromText = sideFromTextDetected || (qtyNumber < 0 ? "sell" : "buy");
      if (!sideText) {
        sideText = sideFromText;
      }
      return {
        symbol: symbol || "",
        sideText,
        sideFromText,
        qtyText,
        qtyNumber,
        qtyCandidateScore: bestQtyCandidate.score,
        qtySourceText: bestQtyCandidate.sourceText,
        qtySourceCellIndex: bestQtyCandidate.sourceCellIndex
      };
    }).filter(Boolean);
  };

  const getOpenPositionStateBySide = (rawSide) => {
    const targetSide = resolveTargetPageSide(rawSide);
    const positions = extractPagePositionsByDom();
    if (!positions.length) {
      return null;
    }
    let candidates = positions;
    if (targetSide) {
      const bySide = positions.filter((position) => position.sideFromText === targetSide);
      if (bySide.length > 0) {
        candidates = bySide;
      }
    }
    let best = null;
    let totalAbsQty = 0;
    candidates.forEach((position) => {
      if (!best || Math.abs(position.qtyNumber) > Math.abs(best.qtyNumber)) {
        best = position;
      }
      totalAbsQty += Math.abs(position.qtyNumber);
    });
    if (!best) {
      return null;
    }
    const absQty = targetSide ? totalAbsQty : Math.abs(best.qtyNumber);
    return {
      targetSide,
      qtyNumber: targetSide === "sell" ? -absQty : targetSide === "buy" ? absQty : best.qtyNumber,
      absQty,
      qtyText: best.qtyText,
      sideText: best.sideText,
      symbol: best.symbol,
      matchedBySide: candidates !== positions,
      positionsCount: positions.length
    };
  };

  const waitForOpenPositionQtyReady = async (rawSide, expectedQtyText) => {
    const expectedQty = parsePositiveNumber(expectedQtyText);
    const threshold = expectedQty ? Math.max(expectedQty * 0.85, expectedQty - 0.05) : null;
    const matched = await waitForCondition(() => {
      const state = getOpenPositionStateBySide(rawSide);
      if (!state) {
        return null;
      }
      if (!threshold) {
        return state;
      }
      return state.absQty >= threshold ? state : null;
    }, {
      timeoutMs: 5200,
      intervalMs: 120
    });
    if (matched) {
      return {
        ok: true,
        reason: "position_qty_ready",
        expectedQty,
        threshold,
        state: matched
      };
    }
    const latest = getOpenPositionStateBySide(rawSide);
    if (latest) {
      return {
        ok: false,
        reason: "position_qty_below_expected",
        expectedQty,
        threshold,
        state: latest
      };
    }
    return {
      ok: false,
      reason: "position_qty_not_found",
      expectedQty,
      threshold,
      state: null
    };
  };

  const resolveClickableFromNode = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    const tag = String(node.tagName || "").toLowerCase();
    if (tag === "button" || tag === "a" || node.getAttribute("role") === "button") {
      return node;
    }
    if (typeof node.closest === "function") {
      return node.closest('button, a, [role="button"]');
    }
    return null;
  };

  const findCreateTpSlTrigger = () => {
    const docs = collectAccessibleDocuments();
    for (const doc of docs) {
      const nodes = Array.from(doc.querySelectorAll("button, span, a, [role='button'], div"));
      for (const node of nodes) {
        if (isInsideVarPanel(node) || !isVisibleElement(node)) {
          continue;
        }
        const text = normalizeText(node.textContent || "");
        if (!text) {
          continue;
        }
        const isCreateTrigger = text.includes(CREATE_TPSL_TRIGGER_LABEL) || text.includes("createtpsl");
        const isCreateSubmit = text.includes(CREATE_TPSL_SUBMIT_LABEL) || text.includes("createtpandsl");
        if (!isCreateTrigger || isCreateSubmit) {
          continue;
        }
        const clickable = resolveClickableFromNode(node) || node;
        if (clickable && !isInsideVarPanel(clickable) && isVisibleElement(clickable)) {
          return clickable;
        }
      }
    }
    return null;
  };

  const findCreateTpSlSubmitButton = (root = null) => {
    const docs = root ? [root] : collectAccessibleDocuments();
    for (const doc of docs) {
      const buttons = Array.from(doc.querySelectorAll("button, [role='button']"));
      let fallback = null;
      for (const button of buttons) {
        if (isInsideVarPanel(button) || !isVisibleElement(button)) {
          continue;
        }
        const text = normalizeText(button.textContent || "");
        const testId = normalizeText(button.getAttribute("data-testid") || "");
        const hasSubmitText = text.includes(CREATE_TPSL_SUBMIT_LABEL) || text.includes("createtpandsl");
        const maybeTpSlSubmit = hasSubmitText || (testId.includes("submit") && text.includes("createtp"));
        if (!maybeTpSlSubmit) {
          continue;
        }
        if (isButtonClickable(button)) {
          return button;
        }
        fallback = fallback || button;
      }
      if (fallback) {
        return fallback;
      }
    }
    return null;
  };

  const ensureCreateTpSlDialogVisible = async () => {
    const submitReady = findCreateTpSlSubmitButton();
    if (submitReady) {
      return { ok: true, reason: "dialog_already_visible" };
    }
    for (let round = 0; round < 3; round += 1) {
      const trigger = findCreateTpSlTrigger();
      if (!trigger) {
        return { ok: false, reason: "create_tpsl_trigger_missing" };
      }
      logHedgeInfo("create tpsl trigger click", {
        round,
        target: describeButtonBrief(resolveClickableFromNode(trigger) || trigger)
      });
      await clickElementLikeUser(trigger);
      const ready = await waitForCondition(() => findCreateTpSlSubmitButton(), {
        timeoutMs: 1400,
        intervalMs: 90
      });
      if (ready) {
        return { ok: true, reason: "dialog_visible_after_click" };
      }
    }
    return { ok: false, reason: "create_tpsl_dialog_not_visible" };
  };

  const findAutoResizeToggle = () => {
    const docs = collectAccessibleDocuments();
    for (const doc of docs) {
      const nodes = Array.from(doc.querySelectorAll("button, span, a, [role='button'], div"));
      for (const node of nodes) {
        if (isInsideVarPanel(node) || !isVisibleElement(node)) {
          continue;
        }
        const text = normalizeText(node.textContent || "");
        if (!text || !text.includes(AUTO_RESIZE_LABEL)) {
          continue;
        }
        const clickable = resolveClickableFromNode(node) || node;
        if (clickable && !isInsideVarPanel(clickable) && isVisibleElement(clickable)) {
          return clickable;
        }
      }
    }
    return null;
  };

  const ensureAutoResizeOffByText = async () => {
    const toggle = findAutoResizeToggle();
    if (!toggle) {
      return { ok: false, reason: "autoresize_toggle_missing" };
    }
    await clickElementLikeUser(toggle);
    await sleep(90);
    return { ok: true, reason: "autoresize_clicked_off" };
  };

  const resolveCreateTpSlScope = (submitButton) => {
    if (!submitButton) {
      return document;
    }
    let node = submitButton;
    for (let depth = 0; depth < 10 && node; depth += 1) {
      const priceInputs = Array.from(node.querySelectorAll('input[data-testid="price-input"]'))
        .filter((input) => isEditableInput(input) && !isInsideVarPanel(input));
      if (priceInputs.length >= 2) {
        return node;
      }
      node = node.parentElement;
    }
    return submitButton.ownerDocument || document;
  };

  const findCreateTpSlInputs = () => {
    const submitButton = findCreateTpSlSubmitButton();
    if (!submitButton) {
      return {
        submitButton: null,
        scope: null,
        stopLossInput: null,
        takeProfitInput: null,
        quantityInput: null
      };
    }
    const scope = resolveCreateTpSlScope(submitButton);
    const priceInputs = getVisibleInputs('input[data-testid="price-input"]', scope)
      .filter((input) => !isInsideVarPanel(input));
    const rowSemantic = classifyPriceInputsByRowSemantic(priceInputs);
    let takeProfitInput = rowSemantic.takeProfitInput || null;
    let stopLossInput = rowSemantic.stopLossInput || null;
    if (!takeProfitInput && priceInputs.length > 0) {
      takeProfitInput =
        findBestPriceInputByKeywords(priceInputs, ["止盈", "takeprofit", "tp"], stopLossInput || null)
        || priceInputs.find((item) => item !== stopLossInput)
        || priceInputs[0];
    }
    if (!stopLossInput && priceInputs.length > 0) {
      stopLossInput =
        findBestPriceInputByKeywords(priceInputs, ["止损", "stoploss", "sl"], takeProfitInput || null)
        || priceInputs.find((item) => item !== takeProfitInput)
        || priceInputs[0];
    }
    const quantitySelectors = [
      PAGE_QTY_SELECTOR,
      'input[name*="quantity" i]',
      'input[name*="size" i]',
      'input[name*="qty" i]'
    ];
    let quantityInput = null;
    for (const selector of quantitySelectors) {
      const scopedHit = getVisibleInputs(selector, scope).find((input) => !isInsideVarPanel(input));
      if (scopedHit) {
        quantityInput = scopedHit;
        break;
      }
    }
    if (!quantityInput) {
      quantityInput = findInputBySelectors(quantitySelectors);
    }

    return {
      submitButton,
      scope,
      stopLossInput: stopLossInput || null,
      takeProfitInput: takeProfitInput || null,
      quantityInput
    };
  };

  const clickCreateTpSlSubmitWithRetry = async (options = {}) => {
    const attempts = Number.isFinite(Number(options.attempts)) ? Math.max(1, Number(options.attempts)) : 6;
    const waitMs = Number.isFinite(Number(options.waitMs)) ? Math.max(40, Number(options.waitMs)) : 180;
    for (let index = 0; index < attempts; index += 1) {
      const submitButton = findCreateTpSlSubmitButton();
      if (!submitButton || !isButtonClickable(submitButton)) {
        await sleep(waitMs);
        continue;
      }
      await clickElementLikeUser(submitButton);
      await sleep(80);
      return { ok: true, reason: "create_tpsl_submit_clicked" };
    }
    return { ok: false, reason: "create_tpsl_submit_missing_or_disabled" };
  };

  const applyTpSlAfterOpen = async ({ stopLoss, takeProfit, side, expectedQtyText }) => {
    const shouldWriteStopLoss = hasRiskValue(stopLoss);
    const shouldWriteTakeProfit = hasRiskValue(takeProfit);
    if (!shouldWriteStopLoss && !shouldWriteTakeProfit) {
      return { ok: true, reason: "no_tpsl_values_skip" };
    }

    const qtyReady = await waitForOpenPositionQtyReady(side, expectedQtyText);
    if (!qtyReady.ok) {
      return {
        ok: false,
        reason: qtyReady.reason || "position_qty_not_ready",
        qtyReady
      };
    }
    logHedgeInfo("tpsl after open qty ready", qtyReady);

    const dialogReady = await ensureCreateTpSlDialogVisible();
    if (!dialogReady.ok) {
      return { ok: false, reason: dialogReady.reason || "create_tpsl_dialog_not_visible", dialogReady };
    }

    const autoResizeOff = await ensureAutoResizeOffByText();
    logHedgeInfo("tpsl auto-resize off result", autoResizeOff);
    if (!autoResizeOff.ok) {
      return { ok: false, reason: autoResizeOff.reason || "autoresize_toggle_missing", autoResizeOff };
    }

    const inputs = findCreateTpSlInputs();
    if (!inputs.submitButton) {
      return { ok: false, reason: "create_tpsl_submit_missing" };
    }
    if (shouldWriteStopLoss && !inputs.stopLossInput) {
      return { ok: false, reason: "create_tpsl_stoploss_input_missing" };
    }
    if (shouldWriteTakeProfit && !inputs.takeProfitInput) {
      return { ok: false, reason: "create_tpsl_takeprofit_input_missing" };
    }

    const scale = Math.max(getDecimalPlaces(expectedQtyText), 4);
    const currentQtyText = formatNumberByScale(qtyReady.state.absQty, scale);
    if (inputs.quantityInput && parsePositiveNumber(currentQtyText)) {
      const qtySync = await syncSingleInputWithRetry(inputs.quantityInput, currentQtyText, {
        attempts: 4,
        waitMs: 100
      });
      if (!qtySync.ok) {
        return { ok: false, reason: "create_tpsl_qty_sync_failed", qtySync };
      }
    }

    if (shouldWriteStopLoss) {
      const slSync = await syncSingleInputWithRetry(inputs.stopLossInput, stopLoss, {
        attempts: 4,
        waitMs: 100
      });
      if (!slSync.ok) {
        return { ok: false, reason: "create_tpsl_stoploss_sync_failed", slSync };
      }
    }
    if (shouldWriteTakeProfit) {
      const tpSync = await syncSingleInputWithRetry(inputs.takeProfitInput, takeProfit, {
        attempts: 4,
        waitMs: 100
      });
      if (!tpSync.ok) {
        return { ok: false, reason: "create_tpsl_takeprofit_sync_failed", tpSync };
      }
    }

    const submit = await clickCreateTpSlSubmitWithRetry({
      attempts: 8,
      waitMs: 180
    });
    if (!submit.ok) {
      return { ok: false, reason: submit.reason || "create_tpsl_submit_failed", submit };
    }

    return {
      ok: true,
      reason: "create_tpsl_submitted",
      qtyReady,
      autoResizeOff
    };
  };

  const setNativeCheckedValue = (input, checked) => {
    if (!input || !isHtmlInputElementLike(input)) {
      return;
    }
    const ownerWin = getElementWindow(input);
    const prototype = ownerWin.HTMLInputElement && ownerWin.HTMLInputElement.prototype;
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "checked") : null;
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(input, Boolean(checked));
      return;
    }
    input.checked = Boolean(checked);
  };

  const resolveTpSlToggleContext = () => {
    const clickTargets = [];
    let checkboxInput = null;
    const pushClickTarget = (el) => {
      if (!el || clickTargets.includes(el) || !isVisibleElement(el)) {
        return;
      }
      clickTargets.push(el);
    };

    const assignCheckboxInput = (el) => {
      if (checkboxInput || !isHtmlInputElementLike(el)) {
        return;
      }
      if (String(el.type || "").toLowerCase() !== "checkbox") {
        return;
      }
      checkboxInput = el;
    };

    const collectFromScope = (scope) => {
      if (!scope || typeof scope.querySelector !== "function") {
        return;
      }
      assignCheckboxInput(scope.querySelector('input[type="checkbox"]'));
      pushClickTarget(scope.querySelector('button[type="checkbox"]'));
      pushClickTarget(scope.querySelector("svg"));
      pushClickTarget(scope.querySelector("span"));
      pushClickTarget(scope.querySelector("button"));
    };

    const xpathNode = findElementByXPathInAllDocuments(PAGE_TPSL_TOGGLE_XPATH);
    if (xpathNode && xpathNode.nodeType === Node.ELEMENT_NODE) {
      pushClickTarget(xpathNode);
      if (typeof xpathNode.closest === "function") {
        const checkboxButton = xpathNode.closest('button[type="checkbox"]');
        const outerButton = xpathNode.closest("button");
        pushClickTarget(checkboxButton);
        pushClickTarget(outerButton);
        collectFromScope(checkboxButton);
        collectFromScope(outerButton);
      }
      collectFromScope(xpathNode);
    }

    const fallbackToggleButton = findTpSlToggleButton();
    if (fallbackToggleButton) {
      pushClickTarget(fallbackToggleButton);
      collectFromScope(fallbackToggleButton);
    }

    if (!checkboxInput) {
      const docs = collectAccessibleDocuments();
      for (const doc of docs) {
        const byTitle = doc.querySelector('button[title*="Take Profit / Stop Loss" i] input[type="checkbox"]');
        if (byTitle) {
          checkboxInput = byTitle;
          break;
        }
      }
    }

    return {
      clickTargets,
      checkboxInput
    };
  };

  const setNativeInputValue = (input, value) => {
    if (!input) {
      return;
    }
    const ownerWin = getElementWindow(input);
    const isTextArea = String(input.tagName || "").toLowerCase() === "textarea";
    const prototype = isTextArea
      ? ownerWin.HTMLTextAreaElement && ownerWin.HTMLTextAreaElement.prototype
      : ownerWin.HTMLInputElement && ownerWin.HTMLInputElement.prototype;
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
  };

  const sleep = (ms) => new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

  const waitForCondition = async (predicate, options = {}) => {
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(0, Number(options.timeoutMs)) : 1600;
    const intervalMs = Number.isFinite(Number(options.intervalMs)) ? Math.max(20, Number(options.intervalMs)) : 80;
    const start = Date.now();

    while (Date.now() - start <= timeoutMs) {
      const value = predicate();
      if (value) {
        return value;
      }
      await sleep(intervalMs);
    }
    return null;
  };

  const dispatchMouseLikeEvent = (input, eventName, rect) => {
    const ownerWin = getElementWindow(input);
    const PointerCtor = ownerWin.PointerEvent;
    const MouseCtor = ownerWin.MouseEvent;
    const clientX = rect.left + Math.min(Math.max(4, rect.width / 2), Math.max(4, rect.width - 4));
    const clientY = rect.top + Math.min(Math.max(4, rect.height / 2), Math.max(4, rect.height - 4));

    if (eventName.startsWith("pointer") && typeof PointerCtor === "function") {
      input.dispatchEvent(
        new PointerCtor(eventName, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          clientX,
          clientY,
          button: 0,
          buttons: eventName === "pointerdown" ? 1 : 0
        })
      );
      return;
    }

    if (typeof MouseCtor === "function") {
      input.dispatchEvent(
        new MouseCtor(eventName, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX,
          clientY,
          button: 0,
          buttons: eventName === "mousedown" ? 1 : 0
        })
      );
    }
  };

  const clickElementLikeUser = async (el, options = {}) => {
    if (!el || typeof el.getBoundingClientRect !== "function") {
      return;
    }
    const dispatchSyntheticClick = options.dispatchSyntheticClick === true;
    const rect = el.getBoundingClientRect();
    dispatchMouseLikeEvent(el, "pointerover", rect);
    dispatchMouseLikeEvent(el, "mouseover", rect);
    dispatchMouseLikeEvent(el, "pointerenter", rect);
    dispatchMouseLikeEvent(el, "mouseenter", rect);
    dispatchMouseLikeEvent(el, "pointerdown", rect);
    dispatchMouseLikeEvent(el, "mousedown", rect);
    if (typeof el.click === "function") {
      el.click();
    }
    if (typeof el.focus === "function") {
      el.focus({ preventScroll: true });
    }
    dispatchMouseLikeEvent(el, "pointerup", rect);
    dispatchMouseLikeEvent(el, "mouseup", rect);
    // Avoid duplicate order submissions: native click already dispatches "click".
    if (dispatchSyntheticClick) {
      dispatchMouseLikeEvent(el, "click", rect);
    }
    await sleep(60);
  };

  const ensureTpSlInputsVisible = async () => {
    if (hasVisibleRiskPriceInputs()) {
      return { ok: true, reason: "already_visible" };
    }

    for (let round = 0; round < 3; round += 1) {
      const context = resolveTpSlToggleContext();
      logHedgeInfo("tpsl toggle context", {
        round,
        clickTargets: context.clickTargets.length,
        checkboxChecked: Boolean(context.checkboxInput && context.checkboxInput.checked)
      });
      if (context.checkboxInput && context.checkboxInput.checked) {
        const readyChecked = await waitForCondition(() => hasVisibleRiskPriceInputs(), {
          timeoutMs: 900,
          intervalMs: 80
        });
        if (readyChecked) {
          return { ok: true, reason: "already_checked" };
        }
      }

      for (const target of context.clickTargets) {
        logHedgeInfo("tpsl click target", {
          tag: String(target.tagName || "").toLowerCase(),
          cls: String(target.className || "")
        });
        await clickElementLikeUser(target);
        const readyAfterClick = await waitForCondition(() => hasVisibleRiskPriceInputs(), {
          timeoutMs: 700,
          intervalMs: 70
        });
        if (readyAfterClick) {
          return { ok: true, reason: "visible_after_toggle_click" };
        }
      }

      if (context.checkboxInput && !context.checkboxInput.checked) {
        const ownerWin = getElementWindow(context.checkboxInput);
        const EventCtor = ownerWin.Event;
        setNativeCheckedValue(context.checkboxInput, true);
        context.checkboxInput.dispatchEvent(new EventCtor("input", { bubbles: true }));
        context.checkboxInput.dispatchEvent(new EventCtor("change", { bubbles: true }));
        context.checkboxInput.dispatchEvent(new EventCtor("click", { bubbles: true }));
        logHedgeInfo("tpsl force checked");
        const readyAfterForce = await waitForCondition(() => hasVisibleRiskPriceInputs(), {
          timeoutMs: 900,
          intervalMs: 70
        });
        if (readyAfterForce) {
          return { ok: true, reason: "visible_after_force_checked" };
        }
      }
    }

    return { ok: false, reason: "inputs_not_visible_after_toggle" };
  };

  const ensureToggleOffByXPath = async (xpath) => {
    const node = findElementByXPathInAllDocuments(xpath);
    if (!node) {
      return { ok: false, reason: "toggle_not_found" };
    }

    const rootButton = typeof node.closest === "function" ? node.closest("button") || node : node;
    const scope =
      (rootButton && typeof rootButton.closest === "function" && rootButton.closest("div")) ||
      (node && typeof node.closest === "function" && node.closest("div")) ||
      null;
    const checkbox =
      (rootButton && typeof rootButton.querySelector === "function" && rootButton.querySelector('input[type="checkbox"]')) ||
      (scope && typeof scope.querySelector === "function" && scope.querySelector('input[type="checkbox"]')) ||
      null;

    if (checkbox && checkbox.checked === false) {
      return { ok: true, reason: "already_off" };
    }

    const clickTargets = [];
    const pushTarget = (el) => {
      if (!el || clickTargets.includes(el) || !isVisibleElement(el)) {
        return;
      }
      clickTargets.push(el);
    };
    pushTarget(node);
    pushTarget(rootButton);
    if (rootButton && typeof rootButton.querySelector === "function") {
      pushTarget(rootButton.querySelector("span"));
      pushTarget(rootButton.querySelector("svg"));
      pushTarget(rootButton.querySelector('button[type="checkbox"]'));
    }

    for (const target of clickTargets) {
      await clickElementLikeUser(target);
      if (checkbox && checkbox.checked === false) {
        return { ok: true, reason: "off_after_click" };
      }
      await sleep(80);
    }

    if (checkbox && checkbox.checked === true) {
      const ownerWin = getElementWindow(checkbox);
      const EventCtor = ownerWin.Event;
      setNativeCheckedValue(checkbox, false);
      checkbox.dispatchEvent(new EventCtor("input", { bubbles: true }));
      checkbox.dispatchEvent(new EventCtor("change", { bubbles: true }));
      checkbox.dispatchEvent(new EventCtor("click", { bubbles: true }));
      await sleep(80);
      if (checkbox.checked === false) {
        return { ok: true, reason: "off_after_force" };
      }
    }

    return { ok: false, reason: "off_failed" };
  };

  const activateInputBeforeWrite = async (input) => {
    if (!input) {
      return;
    }
    const rect = input.getBoundingClientRect();
    dispatchMouseLikeEvent(input, "pointerover", rect);
    dispatchMouseLikeEvent(input, "mouseover", rect);
    dispatchMouseLikeEvent(input, "pointerenter", rect);
    dispatchMouseLikeEvent(input, "mouseenter", rect);
    dispatchMouseLikeEvent(input, "pointerdown", rect);
    dispatchMouseLikeEvent(input, "mousedown", rect);
    if (typeof input.click === "function") {
      input.click();
    }
    input.focus({ preventScroll: true });
    dispatchMouseLikeEvent(input, "pointerup", rect);
    dispatchMouseLikeEvent(input, "mouseup", rect);
    dispatchMouseLikeEvent(input, "click", rect);
    await sleep(35);
  };

  const triggerInputEvents = (input, value, options = {}) => {
    const ownerWin = getElementWindow(input);
    const EventCtor = ownerWin.Event;
    const InputEventCtor = ownerWin.InputEvent;
    const includeBlur = options.blur !== false;
    input.dispatchEvent(new EventCtor("focus", { bubbles: true }));
    if (typeof InputEventCtor === "function") {
      input.dispatchEvent(
        new InputEventCtor("input", {
          bubbles: true,
          data: String(value || ""),
          inputType: "insertText"
        })
      );
    } else {
      input.dispatchEvent(new EventCtor("input", { bubbles: true }));
    }
    input.dispatchEvent(new EventCtor("change", { bubbles: true }));
    if (includeBlur) {
      input.dispatchEvent(new EventCtor("blur", { bubbles: true }));
    }
  };

  const applyValueToInput = async (input, value, options = {}) => {
    await activateInputBeforeWrite(input);
    setNativeInputValue(input, value);
    triggerInputEvents(input, value, options);
    await sleep(40);
  };

  const isSameNumericValue = (a, b) => {
    const na = Number(a);
    const nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-12;
  };

  const isValueApplied = (target, expected) => {
    const current = String(target.value || "");
    if (current === expected) {
      return true;
    }
    return isSameNumericValue(current, expected);
  };

  const typeValueLikeUser = async (input, value) => {
    const ownerWin = getElementWindow(input);
    const KeyboardCtor = ownerWin.KeyboardEvent;
    const EventCtor = ownerWin.Event;
    const InputEventCtor = ownerWin.InputEvent;
    const nextValue = String(value || "");

    await activateInputBeforeWrite(input);
    if (typeof input.select === "function") {
      input.select();
    }
    setNativeInputValue(input, "");
    input.dispatchEvent(new EventCtor("input", { bubbles: true }));
    await sleep(16);

    for (const char of nextValue) {
      if (typeof KeyboardCtor === "function") {
        input.dispatchEvent(new KeyboardCtor("keydown", { key: char, bubbles: true }));
      }
      if (typeof input.setRangeText === "function") {
        const start = Number.isFinite(input.selectionStart) ? input.selectionStart : String(input.value || "").length;
        const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : String(input.value || "").length;
        input.setRangeText(char, start, end, "end");
      } else {
        setNativeInputValue(input, `${String(input.value || "")}${char}`);
      }

      if (typeof InputEventCtor === "function") {
        input.dispatchEvent(
          new InputEventCtor("input", {
            bubbles: true,
            data: char,
            inputType: "insertText"
          })
        );
      } else {
        input.dispatchEvent(new EventCtor("input", { bubbles: true }));
      }
      if (typeof KeyboardCtor === "function") {
        input.dispatchEvent(new KeyboardCtor("keyup", { key: char, bubbles: true }));
      }
      await sleep(8);
    }

    if (typeof KeyboardCtor === "function") {
      input.dispatchEvent(new KeyboardCtor("keydown", { key: "Enter", bubbles: true }));
      input.dispatchEvent(new KeyboardCtor("keyup", { key: "Enter", bubbles: true }));
    }
    input.dispatchEvent(new EventCtor("change", { bubbles: true }));
  };

  const applyValueToTargetWithFallbacks = async (target, nextValue) => {
    const ownerWin = getElementWindow(target);
    const EventCtor = ownerWin.Event;
    let observedValue = "";

    setNativeInputValue(target, nextValue);
    target.dispatchEvent(new EventCtor("input", { bubbles: true }));
    target.dispatchEvent(new EventCtor("change", { bubbles: true }));
    await sleep(35);
    observedValue = String(target.value || "");
    if (isValueApplied(target, nextValue)) {
      return { ok: true, observedValue };
    }

    await applyValueToInput(target, nextValue, { blur: false });
    await sleep(35);
    observedValue = String(target.value || "");
    if (isValueApplied(target, nextValue)) {
      return { ok: true, observedValue };
    }

    await typeValueLikeUser(target, nextValue);
    await sleep(40);
    observedValue = String(target.value || "");
    return { ok: isValueApplied(target, nextValue), observedValue };
  };

  const syncSingleInputWithRetry = async (target, value, options = {}) => {
    const attempts = Number.isFinite(Number(options.attempts)) ? Math.max(1, Number(options.attempts)) : 4;
    const waitMs = Number.isFinite(Number(options.waitMs)) ? Math.max(0, Number(options.waitMs)) : 120;
    const nextValue = value === null || value === undefined ? "" : String(value);
    let lastObservedValue = "";

    if (!target || !isHtmlInputElementLike(target)) {
      return {
        ok: false,
        reason: "no_input",
        expectedValue: nextValue,
        observedValue: ""
      };
    }

    for (let index = 0; index < attempts; index += 1) {
      const applyResult = await applyValueToTargetWithFallbacks(target, nextValue);
      lastObservedValue = applyResult.observedValue;
      if (applyResult.ok) {
        return {
          ok: true,
          reason: "applied",
          expectedValue: nextValue,
          observedValue: lastObservedValue
        };
      }
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }

    return {
      ok: false,
      reason: "write_rejected",
      expectedValue: nextValue,
      observedValue: lastObservedValue
    };
  };

  const syncQuantityWithRetry = async (value, options = {}) => {
    const attempts = Number.isFinite(Number(options.attempts)) ? Math.max(1, Number(options.attempts)) : 3;
    const waitMs = Number.isFinite(Number(options.waitMs)) ? Math.max(0, Number(options.waitMs)) : 80;
    const nextValue = value === null || value === undefined ? "" : String(value);
    const preferredInput = options.preferredInput || null;
    let validCandidatesCount = 0;
    let lastObservedValue = "";

    const resolveCandidates = () => {
      const pool = [];
      const append = (input) => {
        if (!input || pool.includes(input)) {
          return;
        }
        pool.push(input);
      };
      append(preferredInput);
      getAllQuantityInputCandidates().forEach((input) => append(input));
      return pool;
    };

    for (let index = 0; index < attempts; index += 1) {
      const candidates = resolveCandidates();
      for (const target of candidates) {
        if (!isHtmlInputElementLike(target)) {
          continue;
        }
        validCandidatesCount += 1;
        const applyResult = await applyValueToTargetWithFallbacks(target, nextValue);
        lastObservedValue = applyResult.observedValue;
        if (applyResult.ok) {
          return {
            ok: true,
            reason: "applied",
            tried: validCandidatesCount,
            expectedValue: nextValue,
            observedValue: lastObservedValue
          };
        }
      }
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }
    return {
      ok: false,
      reason: validCandidatesCount > 0 ? "write_rejected" : "no_input",
      tried: validCandidatesCount,
      expectedValue: nextValue,
      observedValue: lastObservedValue
    };
  };

  const applyPositionValuesToPage = async ({ quantity, stopLoss, takeProfit, side }) => {
    const result = {
      appliedFields: [],
      missingFields: [],
      skippedFields: [],
      writeFailedFields: [],
      debug: {
        reason: "",
        tried: 0,
        expectedValue: "",
        observedValue: "",
        targetSide: "",
        sideSwitchReason: ""
      }
    };
    const shouldWriteQuantity = hasRiskValue(quantity);
    const shouldWriteStopLoss = hasRiskValue(stopLoss);
    const shouldWriteTakeProfit = hasRiskValue(takeProfit);

    const pushFieldResult = (fieldLabel, syncResult) => {
      result.debug.reason = syncResult.reason;
      result.debug.expectedValue = syncResult.expectedValue || "";
      result.debug.observedValue = syncResult.observedValue || "";
      if (syncResult.ok) {
        result.appliedFields.push(fieldLabel);
      } else if (syncResult.reason === "no_input") {
        result.missingFields.push(fieldLabel);
      } else {
        result.writeFailedFields.push(fieldLabel);
      }
    };

    const sideSwitch = await ensurePageSide(side);
    result.debug.targetSide = sideSwitch.targetSide || "";
    result.debug.sideSwitchReason = sideSwitch.reason || "";
    if (!sideSwitch.ok) {
      result.debug.reason = sideSwitch.reason;
      result.writeFailedFields.push("方向");
      return result;
    }

    const initialInputs = findRiskInputs();

    if (shouldWriteQuantity) {
      if (initialInputs.quantityInput) {
        const syncResult = await syncQuantityWithRetry(quantity, {
          preferredInput: initialInputs.quantityInput,
          attempts: 4,
          waitMs: 120
        });
        result.debug.reason = syncResult.reason;
        result.debug.tried = syncResult.tried;
        result.debug.expectedValue = syncResult.expectedValue;
        result.debug.observedValue = syncResult.observedValue;
        if (syncResult.ok) {
          result.appliedFields.push("仓位");
        } else if (syncResult.reason === "no_input") {
          result.missingFields.push("仓位");
        } else {
          result.writeFailedFields.push("仓位");
        }
      } else {
        result.missingFields.push("仓位");
        result.debug.reason = "no_input";
      }
    } else {
      result.skippedFields.push("仓位");
    }

    if (shouldWriteStopLoss || shouldWriteTakeProfit) {
      const ensureResult = await ensureTpSlInputsVisible();
      if (!ensureResult.ok) {
        if (shouldWriteStopLoss) {
          result.missingFields.push("止损");
        } else {
          result.skippedFields.push("止损");
        }
        if (shouldWriteTakeProfit) {
          result.missingFields.push("止盈");
        } else {
          result.skippedFields.push("止盈");
        }
      } else {
        const riskInputs = findRiskInputs();
        if (shouldWriteStopLoss) {
          const syncStopLoss = await syncSingleInputWithRetry(riskInputs.stopLossInput, stopLoss, {
            attempts: 4,
            waitMs: 120
          });
          pushFieldResult("止损", syncStopLoss);
        } else {
          result.skippedFields.push("止损");
        }

        if (shouldWriteTakeProfit) {
          const syncTakeProfit = await syncSingleInputWithRetry(riskInputs.takeProfitInput, takeProfit, {
            attempts: 4,
            waitMs: 120
          });
          pushFieldResult("止盈", syncTakeProfit);
        } else {
          result.skippedFields.push("止盈");
        }
      }
    } else {
      result.skippedFields.push("止损");
      result.skippedFields.push("止盈");
    }

    if (shouldWriteStopLoss || shouldWriteTakeProfit) {
      const postToggleResult = await ensureToggleOffByXPath(PAGE_POST_WRITE_TOGGLE_OFF_XPATH);
      logHedgeInfo("post-write toggle off", postToggleResult);
    }

    return result;
  };

  const renderHedgeRows = (filters, rows) => {
    if (!hedgeList) {
      return;
    }

    if (!filters.length) {
      hedgeList.innerHTML = '<div class="item">请先配置账号</div>';
      return;
    }

    const filtered = filters.map((filter) => {
      const lower = filter.toLowerCase();
      const hit = rows.find((row) => String(row.account || "").toLowerCase().includes(lower));
      return {
        filter,
        row: hit || null
      };
    });

    hedgeList.innerHTML = filtered
      .map(({ filter, row }) => {
        if (!row) {
          return `<div class="item"><div><strong>${escapeHtml(
            filter
          )}</strong></div><div class="muted">未匹配到数据</div></div>`;
        }
        const sideRaw = String(row.side || "").toLowerCase();
        const isLong = sideRaw.includes("开多") || sideRaw.includes("buy") || sideRaw.includes("long");
        const isShort = sideRaw.includes("开空") || sideRaw.includes("sell") || sideRaw.includes("short");
        const sideClass = isLong ? "side-long" : isShort ? "side-short" : "side-neutral";
        const qtyNumber = Number(row.qty);
        const qtyText = row.qty === null || row.qty === undefined || !Number.isFinite(qtyNumber) ? "--" : qtyNumber.toFixed(2);
        const qtyApplyText = qtyText === "--" ? "--" : qtyText;
        const liqNumber = Number(row.liquidationPrice);
        const liqText =
          row.liquidationPrice === null || row.liquidationPrice === undefined || !Number.isFinite(liqNumber)
            ? "--"
            : liqNumber.toFixed(2);
        const stopLossText = formatRiskPrice(row.stopLoss);
        const takeProfitText = formatRiskPrice(row.takeProfit);
        const canApply =
          hasRiskValue(qtyApplyText) || hasRiskValue(stopLossText) || hasRiskValue(takeProfitText);
        const canOpen = hasRiskValue(qtyApplyText);
        const submitSide = resolveTargetPageSide(row.side || "");
        const closeSide = submitSide === "buy" ? "sell" : submitSide === "sell" ? "buy" : "";
        const canClose = hasRiskValue(qtyApplyText) && Boolean(closeSide);
        return `
          <div class="item">
            <div><strong>${escapeHtml(row.account || "--")}</strong></div>
            <div>方向：<span class="side-badge ${sideClass}">${escapeHtml(row.side || "--")}</span></div>
            <div>仓位：${qtyText}</div>
            <div>爆仓价：${liqText}</div>
            <div>止损价：${stopLossText}</div>
            <div>止盈价：${takeProfitText}</div>
            <div class="actions-inline">
              <button
                class="apply-risk-button"
                type="button"
                data-qty="${escapeHtml(qtyApplyText)}"
                data-stop-loss="${escapeHtml(stopLossText)}"
                data-take-profit="${escapeHtml(takeProfitText)}"
                data-side="${escapeHtml(row.side || "")}"
                data-account="${escapeHtml(row.account || "")}"
                data-action="write"
                ${canApply ? "" : "disabled"}
              >
                写入页面
              </button>
              <button
                class="open-order-button"
                type="button"
                data-qty="${escapeHtml(qtyApplyText)}"
                data-stop-loss="${escapeHtml(stopLossText)}"
                data-take-profit="${escapeHtml(takeProfitText)}"
                data-side="${escapeHtml(row.side || "")}"
                data-account="${escapeHtml(row.account || "")}"
                data-action="open"
                ${canOpen ? "" : "disabled"}
              >
                一键开仓
              </button>
              <button
                class="close-order-button"
                type="button"
                data-qty="${escapeHtml(qtyApplyText)}"
                data-stop-loss="${escapeHtml(stopLossText)}"
                data-take-profit="${escapeHtml(takeProfitText)}"
                data-side="${escapeHtml(closeSide)}"
                data-source-side="${escapeHtml(row.side || "")}"
                data-account="${escapeHtml(row.account || "")}"
                data-action="close"
                ${canClose ? "" : "disabled"}
              >
                一键平仓
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  };

  const refreshHedgeData = async () => {
    if (!hedgeStatus || !hedgeAccountsInput || !hedgeApiInput) {
      return;
    }
    if (hedgeRefreshing) {
      return;
    }

    const apiUrl = String(hedgeApiInput.value || "").trim() || DEFAULT_HEDGE_API_URL;
    const filters = parseAccountFilters(hedgeAccountsInput.value);
    setRefreshing(true);
    setRefreshProgress(1, 3, "请求接口");

    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        cache: "no-store"
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `HTTP ${response.status}`);
      }
      setRefreshProgress(2, 3, "解析数据");
      const payload = await response.json();
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      setRefreshProgress(3, 3, `账号匹配（${filters.length}个）`);
      renderHedgeRows(filters, rows);
      const savedAt = payload?.savedAt ? String(payload.savedAt) : "--";
      hedgeStatus.textContent = `已更新：${savedAt}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求失败";
      hedgeStatus.textContent = `失败：${message}`;
      if (hedgeList) {
        hedgeList.innerHTML = '<div class="item">拉取失败</div>';
      }
    } finally {
      setRefreshing(false);
    }
  };

  if (hedgeSaveButton) {
    hedgeSaveButton.addEventListener("click", async () => {
      if (!hedgeAccountsInput || !hedgeApiInput || !hedgeStatus) {
        return;
      }
      const apiUrl = String(hedgeApiInput.value || "").trim() || DEFAULT_HEDGE_API_URL;
      hedgeApiInput.value = apiUrl;
      const shouldHide = Boolean(String(hedgeAccountsInput.value || "").trim());
      await saveHedgeSettings(hedgeAccountsInput.value, apiUrl, shouldHide);
      setConfigHidden(shouldHide, { persist: false });
      hedgeStatus.textContent = "配置已保存";
      await refreshHedgeData();
    });
  }

  if (hedgeConfigToggle) {
    hedgeConfigToggle.addEventListener("click", () => {
      setConfigHidden(!hedgeConfigHidden);
    });
  }

  if (hedgeRefreshButton) {
    hedgeRefreshButton.addEventListener("click", () => {
      void refreshHedgeData();
    });
  }

  if (hedgeList) {
    hedgeList.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest(".apply-risk-button, .open-order-button, .close-order-button");
      if (!button || !(button instanceof HTMLButtonElement)) {
        return;
      }
      const action = String(button.dataset.action || "write").trim().toLowerCase();
      const isOpenAction = action === "open";
      const isCloseAction = action === "close";
      const isTradeAction = isOpenAction || isCloseAction;
      const quantity = String(button.dataset.qty || "").trim();
      const stopLoss = String(button.dataset.stopLoss || "").trim();
      const takeProfit = String(button.dataset.takeProfit || "").trim();
      const effectiveStopLoss = isTradeAction ? "" : stopLoss;
      const effectiveTakeProfit = isTradeAction ? "" : takeProfit;
      const side = String(button.dataset.side || "").trim();
      const sourceSide = String(button.dataset.sourceSide || "").trim();
      const account = String(button.dataset.account || "").trim();
      const siblingButtons = Array.from(
        (button.parentElement || hedgeList).querySelectorAll(".apply-risk-button, .open-order-button, .close-order-button")
      );
      siblingButtons.forEach((el) => {
        if (el instanceof HTMLButtonElement) {
          el.disabled = true;
        }
      });
      let result;
      try {
        const writePayload = {
          quantity,
          stopLoss: effectiveStopLoss,
          takeProfit: effectiveTakeProfit,
          side
        };
        result = await applyPositionValuesToPage(writePayload);
      } catch (error) {
        if (hedgeStatus) {
          hedgeStatus.textContent = `写入失败：${error instanceof Error ? error.message : "未知错误"}`;
        }
        return;
      } finally {
        siblingButtons.forEach((el) => {
          if (el instanceof HTMLButtonElement) {
            const nextAction = String(el.dataset.action || "write").trim().toLowerCase();
            const qtyText = String(el.dataset.qty || "");
            const sideText = String(el.dataset.side || "").trim();
            const shouldKeepDisabled =
              ((nextAction === "open" || nextAction === "close") &&
                (!hasRiskValue(qtyText) || (nextAction === "close" && !sideText))) ||
              (nextAction !== "open" &&
                nextAction !== "close" &&
                !(
                  hasRiskValue(qtyText) ||
                  hasRiskValue(String(el.dataset.stopLoss || "")) ||
                  hasRiskValue(String(el.dataset.takeProfit || ""))
                ));
            el.disabled = shouldKeepDisabled;
          }
        });
      }

      if (hedgeStatus) {
        if (result.appliedFields.length > 0) {
          const accountText = account ? `（${account}）` : "";
          const missingText =
            result.missingFields.length > 0 ? `；未定位到${result.missingFields.join("、")}输入框` : "";
          hedgeStatus.textContent = `已写入页面${accountText}：${result.appliedFields.join("、")}${missingText}`;
          logHedgeInfo("qty apply success", {
            account,
            action,
            quantity,
            stopLoss: effectiveStopLoss,
            takeProfit: effectiveTakeProfit,
            side,
            sourceSide,
            debug: result.debug
          });
          if (result.writeFailedFields.length === 0 && !isTradeAction) {
            return;
          }
        }

        if (result.appliedFields.length === 0 && result.skippedFields.length === 3) {
          hedgeStatus.textContent = "写入失败：仓位/止损/止盈值为空";
          return;
        }

        if (result.writeFailedFields.length > 0) {
          if (result.writeFailedFields.includes("方向")) {
            const targetSideText = result.debug.targetSide ? `目标方向 ${result.debug.targetSide}` : "方向切换";
            hedgeStatus.textContent = `写入失败：${targetSideText}（${result.debug.sideSwitchReason || "switch_failed"}）`;
            logHedgeWarn("side switch failed", {
              account,
              side,
              debug: result.debug
            });
            return;
          }
          const expected = String(result.debug.expectedValue || "").trim();
          const observed = String(result.debug.observedValue || "").trim();
          if (expected && observed) {
            hedgeStatus.textContent = `写入失败：${result.writeFailedFields.join("、")}目标 ${expected}，实际 ${observed}`;
          } else {
            hedgeStatus.textContent = `写入失败：${result.writeFailedFields.join("、")}输入框已定位，但值未生效`;
          }
          logHedgeWarn("qty apply rejected", {
            account,
            action,
            quantity,
            stopLoss: effectiveStopLoss,
            takeProfit: effectiveTakeProfit,
            side,
            sourceSide,
            debug: result.debug
          });
          return;
        }

        if (isTradeAction) {
          const tradeLabel = isCloseAction ? "平仓" : "开仓";
          const tradeLogPrefix = isCloseAction ? "one-click close" : "one-click open";
          if (result.missingFields.length > 0) {
            hedgeStatus.textContent = `${tradeLabel}已取消：未定位到${result.missingFields.join("、")}输入框`;
            return;
          }
          if (result.appliedFields.length === 0) {
            hedgeStatus.textContent = `${tradeLabel}已取消：没有可用写入值`;
            return;
          }
          const openResult = await executeOpenOrderWithSplit(quantity, side);
          if (openResult.ok) {
            const accountText = account ? `（${account}）` : "";
            const splitText =
              openResult.totalBatches > 1 ? `（拆单 ${openResult.totalBatches} 笔）` : "";
            const mergeText =
              openResult.reason === "submitted_with_merge_fallback" ? "（已触发合并兜底）" : "";
            hedgeStatus.textContent = `已一键${tradeLabel}${accountText}：${openResult.submitSide || "--"}${splitText}`;
            if (mergeText) {
              hedgeStatus.textContent += mergeText;
            }
            const shouldSetTpSlAfterOpen = !isCloseAction && (hasRiskValue(stopLoss) || hasRiskValue(takeProfit));
            let tpSlAfterOpenResult = null;
            if (shouldSetTpSlAfterOpen) {
              logHedgeInfo(`${tradeLogPrefix} start tpsl set`, {
                account,
                side,
                sourceSide,
                quantity,
                stopLoss,
                takeProfit
              });
              tpSlAfterOpenResult = await applyTpSlAfterOpen({
                stopLoss,
                takeProfit,
                side,
                expectedQtyText: quantity
              });
              if (tpSlAfterOpenResult.ok) {
                hedgeStatus.textContent += "（已设置止盈止损）";
              } else {
                const tpSlReasonMap = {
                  position_qty_not_found: "未读取到页面持仓",
                  position_qty_below_expected: "持仓数量未到位",
                  create_tpsl_trigger_missing: "未找到 Create TP/SL 按钮",
                  create_tpsl_dialog_not_visible: "TP/SL 设置框未打开",
                  autoresize_toggle_missing: "未找到 Auto-Resize",
                  create_tpsl_submit_missing: "未找到 Create TP & SL 按钮",
                  create_tpsl_stoploss_input_missing: "未找到止损输入框",
                  create_tpsl_takeprofit_input_missing: "未找到止盈输入框",
                  create_tpsl_qty_sync_failed: "持仓数量写入失败",
                  create_tpsl_stoploss_sync_failed: "止损写入失败",
                  create_tpsl_takeprofit_sync_failed: "止盈写入失败",
                  create_tpsl_submit_missing_or_disabled: "Create TP & SL 不可点击"
                };
                const detail = tpSlReasonMap[tpSlAfterOpenResult.reason] || tpSlAfterOpenResult.reason || "unknown";
                hedgeStatus.textContent += `（止盈止损未设置：${detail}）`;
                logHedgeWarn(`${tradeLogPrefix} tpsl set failed`, {
                  account,
                  side,
                  sourceSide,
                  stopLoss,
                  takeProfit,
                  expectedQtyText: quantity,
                  tpSlAfterOpenResult
                });
              }
            }
            logHedgeInfo(`${tradeLogPrefix} success`, {
              account,
              side,
              sourceSide,
              openResult,
              tpSlAfterOpenResult,
              debug: result.debug
            });
            return;
          }
          if (openResult.reason === "slice_qty_sync_failed") {
            hedgeStatus.textContent = `${tradeLabel}失败：第${openResult.failedBatch}笔数量写入失败`;
          } else if (openResult.reason === "slice_submit_failed") {
            const submitReason = String(openResult.submitResult && openResult.submitResult.reason || "");
            const submitDetailMap = {
              submit_button_missing: "（未找到提交按钮）",
              submit_button_disabled: "（提交按钮置灰）",
              submit_button_not_clickable: "（提交按钮不可点击）"
            };
            const submitDetail = submitDetailMap[submitReason] || "";
            hedgeStatus.textContent = `${tradeLabel}失败：第${openResult.failedBatch}笔点击提交失败${submitDetail}`;
          } else if (openResult.reason === "slice_fill_not_ready") {
            const minDelta = Number(openResult.fillReady && openResult.fillReady.minDelta);
            const latestDelta = Number(openResult.fillReady && openResult.fillReady.latestDelta);
            const expectedDeltaText = Number.isFinite(minDelta) ? formatNumberByScale(minDelta, 3) : "--";
            const actualDeltaText = Number.isFinite(latestDelta) ? formatNumberByScale(Math.max(0, latestDelta), 3) : "--";
            hedgeStatus.textContent = `${tradeLabel}失败：第${openResult.failedBatch}笔成交增量不足（预期≥${expectedDeltaText}，实际${actualDeltaText}）`;
          } else if (openResult.reason === "invalid_qty") {
            hedgeStatus.textContent = `${tradeLabel}失败：仓位数量无效`;
          } else if (openResult.reason === "unknown_side") {
            hedgeStatus.textContent = `${tradeLabel}失败：无法识别方向`;
          } else if (openResult.reason === "side_switch_before_submit_failed") {
            hedgeStatus.textContent = `${tradeLabel}失败：提交前方向切换失败`;
          } else {
            hedgeStatus.textContent = `${tradeLabel}失败：未找到可点击的提交按钮`;
          }
          logHedgeWarn(`${tradeLogPrefix} failed`, {
            account,
            side,
            sourceSide,
            openResult,
            debug: result.debug
          });
          return;
        }

        hedgeStatus.textContent = `写入失败：未定位到${result.missingFields.join("、")}输入框`;
        logHedgeWarn("qty input missing", {
          account,
          quantity,
          stopLoss: effectiveStopLoss,
          takeProfit: effectiveTakeProfit,
          side,
          action,
          debug: result.debug
        });
      }
    });
  }

  const mutationObserver = new MutationObserver(() => {
    scheduleChartScan();
  });

  const start = async () => {
    const storedEnabled = await loadHideSetting();
    setHideChartEnabled(storedEnabled, { persist: false });
    const hedgeSettings = await loadHedgeSettings();
    if (hedgeAccountsInput) {
      hedgeAccountsInput.value = hedgeSettings.accountsText;
    }
    if (hedgeApiInput) {
      hedgeApiInput.value = hedgeSettings.apiUrl || DEFAULT_HEDGE_API_URL;
    }
    setConfigHidden(Boolean(hedgeSettings.configHidden), { persist: false });
    if (hedgeSettings.panelPosition) {
      applyHedgePanelPosition(hedgeSettings.panelPosition.left, hedgeSettings.panelPosition.top);
    }
    await refreshHedgeData();
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
