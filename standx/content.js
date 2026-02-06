(() => {
  if (!window.location.href.includes("perpetual")) {
    return;
  }
  if (document.getElementById("standx-root")) {
    return;
  }

  const root = document.createElement("div");
  root.id = "standx-root";
  root.classList.add("standx-open");
  root.innerHTML = `
    <button id="standx-toggle" type="button">StandX</button>
    <div id="standx-panel" role="dialog" aria-label="StandX panel">
      <div id="standx-header">
        <div id="standx-title">
          <strong>StandX</strong>
          <div id="standx-subtitle">Positions monitor</div>
        </div>
        <button id="standx-close" type="button" aria-label="Close">X</button>
      </div>
      <div id="standx-body">
        <div class="standx-section">
          <div class="standx-row standx-status-row">
            <div id="standx-fetch-status"></div>
            <div class="standx-controls">
              <button class="standx-chip" id="standx-refresh-mode" type="button">Auto</button>
              <button class="standx-button secondary small" id="standx-refresh" type="button" hidden>Refresh</button>
              <button class="standx-chip" id="standx-hide-chart" type="button">Hide Chart</button>
            </div>
          </div>
        </div>

        <div class="standx-section">
          <div class="standx-row">
            <div>Positions</div>
          </div>
          <div id="standx-positions" class="standx-list"></div>
        </div>

        <div class="standx-order-grid">
          <div class="standx-section">
            <div class="standx-row">
              <div>Open order</div>
            </div>
            <div class="standx-form">
              <label>
                Symbol
                <select id="standx-symbol">
                  <option value="BTC-USD">BTC-USD</option>
                  <option value="XAU-USD">XAU-USD</option>
                </select>
              </label>
              <label>
                Qty
                <input id="standx-qty" type="number" min="0" step="0.1" value="0.1" />
              </label>
              <div class="standx-button-row">
                <button class="standx-button long" id="standx-submit-long" type="button">Open Long</button>
                <button class="standx-button short" id="standx-submit-short" type="button">Open Short</button>
              </div>
              <div id="standx-order-status"></div>
            </div>
          </div>

          <div class="standx-section">
            <div class="standx-row">
              <div>Auto Open Order</div>
              <button class="standx-chip" id="standx-auto-order-toggle" type="button">Off</button>
            </div>
            <div class="standx-form">
              <label>
                Spread Threshold
                <input id="standx-auto-order-threshold" type="number" step="0.01" value="1" />
              </label>
              <label>
                Compare
                <select id="standx-auto-order-compare">
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                </select>
              </label>
              <label>
                Direction
                <select id="standx-auto-order-direction">
                  <option value="both">Auto (Both)</option>
                  <option value="long">Long Only</option>
                  <option value="short">Short Only</option>
                </select>
              </label>
              <label>
                Confirm Frames
                <input id="standx-auto-order-frames" type="number" min="1" step="1" value="3" />
              </label>
              <div class="standx-hint" id="standx-auto-order-hint">
                Trigger when spread &gt; or &lt; threshold for 3 frames
              </div>
            </div>
          </div>
        </div>
        <div class="standx-section">
          <div class="standx-row">
            <div>Liq Alert</div>
          </div>
          <div class="standx-form">
            <div class="standx-hint" id="standx-liq-alert-hint">Notify when |Mark - Liq| &lt; 2000</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const mountTarget = document.body || document.documentElement;
  mountTarget.appendChild(root);
  const rootContainer = root.parentElement || mountTarget;

  const toggleButton = root.querySelector("#standx-toggle");
  const closeButton = root.querySelector("#standx-close");
  const refreshButton = root.querySelector("#standx-refresh");
  const refreshModeButton = root.querySelector("#standx-refresh-mode");
  const hideChartButton = root.querySelector("#standx-hide-chart");
  const positionsList = root.querySelector("#standx-positions");
  const fetchStatus = root.querySelector("#standx-fetch-status");
  const orderLongButton = root.querySelector("#standx-submit-long");
  const orderShortButton = root.querySelector("#standx-submit-short");
  const orderStatus = root.querySelector("#standx-order-status");
  const autoOrderToggle = root.querySelector("#standx-auto-order-toggle");
  const autoOrderThresholdInput = root.querySelector("#standx-auto-order-threshold");
  const autoOrderCompareSelect = root.querySelector("#standx-auto-order-compare");
  const autoOrderDirectionSelect = root.querySelector("#standx-auto-order-direction");
  const autoOrderFramesInput = root.querySelector("#standx-auto-order-frames");
  const autoOrderHint = root.querySelector("#standx-auto-order-hint");
  const qtyInput = root.querySelector("#standx-qty");
  const liqAlertHint = root.querySelector("#standx-liq-alert-hint");
  const symbolInput = root.querySelector("#standx-symbol");

  let isFetching = false;
  let hasToken = false;
  let pollTimer = null;
  let refreshMode = "auto";
  let suppressToggleClickUntil = 0;
  let spreadPort = null;
  let spreadRetry = 0;
  let spreadRetryTimer = null;
  let orderAutoTimer = null;
  let lastAutoQty = null;
  let lastAutoQtyIsRandom = false;
  let summarySpreadValue = null;
  let lastSpreadDiff = null;
  let pageHardRefreshTimer = null;
  let qtySyncTimer = null;
  let autoOrderEnabled = false;
  let autoOrderPending = false;
  let autoOrderArmed = true;
  let lastPositionsPayload = null;
  let autoOrderLongCount = 0;
  let autoOrderShortCount = 0;
  let hideChartEnabled = false;
  let chartScanScheduled = false;
  const settingSaveTimers = new Map();
  const hiddenChartElements = new Map();
  let autoOrderCompare = "gt";
  let autoOrderDirection = "both";
  let lastVarOrderResponse = null;
  let pendingVarOrderResponse = null;
  const pageQtySelector = '[data-testid="quantity-input"]';
  const pageBuyPriceSelector = '[data-testid="ask-price-display"]';
  const pageSellPriceSelector = '[data-testid="bid-price-display"]';
  const pageSubmitSelector = '[data-testid="submit-button"]';
  const varOrderResponseTimeoutMs = 3000;
  const liqAlertState = new Map();
  const liqAlertCooldownMs = 10 * 60 * 1000;
  const liqAlertDefaultDistance = 2000;
  const liqAlertXauDistance = 500;
  const pageHardRefreshIntervalMs = 2 * 60 * 60 * 1000;
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
    "#tv_chart_container",
  ].join(", ");
  const setPanelOpen = (open, options = {}) => {
    const nextOpen = Boolean(open);
    const wasOpen = root.classList.contains("standx-open");
    root.classList.toggle("standx-open", nextOpen);
    root.classList.toggle("standx-collapsed", !nextOpen);
    if (nextOpen) {
      requestTopLayer();
    }
    if (options.persist !== false && nextOpen !== wasOpen) {
      persistSettings({ standxPanelOpen: nextOpen });
    }
  };

  const setStatus = (el, message, type) => {
    el.textContent = message;
    el.classList.remove("error", "success");
    if (type) {
      el.classList.add(type);
    }
  };

  const sendMessage = (payload) => new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, status: 0, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });

  const wait = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

  const persistSettings = (payload) => {
    if (!payload || typeof payload !== "object") {
      return;
    }
    chrome.storage.sync.set(payload);
  };

  const scheduleSettingPersist = (key, value, delay = 300) => {
    if (!key) {
      return;
    }
    const existing = settingSaveTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      settingSaveTimers.delete(key);
      persistSettings({ [key]: value });
    }, delay);
    settingSaveTimers.set(key, timer);
  };

  const getCurrentSettingsSnapshot = () => ({
    standxSymbol: symbolInput ? symbolInput.value : "",
    standxHideChart: hideChartEnabled,
    standxPanelOpen: root.classList.contains("standx-open"),
    standxRefreshMode: refreshMode,
    standxAutoOrderEnabled: autoOrderEnabled,
    standxAutoOrderThreshold: autoOrderThresholdInput ? autoOrderThresholdInput.value : "",
    standxAutoOrderCompare: getAutoOrderCompare(),
    standxAutoOrderDirection: getAutoOrderDirection(),
    standxAutoOrderFrames: autoOrderFramesInput ? autoOrderFramesInput.value : "",
    standxQty: qtyInput ? qtyInput.value : ""
  });

  const persistAllSettings = () => {
    persistSettings(getCurrentSettingsSnapshot());
  };

  const logAutoOrder = (message, level = "info") => {
    const prefix = "[StandX Auto]";
    if (level === "error") {
      console.warn(prefix, message);
      return;
    }
    console.info(prefix, message);
  };

  const updateHideChartButton = () => {
    if (!hideChartButton) {
      return;
    }
    hideChartButton.textContent = hideChartEnabled ? "Show Chart" : "Hide Chart";
    hideChartButton.classList.toggle("is-auto", hideChartEnabled);
    hideChartButton.setAttribute("aria-pressed", hideChartEnabled ? "true" : "false");
  };

  const updateLiqAlertHint = () => {
    if (!liqAlertHint) {
      return;
    }
    const distance = getActiveLiqAlertDistance();
    liqAlertHint.textContent = `Notify when |Mark - Liq| < ${distance}`;
  };

  const blankChartFrame = (frame) => {
    if (!frame || frame.dataset.standxChartBlanked === "1") {
      return;
    }
    const src = frame.getAttribute("src");
    if (src) {
      frame.dataset.standxChartSrc = src;
    }
    const srcdoc = frame.getAttribute("srcdoc");
    if (srcdoc) {
      frame.dataset.standxChartSrcdoc = srcdoc;
    }
    frame.dataset.standxChartBlanked = "1";
    frame.setAttribute("src", "about:blank");
    frame.removeAttribute("srcdoc");
  };

  const restoreChartFrame = (frame) => {
    if (!frame || frame.dataset.standxChartBlanked !== "1") {
      return;
    }
    const src = frame.dataset.standxChartSrc;
    if (src) {
      frame.setAttribute("src", src);
    } else {
      frame.removeAttribute("src");
    }
    const srcdoc = frame.dataset.standxChartSrcdoc;
    if (srcdoc) {
      frame.setAttribute("srcdoc", srcdoc);
    }
    delete frame.dataset.standxChartBlanked;
    delete frame.dataset.standxChartSrc;
    delete frame.dataset.standxChartSrcdoc;
  };

  const collectChartTargets = () => {
    const targets = new Set();
    chartSelectorHints.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (el.closest("#standx-root")) {
          return;
        }
        targets.add(el);
      });
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
      if (!container || container.closest("#standx-root")) {
        return;
      }
      if (!hiddenChartElements.has(container)) {
        hiddenChartElements.set(container, { display: container.style.display });
      }
      container.dataset.standxChartHidden = "1";
      container.style.display = "none";
      if (container.tagName === "IFRAME") {
        blankChartFrame(container);
      } else {
        const frames = container.querySelectorAll("iframe");
        frames.forEach((frame) => blankChartFrame(frame));
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
      delete container.dataset.standxChartHidden;
      if (container.tagName === "IFRAME") {
        restoreChartFrame(container);
      } else {
        const frames = container.querySelectorAll("iframe");
        frames.forEach((frame) => restoreChartFrame(frame));
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

  const setHideChartEnabled = (enabled, options = {}) => {
    hideChartEnabled = Boolean(enabled);
    updateHideChartButton();
    if (hideChartEnabled) {
      scheduleChartScan();
    } else {
      restoreChartElements();
    }
    if (options.persist !== false) {
      chrome.storage.sync.set({ standxHideChart: hideChartEnabled });
    }
  };

  const loadHideChartSetting = async () => {
    const stored = await chrome.storage.sync.get({ standxHideChart: true });
    setHideChartEnabled(Boolean(stored.standxHideChart), { persist: false });
  };

  const loadSymbolSetting = async () => {
    if (!symbolInput) {
      return;
    }
    const stored = await chrome.storage.sync.get({ standxSymbol: "" });
    const nextValue = stored.standxSymbol || symbolInput.value;
    applySymbolValue(nextValue, { persist: false, refresh: false, adjustDirection: false });
  };

  const loadUserSettings = async () => {
    const stored = await chrome.storage.sync.get([
      "standxSymbol",
      "standxHideChart",
      "standxPanelOpen",
      "standxRefreshMode",
      "standxAutoOrderEnabled",
      "standxAutoOrderThreshold",
      "standxAutoOrderCompare",
      "standxAutoOrderDirection",
      "standxAutoOrderFrames",
      "standxQty"
    ]);

    const symbolValue = stored.standxSymbol || (symbolInput ? symbolInput.value : "");
    if (symbolInput) {
      applySymbolValue(symbolValue, { persist: false, refresh: false, adjustDirection: false });
    }
    maybeRedirectVarUrlForSelection();

    const hideChartValue = stored.standxHideChart;
    setHideChartEnabled(hideChartValue === undefined ? true : Boolean(hideChartValue), { persist: false });

    if (stored.standxPanelOpen !== undefined) {
      setPanelOpen(Boolean(stored.standxPanelOpen), { persist: false });
    }

    const refreshValue = stored.standxRefreshMode === "manual" ? "manual" : "auto";
    refreshMode = refreshValue;

    if (autoOrderThresholdInput) {
      const thresholdValue = stored.standxAutoOrderThreshold ?? autoOrderThresholdInput.value;
      applyAutoOrderThresholdValue(thresholdValue, { persist: false });
    }

    const compareValue = stored.standxAutoOrderCompare
      ?? (autoOrderCompareSelect ? autoOrderCompareSelect.value : autoOrderCompare);
    const directionValue = stored.standxAutoOrderDirection;
    if (directionValue === undefined) {
      applyAutoOrderCompareDefaults(compareValue, { persist: false });
    } else {
      applyAutoOrderCompareValue(compareValue, { persist: false });
      applyAutoOrderDirectionValue(directionValue, { persist: false });
    }

    if (autoOrderFramesInput) {
      const framesValue = stored.standxAutoOrderFrames ?? autoOrderFramesInput.value;
      applyAutoOrderFramesValue(framesValue, { persist: false });
    }

    if (qtyInput) {
      const qtyValue = stored.standxQty ?? qtyInput.value;
      applyQtyValue(qtyValue, { persist: false });
    }

    if (stored.standxAutoOrderEnabled !== undefined) {
      setAutoOrderEnabled(Boolean(stored.standxAutoOrderEnabled), { persist: false });
    }
  };

  const handleVarOrderResponse = (payload) => {
    const response = {
      ok: Boolean(payload && payload.ok),
      status: typeof payload?.status === "number" ? payload.status : 0,
      url: payload && payload.url ? String(payload.url) : "",
      method: payload && payload.method ? String(payload.method) : "",
      error: payload && payload.error ? String(payload.error) : "",
      receivedAt: Date.now()
    };
    lastVarOrderResponse = response;
    if (pendingVarOrderResponse && response.receivedAt >= pendingVarOrderResponse.afterTime) {
      clearTimeout(pendingVarOrderResponse.timer);
      const resolve = pendingVarOrderResponse.resolve;
      pendingVarOrderResponse = null;
      resolve(response);
    }
  };

  const waitForVarOrderResponse = (afterTime, timeoutMs) => new Promise((resolve) => {
    if (lastVarOrderResponse && lastVarOrderResponse.receivedAt >= afterTime) {
      resolve(lastVarOrderResponse);
      return;
    }
    if (pendingVarOrderResponse) {
      clearTimeout(pendingVarOrderResponse.timer);
      pendingVarOrderResponse.resolve({ ok: false, status: 0, reason: "superseded" });
    }
    const timer = setTimeout(() => {
      if (!pendingVarOrderResponse || pendingVarOrderResponse.resolve !== resolve) {
        return;
      }
      pendingVarOrderResponse = null;
      resolve({ ok: false, status: 0, reason: "timeout" });
    }, timeoutMs);
    pendingVarOrderResponse = { afterTime, resolve, timer };
  });

  const truncateText = (value, maxLength) => {
    if (!value) {
      return "";
    }
    const normalized = String(value).replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
  };

  const buildOrderResponseDetails = (response) => {
    if (!response) {
      return "no_response";
    }
    if (response.error) {
      return truncateText(`error:${response.error}`, 200);
    }
    let dataText = "";
    if (response.data !== undefined) {
      if (typeof response.data === "string") {
        dataText = response.data;
      } else {
        try {
          dataText = JSON.stringify(response.data);
        } catch {
          dataText = String(response.data);
        }
      }
    }
    const statusText = response.status !== undefined ? `status:${response.status}` : "";
    const combined = `${statusText} ${dataText}`.trim();
    return truncateText(combined, 200);
  };

  const notifyAutoOrderResult = async (success, spread, status, details) => {
    const stored = await chrome.storage.sync.get({ standxNotifyId: "" });
    const notifyId = (stored.standxNotifyId || "").trim();
    if (!notifyId) {
      return;
    }
    await sendMessage({
      type: "BARK_NOTIFY",
      id: notifyId,
      spread: formatValue(spread),
      success: Boolean(success),
      status: status || (success ? "success" : "failed"),
      details: details || ""
    });
  };

  const notifyLiqAlert = async (position, mark, liq, distance) => {
    const stored = await chrome.storage.sync.get({ standxNotifyId: "" });
    const notifyId = (stored.standxNotifyId || "").trim();
    if (!notifyId) {
      return;
    }
    const symbol = getPositionSymbol(position);
    const side = getPositionSideValue(position);
    const details = truncateText(
      [
        symbol ? `symbol:${symbol}` : null,
        side ? `side:${side}` : null,
        `mark:${formatValue(mark)}`,
        `liq:${formatValue(liq)}`,
        `dist:${formatValue(distance)}`
      ].filter(Boolean).join(" "),
      200
    );
    await sendMessage({
      type: "BARK_NOTIFY",
      id: notifyId,
      spread: formatValue(distance),
      success: false,
      status: "liq_alert",
      details
    });
  };

  const setSignedValue = (el, value) => {
    if (!el) {
      return;
    }
    const num = parseQty(value);
    el.textContent = formatValue(value);
    el.classList.remove("standx-positive", "standx-negative");
    if (num > 0) {
      el.classList.add("standx-positive");
    } else if (num < 0) {
      el.classList.add("standx-negative");
    }
  };

  const setSpreadSignedValue = (el, value) => {
    if (!el) {
      return;
    }
    const num = parseQty(value);
    el.textContent = formatValue(value);
    el.classList.remove(
      "standx-positive",
      "standx-negative",
      "standx-spread-positive",
      "standx-spread-negative"
    );
    if (num > 0) {
      el.classList.add("standx-spread-positive");
    } else if (num < 0) {
      el.classList.add("standx-spread-negative");
    }
  };

  const resetAutoOrderCounters = () => {
    autoOrderLongCount = 0;
    autoOrderShortCount = 0;
    autoOrderArmed = true;
  };

  const resetLiqAlertState = () => {
    liqAlertState.clear();
  };

  const setPopupInputsLocked = (locked) => {
    if (!root) {
      return;
    }
    const elements = root.querySelectorAll("input, select, textarea");
    elements.forEach((el) => {
      if (el.tagName === "INPUT" && el.type === "hidden") {
        return;
      }
      if (locked) {
        if (el.disabled) {
          return;
        }
        el.dataset.standxAutoLock = "1";
        el.disabled = true;
        return;
      }
      if (el.dataset.standxAutoLock === "1") {
        el.disabled = false;
        delete el.dataset.standxAutoLock;
      }
    });
  };

  const setAutoOrderEnabled = (enabled, options = {}) => {
    autoOrderEnabled = Boolean(enabled);
    autoOrderPending = false;
    if (autoOrderToggle) {
      autoOrderToggle.textContent = autoOrderEnabled ? "On" : "Off";
      autoOrderToggle.classList.toggle("is-auto", autoOrderEnabled);
    }
    setPopupInputsLocked(autoOrderEnabled);
    resetAutoOrderCounters();
    if (options.persist !== false) {
      persistSettings({ standxAutoOrderEnabled: autoOrderEnabled });
    }
  };

  const setAutoOrderDirection = (value) => {
    if (value === "long" || value === "short" || value === "both") {
      autoOrderDirection = value;
    } else {
      autoOrderDirection = "both";
    }
    resetAutoOrderCounters();
  };

  const setAutoOrderCompare = (value) => {
    if (value === "gt" || value === "lt") {
      autoOrderCompare = value;
    } else {
      autoOrderCompare = "gt";
    }
    resetAutoOrderCounters();
  };

  const applyAutoOrderCompareDefaults = (value, options = {}) => {
    const compareValue = value === "lt" ? "lt" : "gt";
    applyAutoOrderCompareValue(compareValue, { persist: false });
    const directionValue = getDefaultAutoOrderDirection(
      compareValue,
      symbolInput ? symbolInput.value : ""
    );
    applyAutoOrderDirectionValue(directionValue, { persist: false });
    if (options.persist !== false) {
      persistSettings({
        standxAutoOrderCompare: compareValue,
        standxAutoOrderDirection: directionValue
      });
    }
  };

  const getAutoOrderCompare = () => {
    return autoOrderCompareSelect ? autoOrderCompareSelect.value : autoOrderCompare;
  };

  const getAutoOrderDirection = () => {
    return autoOrderDirectionSelect ? autoOrderDirectionSelect.value : autoOrderDirection;
  };

  const getAutoOrderThreshold = () => {
    if (!autoOrderThresholdInput) {
      return null;
    }
    const value = parseQty(autoOrderThresholdInput.value);
    if (value === null || value === 0) {
      return null;
    }
    return value;
  };

  const getAutoOrderTriggerCount = () => {
    if (!autoOrderFramesInput) {
      return 3;
    }
    const value = parseInt(autoOrderFramesInput.value, 10);
    if (Number.isNaN(value) || value < 1) {
      return 3;
    }
    return value;
  };

  const updateAutoOrderHint = () => {
    if (!autoOrderHint) {
      return;
    }
    const count = getAutoOrderTriggerCount();
    autoOrderHint.textContent = `Trigger when spread > or < threshold for ${count} ${count === 1 ? "frame" : "frames"}`;
  };

  const triggerAutoOrder = (side) => {
    const triggerSpread = lastSpreadDiff;
    if (autoOrderPending) {
      return;
    }
    autoOrderPending = true;
    autoOrderArmed = false;
    const stopAutoOrder = (status, details) => {
      const statusText = status || "var_failed";
      setStatus(orderStatus, `Auto order stopped (${statusText}).`, "error");
      setAutoOrderEnabled(false);
      notifyAutoOrderResult(false, triggerSpread, statusText, details || statusText);
      resetAutoOrderCounters();
    };
    (async () => {
      if (!ensureVarUrlMatchesSelection("auto")) {
        stopAutoOrder("var_symbol_mismatch", "var_symbol_mismatch");
        return;
      }
      const pageResult = await prepareAutoOrderPage(side);
      if (!pageResult.ok) {
        stopAutoOrder(pageResult.reason || "var_failed");
        return;
      }
      const varResponse = await waitForVarOrderResponse(
        pageResult.clickedAt,
        varOrderResponseTimeoutMs
      );
      if (!varResponse.ok) {
        const reason = varResponse.reason === "timeout"
          ? "var_timeout"
          : varResponse.status
            ? `var_status_${varResponse.status}`
            : varResponse.error
              ? `var_error_${varResponse.error}`
              : "var_failed";
        logAutoOrder(`Var order failed (${reason}).`, "error");
        stopAutoOrder(reason, truncateText(reason, 200));
        return;
      }
      logAutoOrder(`Var order ok (status ${varResponse.status}).`);
      setStatus(orderStatus, `Var order confirmed (${pageResult.targetSide}). Submitting StandX...`, "");
      setAutoOrderEnabled(false);
      setTimeout(() => {
        submitOrder(side, { skipPageClick: true, autoMeta: { spread: triggerSpread } });
      }, 0);
    })().catch(() => {
      stopAutoOrder();
    });
  };

  const maybeTriggerAutoOrder = (value) => {
    if (!autoOrderEnabled || autoOrderPending) {
      return;
    }
    const threshold = getAutoOrderThreshold();
    const diff = parseQty(value);
    if (threshold === null || diff === null) {
      resetAutoOrderCounters();
      return;
    }
    const compare = getAutoOrderCompare();
    const conditionMet = compare === "gt" ? diff > threshold : diff < threshold;
    if (!conditionMet) {
      resetAutoOrderCounters();
      return;
    }
    if (!autoOrderArmed) {
      return;
    }
    const direction = getAutoOrderDirection();
    const triggerCount = getAutoOrderTriggerCount();
    if (direction === "long") {
      autoOrderShortCount = 0;
      autoOrderLongCount += 1;
      if (autoOrderLongCount >= triggerCount) {
        triggerAutoOrder("buy");
      }
      return;
    }
    if (direction === "short") {
      autoOrderLongCount = 0;
      autoOrderShortCount += 1;
      if (autoOrderShortCount >= triggerCount) {
        triggerAutoOrder("sell");
      }
      return;
    }
    if (threshold > 0) {
      autoOrderShortCount += 1;
      autoOrderLongCount = 0;
      if (autoOrderShortCount >= triggerCount) {
        triggerAutoOrder("sell");
      }
      return;
    }
    autoOrderLongCount += 1;
    autoOrderShortCount = 0;
    if (autoOrderLongCount >= triggerCount) {
      triggerAutoOrder("buy");
    }
  };

  const updateSpreadSummary = (value) => {
    lastSpreadDiff = value;
    if (!summarySpreadValue) {
      ensureSpreadSummaryVisible();
    }
    if (summarySpreadValue) {
      setSpreadSignedValue(summarySpreadValue, value);
    }
    maybeTriggerAutoOrder(value);
  };

  const handleSpreadMessage = (message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "SPREAD_STATUS") {
      if (message.status === "connected") {
        spreadRetry = 0;
      } else if (message.status === "error" || message.status === "disconnected") {
        updateSpreadSummary(null);
      }
      return;
    }
    if (message.type !== "SPREAD_UPDATE" || !message.data) {
      return;
    }
    if ("diff" in message.data) {
      updateSpreadSummary(message.data.diff);
    }
  };

  const scheduleSpreadReconnect = () => {
    if (spreadRetryTimer) {
      return;
    }
    const delay = Math.min(10000, 1000 * Math.pow(2, spreadRetry));
    spreadRetryTimer = setTimeout(() => {
      spreadRetryTimer = null;
      spreadRetry = Math.min(spreadRetry + 1, 5);
      connectSpreadPort();
    }, delay);
  };

  const connectSpreadPort = () => {
    if (spreadPort) {
      return;
    }
    try {
      spreadPort = chrome.runtime.connect({ name: "standx-spread" });
    } catch (error) {
      updateSpreadSummary(null);
      scheduleSpreadReconnect();
      return;
    }
    spreadPort.onMessage.addListener(handleSpreadMessage);
    spreadPort.onDisconnect.addListener(() => {
      spreadPort = null;
      updateSpreadSummary(null);
      scheduleSpreadReconnect();
    });
    updateSpreadSubscription();
  };

  const ensureTopLayer = () => {
    const container = root.parentElement || rootContainer;
    if (!container) {
      return;
    }
    if (container.lastElementChild !== root) {
      container.appendChild(root);
    }
  };

  const updatePanelScale = () => {
    const scaleTarget = document.body || document.documentElement;
    if (!scaleTarget) {
      return;
    }
    const rect = scaleTarget.getBoundingClientRect();
    const layoutWidth = scaleTarget.offsetWidth || rect.width;
    const layoutHeight = scaleTarget.offsetHeight || rect.height;
    let scaleX = layoutWidth ? rect.width / layoutWidth : 1;
    let scaleY = layoutHeight ? rect.height / layoutHeight : 1;
    if (!Number.isFinite(scaleX) || scaleX <= 0) {
      scaleX = 1;
    }
    if (!Number.isFinite(scaleY) || scaleY <= 0) {
      scaleY = 1;
    }
    const scale = Math.min(scaleX, scaleY);
    const inverse = 1 / scale;
    const hasLeft = root.style.left && root.style.left !== "auto";
    const hasTop = root.style.top && root.style.top !== "auto";
    root.style.transformOrigin = hasLeft || hasTop ? "top left" : "bottom right";
    if (!Number.isFinite(inverse) || Math.abs(inverse - 1) < 0.01) {
      root.style.transform = "";
      return;
    }
    root.style.transform = `scale(${inverse})`;
  };

  let topLayerScheduled = false;
  const requestTopLayer = () => {
    if (topLayerScheduled) {
      return;
    }
    topLayerScheduled = true;
    requestAnimationFrame(() => {
      topLayerScheduled = false;
      ensureTopLayer();
    });
  };

  const getPointerPosition = (event) => {
    if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    if (event.changedTouches && event.changedTouches[0]) {
      return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }
    return { x: event.clientX, y: event.clientY };
  };

  const applyRootPosition = (x, y) => {
    const rect = root.getBoundingClientRect();
    const width = rect.width || root.offsetWidth;
    const height = rect.height || root.offsetHeight;
    const maxX = Math.max(0, window.innerWidth - width - 8);
    const maxY = Math.max(0, window.innerHeight - height - 8);
    const clampedX = Math.min(Math.max(0, x), maxX);
    const clampedY = Math.min(Math.max(0, y), maxY);
    root.style.left = `${clampedX}px`;
    root.style.top = `${clampedY}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    updatePanelScale();
  };

  const loadDragPosition = async () => {
    const stored = await chrome.storage.sync.get({ standxPosition: null });
    if (stored.standxPosition && typeof stored.standxPosition.x === "number") {
      applyRootPosition(stored.standxPosition.x, stored.standxPosition.y);
    }
  };

  const saveDragPosition = async () => {
    const rect = root.getBoundingClientRect();
    await chrome.storage.sync.set({ standxPosition: { x: rect.left, y: rect.top } });
  };

  const setupDrag = (handle, allowButtonDrag = false) => {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let startX = 0;
    let startY = 0;
    let moved = false;

    const onMove = (event) => {
      if (!dragging) {
        return;
      }
      event.preventDefault();
      const { x, y } = getPointerPosition(event);
      if (!moved) {
        const deltaX = Math.abs(x - startX);
        const deltaY = Math.abs(y - startY);
        if (deltaX > 4 || deltaY > 4) {
          moved = true;
        }
      }
      applyRootPosition(x - offsetX, y - offsetY);
    };

    const onUp = () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      if (moved) {
        suppressToggleClickUntil = Date.now() + 250;
      }
      saveDragPosition();
    };

    const onDown = (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      if (!allowButtonDrag && event.target && event.target.closest("button")) {
        return;
      }
      dragging = true;
      const rect = root.getBoundingClientRect();
      const { x, y } = getPointerPosition(event);
      startX = x;
      startY = y;
      moved = false;
      offsetX = x - rect.left;
      offsetY = y - rect.top;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    };

    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive: false });
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) {
      return "--";
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value.toString() : String(value);
    }
    if (typeof value === "string") {
      return value.trim() || "--";
    }
    return String(value);
  };

  const formatComputedValue = (value) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "--";
    }
    const rounded = Math.round(value * 100) / 100;
    const normalized = Object.is(rounded, -0) ? 0 : rounded;
    return normalized.toFixed(2);
  };

  const formatQtyValue = (value) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "--";
    }
    const rounded = Math.round(value * 10000) / 10000;
    const normalized = Object.is(rounded, -0) ? 0 : rounded;
    return normalized.toFixed(4);
  };

  const setNativeValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) {
      setter.call(el, value);
      return;
    }
    el.value = value;
  };

  const syncQtyToPage = (value) => {
    const target = document.querySelector(pageQtySelector);
    if (!target) {
      return;
    }
    const nextValue = value === null || value === undefined ? "" : String(value);
    if (target.value === nextValue) {
      return;
    }
    setNativeValue(target, nextValue);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const normalizeSymbol = (value) => {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim().toLowerCase();
  };

  const isXauSymbol = (symbol) => {
    const normalized = normalizeSymbol(symbol);
    return normalized === "xau-usd" || normalized === "xauusd";
  };

  const getDefaultAutoOrderDirection = (compare, symbol) => {
    const baseDirection = compare === "lt" ? "long" : "short";
    if (isXauSymbol(symbol)) {
      return baseDirection === "long" ? "short" : "long";
    }
    return baseDirection;
  };

  const getLiqAlertDistanceForSymbol = (symbol) => (
    isXauSymbol(symbol) ? liqAlertXauDistance : liqAlertDefaultDistance
  );

  const getActiveLiqAlertDistance = () => (
    getLiqAlertDistanceForSymbol(symbolInput ? symbolInput.value : "")
  );

  const getSpreadChannelForSymbol = (symbol) => (
    isXauSymbol(symbol) ? "gold" : "price"
  );

  const getVarUrlRequirement = (symbol) => {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) {
      return "";
    }
    if (normalized.includes("xau")) {
      return "PAXG";
    }
    if (normalized.includes("btc")) {
      return "BTC";
    }
    return "";
  };

  const getVarUrlSlugForSymbol = (symbol) => getVarUrlRequirement(symbol);

  const maybeRedirectVarUrlForSelection = () => {
    if (!window.location || window.location.hostname !== "omni.variational.io") {
      return;
    }
    const slug = getVarUrlSlugForSymbol(symbolInput ? symbolInput.value : "");
    if (!slug) {
      return;
    }
    const targetPath = `/perpetual/${slug}`.toUpperCase();
    const currentPath = (window.location.pathname || "").toUpperCase();
    if (currentPath.startsWith(targetPath)) {
      return;
    }
    window.location.replace(`https://omni.variational.io/perpetual/${slug}`);
  };

  const ensureVarUrlMatchesSelection = (context) => {
    const symbolValue = symbolInput ? symbolInput.value : "";
    const requirement = getVarUrlRequirement(symbolValue);
    if (!requirement) {
      return true;
    }
    const href = (window.location && window.location.href) ? window.location.href.toUpperCase() : "";
    if (href.includes(requirement)) {
      return true;
    }
    const message = `Var 页面不匹配：${symbolValue || "当前币种"} 需要 URL 包含 ${requirement}`;
    setStatus(orderStatus, message, "error");
    if (context === "auto") {
      logAutoOrder(message, "error");
    }
    return false;
  };

  const updateSpreadSubscription = () => {
    if (!spreadPort) {
      return;
    }
    const channel = getSpreadChannelForSymbol(symbolInput ? symbolInput.value : "");
    try {
      spreadPort.postMessage({ type: "SPREAD_SUBSCRIBE", channel });
    } catch {
      // Ignore failed posts when port is already closed.
    }
  };

  const applyAutoOrderCompareValue = (value, options = {}) => {
    const compareValue = value === "lt" ? "lt" : "gt";
    if (autoOrderCompareSelect) {
      autoOrderCompareSelect.value = compareValue;
    }
    setAutoOrderCompare(compareValue);
    if (options.persist !== false) {
      persistSettings({ standxAutoOrderCompare: compareValue });
    }
  };

  const applyAutoOrderDirectionValue = (value, options = {}) => {
    const directionValue = value === "long" || value === "short" || value === "both"
      ? value
      : "both";
    if (autoOrderDirectionSelect) {
      autoOrderDirectionSelect.value = directionValue;
    }
    setAutoOrderDirection(directionValue);
    if (options.persist !== false) {
      persistSettings({ standxAutoOrderDirection: directionValue });
    }
  };

  const normalizeThresholdValue = (value) => (
    value === null || value === undefined ? "" : String(value)
  );

  const applyAutoOrderThresholdValue = (value, options = {}) => {
    if (!autoOrderThresholdInput) {
      return;
    }
    const nextValue = normalizeThresholdValue(value);
    if (autoOrderThresholdInput.value !== nextValue) {
      autoOrderThresholdInput.value = nextValue;
    }
    resetAutoOrderCounters();
    if (options.persist !== false) {
      persistSettings({ standxAutoOrderThreshold: nextValue });
    }
  };

  const normalizeFramesValue = (value) => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return "3";
    }
    return String(parsed);
  };

  const applyAutoOrderFramesValue = (value, options = {}) => {
    if (!autoOrderFramesInput) {
      return;
    }
    const nextValue = normalizeFramesValue(value);
    if (autoOrderFramesInput.value !== nextValue) {
      autoOrderFramesInput.value = nextValue;
    }
    resetAutoOrderCounters();
    updateAutoOrderHint();
    if (options.persist !== false) {
      persistSettings({ standxAutoOrderFrames: nextValue });
    }
  };

  const applyQtyValue = (value, options = {}) => {
    if (!qtyInput) {
      return;
    }
    const nextValue = value === null || value === undefined ? "" : String(value);
    if (qtyInput.value !== nextValue) {
      qtyInput.value = nextValue;
    }
    lastAutoQty = nextValue;
    lastAutoQtyIsRandom = true;
    syncQtyToPage(nextValue);
    if (options.persist !== false) {
      persistSettings({ standxQty: nextValue });
    }
  };

  const maybeUpdateAutoOrderDirectionForSymbolChange = (previousSymbol, nextSymbol, options = {}) => {
    const compareValue = getAutoOrderCompare();
    const currentDirection = getAutoOrderDirection();
    const previousDefault = getDefaultAutoOrderDirection(compareValue, previousSymbol);
    const nextDefault = getDefaultAutoOrderDirection(compareValue, nextSymbol);
    if (currentDirection !== previousDefault || previousDefault === nextDefault) {
      return;
    }
    if (options.persist === false) {
      if (autoOrderDirectionSelect) {
        autoOrderDirectionSelect.value = nextDefault;
      }
      setAutoOrderDirection(nextDefault);
      return;
    }
    applyAutoOrderDirectionValue(nextDefault);
  };

  const resolveSymbolValue = (value) => {
    if (!symbolInput) {
      return "";
    }
    const trimmed = typeof value === "string" ? value.trim() : "";
    const options = Array.from(symbolInput.options || []);
    if (!options.length) {
      return trimmed;
    }
    const match = options.find((option) => option.value === trimmed);
    return match ? match.value : options[0].value;
  };

  const applySymbolValue = (value, options = {}) => {
    if (!symbolInput) {
      return;
    }
    const previousValue = symbolInput.value;
    const nextValue = resolveSymbolValue(value);
    const changed = symbolInput.value !== nextValue;
    const shouldUpdate = changed || options.forceUpdate;
    if (changed) {
      symbolInput.value = nextValue;
    }
    const shouldPersist = options.persist !== false && (changed || options.forcePersist);
    if (shouldPersist) {
      persistSettings({ standxSymbol: nextValue });
    }
    if (shouldUpdate) {
      updateSpreadSummary(null);
      if (options.adjustDirection !== false) {
        maybeUpdateAutoOrderDirectionForSymbolChange(previousValue, nextValue, {
          persist: options.persist !== false
        });
      }
    }
    updateLiqAlertHint();
    updateSpreadSubscription();
    if (shouldUpdate) {
      maybeRedirectVarUrlForSelection();
    }
    if (shouldUpdate && options.refresh !== false) {
      renderPositions(lastPositionsPayload);
      refreshPositions();
    }
  };

  const normalizeCellText = (value) => {
    if (!value) {
      return "";
    }
    return String(value).replace(/\s+/g, " ").trim();
  };

  const normalizeNumericText = (value) => {
    if (!value) {
      return "";
    }
    return String(value).replace(/[$,]/g, "").trim();
  };

  const hasClassToken = (el, token) => {
    if (!el) {
      return false;
    }
    if (el.classList && el.classList.contains(token)) {
      return true;
    }
    return typeof el.className === "string" && el.className.includes(token);
  };

  const getPositionSymbol = (position) => (
    position.symbol || position.market || position.instrument || position.pair
  );

  const getPrimaryQtyValue = (position) => {
    const keys = ["qty", "size", "position_qty", "positionSize"];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(position, key)) {
        const value = position[key];
        if (value !== null && value !== undefined && value !== "") {
          return value;
        }
      }
    }
    return null;
  };

  const getQtyValues = (position) => {
    const values = [];
    const keys = ["qty", "size", "position_qty", "positionSize"];

    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(position, key)) {
        const value = position[key];
        if (value !== null && value !== undefined && value !== "") {
          values.push(value);
        }
      }
    });

    return values;
  };

  const parseQty = (value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const normalized = trimmed
        .replace(/[−–—‒﹣－]/g, "-")
        .replace(/,/g, "");
      const num = Number(normalized);
      return Number.isFinite(num) ? num : null;
    }
    return null;
  };

  const isZeroQty = (position) => {
    const values = getQtyValues(position);
    if (!values.length) {
      return false;
    }
    let hasNumeric = false;
    for (const value of values) {
      const num = parseQty(value);
      if (num !== null) {
        hasNumeric = true;
        if (num !== 0) {
          return false;
        }
      }
    }
    return hasNumeric;
  };

  const getDisplayRows = (position) => {
    const rows = [];
    const pick = (label, value, className) => {
      if (value !== undefined && value !== null && value !== "") {
        rows.push({ label, value: formatValue(value), className });
      }
    };

    const qtyValue = getPrimaryQtyValue(position);
    const qtyNumber = parseQty(qtyValue);
    if (qtyNumber !== null && qtyNumber !== 0) {
      const direction = qtyNumber > 0 ? "Long" : "Short";
      const directionClass = qtyNumber > 0 ? "standx-positive" : "standx-negative";
      pick("Direction", direction, directionClass);
    } else {
      pick("Side", position.side || position.position_side);
    }

    let qtyDisplay = qtyValue;
    if (qtyNumber !== null && position.source !== "page") {
      qtyDisplay = formatQtyValue(qtyNumber);
    }
    pick("Qty", qtyDisplay);
    pick("Entry", position.entry_price || position.entryPrice || position.avg_entry_price);
    pick("Mark", position.mark_price || position.markPrice || position.index_price);
    pick("Liq", position.liq_price || position.liqPrice);

    const upnlValue = position.upnl;
    const upnlNumber = parseQty(upnlValue);
    let upnlDisplay = upnlValue;
    if (upnlNumber !== null) {
      const rounded = Math.round(upnlNumber * 100) / 100;
      const normalized = Object.is(rounded, -0) ? 0 : rounded;
      upnlDisplay = normalized.toFixed(2);
    }
    const upnlClass = upnlNumber > 0 ? "standx-positive" : upnlNumber < 0 ? "standx-negative" : "";
    pick("UPnL", upnlDisplay, upnlClass || undefined);

    if (rows.length === 0) {
      const entries = Object.entries(position).slice(0, 6);
      entries.forEach(([key, value]) => rows.push({ label: key, value: formatValue(value) }));
    }

    return rows;
  };

  const extractPositions = (payload) => {
    if (!payload) {
      return [];
    }
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload.positions && Array.isArray(payload.positions)) {
      return payload.positions;
    }
    if (payload.data && Array.isArray(payload.data)) {
      return payload.data;
    }
    if (payload.data && payload.data.positions && Array.isArray(payload.data.positions)) {
      return payload.data.positions;
    }
    if (payload.result && Array.isArray(payload.result)) {
      return payload.result;
    }
    if (payload.result && payload.result.positions && Array.isArray(payload.result.positions)) {
      return payload.result.positions;
    }
    return [];
  };

  const extractPagePositions = () => {
    const rows = Array.from(document.querySelectorAll('[data-testid="positions-table-row"]'));
    return rows.map((row) => {
      const cells = Array.from(row.querySelectorAll(":scope > div"));
      if (!cells.length) {
        return null;
      }
      const symbolEl = row.querySelector("a span[title]")
        || row.querySelector("a [title]")
        || row.querySelector("a span")
        || cells[0];
      const symbol = normalizeCellText(symbolEl && symbolEl.textContent);
      const qtyText = normalizeNumericText(normalizeCellText(cells[1] && cells[1].textContent));
      const markText = normalizeNumericText(normalizeCellText(cells[2] && cells[2].textContent));
      const notionalText = normalizeNumericText(normalizeCellText(cells[3] && cells[3].textContent));
      const entryText = normalizeNumericText(normalizeCellText(cells[4] && cells[4].textContent));
      const liqText = normalizeNumericText(normalizeCellText(cells[5] && cells[5].textContent));
      const upnlTextRaw = normalizeCellText(cells[7] && cells[7].textContent);
      const upnlText = normalizeNumericText(upnlTextRaw.replace(/\s*\([^)]*\)\s*$/, ""));

      if (!symbol && !qtyText) {
        return null;
      }

      const position = {
        symbol: symbol || undefined,
        qty: qtyText || undefined,
        entry_price: entryText || undefined,
        mark_price: markText || undefined,
        liq_price: liqText || undefined,
        upnl: upnlText || undefined,
        source: "page"
      };
      if (notionalText) {
        position.notional = notionalText;
      }
      return position;
    }).filter(Boolean);
  };

  const getPositionQtyNumber = (positions) => {
    const targetSymbol = normalizeSymbol(symbolInput.value);
    if (targetSymbol) {
      for (const position of positions) {
        const symbol = getPositionSymbol(position);
        if (normalizeSymbol(symbol) !== targetSymbol) {
          continue;
        }
        const qtyNumber = parseQty(getPrimaryQtyValue(position));
        if (qtyNumber !== null && qtyNumber !== 0) {
          return qtyNumber;
        }
      }
    }
    for (const position of positions) {
      const qtyNumber = parseQty(getPrimaryQtyValue(position));
      if (qtyNumber !== null && qtyNumber !== 0) {
        return qtyNumber;
      }
    }
    return null;
  };

  const getEntryNumber = (position) => {
    if (!position) {
      return null;
    }
    const value = position.entry_price || position.entryPrice || position.avg_entry_price;
    return parseQty(value);
  };

  const getMarkNumber = (position) => {
    if (!position) {
      return null;
    }
    const value = position.mark_price || position.markPrice || position.index_price;
    return parseQty(value);
  };

  const getLiqNumber = (position) => {
    if (!position) {
      return null;
    }
    const value = position.liq_price || position.liqPrice;
    return parseQty(value);
  };

  const getUpnlNumber = (position) => {
    if (!position) {
      return null;
    }
    return parseQty(position.upnl);
  };

  const pickPrimaryPosition = (positions) => {
    if (!positions || !positions.length) {
      return null;
    }
    const targetSymbol = normalizeSymbol(symbolInput.value);
    if (targetSymbol) {
      const match = positions.find((position) => (
        normalizeSymbol(getPositionSymbol(position)) === targetSymbol
      ));
      if (match) {
        return match;
      }
    }
    return positions[0];
  };

  const getNetQtyFromPositions = (positions) => {
    if (!positions || !positions.length) {
      return 0;
    }
    let netQty = 0;
    positions.forEach((position) => {
      const qtyValue = getPrimaryQtyValue(position);
      const qtyNumber = parseQty(qtyValue);
      if (qtyNumber !== null && qtyNumber !== 0) {
        netQty += qtyNumber;
        return;
      }
      const sideValue = (position.side || position.position_side || "").toString().toLowerCase();
      if (!sideValue) {
        return;
      }
      if (sideValue.includes("short") || sideValue === "sell") {
        netQty -= 1;
      } else if (sideValue.includes("long") || sideValue === "buy") {
        netQty += 1;
      }
    });
    return netQty;
  };

  const getPositionSideValue = (position) => {
    if (!position) {
      return "";
    }
    const qtyNumber = parseQty(getPrimaryQtyValue(position));
    if (qtyNumber !== null && qtyNumber !== 0) {
      return qtyNumber > 0 ? "long" : "short";
    }
    const sideValue = (position.side || position.position_side || "").toString().toLowerCase();
    if (sideValue.includes("short") || sideValue === "sell") {
      return "short";
    }
    if (sideValue.includes("long") || sideValue === "buy") {
      return "long";
    }
    return "";
  };

  const findPageSideButtons = () => {
    let buyButton = null;
    let sellButton = null;

    const buyAnchor = document.querySelector(pageBuyPriceSelector);
    const sellAnchor = document.querySelector(pageSellPriceSelector);
    if (buyAnchor) {
      buyButton = buyAnchor.closest("button");
    }
    if (sellAnchor) {
      sellButton = sellAnchor.closest("button");
    }

    if (!buyButton || !sellButton) {
      const candidates = Array.from(document.querySelectorAll("button"))
        .filter((button) => !button.closest("#standx-root"));
      if (!buyButton) {
        buyButton = candidates.find((button) => /\bbuy\b/i.test(button.textContent || ""));
      }
      if (!sellButton) {
        sellButton = candidates.find((button) => /\bsell\b/i.test(button.textContent || ""));
      }
    }

    if (buyButton && buyButton.closest("#standx-root")) {
      buyButton = null;
    }
    if (sellButton && sellButton.closest("#standx-root")) {
      sellButton = null;
    }

    return { buyButton, sellButton };
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

  const isButtonClickable = (button) => {
    return Boolean(button) && !isButtonDisabled(button);
  };

  const hasBuyActiveStyle = (button) => (
    hasClassToken(button, "text-green")
    || hasClassToken(button, "border-green")
    || hasClassToken(button, "fill-green")
  );

  const hasSellActiveStyle = (button) => (
    hasClassToken(button, "text-red")
    || hasClassToken(button, "border-red")
    || hasClassToken(button, "fill-red")
  );

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

  const switchPageSideTo = (targetSide) => {
    const { buyButton, sellButton, currentSide } = getPageSideState();
    const targetButton = targetSide === "buy" ? buyButton : sellButton;
    if (!targetButton) {
      return false;
    }
    if (currentSide === targetSide) {
      return true;
    }
    if (isButtonDisabled(targetButton)) {
      return false;
    }
    targetButton.click();
    return true;
  };

  const prepareAutoOrderPage = async (popupSide) => {
    const targetSide = popupSide === "buy" ? "sell" : "buy";
    const { buyButton, sellButton, currentSide } = getPageSideState();
    const targetButton = targetSide === "buy" ? buyButton : sellButton;
    if (!targetButton) {
      logAutoOrder(`Var side button missing (${targetSide}).`, "error");
      return { ok: false, targetSide, reason: "side_button_missing" };
    }
    const shouldSwitch = currentSide !== targetSide;
    if (shouldSwitch) {
      if (isButtonDisabled(targetButton)) {
        logAutoOrder(`Var side button disabled (${targetSide}).`, "error");
        return { ok: false, targetSide, reason: "side_button_disabled" };
      }
      targetButton.click();
      await wait(100);
      if (qtyInput) {
        syncQtyToPage(qtyInput.value);
      }
      await wait(100);
    }
    const submitButton = findPageSubmitButton(targetSide);
    if (!isButtonClickable(submitButton)) {
      logAutoOrder(`Var submit button disabled (${targetSide}).`, "error");
      return { ok: false, targetSide, reason: "submit_button_disabled" };
    }
    await wait(100);
    const clickedAt = Date.now();
    submitButton.click();
    logAutoOrder(`Var submit clicked (${targetSide}, qty ${qtyInput ? qtyInput.value : "--"}).`);
    return { ok: true, targetSide, clickedAt };
  };

  const findPageSubmitButton = (side) => {
    const buttons = Array.from(document.querySelectorAll(pageSubmitSelector))
      .filter((button) => !button.closest("#standx-root"));
    if (!buttons.length) {
      return null;
    }
    const targetClass = side === "buy" ? "bg-green" : "bg-red";
    let button = buttons.find((candidate) => hasClassToken(candidate, targetClass));
    if (!button) {
      const regex = side === "buy" ? /\bbuy\b/i : /\bsell\b/i;
      button = buttons.find((candidate) => regex.test(candidate.textContent || ""));
    }
    return button || null;
  };

  const clickPageSubmitWithRetry = (side, attempt = 0) => new Promise((resolve) => {
    const button = findPageSubmitButton(side);
    if (button && isButtonDisabled(button)) {
      resolve(false);
      return;
    }
    if (isButtonClickable(button)) {
      button.click();
      resolve(true);
      return;
    }
    if (attempt >= 6) {
      resolve(false);
      return;
    }
    setTimeout(() => {
      clickPageSubmitWithRetry(side, attempt + 1).then(resolve);
    }, 120);
  });

  const waitForPageSubmitClickable = (side, attempt = 0) => new Promise((resolve) => {
    const button = findPageSubmitButton(side);
    if (button && isButtonDisabled(button)) {
      resolve(false);
      return;
    }
    if (isButtonClickable(button)) {
      resolve(true);
      return;
    }
    if (attempt >= 6) {
      resolve(false);
      return;
    }
    setTimeout(() => {
      waitForPageSubmitClickable(side, attempt + 1).then(resolve);
    }, 120);
  });

  const clickPageSubmitForPopupSide = (popupSide) => {
    const targetSide = popupSide === "buy" ? "sell" : "buy";
    switchPageSideTo(targetSide);
    return clickPageSubmitWithRetry(targetSide);
  };

  const canClickPageSubmitForPopupSide = (popupSide) => {
    const targetSide = popupSide === "buy" ? "sell" : "buy";
    switchPageSideTo(targetSide);
    return waitForPageSubmitClickable(targetSide);
  };

  const updateOrderButtonEmphasis = (positions) => {
    orderLongButton.classList.remove("is-emphasis");
    orderShortButton.classList.remove("is-emphasis");
    if (!positions || !positions.length) {
      return;
    }

    const netQty = getNetQtyFromPositions(positions);
    if (netQty > 0) {
      orderShortButton.classList.add("is-emphasis");
    } else if (netQty < 0) {
      orderLongButton.classList.add("is-emphasis");
    }
  };

  const getRandomDefaultQty = () => {
    const milliUnits = Math.floor(Math.random() * 51) + 100;
    return (milliUnits / 1000).toFixed(3);
  };

  const updateQtyDefault = (positions) => {
    if (!qtyInput) {
      return;
    }
    const currentValue = qtyInput.value;
    const userModified = lastAutoQty !== null
      && currentValue !== ""
      && currentValue !== lastAutoQty;
    if (!positions || !positions.length) {
      if (userModified) {
        return;
      }
      if (currentValue === "" || !lastAutoQtyIsRandom) {
        const nextValue = getRandomDefaultQty();
        if (currentValue !== nextValue) {
          qtyInput.value = nextValue;
          syncQtyToPage(nextValue);
        }
        lastAutoQty = nextValue;
        lastAutoQtyIsRandom = true;
      }
      return;
    }
    lastAutoQtyIsRandom = false;
    const qtyNumber = getPositionQtyNumber(positions);
    if (qtyNumber === null) {
      return;
    }
    const nextValue = Math.abs(qtyNumber).toString();
    if (userModified) {
      return;
    }
    if (currentValue !== nextValue) {
      qtyInput.value = nextValue;
      syncQtyToPage(nextValue);
    }
    lastAutoQty = nextValue;
  };

  const buildPositionCard = (position, index) => {
    const card = document.createElement("div");
    card.className = "standx-card";
    const qtyValue = getPrimaryQtyValue(position);
    const qtyNumber = parseQty(qtyValue);
    if (qtyNumber > 0) {
      card.classList.add("standx-long");
    } else if (qtyNumber < 0) {
      card.classList.add("standx-short");
    }

    const title = document.createElement("div");
    title.className = "standx-card-title";
    const symbol = getPositionSymbol(position);
    title.textContent = symbol ? String(symbol) : `Position ${index + 1}`;

    const kv = document.createElement("div");
    kv.className = "standx-kv";

    getDisplayRows(position).forEach(({ label, value, className }) => {
      const keyEl = document.createElement("div");
      keyEl.textContent = label;
      const valueEl = document.createElement("div");
      const valueText = document.createElement("span");
      valueText.textContent = value;
      if (className) {
        valueText.classList.add(className);
      }
      valueEl.appendChild(valueText);
      kv.appendChild(keyEl);
      kv.appendChild(valueEl);
    });

    card.appendChild(title);
    card.appendChild(kv);
    return card;
  };

  const buildPositionsColumn = (title, positions) => {
    const column = document.createElement("div");
    column.className = "standx-positions-column";

    const heading = document.createElement("div");
    heading.className = "standx-positions-heading";
    heading.textContent = title;
    column.appendChild(heading);

    const list = document.createElement("div");
    list.className = "standx-list";

    if (!positions.length) {
      const empty = document.createElement("div");
      empty.className = "standx-card standx-empty";
      empty.textContent = "No positions.";
      list.appendChild(empty);
    } else {
      positions.forEach((position, index) => {
        list.appendChild(buildPositionCard(position, index));
      });
    }

    column.appendChild(list);
    return column;
  };

  const appendSummaryRow = (kv, label, value, className) => {
    const keyEl = document.createElement("div");
    keyEl.textContent = label;
    const valueEl = document.createElement("div");
    const valueText = document.createElement("span");
    valueText.textContent = value;
    if (className) {
      valueText.classList.add(className);
    }
    valueEl.appendChild(valueText);
    kv.appendChild(keyEl);
    kv.appendChild(valueEl);
    return valueText;
  };

  const buildPositionsSummary = (apiPositions, pagePositions) => {
    const apiPosition = pickPrimaryPosition(apiPositions);
    const pagePosition = pickPrimaryPosition(pagePositions);
    const apiEntry = getEntryNumber(apiPosition);
    const pageEntry = getEntryNumber(pagePosition);
    const entryDiff = (apiEntry !== null && pageEntry !== null) ? apiEntry - pageEntry : null;
    const apiUpnl = getUpnlNumber(apiPosition);
    const pageUpnl = getUpnlNumber(pagePosition);
    const totalUpnl = (apiUpnl !== null && pageUpnl !== null) ? apiUpnl + pageUpnl : null;

    const summary = document.createElement("div");
    summary.className = "standx-card standx-summary";
    const kv = document.createElement("div");
    kv.className = "standx-kv";
    appendSummaryRow(kv, "Entry Spread", formatComputedValue(entryDiff));
    summarySpreadValue = appendSummaryRow(kv, "Live Spread", formatValue(lastSpreadDiff));
    setSpreadSignedValue(summarySpreadValue, lastSpreadDiff);


    let upnlClass = "";
    if (totalUpnl > 0) {
      upnlClass = "standx-positive";
    } else if (totalUpnl < 0) {
      upnlClass = "standx-negative";
    }
    appendSummaryRow(kv, "Total UPnL", formatComputedValue(totalUpnl), upnlClass);

    summary.appendChild(kv);
    return summary;
  };

  const buildLiqAlertKey = (position, index) => {
    const symbol = normalizeSymbol(getPositionSymbol(position));
    const side = getPositionSideValue(position) || "na";
    if (symbol) {
      return `${symbol}:${side}`;
    }
    const liq = getLiqNumber(position);
    const mark = getMarkNumber(position);
    if (liq !== null || mark !== null) {
      return `pos:${liq ?? "na"}:${mark ?? "na"}:${side}`;
    }
    return `idx:${index}`;
  };

  const checkLiqAlerts = async (positions) => {
    if (!positions || !positions.length) {
      resetLiqAlertState();
      return;
    }
    const now = Date.now();
    const seenKeys = new Set();
    for (let i = 0; i < positions.length; i += 1) {
      const position = positions[i];
      const key = buildLiqAlertKey(position, i);
      const mark = getMarkNumber(position);
      const liq = getLiqNumber(position);
      if (mark === null || liq === null) {
        liqAlertState.delete(key);
        continue;
      }
      const distance = Math.abs(mark - liq);
      const threshold = getLiqAlertDistanceForSymbol(getPositionSymbol(position) || symbolInput?.value);
      seenKeys.add(key);
      const state = liqAlertState.get(key) || { lastAlertAt: 0 };
      if (distance < threshold) {
        if (now - state.lastAlertAt >= liqAlertCooldownMs) {
          state.lastAlertAt = now;
          liqAlertState.set(key, state);
          await notifyLiqAlert(position, mark, liq, distance);
        } else {
          liqAlertState.set(key, state);
        }
        continue;
      }
      liqAlertState.set(key, state);
    }
    for (const key of Array.from(liqAlertState.keys())) {
      if (!seenKeys.has(key)) {
        liqAlertState.delete(key);
      }
    }
  };

  const renderPositions = (payload) => {
    summarySpreadValue = null;
    positionsList.innerHTML = "";
    const apiPositions = extractPositions(payload).filter((position) => !isZeroQty(position));
    const pagePositions = extractPagePositions().filter((position) => !isZeroQty(position));
    const statePositions = apiPositions.length ? apiPositions : pagePositions;
    updateOrderButtonEmphasis(statePositions);
    updateQtyDefault(statePositions);
    const alertPositions = apiPositions.concat(pagePositions);
    checkLiqAlerts(alertPositions).catch(() => {});
    const hasAnyPositions = apiPositions.length || pagePositions.length;
    if (!hasAnyPositions && refreshMode === "auto") {
      applyRefreshModeValue("manual");
    }

    const grid = document.createElement("div");
    grid.className = "standx-positions-grid";
    grid.appendChild(buildPositionsColumn("StandX", apiPositions));
    grid.appendChild(buildPositionsColumn("Var", pagePositions));
    positionsList.appendChild(grid);
    positionsList.appendChild(buildPositionsSummary(apiPositions, pagePositions));
  };

  const ensureSpreadSummaryVisible = () => {
    if (!positionsList) {
      return;
    }
    const existing = positionsList.querySelector(".standx-summary");
    if (existing) {
      return;
    }
    const summary = buildPositionsSummary([], []);
    positionsList.appendChild(summary);
  };

  const updateTokenStatus = async () => {
    const stored = await chrome.storage.sync.get({ standxToken: "" });
    const token = (stored.standxToken || "").trim();
    hasToken = Boolean(token);
    return hasToken;
  };

  const refreshPositions = async () => {
    if (!hasToken || isFetching) {
      return;
    }
    isFetching = true;
    setStatus(fetchStatus, "Loading positions...", "");
    const response = await sendMessage({ type: "GET_POSITIONS" });

    if (!response || !response.ok) {
      const errorMessage = response && response.error
        ? response.error
        : `Request failed (${response ? response.status : "no response"})`;
      setStatus(fetchStatus, errorMessage, "error");
      isFetching = false;
      return;
    }

    lastPositionsPayload = response.data;
    renderPositions(lastPositionsPayload);
    setStatus(fetchStatus, "Positions updated", "success");
    isFetching = false;
  };

  const scheduleAutoRefreshAfterOrder = () => {
    if (orderAutoTimer) {
      clearTimeout(orderAutoTimer);
    }
    orderAutoTimer = setTimeout(() => {
      orderAutoTimer = null;
      if (refreshMode !== "auto") {
        applyRefreshModeValue("auto");
      }
    }, 1000);
  };

  const submitOrder = async (side, options = {}) => {
    scheduleAutoRefreshAfterOrder();
    if (!options.skipPageClick) {
      if (!ensureVarUrlMatchesSelection("manual")) {
        return;
      }
      clickPageSubmitForPopupSide(side);
    }
    setStatus(orderStatus, "Sending order...", "");
    const response = await sendMessage({
      type: "NEW_ORDER",
      side,
      qty: qtyInput.value,
      symbol: symbolInput.value
    });

    const responseDetails = buildOrderResponseDetails(response);
    if (!response || !response.ok) {
      const errorMessage = response && response.error
        ? response.error
        : `Order failed (${response ? response.status : "no response"})`;
      setStatus(orderStatus, errorMessage, "error");
      if (options.autoMeta) {
        await notifyAutoOrderResult(false, options.autoMeta.spread, "standx_failed", responseDetails);
      }
      return;
    }

    setStatus(orderStatus, "Order submitted", "success");
    if (options.autoMeta) {
      await notifyAutoOrderResult(true, options.autoMeta.spread, "success", responseDetails);
    }
    await refreshPositions();
  };

  toggleButton.addEventListener("click", () => {
    if (Date.now() < suppressToggleClickUntil) {
      return;
    }
    const isOpen = root.classList.contains("standx-open");
    setPanelOpen(!isOpen);
  });

  closeButton.addEventListener("click", () => setPanelOpen(false));
  refreshButton.addEventListener("click", refreshPositions);
  refreshModeButton.addEventListener("click", () => {
    applyRefreshModeValue(refreshMode === "auto" ? "manual" : "auto");
  });
  if (hideChartButton) {
    hideChartButton.addEventListener("click", () => {
      setHideChartEnabled(!hideChartEnabled);
    });
  }
  autoOrderToggle.addEventListener("click", () => {
    setAutoOrderEnabled(!autoOrderEnabled);
  });
  autoOrderThresholdInput.addEventListener("input", () => {
    resetAutoOrderCounters();
    scheduleSettingPersist("standxAutoOrderThreshold", autoOrderThresholdInput.value);
  });
  if (autoOrderFramesInput) {
    autoOrderFramesInput.addEventListener("input", () => {
      resetAutoOrderCounters();
      updateAutoOrderHint();
      scheduleSettingPersist("standxAutoOrderFrames", autoOrderFramesInput.value);
    });
  }
  autoOrderCompareSelect.addEventListener("change", (event) => {
    applyAutoOrderCompareDefaults(event.target.value);
  });
  autoOrderDirectionSelect.addEventListener("change", (event) => {
    applyAutoOrderDirectionValue(event.target.value);
  });
  qtyInput.addEventListener("input", (event) => {
    syncQtyToPage(event.target.value);
    scheduleSettingPersist("standxQty", event.target.value);
  });
  if (symbolInput) {
    symbolInput.addEventListener("change", (event) => {
      applySymbolValue(event.target.value, { forcePersist: true, forceUpdate: true });
    });
  }
  orderLongButton.addEventListener("click", () => submitOrder("buy"));
  orderShortButton.addEventListener("click", () => submitOrder("sell"));
  updateAutoOrderHint();
  updateLiqAlertHint();

  const headerHandle = root.querySelector("#standx-header");
  setupDrag(toggleButton, true);
  if (headerHandle) {
    setupDrag(headerHandle);
  }
  loadDragPosition();
  updatePanelScale();
  connectSpreadPort();

  const observerTarget = document.body || document.documentElement;
  if (observerTarget && typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => {
      requestTopLayer();
      if (hideChartEnabled) {
        scheduleChartScan();
      }
    });
    observer.observe(observerTarget, { childList: true, subtree: true });
  }

  window.addEventListener("focus", requestTopLayer);
  document.addEventListener("visibilitychange", requestTopLayer);
  window.addEventListener("pagehide", () => {
    persistAllSettings();
    if (pageHardRefreshTimer) {
      clearInterval(pageHardRefreshTimer);
      pageHardRefreshTimer = null;
    }
  });
  window.addEventListener("resize", updatePanelScale);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updatePanelScale);
  }

  const startPolling = () => {
    if (pollTimer) {
      return;
    }
    pollTimer = setInterval(() => {
      refreshPositions();
    }, 1000);
  };

  const stopPolling = () => {
    if (!pollTimer) {
      return;
    }
    clearInterval(pollTimer);
    pollTimer = null;
  };

  const applyRefreshMode = () => {
    const isAuto = refreshMode === "auto";
    refreshModeButton.textContent = isAuto ? "Auto" : "Manual";
    refreshModeButton.classList.toggle("is-auto", isAuto);
    if (isAuto) {
      refreshButton.setAttribute("hidden", "");
    } else {
      refreshButton.removeAttribute("hidden");
    }
    if (!hasToken) {
      stopPolling();
      return;
    }
    if (isAuto) {
      startPolling();
      refreshPositions();
      return;
    }
    stopPolling();
  };

  const applyRefreshModeValue = (value, options = {}) => {
    const nextValue = value === "manual" ? "manual" : "auto";
    refreshMode = nextValue;
    if (options.apply !== false) {
      applyRefreshMode();
    }
    if (options.persist !== false) {
      persistSettings({ standxRefreshMode: refreshMode });
    }
  };

  const startQtySyncMonitor = () => {
    if (qtySyncTimer) {
      return;
    }
    qtySyncTimer = setInterval(() => {
      if (!qtyInput) {
        return;
      }
      syncQtyToPage(qtyInput.value);
    }, 1000);
  };

  const startPageHardRefreshTimer = () => {
    if (pageHardRefreshTimer) {
      return;
    }
    pageHardRefreshTimer = setInterval(() => {
      window.location.reload();
    }, pageHardRefreshIntervalMs);
  };

  const syncTokenState = async () => {
    const tokenReady = await updateTokenStatus();
    if (tokenReady) {
      if (refreshMode === "auto") {
        startPolling();
        refreshPositions();
      } else {
        stopPolling();
      }
      return;
    }
    stopPolling();
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.standxToken) {
      syncTokenState();
    }
    if (area === "sync" && changes.standxHideChart) {
      setHideChartEnabled(Boolean(changes.standxHideChart.newValue), { persist: false });
    }
    if (area === "sync" && changes.standxPanelOpen) {
      setPanelOpen(Boolean(changes.standxPanelOpen.newValue), { persist: false });
    }
    if (area === "sync" && changes.standxRefreshMode) {
      applyRefreshModeValue(changes.standxRefreshMode.newValue, { persist: false });
    }
    if (area === "sync" && changes.standxAutoOrderEnabled) {
      setAutoOrderEnabled(Boolean(changes.standxAutoOrderEnabled.newValue), { persist: false });
    }
    if (area === "sync" && changes.standxAutoOrderThreshold) {
      applyAutoOrderThresholdValue(changes.standxAutoOrderThreshold.newValue, { persist: false });
    }
    if (area === "sync" && changes.standxAutoOrderCompare) {
      applyAutoOrderCompareValue(changes.standxAutoOrderCompare.newValue, { persist: false });
    }
    if (area === "sync" && changes.standxAutoOrderDirection) {
      applyAutoOrderDirectionValue(changes.standxAutoOrderDirection.newValue, { persist: false });
    }
    if (area === "sync" && changes.standxAutoOrderFrames) {
      applyAutoOrderFramesValue(changes.standxAutoOrderFrames.newValue, { persist: false });
    }
    if (area === "sync" && changes.standxQty) {
      applyQtyValue(changes.standxQty.newValue, { persist: false });
    }
    if (area === "sync" && changes.standxSymbol) {
      applySymbolValue(changes.standxSymbol.newValue, { persist: false });
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "VAR_ORDER_REQUEST") {
      handleVarOrderResponse(message);
    }
  });

  loadUserSettings()
    .catch(() => {})
    .finally(() => {
      applyRefreshMode();
      syncTokenState();
      startQtySyncMonitor();
      startPageHardRefreshTimer();
    });
})();
