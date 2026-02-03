(() => {
  const KEYWORD = "probable";
  if (!window.location.href.includes(KEYWORD)) {
    return;
  }
  if (document.getElementById("probable-root")) {
    return;
  }

  const root = document.createElement("div");
  root.id = "probable-root";
  root.innerHTML = `
    <div id="probable-panel" role="dialog" aria-label="Probable panel">
      <div id="probable-header">
        <div id="probable-title">Probable</div>
        <button id="probable-close" type="button" aria-label="关闭">×</button>
      </div>
      <div id="probable-sections">
        <div class="probable-section" data-section="modes">
          <div id="probable-modes">
            <button class="probable-mode is-active" data-mode="market-market" type="button">市价买<==>市价卖</button>
            <button class="probable-mode" data-mode="market-limit" type="button">市价买<==>限价卖</button>
            <button class="probable-mode" data-mode="limit-limit" type="button">限价买<==>限价卖</button>
          </div>
        </div>
        <div class="probable-section" data-section="settings">
          <div id="probable-settings">
        <div class="probable-setting">
          <label for="probable-buy-min">买入金额最小</label>
          <input id="probable-buy-min" type="number" min="0" step="0.001" value="" />
        </div>
        <div class="probable-setting">
          <label for="probable-buy-max">买入金额最大</label>
          <input id="probable-buy-max" type="number" min="0" step="0.001" value="" />
        </div>
      </div>
      <div class="probable-hint">金额留空默认使用最大</div>
    </div>
        <div class="probable-section" data-section="control">
          <button id="probable-run" type="button">运行</button>
        </div>
        <div class="probable-section" data-section="log">
          <div id="probable-status" class="is-info">就绪</div>
        </div>
      </div>
    </div>
  `;

  const mountTarget = document.body || document.documentElement;
  if (!mountTarget) {
    return;
  }
  mountTarget.appendChild(root);

  const header = root.querySelector("#probable-header");
  const closeButton = root.querySelector("#probable-close");
  const runButton = root.querySelector("#probable-run");
  const statusEl = root.querySelector("#probable-status");
  const buyMinInput = root.querySelector("#probable-buy-min");
  const buyMaxInput = root.querySelector("#probable-buy-max");
  const modeButtons = Array.from(root.querySelectorAll(".probable-mode"));

  let selectedMode = "market-market";
  let running = false;
  let runToken = 0;
  const STORAGE_KEY = "probable_state_v2";
  let resumeAfterReload = false;

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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

  const persistState = (overrides = {}) => {
    const state = {
      buyMin: String(buyMinInput.value || ""),
      buyMax: String(buyMaxInput.value || ""),
      mode: selectedMode,
      resumeRun: false,
      ...overrides
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Ignore storage errors.
    }
  };

  const applyStoredState = () => {
    const state = loadState();
    if (!state) {
      return;
    }
    if (typeof state.buyMin === "string") {
      buyMinInput.value = state.buyMin;
    }
    if (typeof state.buyMax === "string") {
      buyMaxInput.value = state.buyMax;
    }
    if (state.mode) {
      setMode(state.mode);
    }
    if (state.resumeRun) {
      resumeAfterReload = true;
      state.resumeRun = false;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        // Ignore storage errors.
      }
    }
  };

  const setStatus = (message, type) => {
    statusEl.textContent = message;
    statusEl.classList.remove("is-error", "is-warn", "is-success", "is-info");
    if (type) {
      statusEl.classList.add(`is-${type}`);
    }
  };

  const setRunning = (value) => {
    running = value;
    runButton.textContent = running ? "停止" : "运行";
    runButton.classList.toggle("is-running", running);
    buyMinInput.disabled = value;
    buyMaxInput.disabled = value;
    modeButtons.forEach((button) => {
      button.disabled = value;
      button.setAttribute("aria-disabled", value ? "true" : "false");
    });
  };

  const setMode = (mode) => {
    selectedMode = mode;
    modeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });
  };

  applyStoredState();

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (running) {
        setStatus("运行中无法切换模式", "warn");
        return;
      }
      setMode(button.dataset.mode);
      persistState();
      setStatus("模式已切换", "info");
    });
  });

  buyMinInput.addEventListener("input", () => {
    persistState();
  });
  buyMaxInput.addEventListener("input", () => {
    persistState();
  });

  closeButton.addEventListener("click", () => {
    setRunning(false);
    root.remove();
  });

  const stopRun = () => {
    if (!running) {
      return;
    }
    setRunning(false);
    runToken += 1;
    setStatus("已停止", "info");
  };

  runButton.addEventListener("click", () => {
    if (running) {
      stopRun();
      return;
    }
    runToken += 1;
    setRunning(true);
    runLoop(runToken);
  });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const ensureRunning = (token) => {
    if (!running || token !== runToken) {
      throw new Error("stopped");
    }
  };

  const sleepWithAbort = async (ms, token) => {
    const step = 250;
    let remaining = ms;
    while (remaining > 0) {
      ensureRunning(token);
      const delay = Math.min(step, remaining);
      await sleep(delay);
      remaining -= delay;
    }
  };

  const getRandomClickDelayMs = () => 2000 + Math.floor(Math.random() * 8001);

  const normalizeText = (value) => String(value || "").replace(/\s+/g, "").trim();

  const isVisible = (el) => {
    if (!el) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const opacity = Number.parseFloat(style.opacity);
    if (Number.isFinite(opacity) && opacity === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const parseNumber = (value) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  };

  const formatAmount = (value) => {
    const fixed = value.toFixed(3);
    return fixed.replace(/\.?0+$/, "");
  };

  const getBuyAmountRange = () => {
    const min = parseNumber(buyMinInput.value);
    const max = parseNumber(buyMaxInput.value);
    if (min === null || max === null || min < 0 || max < 0 || max < min) {
      return null;
    }
    return { min, max };
  };

  const shouldUseMaxBuy = () => {
    const minRaw = String(buyMinInput.value || "").trim();
    const maxRaw = String(buyMaxInput.value || "").trim();
    return !minRaw || !maxRaw;
  };

  const findTextElement = (selector, text) => {
    const target = normalizeText(text);
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const content = normalizeText(el.textContent);
      if (!content) {
        continue;
      }
      if (content === target || content.includes(target)) {
        return el;
      }
    }
    return null;
  };

  const findVisibleTextElement = (selector, text) => {
    const target = normalizeText(text);
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (!isVisible(el)) {
        continue;
      }
      const content = normalizeText(el.textContent);
      if (!content) {
        continue;
      }
      if (content === target || content.includes(target)) {
        return el;
      }
    }
    return null;
  };

  const findExactTextElement = (selector, text, scope = document) => {
    const target = normalizeText(text);
    const elements = scope.querySelectorAll(selector);
    for (const el of elements) {
      if (!isVisible(el)) {
        continue;
      }
      const content = normalizeText(el.textContent);
      if (content === target) {
        return el;
      }
    }
    return null;
  };

  const findButtonByText = (selectors, text, options = {}) => {
    const target = normalizeText(text);
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of list) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (!isVisible(el)) {
          continue;
        }
        const content = normalizeText(el.textContent);
        if (!content || !content.includes(target)) {
          continue;
        }
        if (!options.allowExact && content === target) {
          continue;
        }
        return el;
      }
    }
    return null;
  };

  const toClickable = (el) => el.closest("button,[role=\"button\"]") || el;

  const clickElement = (el) => {
    const target = toClickable(el);
    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
  };

  const waitFor = async (finder, label, token, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      ensureRunning(token);
      const el = finder();
      if (el) {
        return el;
      }
      await sleep(300);
    }
    throw new Error(`${label} 未找到`);
  };

  const clickStep = async (finder, label, token) => {
    const el = await waitFor(finder, label, token);
    clickElement(el);
    await sleepWithAbort(getRandomClickDelayMs(), token);
  };

  const clickWithRandomDelay = async (el, token) => {
    clickElement(el);
    await sleepWithAbort(getRandomClickDelayMs(), token);
  };

  const findBuyTab = () =>
    findTextElement("p.css-1pof9oe", "买入") ||
    findTextElement("p,div,span", "买入");
  const findSellTab = () =>
    findTextElement("p.css-atrb4d", "卖出") ||
    findTextElement("p,div,span", "卖出");
  const findBuyConfirm = () =>
    findButtonByText(["button.button[data-variant=\"primary\"]", "button.button", "button"], "买入");
  const findBuyMaxButton = () => {
    const buttons = Array.from(document.querySelectorAll("button")).filter(
      (button) => isVisible(button) && !isInsideProbablePanel(button)
    );
    for (const button of buttons) {
      const text = normalizeText(button.textContent);
      if (text === "最大" || text.includes("最大")) {
        return button;
      }
    }
    return null;
  };
  const findSellConfirm = () => {
    const primary = findButtonByText(
      ["button.button[data-variant=\"primary\"]", "button[data-variant=\"primary\"]"],
      "卖出",
      { allowExact: true }
    );
    if (primary) {
      return primary;
    }
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const button of buttons) {
      if (!isVisible(button)) {
        continue;
      }
      const text = normalizeText(button.textContent);
      if (!text.includes("卖出")) {
        continue;
      }
      const variant = button.getAttribute("data-variant");
      if (variant === "destructive") {
        continue;
      }
      return button;
    }
    return null;
  };

  const findBuyAmountInput = () => {
    const inputs = Array.from(document.querySelectorAll("input"));
    let fallback = null;
    for (const input of inputs) {
      if (!isVisible(input)) {
        continue;
      }
      const placeholder = input.getAttribute("placeholder") || "";
      const inputMode = input.getAttribute("inputmode") || "";
      const type = input.getAttribute("type") || "";
      const className = input.className || "";
      const hasDollar = placeholder.includes("$");
      const isDecimal = inputMode === "decimal" || type === "number";
      if (hasDollar && isDecimal) {
        return input;
      }
      if (!fallback && hasDollar && className.includes("chakra-input")) {
        fallback = input;
      }
    }
    return fallback;
  };

  const isInsideProbablePanel = (el) => Boolean(el.closest("#probable-root"));

  const setNativeValue = (element, value) => {
    const proto = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  };

  const setRandomBuyAmount = async (token) => {
    if (shouldUseMaxBuy()) {
      await clickStep(findBuyMaxButton, "最大按钮", token);
      setStatus("已点击最大买入金额", "info");
      return;
    }
    const range = getBuyAmountRange();
    if (!range) {
      throw new Error("买入金额设置无效");
    }
    const input = await waitFor(findBuyAmountInput, "买入金额输入框", token);
    const amount = range.min + Math.random() * (range.max - range.min);
    const formatted = formatAmount(amount);
    setNativeValue(input, formatted);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setStatus(`已填写买入金额 ${formatted}$`, "info");
  };

  const getElementCenter = (el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const findNearestElement = (anchor, elements) => {
    if (!elements.length) {
      return null;
    }
    if (!anchor || !isVisible(anchor)) {
      return elements[0];
    }
    const anchorCenter = getElementCenter(anchor);
    let best = elements[0];
    let bestScore = Infinity;
    for (const el of elements) {
      const center = getElementCenter(el);
      const score = Math.hypot(center.x - anchorCenter.x, center.y - anchorCenter.y);
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  };

  const parseNumberText = (text) => {
    const cleaned = String(text || "").replace(/[^0-9.]/g, "");
    if (!cleaned) {
      return null;
    }
    const value = Number.parseFloat(cleaned);
    if (!Number.isFinite(value)) {
      return null;
    }
    return { value, cleaned };
  };

  const getInputPlaceholder = (input) =>
    input ? String(input.getAttribute("placeholder") || "").trim() : "";

  const isSharePlaceholder = (placeholder) =>
    placeholder === "0" || placeholder === "0.0" || placeholder.includes("份额");

  const findAmountInputContainer = (anchor) => {
    const containers = Array.from(document.querySelectorAll(".amount-input")).filter((el) =>
      isVisible(el)
    );
    return findNearestElement(anchor, containers);
  };

  const findShareAmountInput = (anchor) => {
    const container = findAmountInputContainer(anchor);
    const inputs = Array.from(document.querySelectorAll("input"));
    const candidates = inputs.filter((input) => {
      if (!isVisible(input) || isInsideProbablePanel(input)) {
        return false;
      }
      if (container && !container.contains(input)) {
        return false;
      }
      const placeholder = getInputPlaceholder(input);
      return placeholder && isSharePlaceholder(placeholder);
    });
    return findNearestElement(anchor, candidates);
  };

  const findSellAmountInput = (anchor) => {
    const shareInput = findShareAmountInput(anchor);
    if (shareInput) {
      return shareInput;
    }
    const container = findAmountInputContainer(anchor);
    const inputs = Array.from(document.querySelectorAll("input"));
    const candidates = inputs.filter((input) => {
      if (!isVisible(input)) {
        return false;
      }
      if (isInsideProbablePanel(input)) {
        return false;
      }
      if (container && !container.contains(input)) {
        return false;
      }
      const placeholder = getInputPlaceholder(input);
      const inputMode = input.getAttribute("inputmode") || "";
      const type = input.getAttribute("type") || "";
      const className = input.className || "";
      const hasDollar = placeholder.includes("$");
      const hasShares = placeholder.includes("份额");
      const hasZero = isSharePlaceholder(placeholder);
      const isDecimal = inputMode === "decimal" || type === "number" || type === "text";
      return isDecimal && (hasZero || hasShares || hasDollar || className.includes("chakra-input"));
    });
    return findNearestElement(anchor, candidates);
  };

  const getToggleHeadingText = (toggleEl) => {
    if (!toggleEl) {
      return "";
    }
    const heading = toggleEl.querySelector("h4");
    if (!heading) {
      return "";
    }
    return normalizeText(heading.textContent);
  };

  const findShareToggleElement = (anchor) => {
    const container = findAmountInputContainer(anchor);
    const scope = container || document;
    const stackCandidates = Array.from(scope.querySelectorAll("div.chakra-stack")).filter((el) => {
      if (!isVisible(el) || isInsideProbablePanel(el)) {
        return false;
      }
      const heading = el.querySelector("h4");
      if (!heading || !isVisible(heading) || isInsideProbablePanel(heading)) {
        return false;
      }
      const text = normalizeText(heading.textContent);
      return text === "份额" || text === "数量";
    });
    if (stackCandidates.length) {
      return findNearestElement(anchor, stackCandidates);
    }
    const headings = Array.from(scope.querySelectorAll("h4")).filter((el) => {
      if (!isVisible(el)) {
        return false;
      }
      if (isInsideProbablePanel(el)) {
        return false;
      }
      const text = normalizeText(el.textContent);
      return text === "份额" || text === "数量";
    });
    if (headings.length) {
      return findNearestElement(anchor, headings);
    }
    return null;
  };

  const isShareModeActive = (toggleEl, anchor) => {
    const headingText = getToggleHeadingText(toggleEl);
    if (headingText === "份额") {
      return true;
    }
    if (headingText === "数量") {
      return false;
    }
    const shareInput = findShareAmountInput(anchor || toggleEl);
    if (shareInput) {
      return true;
    }
    const candidateInput = findSellAmountInput(anchor || toggleEl);
    if (candidateInput) {
      const placeholder = getInputPlaceholder(candidateInput);
      if (placeholder.includes("$")) {
        return false;
      }
      if (isSharePlaceholder(placeholder)) {
        return true;
      }
    }
    if (!toggleEl) {
      return false;
    }
    const target = toggleEl.closest("[role=\"tab\"],button") || toggleEl;
    const attributes = [
      "aria-selected",
      "aria-pressed",
      "aria-current",
      "data-state",
      "data-active",
      "data-selected"
    ];
    for (const attr of attributes) {
      const value = target.getAttribute(attr);
      if (value === null) {
        continue;
      }
      const normalized = value.toLowerCase().trim();
      if (["true", "active", "on", "checked", "selected"].includes(normalized)) {
        return true;
      }
      if (["false", "inactive", "off"].includes(normalized)) {
        return false;
      }
    }
    const className = target.className || "";
    if (/\b(active|selected|is-active|is-selected)\b/i.test(className)) {
      return true;
    }
    return false;
  };

  const isNumericText = (text) => /^\d+(\.\d+)?$/.test(String(text || "").trim());

  const findShareValueElement = (anchor) => {
    const container = findAmountInputContainer(anchor);
    const scope = container || document;
    const primary = Array.from(
      scope.querySelectorAll("div.chakra-stack.css-12zalxq p.css-k1cltp")
    ).filter((el) => isVisible(el) && !isInsideProbablePanel(el));
    if (primary.length) {
      return findNearestElement(anchor, primary);
    }
    const fallback = Array.from(scope.querySelectorAll("p")).filter((el) => {
      if (!isVisible(el) || isInsideProbablePanel(el)) {
        return false;
      }
      const text = String(el.textContent || "").trim();
      return text && isNumericText(text) && !text.includes("$");
    });
    return findNearestElement(anchor, fallback);
  };

  const setSellAmountFromPosition = async (token) => {
    const sellConfirm = await waitFor(findSellConfirm, "卖出确认按钮", token, 8000);
    const shareToggle = findShareToggleElement(sellConfirm);
    const anchor = shareToggle || sellConfirm;
    const shareValueEl = await waitFor(
      () => findShareValueElement(anchor),
      "当前持有份额",
      token,
      8000
    );
    const parsed = parseNumberText(shareValueEl.textContent);
    if (!parsed) {
      throw new Error("当前持有份额无效");
    }
    const input = await waitFor(
      () => findSellAmountInput(anchor),
      "卖出份额输入框",
      token,
      8000
    );
    setNativeValue(input, parsed.cleaned);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setStatus(`已填写卖出份额 ${parsed.cleaned}`, "info");
  };

  const ensureSellShareMode = async (token) => {
    const sellConfirm = await waitFor(findSellConfirm, "卖出确认按钮", token, 8000);
    const shareToggle = await waitFor(
      () => findShareToggleElement(sellConfirm),
      "份额切换",
      token,
      8000
    );
    if (isShareModeActive(shareToggle, sellConfirm)) {
      return;
    }
    await clickWithRandomDelay(shareToggle, token);
    await waitFor(
      () => isShareModeActive(shareToggle, sellConfirm),
      "份额切换完成",
      token,
      8000
    );
  };

  const findPositionsTable = () => {
    const tables = Array.from(document.querySelectorAll("table"));
    let fallback = null;
    for (const table of tables) {
      if (!isVisible(table)) {
        continue;
      }
      const text = normalizeText(table.textContent);
      if (!text) {
        continue;
      }
      const hasResult = text.includes("结果");
      const hasQty = text.includes("数量");
      if (hasResult && hasQty) {
        return table;
      }
      if (!fallback && (hasResult || hasQty)) {
        fallback = table;
      }
    }
    return fallback;
  };

  const rowHasSellAction = (row) => {
    const buttons = row.querySelectorAll("button,[role=\"button\"]");
    for (const btn of buttons) {
      if (!isVisible(btn)) {
        continue;
      }
      const text = normalizeText(btn.textContent);
      if (text.includes("卖出")) {
        return true;
      }
    }
    return false;
  };

  const getPositionRows = () => {
    const table = findPositionsTable();
    if (!table) {
      return [];
    }
    const tbody = table.querySelector("tbody");
    const rows = Array.from((tbody || table).querySelectorAll("tr"));
    return rows.filter((row) => isVisible(row) && rowHasSellAction(row));
  };

  const hasPositions = () => getPositionRows().length > 0;

  const waitForPositionState = async (shouldExist, token, timeoutMs = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      ensureRunning(token);
      const exists = hasPositions();
      if (exists === shouldExist) {
        return;
      }
      await sleep(500);
    }
    throw new Error(shouldExist ? "持仓未出现" : "持仓未清空");
  };

  const waitForSellPanelReady = async (token) => {
    await waitFor(findSellConfirm, "卖出确认按钮", token, 8000);
  };

  const attemptSellUntilClear = async (token, retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      setStatus(`卖出尝试 ${attempt}/${retries}`, "info");
      await clickStep(findSellTab, "卖出按钮", token);
      await waitForSellPanelReady(token);
      await ensureSellShareMode(token);
      await setSellAmountFromPosition(token);
      await clickStep(findSellConfirm, "卖出确认", token);
      try {
        setStatus("等待持仓清空", "info");
        await waitForPositionState(false, token);
        return;
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        setStatus("持仓未清空，重试卖出", "warn");
        await sleepWithAbort(1000, token);
      }
    }
  };

  const reloadAfterSell = (token) => {
    ensureRunning(token);
    persistState({ resumeRun: true });
    setStatus("卖出完成，刷新页面", "info");
    setRunning(false);
    window.location.reload();
  };

  const runCycleMode1 = async (token) => {
    setStatus("模式1执行中：买入", "info");
    await clickStep(findBuyTab, "买入按钮", token);
    await setRandomBuyAmount(token);
    await clickStep(findBuyConfirm, "买入确认", token);
    setStatus("等待持仓出现", "info");
    await waitForPositionState(true, token);

    const waitMs = 30000 + Math.floor(Math.random() * 30001);
    setStatus(`等待 ${Math.round(waitMs / 1000)}s`, "info");
    await sleepWithAbort(waitMs, token);

    setStatus("模式1执行中：卖出", "info");
    await attemptSellUntilClear(token, 3);
    reloadAfterSell(token);
    return;
  };

  const runLoop = async (token) => {
    try {
      setStatus("开始运行", "info");
      while (running && token === runToken) {
        if (selectedMode === "market-market") {
          await runCycleMode1(token);
        } else {
          setStatus("该模式暂未实现", "warn");
          setRunning(false);
          break;
        }
      }
    } catch (error) {
      if (error && error.message === "stopped") {
        return;
      }
      const message = error && error.message ? error.message : String(error);
      setStatus(`出错: ${message}`, "error");
      setRunning(false);
    }
  };

  const resumeRunIfNeeded = async () => {
    if (!resumeAfterReload) {
      return;
    }
    resumeAfterReload = false;
    await sleep(2000);
    if (running) {
      return;
    }
    runToken += 1;
    setRunning(true);
    runLoop(runToken);
  };

  resumeRunIfNeeded();

  const getPoint = (event) => {
    if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    if (event.changedTouches && event.changedTouches[0]) {
      return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }
    return { x: event.clientX, y: event.clientY };
  };

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const onMove = (event) => {
    if (!dragging) {
      return;
    }
    event.preventDefault();
    const { x, y } = getPoint(event);
    const rect = root.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width - 8);
    const maxY = Math.max(0, window.innerHeight - rect.height - 8);
    const nextX = Math.min(Math.max(0, x - offsetX), maxX);
    const nextY = Math.min(Math.max(0, y - offsetY), maxY);
    root.style.left = `${nextX}px`;
    root.style.top = `${nextY}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
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
  };

  const onDown = (event) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    if (event.target && event.target.closest("button")) {
      return;
    }
    dragging = true;
    const rect = root.getBoundingClientRect();
    const { x, y } = getPoint(event);
    offsetX = x - rect.left;
    offsetY = y - rect.top;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  };

  header.addEventListener("mousedown", onDown);
  header.addEventListener("touchstart", onDown, { passive: false });
})();
