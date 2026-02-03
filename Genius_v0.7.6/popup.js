(() => {
  const STORAGE_KEYS = {
    enabled: "geniusSwapEnabled",
    count: "geniusSwapCount",
    configureAggregator: "geniusConfigureAggregator",
    aggregatorSettings: "geniusAggregatorSettings",
  };

  // 所有可用的聚合器
  const ALL_AGGREGATORS = {
    EVM: [
      "Odos", "KyberSwap", "OpenOcean", "OKX", "0x", "LiFi",
      "EvmDirectPool", "LFJ", "Algebra", "Ve33", "UniswapV2", "UniswapV3"
    ],
    Solana: [
      "Jupiter", "Raydium-V2", "OpenOcean", "OKX", "Lifinity", "DFlow", "PumpFun", "PumpSwap"
    ],
  };

  // 默认启用的聚合器
  const DEFAULT_ENABLED = {
    EVM: ["OKX", "UniswapV2", "UniswapV3"],
    Solana: ["OKX"],
  };

  const toggle = document.getElementById("enabledToggle");
  const statusText = document.getElementById("statusText");
  const countValue = document.getElementById("countValue");
  const configBtn = document.getElementById("configAggregatorBtn");
  const hintText = document.getElementById("hintText");
  const mainPanel = document.getElementById("mainPanel");
  const aggregatorPanel = document.getElementById("aggregatorPanel");
  const backBtn = document.getElementById("backBtn");
  const evmList = document.getElementById("evmAggregatorList");
  const solanaList = document.getElementById("solanaAggregatorList");
  const applyBtn = document.getElementById("applyAggregatorBtn");
  const aggregatorHintText = document.getElementById("aggregatorHintText");

  let currentAggregatorSettings = null;

  const getSettings = () =>
    new Promise((resolve) => {
      chrome.storage.local.get(
        {
          [STORAGE_KEYS.enabled]: false,
          [STORAGE_KEYS.count]: 0,
          [STORAGE_KEYS.aggregatorSettings]: null,
        },
        (result) => {
          resolve({
            enabled: Boolean(result[STORAGE_KEYS.enabled]),
            count: Number(result[STORAGE_KEYS.count] || 0),
            aggregatorSettings: result[STORAGE_KEYS.aggregatorSettings] || DEFAULT_ENABLED,
          });
        }
      );
    });

  const render = ({ enabled, count }) => {
    toggle.checked = enabled;
    statusText.textContent = enabled ? "Enabled" : "Disabled";
    statusText.dataset.state = enabled ? "on" : "off";
    countValue.textContent = String(count);
  };

  const onToggleChange = () => {
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: toggle.checked });
  };

  const showHint = (message, type = "") => {
    hintText.textContent = message;
    hintText.className = "hint-text" + (type ? ` ${type}` : "");
  };

  const showAggregatorHint = (message, type = "") => {
    aggregatorHintText.textContent = message;
    aggregatorHintText.className = "hint-text" + (type ? ` ${type}` : "");
  };

  const createAggregatorItem = (name, enabled, chain) => {
    const item = document.createElement("div");
    item.className = "aggregator-item";
    item.innerHTML = `
      <span class="aggregator-name">${name}</span>
      <label class="switch small">
        <input type="checkbox" data-chain="${chain}" data-name="${name}" ${enabled ? "checked" : ""} />
        <span class="slider"></span>
      </label>
    `;
    return item;
  };

  const renderAggregatorList = (settings) => {
    evmList.innerHTML = "";
    solanaList.innerHTML = "";

    ALL_AGGREGATORS.EVM.forEach((name) => {
      const enabled = settings.EVM?.includes(name) || false;
      evmList.appendChild(createAggregatorItem(name, enabled, "EVM"));
    });

    ALL_AGGREGATORS.Solana.forEach((name) => {
      const enabled = settings.Solana?.includes(name) || false;
      solanaList.appendChild(createAggregatorItem(name, enabled, "Solana"));
    });
  };

  const collectAggregatorSettings = () => {
    const settings = { EVM: [], Solana: [] };
    const checkboxes = aggregatorPanel.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      if (cb.checked) {
        const chain = cb.dataset.chain;
        const name = cb.dataset.name;
        if (chain && name) {
          settings[chain].push(name);
        }
      }
    });
    return settings;
  };

  const showAggregatorPanel = async () => {
    const { aggregatorSettings } = await getSettings();
    currentAggregatorSettings = aggregatorSettings;
    renderAggregatorList(aggregatorSettings);
    mainPanel.classList.add("hidden");
    aggregatorPanel.classList.remove("hidden");
  };

  const hideAggregatorPanel = () => {
    aggregatorPanel.classList.add("hidden");
    mainPanel.classList.remove("hidden");
  };

  const onApplyAggregator = async () => {
    const settings = collectAggregatorSettings();

    // 保存设置
    await chrome.storage.local.set({
      [STORAGE_KEYS.aggregatorSettings]: settings,
      [STORAGE_KEYS.configureAggregator]: Date.now(),
    });

    showAggregatorHint("设置已保存，请在页面中应用", "success");

    setTimeout(() => {
      hideAggregatorPanel();
      showHint("聚合器设置已更新", "success");
    }, 800);
  };

  const init = async () => {
    render(await getSettings());
    toggle.addEventListener("change", onToggleChange);
    configBtn.addEventListener("click", showAggregatorPanel);
    backBtn.addEventListener("click", hideAggregatorPanel);
    applyBtn.addEventListener("click", onApplyAggregator);
  };

  document.addEventListener("DOMContentLoaded", init);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    if (
      STORAGE_KEYS.enabled in changes ||
      STORAGE_KEYS.count in changes
    ) {
      getSettings().then(render);
    }
  });
})();
