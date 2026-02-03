(() => {
  const STORAGE_KEYS = {
    enabled: "geniusSwapEnabled",
    count: "geniusSwapCount",
    loopCount: "geniusSwapLoopCount",
  };

  const PANEL_ID = "genius-swap-panel";
  const LOG_LIMIT = 80;
  const POLL_INTERVAL_MS = 250;
  const WAIT_TIMEOUT_MS = 20000;
  const WAIT_AFTER_BUTTON_MS = 1000;
  const WAIT_AFTER_SAVED_TAB_MS = 2000;
  const WAIT_AFTER_MAX_MS = 5000;
  const WAIT_AFTER_CONFIRM_MS = 30000;
  const WAIT_AFTER_REFRESH_MS = 3000;
  const USDT_SOURCE_NAMES = ["Tether USD", "USDT"];
  const KOGE_SOURCE_NAMES = ["BNB48 Club Token", "KOGE"];
  const TARGET_SYMBOL_USDT = "USDT";
  const TARGET_SYMBOL_KOGE = "KOGE";
  const TARGET_CHAIN_NAME = "BNB";
  const SAVED_TAB_TEXT = "已保存";
  const CONFIRM_TEXT = "确认";
  const CLOSE_TEXT = "Close";
  const REFRESH_TEXT = "Refresh";
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
  const FLOW_USDT_TO_KOGE = {
    label: "USDT->KOGE",
    sourceNames: USDT_SOURCE_NAMES,
    targetSymbol: TARGET_SYMBOL_KOGE,
    targetChain: null,
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
  let running = false;
  let stopRequested = false;
  const logBuffer = [];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        resolve({ enabled: false, count: 0 });
        return;
      }
      chrome.storage.local.get(
        {
          [STORAGE_KEYS.enabled]: false,
          [STORAGE_KEYS.count]: 0,
          [STORAGE_KEYS.loopCount]: 1,
        },
        (result) => {
          resolve({
            enabled: Boolean(result[STORAGE_KEYS.enabled]),
            count: Number(result[STORAGE_KEYS.count] || 0),
            loopCount: Number(result[STORAGE_KEYS.loopCount] || 1),
          });
        }
      );
    });

  const incrementCount = async () => {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    const { count } = await getSettings();
    chrome.storage.local.set({ [STORAGE_KEYS.count]: count + 1 });
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

  const normalizeText = (text) =>
    (text || "").toLowerCase().replace(/\s+/g, " ").trim();

  const matchesAny = (text, names) =>
    names.some((name) => normalizeText(text).includes(normalizeText(name)));

  const findRowByNames = (rows, names) =>
    rows.find((row) => matchesAny(row.name, names)) || null;

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

  const setEnabled = (value) => {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: Boolean(value) });
  };

  const resolveInitialFlow = (rows) => {
    const hasUsdt = rows.some((row) =>
      matchesAny(row.name, FLOW_USDT_TO_KOGE.sourceNames)
    );
    if (hasUsdt) {
      addLog(`检测到USDT，执行 ${FLOW_USDT_TO_KOGE.label}`);
      return FLOW_USDT_TO_KOGE;
    }
    const hasKoge = rows.some((row) =>
      matchesAny(row.name, FLOW_BNB48_TO_USDT.sourceNames)
    );
    if (hasKoge) {
      addLog(`未检测到USDT，执行 ${FLOW_BNB48_TO_USDT.label}`);
      return FLOW_BNB48_TO_USDT;
    }
    addLog("未检测到USDT或BNB48，无法选择来源代币");
    return null;
  };

  const renderPanel = ({ enabled, loopCount }) => {
    if (!panelRefs) {
      return;
    }
    panelRefs.toggle.checked = enabled;
    panelRefs.status.textContent = enabled ? "Enabled" : "Disabled";
    panelRefs.status.dataset.state = enabled ? "on" : "off";
    if (panelRefs.loopInput) {
      panelRefs.loopInput.value = String(loopCount || 1);
    }
  };

  const initPanel = () => {
    if (!document.body) {
      return;
    }
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      return;
    }
    if (panelRefs) {
      panelRefs = null;
    }

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="gsh-header">
        <div>
          <div class="gsh-title">Genius Swap</div>
        </div>
        <div class="gsh-status" id="gsh-status">Disabled</div>
      </div>
      <div class="gsh-row">
        <div>
          <div class="gsh-label">Enable auto swap</div>
          <div class="gsh-hint">Only runs on /zh/trade</div>
        </div>
        <label class="gsh-switch">
          <input type="checkbox" id="gsh-toggle" />
          <span class="gsh-slider"></span>
        </label>
      </div>
      <div class="gsh-row">
        <div>
          <div class="gsh-label">次数</div>
          <div class="gsh-hint">手动开启后执行</div>
        </div>
        <input class="gsh-input" id="gsh-loop-count" type="number" min="1" step="1" />
      </div>
      <div class="gsh-log">
        <div class="gsh-log-title">日志</div>
        <div class="gsh-log-list" id="gsh-log-list"></div>
      </div>
    `;
    document.body.appendChild(panel);

    const toggle = panel.querySelector("#gsh-toggle");
    const status = panel.querySelector("#gsh-status");
    const logs = panel.querySelector("#gsh-log-list");
    const loopInput = panel.querySelector("#gsh-loop-count");

    panelRefs = {
      toggle,
      status,
      logs,
      loopInput,
      container: panel,
    };

    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        const nextValue = clampLoopCount(loopInput.value);
        loopInput.value = String(nextValue);
        chrome.storage.local.set({
          [STORAGE_KEYS.loopCount]: nextValue,
          [STORAGE_KEYS.enabled]: true,
        });
        addLog(`已开启，循环次数: ${nextValue}`);
      } else {
        chrome.storage.local.set({ [STORAGE_KEYS.enabled]: false });
        addLog("已关闭");
      }
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

    getSettings().then((settings) => {
      renderPanel(settings);
      renderLogs();
    });
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
    const buttons = Array.from(
      document.querySelectorAll(SELECT_BUTTON_SELECTOR)
    ).filter(isVisible);
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
        return { element: row, name };
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
    const nodes = findElementsByExactText(CONFIRM_TEXT, document.body);
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

  const stepOneSelectToken = async (flowOverride) => {
    addLog("步骤1：等待来源代币选择按钮出现");
    const buttons = await waitFor(() => findSelectionButtons(1));
    if (!buttons) {
      addLog("未找到来源选择按钮");
      return { flow: null, reason: "failed" };
    }
    clickEl(buttons[0]);
    addLog("已点击来源按钮，等待1秒");
    await sleep(WAIT_AFTER_BUTTON_MS);

    const rows = await waitFor(findSourceTokenRows);
    if (!rows) {
      addLog("未找到代币列表");
      return { flow: null, reason: "failed" };
    }

    addLog("用户目前持有:");
    rows.forEach((row) => addLog(row.name));

    const flow = flowOverride || resolveInitialFlow(rows);
    if (!flow) {
      return { flow: null, reason: "no_source" };
    }
    if (flowOverride) {
      addLog(`使用指定流程: ${flow.label}`);
    } else {
      addLog(`开始流程: ${flow.label}`);
    }

    const sourceRow = findRowByNames(rows, flow.sourceNames);
    if (!sourceRow) {
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
    logStep(flow, "已点击目标按钮，等待1秒");
    await sleep(WAIT_AFTER_BUTTON_MS);

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

    const targetRow = await waitFor(() =>
      findSavedTokenRowBySymbol(flow.targetSymbol)
    );
    if (!targetRow) {
      logStep(flow, `未找到目标代币 ${flow.targetSymbol}`);
      return false;
    }

    if (flow.targetSymbol === TARGET_SYMBOL_USDT) {
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
    maxButton.scrollIntoView({ block: "center", inline: "nearest" });
    clickEl(maxButton);
    logStep(flow, "已点击MAX，等待5秒");
    await sleep(WAIT_AFTER_MAX_MS);
    return true;
  };

  const stepFourClickConfirm = async (flow) => {
    logStep(flow, "步骤4：点击确认");
    const confirmButton = await waitFor(findConfirmButton);
    if (!confirmButton) {
      logStep(flow, "未找到确认按钮");
      return false;
    }
    confirmButton.scrollIntoView({ block: "center", inline: "nearest" });
    clickEl(confirmButton);
    logStep(flow, "已点击确认，等待30秒");
    await sleep(WAIT_AFTER_CONFIRM_MS);
    return true;
  };

  const stepFiveClickClose = async (flow) => {
    logStep(flow, "步骤5：点击Close");
    const closeButton = await waitFor(findCloseButton);
    if (!closeButton) {
      logStep(flow, "未找到Close按钮");
      return false;
    }
    closeButton.scrollIntoView({ block: "center", inline: "nearest" });
    clickEl(closeButton);
    logStep(flow, "已点击Close");
    return true;
  };

  const runSingleSwap = async (flowOverride) => {
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
    const confirmed = await stepFourClickConfirm(flow);
    if (!confirmed) {
      return { status: "failed" };
    }
    const closed = await stepFiveClickClose(flow);
    if (!closed) {
      return { status: "failed" };
    }
    await incrementCount();
    return { status: "ok", flow };
  };

  const runSwapCycle = async () => {
    const result = await runSingleSwap(null);
    if (result?.status === "ok") {
      return "ok";
    }
    if (result?.status === "no_source") {
      return "no_source";
    }
    return "failed";
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

  const runSwapLoop = async () => {
    if (running) {
      addLog("当前正在执行，忽略重复开始");
      return;
    }
    const { loopCount } = await getSettings();
    const total = clampLoopCount(loopCount);
    if (!total || total < 1) {
      addLog("请输入有效的循环次数");
      setEnabled(false);
      return;
    }

    running = true;
    stopRequested = false;
    try {
      addLog(`开始循环，总次数: ${total}`);
      let completed = 0;
      while (completed < total) {
        if (stopRequested) {
          addLog("已停止循环");
          break;
        }
        addLog(`开始第${completed + 1}/${total}次`);
        const result = await runSwapCycle();
        if (result === "no_source") {
          await refreshAfterNoSource();
          continue;
        }
        if (result !== "ok") {
          addLog("本次失败，停止循环");
          break;
        }
        completed += 1;
      }
    } finally {
      running = false;
      setEnabled(false);
      if (!stopRequested) {
        addLog("循环结束，已关闭");
      }
    }
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
    waitFor(() => document.body).then(() => {
      initPanel();
      startPanelObserver();
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
