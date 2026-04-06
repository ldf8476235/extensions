(() => {
  const STORAGE_KEYS = {
    enabled: "geniusSwapEnabled",
    count: "geniusSwapCount",
    loopCount: "geniusSwapLoopCount",
    runMode: "geniusSwapRunMode",
    targetTodayVolume: "geniusSwapTargetTodayVolume",
    recoveryState: "geniusSwapRecoveryState",
  };

  const PANEL_ID = "genius-swap-panel";
  const PANEL_LAYOUT_STORAGE_KEY = "geniusSwapPanelLayoutV1";
  const PANEL_STATS_STORAGE_KEY = "geniusSwapPanelStatsV1";
  const LOG_LIMIT = 80;
  const POLL_INTERVAL_MS = 250;
  const WAIT_TIMEOUT_MS = 20000;
  const WAIT_AFTER_BUTTON_MS = 1000;
  const WAIT_AFTER_SAVED_TAB_MS = 2000;
  const SEARCH_RESULT_TIMEOUT_MS = 5000;
  const WAIT_AFTER_MAX_MS = 15000;
  const WAIT_AFTER_CONFIRM_MS = 30000;
  const WAIT_BEFORE_CONFIRM_MS = 1500;
  const WAIT_AFTER_REFRESH_MS = 3000;
  const WAIT_BETWEEN_CYCLES_MIN_MS = 5000;
  const WAIT_BETWEEN_CYCLES_MAX_MS = 10000;
  const PANEL_DEFAULT_WIDTH = 240;
  const PANEL_MIN_WIDTH = 220;
  const PANEL_MIN_HEIGHT = 260;
  const PANEL_MAX_WIDTH = 420;
  const PANEL_MAX_HEIGHT = 720;
  const PANEL_EDGE_GAP = 12;
  const ORDER_HISTORY_PAGE_SIZE = 100;
  const ORDER_HISTORY_MAX_PAGES = 10;
  const PANEL_STATS_REFRESH_INTERVAL_MS = 60000;
  const RUN_MODE_COUNT = "count";
  const RUN_MODE_TARGET = "target";
  const POST_RUN_SETTLE_WAIT_MS = 5000;
  const UNKNOWN_ERROR_REFRESH_MAX_ATTEMPTS = 3;
  const USDT_SOURCE_NAMES = ["Tether USD", "USDT"];
  const USDC_SOURCE_NAMES = ["USD Coin", "USDC"];
  const KOGE_SOURCE_NAMES = ["BNB48 Club Token", "KOGE"];
  const TARGET_SYMBOL_USDT = "USDT";
  const TARGET_SYMBOL_USDC = "USDC";
  const TARGET_CHAIN_NAME = "BNB";
  const CHOOSE_TEXT = "Choose";
  const SAVED_TAB_TEXT = "已保存";
  const CONFIRM_TEXTS = ["Confirm", "确认"];
  const CLOSE_TEXT = "Close";
  const REFRESH_TEXT = "Refresh";
  const CONFIRMED_TEXT = "Confirmed";
  const SUCCESS_TEXT = "Success";
  const PENDING_TEXT = "Pending";
  const SWAPPED_TO_TEXT = "Swapped to";
  const TAB_ROW_HINTS = ["Gas", "已保存"];
  const CLICKABLE_SELECTOR =
    "button,[role='button'],[role='option'],[role='tab'],[data-state],a,div.cursor-pointer,li";
  const CHAIN_MENU_HINTS = ["Solana", "BNB"];

  const FLOW_BNB48_TO_USDT = {
    label: "BNB48->USDT",
    sourceNames: KOGE_SOURCE_NAMES,
    targetSymbol: TARGET_SYMBOL_USDT,
    targetChain: TARGET_CHAIN_NAME,
  };
  const FLOW_USDT_TO_USDC = {
    label: "USDT->USDC",
    sourceNames: USDT_SOURCE_NAMES,
    targetSymbol: TARGET_SYMBOL_USDC,
    targetChain: TARGET_CHAIN_NAME,
  };
  const FLOW_USDC_TO_USDT = {
    label: "USDC->USDT",
    sourceNames: USDC_SOURCE_NAMES,
    targetSymbol: TARGET_SYMBOL_USDT,
    targetChain: TARGET_CHAIN_NAME,
  };

  const SELECT_BUTTON_SELECTOR =
    'button[data-sentry-component="TokenSelectionButton"]';
  const TOKEN_ROW_SELECTOR = "div.cursor-pointer";
  const SOURCE_TOKEN_NAME_SELECTOR = "div.text-base";
  const SAVED_TOKEN_SYMBOL_SELECTOR = "div.text-sm.text-genius-cream";

  if (window.__geniusSwapHelperLoaded) {
    return;
  }
  window.__geniusSwapHelperLoaded = true;

  let panelRefs = null;
  let panelObserver = null;
  let panelInteractionCleanup = null;
  let panelStatsRefreshTimer = null;
  let panelStatsRefreshPromise = null;
  let running = false;
  let stopRequested = false;
  const logBuffer = [];
  const panelStatsState = {
    totalTradingVolume: null,
    totalTradingVolumeSource: "",
    todayTradingVolume: null,
    todayTradingVolumeSource: "",
    loading: false,
    error: "",
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const randomBetween = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const waitFor = async (finder, timeoutMs = WAIT_TIMEOUT_MS) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = finder();
      if (result) {
        return result;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    return null;
  };

  const isVisible = (el) => {
    if (!el) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const clickEl = (el) => {
    if (!el || !isVisible(el)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(x, y);
    const target = topEl && el.contains(topEl) ? topEl : el;
    const mouseOpts = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      detail: 1,
    };

    if (target.focus) {
      target.focus();
    }
    if (window.PointerEvent) {
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          ...mouseOpts,
          pointerType: "mouse",
        })
      );
      target.dispatchEvent(
        new PointerEvent("pointerup", {
          ...mouseOpts,
          pointerType: "mouse",
        })
      );
    }
    target.dispatchEvent(
      new MouseEvent("mousedown", mouseOpts)
    );
    target.dispatchEvent(
      new MouseEvent("mouseup", mouseOpts)
    );
    if (typeof target.click === "function") {
      target.click();
    } else {
      target.dispatchEvent(new MouseEvent("click", mouseOpts));
    }
    return true;
  };

  const hoverEl = (el) => {
    if (!el || !isVisible(el)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const mouseOpts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
    };

    if (window.PointerEvent) {
      el.dispatchEvent(
        new PointerEvent("pointerover", {
          ...mouseOpts,
          pointerType: "mouse",
        })
      );
      el.dispatchEvent(
        new PointerEvent("pointerenter", {
          ...mouseOpts,
          pointerType: "mouse",
        })
      );
      el.dispatchEvent(
        new PointerEvent("pointermove", {
          ...mouseOpts,
          pointerType: "mouse",
        })
      );
    }
    el.dispatchEvent(new MouseEvent("mouseover", mouseOpts));
    el.dispatchEvent(new MouseEvent("mouseenter", mouseOpts));
    el.dispatchEvent(new MouseEvent("mousemove", mouseOpts));
    return true;
  };

  const resolveClickable = (node) => {
    if (!node) {
      return null;
    }
    const clickable = node.closest(CLICKABLE_SELECTOR);
    if (clickable && isVisible(clickable)) {
      return clickable;
    }
    return node;
  };

  const getSettings = () =>
    new Promise((resolve) => {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        resolve({
          enabled: false,
          count: 0,
          loopCount: 1,
          runMode: RUN_MODE_COUNT,
          targetTodayVolume: 0,
        });
        return;
      }
      chrome.storage.local.get(
        {
          [STORAGE_KEYS.enabled]: false,
          [STORAGE_KEYS.count]: 0,
          [STORAGE_KEYS.loopCount]: 1,
          [STORAGE_KEYS.runMode]: RUN_MODE_COUNT,
          [STORAGE_KEYS.targetTodayVolume]: 0,
        },
        (result) => {
          resolve({
            enabled: Boolean(result[STORAGE_KEYS.enabled]),
            count: Number(result[STORAGE_KEYS.count] || 0),
            loopCount: Number(result[STORAGE_KEYS.loopCount] || 1),
            runMode: normalizeRunMode(result[STORAGE_KEYS.runMode]),
            targetTodayVolume: normalizeTargetTodayVolume(
              result[STORAGE_KEYS.targetTodayVolume]
            ),
          });
        }
      );
    });

  const storageGet = (defaults) =>
    new Promise((resolve) => {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        resolve(defaults || {});
        return;
      }
      chrome.storage.local.get(defaults || {}, (result) => resolve(result));
    });

  const storageSet = (values) =>
    new Promise((resolve) => {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }
      chrome.storage.local.set(values, () => resolve());
    });

  const storageRemove = (keys) =>
    new Promise((resolve) => {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }
      chrome.storage.local.remove(keys, () => resolve());
    });

  const incrementCount = async () => {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    const { count } = await getSettings();
    chrome.storage.local.set({ [STORAGE_KEYS.count]: count + 1 });
  };

  const readRecoveryState = async () => {
    const result = await storageGet({
      [STORAGE_KEYS.recoveryState]: null,
    });
    const recovery = result[STORAGE_KEYS.recoveryState];
    if (!recovery || typeof recovery !== "object") {
      return null;
    }
    return recovery;
  };

  const clearRecoveryState = async () => {
    await storageRemove([STORAGE_KEYS.recoveryState]);
  };

  const renderLogs = () => {
    if (!panelRefs) {
      return;
    }
    panelRefs.logs.innerHTML = "";
    logBuffer.forEach((message) => {
      const line = document.createElement("div");
      line.className = "gsh-log-line";
      line.textContent = message;
      panelRefs.logs.appendChild(line);
    });
    panelRefs.logs.scrollTop = panelRefs.logs.scrollHeight;
  };

  const addLog = (message) => {
    logBuffer.push(message);
    if (logBuffer.length > LOG_LIMIT) {
      logBuffer.shift();
    }
    if (panelRefs) {
      renderLogs();
    }
  };

  const readPanelLayout = () => {
    try {
      const raw = window.localStorage?.getItem(PANEL_LAYOUT_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed;
    } catch (error) {
      return null;
    }
  };

  const savePanelLayout = (layout) => {
    try {
      window.localStorage?.setItem(
        PANEL_LAYOUT_STORAGE_KEY,
        JSON.stringify(layout)
      );
    } catch (error) {
      // Ignore persistence failures in restrictive page contexts.
    }
  };

  const readCachedPanelStats = () => {
    try {
      const raw = window.localStorage?.getItem(PANEL_STATS_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed;
    } catch (error) {
      return null;
    }
  };

  const savePanelStats = () => {
    try {
      window.localStorage?.setItem(
        PANEL_STATS_STORAGE_KEY,
        JSON.stringify({
          totalTradingVolume: panelStatsState.totalTradingVolume,
          totalTradingVolumeSource: panelStatsState.totalTradingVolumeSource,
          todayTradingVolume: panelStatsState.todayTradingVolume,
          todayTradingVolumeSource: panelStatsState.todayTradingVolumeSource,
          error: panelStatsState.error,
        })
      );
    } catch (error) {
      // Ignore persistence failures in restrictive page contexts.
    }
  };

  const hydratePanelStatsFromCache = () => {
    const cached = readCachedPanelStats();
    if (!cached) {
      return;
    }
    const cachedValue = Number(cached.totalTradingVolume);
    if (Number.isFinite(cachedValue) && cachedValue > 0) {
      panelStatsState.totalTradingVolume = cachedValue;
    }
    if (typeof cached.totalTradingVolumeSource === "string") {
      panelStatsState.totalTradingVolumeSource =
        cached.totalTradingVolumeSource;
    }
    const cachedTodayValue = Number(cached.todayTradingVolume);
    if (Number.isFinite(cachedTodayValue) && cachedTodayValue >= 0) {
      panelStatsState.todayTradingVolume = cachedTodayValue;
    }
    if (typeof cached.todayTradingVolumeSource === "string") {
      panelStatsState.todayTradingVolumeSource =
        cached.todayTradingVolumeSource;
    }
    if (typeof cached.error === "string") {
      panelStatsState.error = cached.error;
    }
  };

  hydratePanelStatsFromCache();

  const getPanelViewportBounds = () => ({
    maxWidth: clamp(
      window.innerWidth - PANEL_EDGE_GAP * 2,
      PANEL_MIN_WIDTH,
      PANEL_MAX_WIDTH
    ),
    maxHeight: clamp(
      window.innerHeight - PANEL_EDGE_GAP * 2,
      PANEL_MIN_HEIGHT,
      PANEL_MAX_HEIGHT
    ),
  });

  const getCurrentPanelLayout = (panel) => {
    const rect = panel.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  };

  const normalizePanelLayout = (layout, fallbackHeight = PANEL_MIN_HEIGHT) => {
    const { maxWidth, maxHeight } = getPanelViewportBounds();
    const width = clamp(
      Number(layout?.width) || PANEL_DEFAULT_WIDTH,
      PANEL_MIN_WIDTH,
      maxWidth
    );
    const height = clamp(
      Number(layout?.height) || fallbackHeight,
      PANEL_MIN_HEIGHT,
      maxHeight
    );
    const maxLeft = Math.max(PANEL_EDGE_GAP, window.innerWidth - width - PANEL_EDGE_GAP);
    const maxTop = Math.max(PANEL_EDGE_GAP, window.innerHeight - height - PANEL_EDGE_GAP);

    return {
      width,
      height,
      left: clamp(
        Number(layout?.left) || window.innerWidth - width - 18,
        PANEL_EDGE_GAP,
        maxLeft
      ),
      top: clamp(
        Number(layout?.top) || window.innerHeight - height - 18,
        PANEL_EDGE_GAP,
        maxTop
      ),
    };
  };

  const applyPanelLayout = (panel, layout) => {
    panel.style.left = `${layout.left}px`;
    panel.style.top = `${layout.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.width = `${layout.width}px`;
    panel.style.height = `${layout.height}px`;
  };

  const restorePanelLayout = (panel) => {
    const measuredHeight = Math.max(panel.offsetHeight, PANEL_MIN_HEIGHT);
    const layout = normalizePanelLayout(readPanelLayout(), measuredHeight);
    applyPanelLayout(panel, layout);
    savePanelLayout(layout);
  };

  const setupPanelInteractions = (panel, dragHandle, resizeHandle) => {
    let activeMode = null;
    let startX = 0;
    let startY = 0;
    let initialLayout = null;

    const stopInteraction = () => {
      if (!activeMode) {
        return;
      }
      panel.classList.remove("is-dragging", "is-resizing");
      document.documentElement.classList.remove("gsh-panel-interacting");
      savePanelLayout(getCurrentPanelLayout(panel));
      activeMode = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);
      window.removeEventListener("pointercancel", stopInteraction);
    };

    const handlePointerMove = (event) => {
      if (!activeMode || !initialLayout) {
        return;
      }
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      let nextLayout = initialLayout;

      if (activeMode === "drag") {
        nextLayout = normalizePanelLayout({
          ...initialLayout,
          left: initialLayout.left + deltaX,
          top: initialLayout.top + deltaY,
        }, initialLayout.height);
      }

      if (activeMode === "resize") {
        nextLayout = normalizePanelLayout({
          ...initialLayout,
          width: initialLayout.width + deltaX,
          height: initialLayout.height + deltaY,
        }, initialLayout.height);
      }

      applyPanelLayout(panel, nextLayout);
    };

    const startInteraction = (event, mode) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      activeMode = mode;
      startX = event.clientX;
      startY = event.clientY;
      initialLayout = getCurrentPanelLayout(panel);
      panel.classList.toggle("is-dragging", mode === "drag");
      panel.classList.toggle("is-resizing", mode === "resize");
      document.documentElement.classList.add("gsh-panel-interacting");
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopInteraction);
      window.addEventListener("pointercancel", stopInteraction);
    };

    const handleViewportResize = () => {
      const nextLayout = normalizePanelLayout(getCurrentPanelLayout(panel));
      applyPanelLayout(panel, nextLayout);
      savePanelLayout(nextLayout);
    };

    const onDragPointerDown = (event) => startInteraction(event, "drag");
    const onResizePointerDown = (event) => startInteraction(event, "resize");

    dragHandle.addEventListener("pointerdown", onDragPointerDown);
    resizeHandle.addEventListener("pointerdown", onResizePointerDown);
    window.addEventListener("resize", handleViewportResize);

    return () => {
      stopInteraction();
      dragHandle.removeEventListener("pointerdown", onDragPointerDown);
      resizeHandle.removeEventListener("pointerdown", onResizePointerDown);
      window.removeEventListener("resize", handleViewportResize);
    };
  };

  const normalizeText = (text) =>
    (text || "").toLowerCase().replace(/\s+/g, " ").trim();

  const matchesAny = (text, names) =>
    names.some((name) => normalizeText(text).includes(normalizeText(name)));

  const findRowByNames = (rows, names) =>
    rows.find((row) => matchesAny(row.name, names)) || null;

  const findBestPositiveRowByNames = (rows, names) => {
    const matched = rows.filter((row) => matchesAny(row.name, names));
    if (!matched.length) {
      return null;
    }
    const positive = matched
      .filter((row) => row.amountValue > 0)
      .sort((a, b) => b.amountValue - a.amountValue);
    if (positive.length) {
      return positive[0];
    }
    return matched[0];
  };

  const logStep = (flow, message) => {
    if (flow?.label) {
      addLog(`[${flow.label}] ${message}`);
      return;
    }
    addLog(message);
  };

  const clampLoopCount = (value) => {
    const parsed = Number.parseInt(String(value), 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return 1;
    }
    return Math.min(parsed, 999);
  };

  const normalizeRunMode = (value) =>
    value === RUN_MODE_TARGET ? RUN_MODE_TARGET : RUN_MODE_COUNT;

  const normalizeTargetTodayVolume = (value) => {
    const parsed = Number.parseFloat(String(value).replace(/,/g, "").trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(parsed, 999999999);
  };

  const createRecoveryState = ({
    runMode,
    remainingCount = 0,
    targetTodayVolume = 0,
    attempt = 1,
    reason = "unknown_error",
  }) => ({
    runMode: normalizeRunMode(runMode),
    remainingCount: clampLoopCount(remainingCount || 1),
    targetTodayVolume: normalizeTargetTodayVolume(targetTodayVolume),
    attempt: Math.max(1, Number(attempt) || 1),
    reason,
    savedAt: Date.now(),
  });

  const setEnabled = (value) => {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: Boolean(value) });
  };

  const resolveInitialFlow = (rows) => {
    const availableFlows = [
      FLOW_USDT_TO_USDC,
      FLOW_USDC_TO_USDT,
      FLOW_BNB48_TO_USDT,
    ]
      .map((flow) => {
        const row = findBestPositiveRowByNames(rows, flow.sourceNames);
        if (!row || row.amountValue <= 0) {
          return null;
        }
        return { flow, row };
      })
      .filter(Boolean)
      .sort((a, b) => b.row.amountValue - a.row.amountValue);

    if (availableFlows.length) {
      const selected = availableFlows[0];
      addLog(
        `检测到可用来源 ${selected.row.symbol}(${selected.row.amountText || "0"})，执行 ${selected.flow.label}`
      );
      return selected.flow;
    }

    const hasUsdt = rows.some((row) =>
      matchesAny(row.name, FLOW_USDT_TO_USDC.sourceNames)
    );
    const hasUsdc = rows.some((row) =>
      matchesAny(row.name, FLOW_USDC_TO_USDT.sourceNames)
    );
    const hasKoge = rows.some((row) =>
      matchesAny(row.name, FLOW_BNB48_TO_USDT.sourceNames)
    );
    if (hasUsdt || hasUsdc || hasKoge) {
      addLog("检测到候选代币，但可用数量为0，无法执行自动切换");
      return null;
    }

    addLog("未检测到USDT、USDC或BNB48，无法选择来源代币");
    return null;
  };

  const resolveFinalUsdtSettlementFlow = (rows) => {
    const candidates = [FLOW_USDC_TO_USDT, FLOW_BNB48_TO_USDT]
      .map((flow) => {
        const row = findBestPositiveRowByNames(rows, flow.sourceNames);
        if (!row || row.amountValue <= 0) {
          return null;
        }
        return { flow, row };
      })
      .filter(Boolean)
      .sort((a, b) => b.row.amountValue - a.row.amountValue);
    return candidates.length ? candidates[0].flow : null;
  };

  const renderPanel = ({
    enabled,
    loopCount,
    runMode = RUN_MODE_COUNT,
    targetTodayVolume = 0,
  }) => {
    if (!panelRefs) {
      return;
    }
    const mode = normalizeRunMode(runMode);
    panelRefs.toggle.checked = enabled;
    panelRefs.status.textContent = enabled ? "Enabled" : "Disabled";
    panelRefs.status.dataset.state = enabled ? "on" : "off";
    if (panelRefs.loopInput) {
      panelRefs.loopInput.value = String(loopCount || 1);
    }
    if (panelRefs.targetInput) {
      panelRefs.targetInput.value =
        targetTodayVolume > 0 ? String(targetTodayVolume) : "";
    }
    if (panelRefs.countRow) {
      panelRefs.countRow.hidden = mode !== RUN_MODE_COUNT;
      panelRefs.countRow.style.display =
        mode === RUN_MODE_COUNT ? "flex" : "none";
    }
    if (panelRefs.targetRow) {
      panelRefs.targetRow.hidden = mode !== RUN_MODE_TARGET;
      panelRefs.targetRow.style.display =
        mode === RUN_MODE_TARGET ? "flex" : "none";
    }
    if (panelRefs.countModeButton) {
      panelRefs.countModeButton.dataset.active =
        String(mode === RUN_MODE_COUNT);
      panelRefs.countModeButton.setAttribute(
        "aria-pressed",
        String(mode === RUN_MODE_COUNT)
      );
    }
    if (panelRefs.targetModeButton) {
      panelRefs.targetModeButton.dataset.active =
        String(mode === RUN_MODE_TARGET);
      panelRefs.targetModeButton.setAttribute(
        "aria-pressed",
        String(mode === RUN_MODE_TARGET)
      );
    }
    if (panelRefs.targetProgress) {
      const current = formatUsdDisplay(panelStatsState.todayTradingVolume);
      panelRefs.targetProgress.textContent =
        mode === RUN_MODE_TARGET
          ? `当前 ${current} / 目标 ${formatUsdDisplay(targetTodayVolume)}`
          : "达到目标值后自动停止";
    }
  };

  const formatUsdDisplay = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "--";
    }
    return `$${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}`;
  };

  const renderPanelStats = () => {
    if (!panelRefs?.totalTradingVolumeValue) {
      return;
    }
    panelRefs.totalTradingVolumeValue.textContent = formatUsdDisplay(
      panelStatsState.totalTradingVolume
    );
    if (panelRefs.todayTradingVolumeValue) {
      panelRefs.todayTradingVolumeValue.textContent = formatUsdDisplay(
        panelStatsState.todayTradingVolume
      );
    }

    if (panelRefs.totalTradingVolumeMeta) {
      if (panelStatsState.loading) {
        panelRefs.totalTradingVolumeMeta.textContent = "更新中...";
      } else if (panelStatsState.totalTradingVolumeSource) {
        panelRefs.totalTradingVolumeMeta.textContent =
          panelStatsState.totalTradingVolumeSource;
      } else {
        panelRefs.totalTradingVolumeMeta.textContent = "--";
      }
    }
    if (panelRefs.todayTradingVolumeMeta) {
      if (panelStatsState.loading) {
        panelRefs.todayTradingVolumeMeta.textContent = "更新中...";
      } else if (panelStatsState.todayTradingVolumeSource) {
        panelRefs.todayTradingVolumeMeta.textContent =
          panelStatsState.todayTradingVolumeSource;
      } else {
        panelRefs.todayTradingVolumeMeta.textContent = "--";
      }
    }
    if (panelRefs.targetProgress) {
      const current = formatUsdDisplay(panelStatsState.todayTradingVolume);
      const targetValue = normalizeTargetTodayVolume(panelRefs.targetInput?.value);
      panelRefs.targetProgress.textContent = panelStatsState.loading
        ? "更新中..."
        : targetValue > 0
          ? `当前 ${current} / 目标 ${formatUsdDisplay(targetValue)}`
          : `当前今日交易量 ${current}`;
    }

    if (panelRefs.statsError) {
      panelRefs.statsError.textContent = panelStatsState.error || "";
      panelRefs.statsError.hidden = !panelStatsState.error;
    }
  };

  const extractCurrencyNumber = (text, label) => {
    const normalized = (text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return null;
    }
    const labelPattern = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const afterLabel = normalized.match(
      new RegExp(`${labelPattern}\\s*\\$?\\s*([\\d,]+(?:\\.\\d+)?)`, "i")
    );
    if (afterLabel) {
      return Number.parseFloat(afterLabel[1].replace(/,/g, ""));
    }
    const fallback = normalized.match(/\$\s*([\d,]+(?:\.\d+)?)/);
    if (fallback) {
      return Number.parseFloat(fallback[1].replace(/,/g, ""));
    }
    return null;
  };

  const extractFirstUsdValue = (text) => {
    const match = String(text || "").match(/\$\s*([\d,]+(?:\.\d+)?)/);
    if (!match) {
      return 0;
    }
    const parsed = Number.parseFloat(match[1].replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const fetchOrderHistoryPage = async (offset) => {
    const url =
      `/api/db/orderHistory?orderId=undefined&offset=${offset}` +
      `&limit=${ORDER_HISTORY_PAGE_SIZE}&tokenAddress=undefined&startDate=undefined&endDate=undefined`;
    const response = await fetch(url, {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`订单历史请求失败(${response.status})`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("订单历史响应格式异常");
    }
    return data;
  };

  const extractOrderGrossUsd = (row) =>
    Number(
      row?.result?.decodedResponse?.quote?.fees?.grossUsd ??
        row?.result?.decodedResponse?.price?.fees?.grossUsd ??
        0
    ) || 0;

  const extractOrderTimestamp = (row) => {
    const candidates = [
      row?.created_at,
      row?.createdAt,
      row?.updated_at,
      row?.updatedAt,
      row?.timestamp,
      row?.time,
      row?.result?.created_at,
      row?.result?.createdAt,
    ];
    for (const value of candidates) {
      if (!value) {
        continue;
      }
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return null;
  };

  const isWithinToday = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return false;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return date >= start && date < end;
  };

  const isSuccessfulMarketSwap = (row) =>
    row?.status === "success" && row?.order_type === "MARKET_SWAP";

  const calculateTotalTradingVolumeFromOrders = (rows) =>
    rows
      .filter(isSuccessfulMarketSwap)
      .reduce((sum, row) => sum + extractOrderGrossUsd(row), 0);

  const calculateTodayTradingVolumeFromOrders = (rows) =>
    rows
      .filter(isSuccessfulMarketSwap)
      .filter((row) => isWithinToday(extractOrderTimestamp(row)))
      .reduce((sum, row) => sum + extractOrderGrossUsd(row), 0);

  const refreshPanelStats = async () => {
    if (panelStatsRefreshPromise) {
      return panelStatsRefreshPromise;
    }

    panelStatsRefreshPromise = (async () => {
      panelStatsState.loading = true;
      panelStatsState.error = "";
      renderPanelStats();

      try {
        const rows = [];
        for (
          let pageIndex = 0;
          pageIndex < ORDER_HISTORY_MAX_PAGES;
          pageIndex += 1
        ) {
          const offset = pageIndex * ORDER_HISTORY_PAGE_SIZE;
          const pageRows = await fetchOrderHistoryPage(offset);
          rows.push(...pageRows);
          if (pageRows.length < ORDER_HISTORY_PAGE_SIZE) {
            break;
          }
        }

        const totalTradingVolume = calculateTotalTradingVolumeFromOrders(rows);
        if (Number.isFinite(totalTradingVolume) && totalTradingVolume >= 0) {
          panelStatsState.totalTradingVolume = totalTradingVolume;
          panelStatsState.totalTradingVolumeSource = "来自订单历史汇总";
        }

        const todayTradingVolume = calculateTodayTradingVolumeFromOrders(rows);
        if (Number.isFinite(todayTradingVolume) && todayTradingVolume >= 0) {
          panelStatsState.todayTradingVolume = todayTradingVolume;
          panelStatsState.todayTradingVolumeSource = "来自今日订单汇总";
        }

        if (
          !Number.isFinite(panelStatsState.totalTradingVolume) &&
          !Number.isFinite(panelStatsState.todayTradingVolume)
        ) {
          panelStatsState.error = "未获取到交易量统计";
        }
      } catch (error) {
        panelStatsState.error =
          error instanceof Error ? error.message : "交易量统计更新失败";
      } finally {
        panelStatsState.loading = false;
        savePanelStats();
        renderPanelStats();
      }
    })();

    try {
      await panelStatsRefreshPromise;
    } finally {
      panelStatsRefreshPromise = null;
    }
  };

  const startPanelStatsRefresh = () => {
    if (panelStatsRefreshTimer) {
      window.clearInterval(panelStatsRefreshTimer);
    }
    refreshPanelStats();
    panelStatsRefreshTimer = window.setInterval(() => {
      refreshPanelStats();
    }, PANEL_STATS_REFRESH_INTERVAL_MS);
  };

  const initPanel = () => {
    if (!document.body) {
      return;
    }
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      return;
    }
    if (panelInteractionCleanup) {
      panelInteractionCleanup();
      panelInteractionCleanup = null;
    }
    if (panelRefs) {
      panelRefs = null;
    }

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="gsh-header">
        <div class="gsh-drag-handle" id="gsh-drag-handle" role="button" tabindex="0" aria-label="拖动悬浮窗">
          <span class="gsh-drag-grip" aria-hidden="true"></span>
          <div class="gsh-title">Genius Swap</div>
        </div>
        <div class="gsh-status" id="gsh-status">Disabled</div>
      </div>
      <div class="gsh-row">
        <div>
          <div class="gsh-label">Enable auto swap</div>
        </div>
        <label class="gsh-switch">
          <input type="checkbox" id="gsh-toggle" />
          <span class="gsh-slider"></span>
        </label>
      </div>
      <div class="gsh-row">
        <div>
          <div class="gsh-label">模式</div>
          <div class="gsh-hint">切换停止条件</div>
        </div>
        <div class="gsh-mode-group" role="group" aria-label="运行模式">
          <button class="gsh-mode-btn" id="gsh-mode-count" type="button">次数</button>
          <button class="gsh-mode-btn" id="gsh-mode-target" type="button">目标交易量</button>
        </div>
      </div>
      <div class="gsh-row" id="gsh-count-row">
        <div>
          <div class="gsh-label">次数</div>
          <div class="gsh-hint">手动开启后执行</div>
        </div>
        <input class="gsh-input" id="gsh-loop-count" type="number" min="1" step="1" />
      </div>
      <div class="gsh-row" id="gsh-target-row" hidden>
        <div>
          <div class="gsh-label">目标交易量</div>
          <div class="gsh-hint" id="gsh-target-progress">达到目标值后自动停止</div>
        </div>
        <input class="gsh-input" id="gsh-target-volume" type="number" min="0.01" step="0.01" />
      </div>
      <div class="gsh-stats">
        <div class="gsh-stats-grid">
          <div class="gsh-stat">
            <div class="gsh-stat-label">总交易量</div>
            <div class="gsh-stat-value" id="gsh-total-trading-volume">--</div>
            <div class="gsh-stat-meta" id="gsh-total-trading-volume-meta">--</div>
          </div>
          <div class="gsh-stat">
            <div class="gsh-stat-label">今日交易量</div>
            <div class="gsh-stat-value" id="gsh-today-trading-volume">--</div>
            <div class="gsh-stat-meta" id="gsh-today-trading-volume-meta">--</div>
          </div>
        </div>
        <div class="gsh-stats-error" id="gsh-stats-error" hidden></div>
      </div>
      <div class="gsh-log">
        <div class="gsh-log-title">日志</div>
        <div class="gsh-log-list" id="gsh-log-list"></div>
      </div>
      <div class="gsh-resize-handle" id="gsh-resize-handle" aria-hidden="true"></div>
    `;
    document.body.appendChild(panel);

    const toggle = panel.querySelector("#gsh-toggle");
    const status = panel.querySelector("#gsh-status");
    const logs = panel.querySelector("#gsh-log-list");
    const countModeButton = panel.querySelector("#gsh-mode-count");
    const targetModeButton = panel.querySelector("#gsh-mode-target");
    const countRow = panel.querySelector("#gsh-count-row");
    const loopInput = panel.querySelector("#gsh-loop-count");
    const targetRow = panel.querySelector("#gsh-target-row");
    const targetInput = panel.querySelector("#gsh-target-volume");
    const targetProgress = panel.querySelector("#gsh-target-progress");
    const totalTradingVolumeValue = panel.querySelector(
      "#gsh-total-trading-volume"
    );
    const totalTradingVolumeMeta = panel.querySelector(
      "#gsh-total-trading-volume-meta"
    );
    const todayTradingVolumeValue = panel.querySelector(
      "#gsh-today-trading-volume"
    );
    const todayTradingVolumeMeta = panel.querySelector(
      "#gsh-today-trading-volume-meta"
    );
    const statsError = panel.querySelector("#gsh-stats-error");
    const dragHandle = panel.querySelector("#gsh-drag-handle");
    const resizeHandle = panel.querySelector("#gsh-resize-handle");

    panelRefs = {
      toggle,
      status,
      logs,
      countModeButton,
      targetModeButton,
      countRow,
      loopInput,
      targetRow,
      targetInput,
      targetProgress,
      totalTradingVolumeValue,
      totalTradingVolumeMeta,
      todayTradingVolumeValue,
      todayTradingVolumeMeta,
      statsError,
      dragHandle,
      resizeHandle,
      container: panel,
    };

    restorePanelLayout(panel);
    panelInteractionCleanup = setupPanelInteractions(
      panel,
      dragHandle,
      resizeHandle
    );

    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        const mode = normalizeRunMode(
          targetModeButton?.dataset.active === "true"
            ? RUN_MODE_TARGET
            : RUN_MODE_COUNT
        );
        const nextValue = clampLoopCount(loopInput.value);
        const nextTargetValue = normalizeTargetTodayVolume(targetInput?.value);
        loopInput.value = String(nextValue);
        if (targetInput) {
          targetInput.value = nextTargetValue > 0 ? String(nextTargetValue) : "";
        }
        if (mode === RUN_MODE_TARGET && nextTargetValue <= 0) {
          toggle.checked = false;
          addLog("目标交易量模式需要设置大于0的目标值");
          return;
        }
        chrome.storage.local.set({
          [STORAGE_KEYS.runMode]: mode,
          [STORAGE_KEYS.loopCount]: nextValue,
          [STORAGE_KEYS.targetTodayVolume]: nextTargetValue,
          [STORAGE_KEYS.enabled]: true,
        });
        addLog(
          mode === RUN_MODE_TARGET
            ? `已开启，目标交易量: ${formatUsdDisplay(nextTargetValue)}`
            : `已开启，循环次数: ${nextValue}`
        );
      } else {
        chrome.storage.local.set({ [STORAGE_KEYS.enabled]: false });
        addLog("已关闭");
      }
    });

    countModeButton?.addEventListener("click", () => {
      chrome.storage.local.set({ [STORAGE_KEYS.runMode]: RUN_MODE_COUNT });
      getSettings().then(renderPanel);
      addLog("已切换到次数模式");
    });

    targetModeButton?.addEventListener("click", () => {
      chrome.storage.local.set({ [STORAGE_KEYS.runMode]: RUN_MODE_TARGET });
      getSettings().then(renderPanel);
      addLog("已切换到目标交易量模式");
    });

    loopInput.addEventListener("change", () => {
      const nextValue = clampLoopCount(loopInput.value);
      loopInput.value = String(nextValue);
      chrome.storage.local.set({ [STORAGE_KEYS.loopCount]: nextValue });
      addLog(`已设置循环次数: ${nextValue}`);
    });

    loopInput.addEventListener("input", () => {
      const nextValue = clampLoopCount(loopInput.value);
      chrome.storage.local.set({ [STORAGE_KEYS.loopCount]: nextValue });
    });

    targetInput?.addEventListener("change", () => {
      const nextValue = normalizeTargetTodayVolume(targetInput.value);
      targetInput.value = nextValue > 0 ? String(nextValue) : "";
      chrome.storage.local.set({ [STORAGE_KEYS.targetTodayVolume]: nextValue });
      addLog(`已设置目标交易量: ${formatUsdDisplay(nextValue)}`);
    });

    targetInput?.addEventListener("input", () => {
      const nextValue = normalizeTargetTodayVolume(targetInput.value);
      chrome.storage.local.set({ [STORAGE_KEYS.targetTodayVolume]: nextValue });
    });

    getSettings().then((settings) => {
      renderPanel(settings);
      renderPanelStats();
      renderLogs();
    });
    startPanelStatsRefresh();
  };

  const startPanelObserver = () => {
    if (panelObserver || !document.documentElement) {
      return;
    }
    panelObserver = new MutationObserver(() => {
      if (!document.getElementById(PANEL_ID) && document.body) {
        initPanel();
      }
    });
    panelObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  const findSelectionButtons = (minCount) => {
    const selectorButtons = Array.from(
      document.querySelectorAll(SELECT_BUTTON_SELECTOR)
    ).filter(isVisible);
    const textButtons = Array.from(
      document.querySelectorAll("button,[role='button']")
    )
      .filter(isVisible)
      .filter((el) => !panelRefs?.container?.contains(el))
      .filter((el) => {
        const label = normalizeText(
          el.getAttribute("aria-label") ||
            el.innerText ||
            el.textContent ||
            ""
        );
        return label === normalizeText(CHOOSE_TEXT);
      });
    const buttons = [...selectorButtons, ...textButtons].filter(
      (button, index, list) => list.indexOf(button) === index
    );
    buttons.sort((a, b) => {
      if (a === b) {
        return 0;
      }
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });
    if (buttons.length >= minCount) {
      return buttons;
    }
    return null;
  };

  const findOverlayRoot = () => {
    const overlays = Array.from(
      document.querySelectorAll(
        "[role='dialog'],[role='listbox'],[data-radix-popper-content-wrapper]"
      )
    ).filter(isVisible);
    if (overlays.length) {
      return overlays[overlays.length - 1];
    }
    return null;
  };

  const findSourceTokenRows = () => {
    const root = findOverlayRoot() || document.body;
    const rows = Array.from(root.querySelectorAll(TOKEN_ROW_SELECTOR)).filter(
      isVisible
    );
    const list = rows
      .map((row) => {
        const nameEl = row.querySelector(SOURCE_TOKEN_NAME_SELECTOR);
        if (!nameEl) {
          return null;
        }
        const name = nameEl.textContent.trim();
        if (!name) {
          return null;
        }
        const fullText = (row.innerText || "").replace(/\s+/g, " ").trim();
        const restText = fullText.startsWith(name)
          ? fullText.slice(name.length).trim()
          : fullText;
        const symbolMatch = restText.match(/^[A-Z0-9.-]{2,20}/);
        const usdValueMatch = fullText.match(/\$[\d,]+(?:\.\d+)?/);
        const amountMatch = fullText.match(
          /\$[\d,]+(?:\.\d+)?\s+([\d,]+(?:\.\d+)?)\s+[A-Z0-9.-]{2,20}\b/
        );
        const amountText = amountMatch ? amountMatch[1] : "";
        const amountValue = amountText
          ? Number.parseFloat(amountText.replace(/,/g, ""))
          : 0;
        return {
          element: row,
          name,
          symbol: symbolMatch ? symbolMatch[0] : name,
          usdValue: usdValueMatch ? usdValueMatch[0] : "",
          amountText,
          amountValue: Number.isFinite(amountValue) ? amountValue : 0,
        };
      })
      .filter(Boolean);
    return list.length ? list : null;
  };


  const findClickableByText = (text, root) => {
    const searchRoot = root || document.body;
    const xpath = `.//*[contains(normalize-space(.), '${text}')]`;
    const result = document.evaluate(
      xpath,
      searchRoot,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    for (let i = 0; i < result.snapshotLength; i += 1) {
      const node = result.snapshotItem(i);
      if (!node || !isVisible(node)) {
        continue;
      }
      return resolveClickable(node);
    }
    return null;
  };

  const findClickableByExactText = (text, root) => {
    const searchRoot = root || document.body;
    const xpath = `.//*[normalize-space(.)='${text}']`;
    const result = document.evaluate(
      xpath,
      searchRoot,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    for (let i = 0; i < result.snapshotLength; i += 1) {
      const node = result.snapshotItem(i);
      if (!node || !isVisible(node)) {
        continue;
      }
      return resolveClickable(node);
    }
    return null;
  };

  const findElementsByExactText = (text, root) => {
    const searchRoot = root || document.body;
    const xpath = `.//*[normalize-space(.)='${text}']`;
    const result = document.evaluate(
      xpath,
      searchRoot,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    const nodes = [];
    for (let i = 0; i < result.snapshotLength; i += 1) {
      const node = result.snapshotItem(i);
      if (node && isVisible(node)) {
        nodes.push(node);
      }
    }
    return nodes;
  };

  const isWithinTabRow = (node) => {
    let current = node;
    for (let i = 0; i < 8 && current; i += 1) {
      const text = (current.innerText || "").replace(/\s+/g, " ").trim();
      if (
        text &&
        text.length < 200 &&
        TAB_ROW_HINTS.every((hint) => text.includes(hint))
      ) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  };

  const findTabRowContainer = (root) => {
    const searchRoot = root || document.body;
    const xpath =
      ".//*[contains(normalize-space(.), 'Gas') and contains(normalize-space(.), '已保存')]";
    const result = document.evaluate(
      xpath,
      searchRoot,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    let best = null;
    let bestLen = Infinity;
    for (let i = 0; i < result.snapshotLength; i += 1) {
      const node = result.snapshotItem(i);
      if (!node || !isVisible(node)) {
        continue;
      }
      const text = (node.innerText || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 200) {
        continue;
      }
      if (text.length < bestLen) {
        best = node;
        bestLen = text.length;
      }
    }
    return best;
  };

  const findSavedTab = () => {
    const roots = [findOverlayRoot(), document.body].filter(Boolean);
    for (const root of roots) {
      const tabRow = findTabRowContainer(root);
      if (tabRow) {
        const within = findElementsByExactText(SAVED_TAB_TEXT, tabRow);
        if (within.length) {
          return resolveClickable(within[0]);
        }
      }

      const roleTabs = Array.from(root.querySelectorAll("[role='tab']")).filter(
        isVisible
      );
      const roleMatch = roleTabs.find(
        (tab) => tab.textContent.trim() === SAVED_TAB_TEXT
      );
      if (roleMatch && isWithinTabRow(roleMatch)) {
        return resolveClickable(roleMatch);
      }

      const exactNodes = findElementsByExactText(SAVED_TAB_TEXT, root);
      for (const node of exactNodes) {
        if (isWithinTabRow(node)) {
          return resolveClickable(node);
        }
      }

      const exact = findClickableByExactText(SAVED_TAB_TEXT, root);
      if (exact) {
        return exact;
      }
      const fuzzy = findClickableByText(SAVED_TAB_TEXT, root);
      if (fuzzy) {
        return fuzzy;
      }
    }
    return null;
  };

  const findSavedTokenRowBySymbol = (symbol) => {
    const roots = [findOverlayRoot(), document.body].filter(Boolean);
    for (const root of roots) {
      const candidates = Array.from(
        root.querySelectorAll(SAVED_TOKEN_SYMBOL_SELECTOR)
      ).filter(isVisible);
      const match = candidates.find((el) => el.textContent.trim() === symbol);
      if (!match) {
        continue;
      }
      return match.closest("div.cursor-pointer,li,[role='option']") || match;
    }
    return null;
  };

  const findTokenSearchInput = () => {
    const root = findOverlayRoot() || document.body;
    const candidates = Array.from(
      root.querySelectorAll(
        "input[type='text'],input[type='search'],input:not([type]),textarea"
      )
    ).filter(isVisible);

    const preferred = candidates.find((input) => {
      const hint = normalizeText(
        input.getAttribute("placeholder") ||
          input.getAttribute("aria-label") ||
          ""
      );
      return hint.includes("search");
    });
    if (preferred) {
      return preferred;
    }
    return candidates[0] || null;
  };

  const setNativeInputValue = (input, value) => {
    if (!input) {
      return false;
    }
    const prototype =
      input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement?.prototype
        : window.HTMLInputElement?.prototype;
    const descriptor = prototype
      ? Object.getOwnPropertyDescriptor(prototype, "value")
      : null;
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const typeIntoSearchInput = async (input, value) => {
    if (!input || !isVisible(input)) {
      return false;
    }
    input.scrollIntoView({ block: "center", inline: "nearest" });
    if (input.focus) {
      input.focus();
    }
    if (typeof input.select === "function") {
      input.select();
    }
    setNativeInputValue(input, "");
    await sleep(80);
    setNativeInputValue(input, value);
    return true;
  };

  const pickBestTokenRowCandidate = (node, symbol) => {
    if (!node) {
      return null;
    }
    const ancestors = [];
    let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    for (let i = 0; i < 8 && current; i += 1) {
      ancestors.push(current);
      current = current.parentElement;
    }

    const exact = ancestors.find((el) => {
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      return (
        text.includes(symbol) &&
        text.length > symbol.length &&
        text.length < 220 &&
        !isWithinTabRow(el)
      );
    });
    if (exact && isVisible(exact)) {
      return exact;
    }

    const clickable = ancestors
      .map(resolveClickable)
      .find(
        (el) =>
          el &&
          isVisible(el) &&
          !panelRefs?.container?.contains(el) &&
          !isWithinTabRow(el)
      );
    return clickable || null;
  };

  const findSearchTokenRowBySymbol = (symbol) => {
    const root = findOverlayRoot() || document.body;
    const nodes = findElementsByExactText(symbol, root).filter(
      (node) => !panelRefs?.container?.contains(node)
    );
    for (const node of nodes) {
      const row = pickBestTokenRowCandidate(node, symbol);
      if (row) {
        return row;
      }
    }
    return null;
  };

  const searchTargetToken = async (flow) => {
    const searchInput = await waitFor(findTokenSearchInput, 3000);
    if (!searchInput) {
      logStep(flow, "未找到搜索框");
      return null;
    }

    const typed = await typeIntoSearchInput(searchInput, flow.targetSymbol);
    if (!typed) {
      logStep(flow, "输入搜索词失败");
      return null;
    }
    logStep(flow, `已输入搜索词: ${flow.targetSymbol}`);

    const targetRow = await waitFor(
      () => findSearchTokenRowBySymbol(flow.targetSymbol),
      SEARCH_RESULT_TIMEOUT_MS
    );
    if (!targetRow) {
      logStep(flow, `搜索超时，未找到 ${flow.targetSymbol}`);
      return null;
    }
    logStep(flow, `搜索结果已出现: ${flow.targetSymbol}`);
    return targetRow;
  };

  const findChainMenuRoot = (rowEl) => {
    const searchRoot = document.body;
    const xpath = `.//*[contains(normalize-space(.), '${CHAIN_MENU_HINTS[0]}') and contains(normalize-space(.), '${CHAIN_MENU_HINTS[1]}')]`;
    const result = document.evaluate(
      xpath,
      searchRoot,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    let best = null;
    let bestScore = Infinity;
    const rowRect = rowEl ? rowEl.getBoundingClientRect() : null;
    for (let i = 0; i < result.snapshotLength; i += 1) {
      const node = result.snapshotItem(i);
      if (!node || !isVisible(node)) {
        continue;
      }
      if (rowEl && rowEl.contains(node)) {
        continue;
      }
      const text = (node.innerText || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 260) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      const score = rowRect
        ? Math.abs(
            (rect.top + rect.bottom) / 2 - (rowRect.top + rowRect.bottom) / 2
          )
        : text.length;
      if (score < bestScore) {
        best = node;
        bestScore = score;
      }
    }
    return best;
  };

  const findChainOption = (chainName, root, rowEl) => {
    const searchRoot = root || document.body;
    const exactNodes = findElementsByExactText(chainName, searchRoot);
    for (const node of exactNodes) {
      if (rowEl && rowEl.contains(node)) {
        continue;
      }
      const clickable = resolveClickable(node);
      if (clickable && isVisible(clickable)) {
        return clickable;
      }
    }
    const fallback = findClickableByText(chainName, searchRoot);
    if (fallback && (!rowEl || !rowEl.contains(fallback))) {
      return fallback;
    }
    return null;
  };

  const findMaxButton = () => {
    const nodes = findElementsByExactText("MAX", document.body);
    const candidates = nodes
      .map(resolveClickable)
      .filter(Boolean)
      .filter(isVisible)
      .filter((el) => !panelRefs?.container?.contains(el));
    if (!candidates.length) {
      return null;
    }
    const scored = candidates.map((el) => {
      const parentText = (el.parentElement?.innerText || "")
        .replace(/\s+/g, " ")
        .trim();
      const score =
        (el.tagName === "BUTTON" ? 0 : 2) +
        (parentText.includes("25%") ? 0 : 1) +
        (parentText.includes("50%") ? 0 : 1);
      return { el, score };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored[0].el;
  };

  const findConfirmButton = () => {
    const nodes = CONFIRM_TEXTS.flatMap((text) =>
      findElementsByExactText(text, document.body)
    );
    const candidates = nodes
      .map(resolveClickable)
      .filter(Boolean)
      .filter(isVisible)
      .filter((el) => !panelRefs?.container?.contains(el));
    if (!candidates.length) {
      return null;
    }
    const button = candidates.find((el) => el.tagName === "BUTTON");
    return button || candidates[0];
  };

  const isDisabledControl = (el) => {
    if (!el) {
      return true;
    }
    if ("disabled" in el && el.disabled) {
      return true;
    }
    const ariaDisabled = el.getAttribute("aria-disabled");
    if (ariaDisabled === "true") {
      return true;
    }
    return el.hasAttribute("disabled");
  };

  const parseNumericValue = (value) => {
    const normalized = String(value || "")
      .replace(/,/g, "")
      .trim();
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return 0;
    }
    const parsed = Number.parseFloat(match[0]);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const findTradeAmountInputs = () => {
    const overlay = findOverlayRoot();
    return Array.from(document.querySelectorAll("input"))
      .filter(isVisible)
      .filter((el) => !panelRefs?.container?.contains(el))
      .filter((el) => !overlay || !overlay.contains(el))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 80) {
          return false;
        }
        const type = (el.getAttribute("type") || "text").toLowerCase();
        return ["", "text", "number", "search", "tel"].includes(type);
      })
      .sort((a, b) => {
        if (a === b) {
          return 0;
        }
        const position = a.compareDocumentPosition(b);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
          return -1;
        }
        if (position & Node.DOCUMENT_POSITION_PRECEDING) {
          return 1;
        }
        return 0;
      });
  };

  const getSwapQuoteState = () => {
    const inputs = findTradeAmountInputs();
    const sourceInput = inputs.find((el) => !el.disabled && !el.readOnly) || null;
    const targetInput = inputs.find((el) => el !== sourceInput) || null;
    const confirmButton = findConfirmButton();
    return {
      sourceAmount: parseNumericValue(sourceInput?.value),
      targetAmount: parseNumericValue(targetInput?.value),
      hasQuoteSummary:
        hasTextVisible("Simulations", document.body) &&
        hasTextVisible("Total Fee", document.body),
      confirmReady: Boolean(
        confirmButton && !isDisabledControl(confirmButton)
      ),
    };
  };

  const hasQuoteProgress = (beforeState, nextState) => {
    if (!nextState) {
      return false;
    }
    if (nextState.confirmReady || nextState.hasQuoteSummary) {
      return true;
    }
    return (
      nextState.sourceAmount > beforeState.sourceAmount ||
      nextState.targetAmount > beforeState.targetAmount
    );
  };

  const findCloseButton = () => {
    const nodes = findElementsByExactText(CLOSE_TEXT, document.body);
    const candidates = nodes
      .map(resolveClickable)
      .filter(Boolean)
      .filter(isVisible)
      .filter((el) => !panelRefs?.container?.contains(el));
    if (!candidates.length) {
      return null;
    }
    const button = candidates.find((el) => el.tagName === "BUTTON");
    return button || candidates[0];
  };

  const findRefreshButton = () => {
    const nodes = findElementsByExactText(REFRESH_TEXT, document.body);
    const candidates = nodes
      .map(resolveClickable)
      .filter(Boolean)
      .filter(isVisible)
      .filter((el) => !panelRefs?.container?.contains(el));
    if (candidates.length) {
      const button = candidates.find((el) => el.tagName === "BUTTON");
      return button || candidates[0];
    }
    const fallback = findClickableByText(REFRESH_TEXT, document.body);
    if (fallback && !panelRefs?.container?.contains(fallback)) {
      return fallback;
    }
    return null;
  };

  const hasTextVisible = (text, root) => {
    const exactNodes = findElementsByExactText(text, root);
    if (exactNodes.length) {
      return true;
    }
    return Boolean(findClickableByText(text, root));
  };

  const includesAllTexts = (node, texts) => {
    const content = normalizeText(node?.innerText || node?.textContent || "");
    if (!content) {
      return false;
    }
    return texts.every((text) => content.includes(normalizeText(text)));
  };

  const pickSmallestContainer = (containers) => {
    if (!containers.length) {
      return null;
    }
    return containers
      .map((element) => ({
        element,
        area:
          element.getBoundingClientRect().width *
          element.getBoundingClientRect().height,
      }))
      .sort((a, b) => a.area - b.area)[0].element;
  };

  const findFeedbackContainer = (anchorTexts, requiredTexts) => {
    const anchors = anchorTexts.flatMap((text) =>
      findElementsByExactText(text, document.body)
    );
    const candidates = [];

    for (const anchor of anchors) {
      let current = anchor;
      for (let depth = 0; depth < 7 && current; depth += 1) {
        if (
          current instanceof HTMLElement &&
          isVisible(current) &&
          !panelRefs?.container?.contains(current) &&
          includesAllTexts(current, requiredTexts)
        ) {
          const textLength = (current.innerText || "").trim().length;
          if (textLength > 0 && textLength < 320) {
            candidates.push(current);
          }
        }
        current = current.parentElement;
      }
    }

    return pickSmallestContainer(
      candidates.filter((element, index, list) => list.indexOf(element) === index)
    );
  };

  const findFinalSuccessSignal = () => {
    const confirmedCard = findFeedbackContainer(
      [CONFIRMED_TEXT],
      [CONFIRMED_TEXT, "Swap"]
    );
    if (confirmedCard) {
      return {
        status: "confirmed",
        container: confirmedCard,
        closeButton: findCloseButton(),
      };
    }

    const successCard =
      findFeedbackContainer([SUCCESS_TEXT], [SUCCESS_TEXT]) ||
      findFeedbackContainer([SWAPPED_TO_TEXT], [SWAPPED_TO_TEXT]);
    if (successCard) {
      return {
        status: "success",
        container: successCard,
        closeButton: findCloseButton(),
      };
    }
    return null;
  };

  const findPendingSignal = () => {
    const pendingCard = findFeedbackContainer(
      [PENDING_TEXT],
      [PENDING_TEXT, "Swap"]
    );
    if (pendingCard) {
      return {
        status: "pending",
        container: pendingCard,
        closeButton: findCloseButton(),
      };
    }
    return null;
  };

  const findSwapFeedbackSignal = () =>
    findPendingSignal() || findFinalSuccessSignal();

  const extractFeedbackSwapUsdAmount = (feedback) => {
    const text = feedback?.container?.innerText || "";
    return extractFirstUsdValue(text);
  };

  const isReadyForNextCycle = () => {
    const overlay = findOverlayRoot();
    if (
      overlay &&
      (hasTextVisible(SUCCESS_TEXT, overlay) ||
        hasTextVisible(SWAPPED_TO_TEXT, overlay))
    ) {
      return null;
    }
    const buttons = findSelectionButtons(2);
    if (!buttons || buttons.length < 2) {
      return null;
    }
    return buttons;
  };

  const hoverTokenAndSelectChain = async (rowEl, symbol, chainName) => {
    if (!rowEl) {
      return false;
    }
    rowEl.scrollIntoView({ block: "center", inline: "nearest" });
    hoverEl(rowEl);
    addLog(`已悬浮代币: ${symbol}`);

    let menuRoot = await waitFor(() => findChainMenuRoot(rowEl), 6000);
    if (!menuRoot) {
      addLog("未找到网络菜单，尝试点击代币行");
      clickEl(rowEl);
      await sleep(200);
      hoverEl(rowEl);
      menuRoot = await waitFor(() => findChainMenuRoot(rowEl), 6000);
    }
    if (!menuRoot) {
      addLog("未找到网络菜单");
      return false;
    }

    const chainOption = await waitFor(
      () => findChainOption(chainName, menuRoot, rowEl),
      6000
    );
    if (!chainOption) {
      addLog(`未找到网络: ${chainName}`);
      return false;
    }
    clickEl(chainOption);
    addLog(`已点击网络: ${chainName}`);
    return true;
  };

  const dismissOverlay = async () => {
    const overlay = findOverlayRoot();
    if (!overlay) {
      return true;
    }
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    document.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Escape", bubbles: true })
    );
    await sleep(200);
    return !findOverlayRoot();
  };

  const stepOneSelectToken = async (flowOverride) => {
    addLog("步骤1：等待来源代币选择按钮出现");
    const buttons = await waitFor(() => findSelectionButtons(1));
    if (!buttons) {
      addLog("未找到来源选择按钮");
      return { flow: null, reason: "failed" };
    }
    clickEl(buttons[0]);
    addLog("点击选取币种");
    addLog("已点击来源按钮，等待1秒");
    await sleep(WAIT_AFTER_BUTTON_MS);

    const rows = await waitFor(findSourceTokenRows);
    if (!rows) {
      addLog("未找到代币列表");
      return { flow: null, reason: "failed" };
    }

    addLog(`所有代币项（共${rows.length}项）:`);
    rows.forEach((row, index) => {
      addLog(
        `${index + 1}:${row.symbol}${row.usdValue ? ` ${row.usdValue}` : ""}`
      );
    });

    const flow = flowOverride || resolveInitialFlow(rows);
    if (!flow) {
      return { flow: null, reason: "no_source" };
    }
    if (flowOverride) {
      addLog(`使用指定流程: ${flow.label}`);
    } else {
      addLog(`开始流程: ${flow.label}`);
    }

    const sourceRow = findBestPositiveRowByNames(rows, flow.sourceNames);
    if (!sourceRow || sourceRow.amountValue <= 0) {
      addLog(`未找到来源代币: ${flow.sourceNames.join("/")}`);
      return { flow: null, reason: "failed" };
    }

    clickEl(sourceRow.element);
    logStep(flow, `已选择来源代币: ${sourceRow.name}`);
    return { flow, reason: "ok" };
  };

  const stepTwoSelectTarget = async (flow) => {
    if (!flow) {
      return false;
    }

    logStep(flow, "步骤2：点击目标代币选择按钮");
    const buttons = await waitFor(() => findSelectionButtons(2));
    if (!buttons) {
      logStep(flow, "未找到目标选择按钮");
      return false;
    }
    const targetButton = buttons[1] || buttons[0];
    clickEl(targetButton);
    logStep(flow, "点击选取目标币种");
    logStep(flow, "已点击目标按钮，等待1秒");
    await sleep(WAIT_AFTER_BUTTON_MS);

    let targetRow = await searchTargetToken(flow);
    if (!targetRow) {
      logStep(flow, "搜索路径失败，回退到已保存");
      const savedTab = await waitFor(findSavedTab);
      if (!savedTab) {
        logStep(flow, "未找到已保存");
        return false;
      }
      logStep(
        flow,
        `已找到已保存(${savedTab.tagName.toLowerCase()}${
          savedTab.className
            ? `.${savedTab.className.split(" ").slice(0, 2).join(".")}`
            : ""
        })`
      );
      savedTab.scrollIntoView({ block: "center", inline: "nearest" });
      clickEl(savedTab);
      logStep(flow, "已点击已保存，等待2秒");
      await sleep(WAIT_AFTER_SAVED_TAB_MS);

      targetRow = await waitFor(() =>
        findSavedTokenRowBySymbol(flow.targetSymbol)
      );
      if (!targetRow) {
        logStep(flow, `未找到目标代币 ${flow.targetSymbol}`);
        return false;
      }
    }

    if (flow.targetChain) {
      const selected = await hoverTokenAndSelectChain(
        targetRow,
        flow.targetSymbol,
        flow.targetChain
      );
      return selected;
    }

    clickEl(targetRow);
    logStep(flow, `已点击目标代币: ${flow.targetSymbol}`);
    return true;
  };

  const stepThreeClickMax = async (flow) => {
    logStep(flow, "步骤3：点击MAX");
    const maxButton = await waitFor(findMaxButton);
    if (!maxButton) {
      logStep(flow, "未找到MAX按钮");
      return false;
    }
    const quoteBeforeMax = getSwapQuoteState();
    maxButton.scrollIntoView({ block: "center", inline: "nearest" });
    clickEl(maxButton);
    logStep(flow, "已点击MAX，等待金额回填或报价出现");

    const quoteReaction = await waitFor(() => {
      const state = getSwapQuoteState();
      if (!hasQuoteProgress(quoteBeforeMax, state)) {
        return null;
      }
      return state;
    }, WAIT_AFTER_MAX_MS);
    if (!quoteReaction) {
      logStep(flow, "点击MAX后，页面长时间未完成金额回填或报价");
      return false;
    }

    if (quoteReaction.confirmReady) {
      logStep(flow, "确认按钮已可点击");
      return true;
    }

    logStep(flow, "已检测到金额或报价更新，继续等待确认按钮");
    return true;
  };

  const stepFourClickConfirm = async (flow) => {
    logStep(flow, "步骤4：点击确认");
    logStep(flow, `等待${WAIT_BEFORE_CONFIRM_MS}ms，给页面完成确认按钮渲染`);
    await sleep(WAIT_BEFORE_CONFIRM_MS);

    const confirmButton = await waitFor(() => {
      const button = findConfirmButton();
      if (!button || isDisabledControl(button)) {
        return null;
      }
      return button;
    });
    if (!confirmButton) {
      logStep(flow, "未找到确认按钮");
      return false;
    }
    confirmButton.scrollIntoView({ block: "center", inline: "nearest" });
    clickEl(confirmButton);
    logStep(flow, "已点击确认，等待交易反馈");

    const startedAt = Date.now();
    const feedback = await waitFor(findSwapFeedbackSignal, WAIT_AFTER_CONFIRM_MS);
    if (!feedback) {
      logStep(flow, "确认后未检测到成功或待处理提示");
      return null;
    }
    logStep(flow, `检测到反馈状态: ${feedback.status}`);
    if (feedback.status === "confirmed" || feedback.status === "success") {
      const swapUsdAmount = extractFeedbackSwapUsdAmount(feedback);
      if (swapUsdAmount > 0) {
        logStep(flow, `记录本轮兑换金额: ${formatUsdDisplay(swapUsdAmount)}`);
      }
      logStep(flow, "已进入最终成功状态");
      return { status: feedback.status, swapUsdAmount };
    }

    logStep(flow, "已出现待处理提示，继续等待Confirmed");
    const elapsed = Date.now() - startedAt;
    const remainingTimeout = Math.max(1000, WAIT_AFTER_CONFIRM_MS - elapsed);
    const finalFeedback = await waitFor(
      findFinalSuccessSignal,
      remainingTimeout
    );
    if (!finalFeedback) {
      logStep(flow, "待处理后长时间未进入Confirmed");
      return null;
    }
    logStep(flow, `检测到反馈状态: ${finalFeedback.status}`);
    const swapUsdAmount = extractFeedbackSwapUsdAmount(finalFeedback);
    if (swapUsdAmount > 0) {
      logStep(flow, `记录本轮兑换金额: ${formatUsdDisplay(swapUsdAmount)}`);
    }
    logStep(flow, "已进入最终成功状态");
    return { status: finalFeedback.status, swapUsdAmount };
  };

  const stepFiveClickClose = async (flow) => {
    logStep(flow, "步骤5：点击Close");
    const closeButton = await waitFor(findCloseButton, WAIT_AFTER_CONFIRM_MS);
    if (!closeButton) {
      logStep(flow, "未找到Close按钮");
      return false;
    }
    closeButton.scrollIntoView({ block: "center", inline: "nearest" });
    clickEl(closeButton);
    logStep(flow, "已点击Close");
    return true;
  };

  const stepSixWaitForNextCycle = async (flow) => {
    logStep(flow, "步骤6：等待页面回到下一轮可执行状态");
    const ready = await waitFor(isReadyForNextCycle, 10000);
    if (!ready) {
      logStep(flow, "页面未回到可执行状态");
      return false;
    }
    logStep(flow, "已回到下一轮可执行状态");
    return true;
  };

  const runSingleSwap = async (flowOverride, options = {}) => {
    const { flow, reason } = await stepOneSelectToken(flowOverride);
    if (!flow) {
      return { status: reason === "no_source" ? "no_source" : "failed" };
    }
    const targetSelected = await stepTwoSelectTarget(flow);
    if (!targetSelected) {
      return { status: "failed" };
    }
    const maxClicked = await stepThreeClickMax(flow);
    if (!maxClicked) {
      return { status: "failed" };
    }
    const confirmResult = await stepFourClickConfirm(flow);
    if (!confirmResult) {
      return { status: "failed" };
    }
    const closed = await stepFiveClickClose(flow);
    if (!closed) {
      return { status: "failed" };
    }
    const ready = await stepSixWaitForNextCycle(flow);
    if (!ready) {
      return { status: "failed" };
    }
    if (!options.skipCount) {
      await incrementCount();
    }
    return {
      status: "ok",
      flow,
      swapUsdAmount: confirmResult.swapUsdAmount || 0,
    };
  };

  const runSwapCycle = async () => {
    const result = await runSingleSwap(null);
    if (result?.status === "ok") {
      return result;
    }
    if (result?.status === "no_source") {
      return { status: "no_source" };
    }
    return { status: "failed" };
  };

  const refreshAfterNoSource = async () => {
    addLog("未检测到代币，3秒后刷新");
    await sleep(WAIT_AFTER_REFRESH_MS);
    const refreshButton = await waitFor(findRefreshButton, 6000);
    if (!refreshButton) {
      addLog("未找到Refresh按钮");
      return false;
    }
    refreshButton.scrollIntoView({ block: "center", inline: "nearest" });
    clickEl(refreshButton);
    addLog("已点击Refresh");
    await sleep(WAIT_AFTER_BUTTON_MS);
    return true;
  };

  const refreshPage = async () => {
    await sleep(120);
    window.location.reload();
    await new Promise(() => {});
  };

  const persistRecoveryBeforeRefresh = async ({
    runMode,
    remainingCount,
    targetTodayVolume,
    attempt,
    reason,
  }) => {
    const recoveryState = createRecoveryState({
      runMode,
      remainingCount,
      targetTodayVolume,
      attempt,
      reason,
    });
    await storageSet({
      [STORAGE_KEYS.runMode]: recoveryState.runMode,
      [STORAGE_KEYS.loopCount]:
        recoveryState.runMode === RUN_MODE_COUNT
          ? recoveryState.remainingCount
          : 1,
      [STORAGE_KEYS.targetTodayVolume]: recoveryState.targetTodayVolume,
      [STORAGE_KEYS.enabled]: false,
      [STORAGE_KEYS.recoveryState]: recoveryState,
    });
    return recoveryState;
  };

  const recoverFromUnknownError = async ({
    runMode,
    total,
    completed,
    targetTodayVolume,
  }) => {
    const previousRecovery = await readRecoveryState();
    const nextAttempt = (previousRecovery?.attempt || 0) + 1;
    if (nextAttempt > UNKNOWN_ERROR_REFRESH_MAX_ATTEMPTS) {
      await clearRecoveryState();
      addLog("未知错误连续出现，已超过刷新恢复上限，停止执行");
      return false;
    }

    const remainingCount = Math.max(1, total - completed);
    addLog(
      runMode === RUN_MODE_COUNT
        ? `遇到未知错误，刷新前记录恢复状态：还剩 ${remainingCount} 次`
        : `遇到未知错误，刷新前记录恢复状态：目标 ${formatUsdDisplay(
            targetTodayVolume
          )}`
    );
    await persistRecoveryBeforeRefresh({
      runMode,
      remainingCount,
      targetTodayVolume,
      attempt: nextAttempt,
      reason: "unknown_error",
    });
    addLog(`准备刷新页面，第 ${nextAttempt}/${UNKNOWN_ERROR_REFRESH_MAX_ATTEMPTS} 次恢复尝试`);
    await refreshPage();
    return true;
  };

  const waitBetweenCycles = async () => {
    const delayMs = randomBetween(
      WAIT_BETWEEN_CYCLES_MIN_MS,
      WAIT_BETWEEN_CYCLES_MAX_MS
    );
    addLog(`随机等待 ${(delayMs / 1000).toFixed(1)} 秒后进入下一轮`);
    await sleep(delayMs);
  };

  const getTodayTradingVolumeValue = () =>
    Number.isFinite(panelStatsState.todayTradingVolume)
      ? panelStatsState.todayTradingVolume
      : 0;

  const hasReachedTargetTodayVolume = (currentTodayVolume, targetTodayVolume) =>
    currentTodayVolume >= targetTodayVolume;

  const refreshTargetModeProgress = async (targetTodayVolume, phase) => {
    await refreshPanelStats();
    const current = getTodayTradingVolumeValue();
    addLog(
      `${phase}，今日交易量 ${formatUsdDisplay(current)} / 目标 ${formatUsdDisplay(
        targetTodayVolume
      )}`
    );
    if (hasReachedTargetTodayVolume(current, targetTodayVolume)) {
      addLog(`今日交易量已达到目标，停止执行`);
      return { reached: true, currentTodayVolume: current };
    }
    return { reached: false, currentTodayVolume: current };
  };

  const ensureOnlyUsdtAfterCompletion = async () => {
    addLog("全部完成，等待5秒后检查是否需要换回USDT");
    await sleep(POST_RUN_SETTLE_WAIT_MS);

    const sourceButtons = await waitFor(() => findSelectionButtons(1), 6000);
    if (!sourceButtons) {
      addLog("收尾检查失败：未找到来源代币选择按钮");
      return false;
    }

    clickEl(sourceButtons[0]);
    addLog("打开来源代币列表进行收尾检查");
    await sleep(WAIT_AFTER_BUTTON_MS);

    const rows = await waitFor(findSourceTokenRows, 6000);
    if (!rows) {
      addLog("收尾检查失败：未找到来源代币列表");
      return false;
    }

    const positiveRows = rows.filter((row) => row.amountValue > 0);
    if (!positiveRows.length) {
      addLog("收尾检查：未检测到可用来源代币");
      await dismissOverlay();
      return true;
    }

    const onlyUsdt = positiveRows.every((row) =>
      matchesAny(row.name, USDT_SOURCE_NAMES)
    );
    if (onlyUsdt) {
      addLog("收尾检查通过，仅剩USDT");
      const usdtRow = findBestPositiveRowByNames(rows, USDT_SOURCE_NAMES);
      if (usdtRow) {
        clickEl(usdtRow.element);
        await sleep(150);
      } else {
        await dismissOverlay();
      }
      return true;
    }

    const settlementFlow = resolveFinalUsdtSettlementFlow(rows);
    await dismissOverlay();
    if (!settlementFlow) {
      addLog("收尾检查发现非USDT余额，但未匹配到可执行的换回USDT流程");
      return false;
    }

    addLog(`收尾检查发现需要换回USDT，执行 ${settlementFlow.label}`);
    const result = await runSingleSwap(settlementFlow, { skipCount: true });
    if (result.status !== "ok") {
      addLog("收尾换回USDT失败");
      return false;
    }
    addLog("收尾换回USDT完成");
    return true;
  };

  const runSwapLoop = async (overrideSettings = null) => {
    if (running) {
      addLog("当前正在执行，忽略重复开始");
      return;
    }
    const settings = overrideSettings || (await getSettings());
    const runMode = normalizeRunMode(settings.runMode);
    const total = clampLoopCount(settings.loopCount);
    const targetTodayVolume = normalizeTargetTodayVolume(
      settings.targetTodayVolume
    );
    if (runMode === RUN_MODE_COUNT && (!total || total < 1)) {
      addLog("请输入有效的循环次数");
      setEnabled(false);
      return;
    }
    if (runMode === RUN_MODE_TARGET && targetTodayVolume <= 0) {
      addLog("目标交易量模式需要设置大于0的目标值");
      setEnabled(false);
      return;
    }

    running = true;
    stopRequested = false;
    let endReason = "completed";
    try {
      let baseTodayVolume = 0;
      let localAccumulatedVolume = 0;
      if (runMode === RUN_MODE_TARGET) {
        addLog(`开始目标交易量模式，目标值: ${formatUsdDisplay(targetTodayVolume)}`);
        const targetCheck = await refreshTargetModeProgress(
          targetTodayVolume,
          "启动前检查"
        );
        baseTodayVolume = targetCheck.currentTodayVolume || 0;
        if (targetCheck.reached) {
          endReason = "target_reached";
          return;
        }
      } else {
        addLog(`开始循环，总次数: ${total}`);
      }
      let completed = 0;
      while (runMode === RUN_MODE_TARGET || completed < total) {
        if (stopRequested) {
          endReason = "stopped";
          addLog("已停止循环");
          break;
        }
        addLog(
          runMode === RUN_MODE_TARGET
            ? `开始第${completed + 1}次（目标交易量模式）`
            : `开始第${completed + 1}/${total}次`
        );
        const result = await runSwapCycle();
        if (result.status === "no_source") {
          await refreshAfterNoSource();
          continue;
        }
        if (result.status !== "ok") {
          endReason = "failed";
          addLog("本次出现未知错误，准备刷新页面恢复");
          const reloading = await recoverFromUnknownError({
            runMode,
            total,
            completed,
            targetTodayVolume,
          });
          if (reloading) {
            endReason = "reloading";
            return;
          }
          addLog("未知错误恢复失败，停止循环");
          break;
        }
        completed += 1;
        if (runMode === RUN_MODE_TARGET) {
          const swapUsdAmount = result.swapUsdAmount || 0;
          if (swapUsdAmount <= 0) {
            addLog("本轮未解析到兑换金额，刷新真实今日交易量重新校准");
            const targetCheck = await refreshTargetModeProgress(
              targetTodayVolume,
              "金额缺失后校验"
            );
            baseTodayVolume = targetCheck.currentTodayVolume || baseTodayVolume;
            localAccumulatedVolume = 0;
            if (targetCheck.reached) {
              endReason = "target_reached";
              break;
            }
            if (
              (runMode === RUN_MODE_COUNT && completed < total) ||
              runMode === RUN_MODE_TARGET
            ) {
              await waitBetweenCycles();
            }
            continue;
          }
          localAccumulatedVolume += swapUsdAmount;
          const estimatedTodayVolume = baseTodayVolume + localAccumulatedVolume;
          addLog(
            `本地累计兑换金额 ${formatUsdDisplay(
              localAccumulatedVolume
            )}，估算今日交易量 ${formatUsdDisplay(
              estimatedTodayVolume
            )} / 目标 ${formatUsdDisplay(targetTodayVolume)}`
          );
          if (hasReachedTargetTodayVolume(estimatedTodayVolume, targetTodayVolume)) {
            addLog("本地估算已达到目标，刷新真实今日交易量校验");
            const targetCheck = await refreshTargetModeProgress(
              targetTodayVolume,
              "真实值校验"
            );
            baseTodayVolume = targetCheck.currentTodayVolume || baseTodayVolume;
            localAccumulatedVolume = 0;
            if (targetCheck.reached) {
              endReason = "target_reached";
              break;
            }
          }
        }
        if (
          (runMode === RUN_MODE_COUNT && completed < total) ||
          runMode === RUN_MODE_TARGET
        ) {
          await waitBetweenCycles();
        }
      }
      if (
        (endReason === "completed" || endReason === "target_reached") &&
        (runMode === RUN_MODE_TARGET || completed >= total)
      ) {
        await ensureOnlyUsdtAfterCompletion();
      }
      await clearRecoveryState();
    } finally {
      running = false;
      setEnabled(false);
      if (!stopRequested && endReason !== "reloading") {
        addLog("循环结束，已关闭");
      }
    }
  };

  const resumeFromRecoveryIfNeeded = async () => {
    const recovery = await readRecoveryState();
    if (!recovery) {
      return false;
    }
    await clearRecoveryState();
    const resumedSettings =
      recovery.runMode === RUN_MODE_COUNT
        ? {
            enabled: true,
            loopCount: clampLoopCount(recovery.remainingCount),
            runMode: RUN_MODE_COUNT,
            targetTodayVolume: 0,
          }
        : {
            enabled: true,
            loopCount: 1,
            runMode: RUN_MODE_TARGET,
            targetTodayVolume: normalizeTargetTodayVolume(
              recovery.targetTodayVolume
            ),
          };
    renderPanel(resumedSettings);
    addLog(
      recovery.runMode === RUN_MODE_COUNT
        ? `检测到异常恢复，继续执行，剩余 ${resumedSettings.loopCount} 次`
        : `检测到异常恢复，继续执行目标模式，目标 ${formatUsdDisplay(
            resumedSettings.targetTodayVolume
          )}`
    );
    runSwapLoop(resumedSettings);
    return true;
  };

  const runIfEnabled = async () => {
    const { enabled } = await getSettings();
    if (!enabled) {
      return;
    }
    runSwapLoop();
  };

  const handleStorageChange = (changes, area) => {
    if (area !== "local") {
      return;
    }
    let shouldRender = false;
    if (STORAGE_KEYS.enabled in changes) {
      shouldRender = true;
      if (changes[STORAGE_KEYS.enabled].newValue) {
        stopRequested = false;
        runSwapLoop();
      } else {
        stopRequested = true;
      }
    }
    if (STORAGE_KEYS.count in changes) {
      shouldRender = true;
    }
    if (STORAGE_KEYS.loopCount in changes) {
      shouldRender = true;
    }
    if (STORAGE_KEYS.runMode in changes) {
      shouldRender = true;
    }
    if (STORAGE_KEYS.targetTodayVolume in changes) {
      shouldRender = true;
    }
    if (shouldRender) {
      getSettings().then(renderPanel);
    }
  };

  const resetEnabledOnLoad = () => {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: false });
  };

  const init = () => {
    resetEnabledOnLoad();
    waitFor(() => document.body).then(async () => {
      initPanel();
      startPanelObserver();
      const resumed = await resumeFromRecoveryIfNeeded();
      if (resumed) {
        return;
      }
      runIfEnabled();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  if (chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }
})();
