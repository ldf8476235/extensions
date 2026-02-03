(() => {
  const STORAGE_KEYS = {
    enabled: "geniusSwapEnabled",
    count: "geniusSwapCount",
    targetVolume: "geniusSwapTargetVolume",
    localVolume: "geniusSwapLocalVolume", // 本地累计交易量
    baseVolume: "geniusSwapBaseVolume",   // API 基准交易量（启动时记录）
    aggregatorConfigured: "geniusAggregatorConfigured",
    configureAggregator: "geniusConfigureAggregator",
    aggregatorSettings: "geniusAggregatorSettings",
    walletAddress: "geniusSwapWalletAddress", // EVM 钱包地址缓存
    requestFingerprint: "geniusSwapRequestFingerprint", // 请求头指纹缓存
    pendingReload: "geniusSwapPendingReload", // F5 刷新后需要自动恢复
  };

  // 默认启用的聚合器
  const DEFAULT_ENABLED_AGGREGATORS = {
    EVM: ["OKX", "UniswapV2", "UniswapV3"],
    Solana: ["OKX"],
  };

  // 所有聚合器列表（用于配置）
  const ALL_AGGREGATORS = {
    EVM: [
      "Odos", "KyberSwap", "OpenOcean", "OKX", "0x", "LiFi",
      "EvmDirectPool", "LFJ", "Algebra", "Ve33", "UniswapV2", "UniswapV3"
    ],
    Solana: [
      "Jupiter", "Raydium-V2", "OpenOcean", "OKX", "Lifinity", "DFlow", "PumpFun", "PumpSwap"
    ],
  };

  // 交易量阈值（10万美元）
  const VOLUME_THRESHOLD = 100000;

  const PANEL_ID = "genius-swap-panel";
  const LOG_LIMIT = 80;
  const POLL_INTERVAL_MS = 250;
  const WAIT_TIMEOUT_MS = 20000;

  // 随机等待时间范围（毫秒）
  const WAIT_RANGES = {
    afterButton: { min: 800, max: 1500 },
    afterSavedTab: { min: 1500, max: 3000 },
    afterMax: { min: 3000, max: 6000 },
    afterConfirm: { min: 25000, max: 40000 },
    afterRefresh: { min: 2000, max: 4000 },
    betweenSwaps: { min: 2000, max: 5000 },
  };

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

  // API 拦截器 - 检测交易成功/失败
  let lastApiError = null;
  let lastApiErrorTime = 0;
  let lastTradeStatus = null; // "success" | "error" | null
  let lastTradeStatusTime = 0;
  let lastDomStatus = null; // "success" | "error" | null (DOM 检测到的状态)
  let lastDomStatusTime = 0;
  const STATUS_TTL = 30000; // 状态 30 秒有效

  // DOM 检测关键词
  const DOM_SUCCESS_KEYWORDS = ["已确认", "Confirmed", "交易成功", "Success", "Complete", "Completed"];
  const DOM_ERROR_KEYWORDS = ["提交订单时出错", "请重试", "失败", "Failed", "出错", "错误", "Rejected", "拒绝"];
  // 需要点刷新按钮的错误（不是直接失败，而是需要重试）
  const DOM_REFRESH_KEYWORDS = ["Rate limit exceeded", "rate limit", "生成报价失败", "不太聪明"];

  // 设置 DOM 状态（供 MutationObserver 调用）
  const setDomStatus = (status) => {
    lastDomStatus = status;
    lastDomStatusTime = Date.now();
  };

  // 获取 DOM 检测状态
  const getLastDomStatus = () => {
    if (lastDomStatus && Date.now() - lastDomStatusTime < STATUS_TTL) {
      const status = lastDomStatus;
      lastDomStatus = null; // 读取后清除
      return status;
    }
    return null;
  };

  // 清除 DOM 状态
  const clearDomStatus = () => {
    lastDomStatus = null;
    lastDomStatusTime = 0;
  };

  // 检测 DOM 中是否出现成功/失败关键词
  const checkDomForKeywords = (node) => {
    if (!node) return null;

    // 跳过扩展面板内的元素
    if (panelRefs?.container?.contains(node)) return null;

    const text = (node.textContent || node.innerText || '').trim();
    if (!text || text.length > 200) return null;

    // 跳过扩展面板的日志（包含特征文本）
    if (text.includes('停止循环') || text.includes('配置完成') || text.includes('已更改')) {
      return null;
    }

    // 检测需要刷新的错误（优先级最高，因为需要特殊处理）
    for (const keyword of DOM_REFRESH_KEYWORDS) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        return { status: 'refresh', keyword, text: text.slice(0, 50) };
      }
    }

    // 检测错误关键词
    for (const keyword of DOM_ERROR_KEYWORDS) {
      if (text.includes(keyword)) {
        return { status: 'error', keyword, text: text.slice(0, 50) };
      }
    }

    // 检测成功关键词
    for (const keyword of DOM_SUCCESS_KEYWORDS) {
      if (text.includes(keyword)) {
        return { status: 'success', keyword, text: text.slice(0, 50) };
      }
    }

    return null;
  };

  // 获取状态描述
  const getStatusDesc = (status) => {
    if (status === 'success') return '成功';
    if (status === 'error') return '错误';
    if (status === 'refresh') return '需要刷新';
    return status;
  };

  // 设置 DOM 变动监听器
  const setupDomObserver = () => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // 监听新增节点
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const result = checkDomForKeywords(node);
            if (result) {
              setDomStatus(result.status);
              console.log(`[Genius] DOM 检测到${getStatusDesc(result.status)}: "${result.keyword}" in "${result.text}"`);
              return;
            }
            // 也检查子元素
            if (node.querySelectorAll) {
              const children = node.querySelectorAll('*');
              for (const child of children) {
                const childResult = checkDomForKeywords(child);
                if (childResult) {
                  setDomStatus(childResult.status);
                  console.log(`[Genius] DOM 子元素检测到${getStatusDesc(childResult.status)}: "${childResult.keyword}"`);
                  return;
                }
              }
            }
          }
        }

        // 监听文本变化
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          const target = mutation.target;
          if (target && target.nodeType === Node.ELEMENT_NODE) {
            const result = checkDomForKeywords(target);
            if (result) {
              setDomStatus(result.status);
              console.log(`[Genius] DOM 文本变化检测到${getStatusDesc(result.status)}: "${result.keyword}"`);
              return;
            }
          }
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return observer;
  };

  // 监听音频播放事件
  const setupAudioListener = () => {
    // 监听所有 audio 元素的播放
    document.addEventListener('play', (e) => {
      if (e.target.tagName === 'AUDIO') {
        const src = e.target.src || e.target.currentSrc || '';
        if (src.includes('success')) {
          lastTradeStatus = 'success';
          lastTradeStatusTime = Date.now();
          console.log('[Genius] 检测到成功声音播放:', src);
        } else if (src.includes('error') || src.includes('fail')) {
          lastTradeStatus = 'error';
          lastTradeStatusTime = Date.now();
          console.log('[Genius] 检测到失败声音播放:', src);
        }
      }
    }, true);

    // 监听动态创建的 audio 元素
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.tagName === 'AUDIO') {
            const src = node.src || '';
            if (src.includes('success')) {
              lastTradeStatus = 'success';
              lastTradeStatusTime = Date.now();
              console.log('[Genius] 检测到成功声音元素:', src);
            }
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  const setupApiInterceptor = () => {
    // 启动音频监听
    setupAudioListener();
    // 启动 DOM 变动监听
    setupDomObserver();

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = args[0]?.toString() || '';

      // 检测 HTTP 400 错误（客户端错误，交易失败）
      // 不拦截 500 等服务器错误
      if (response.status === 400 && url.includes('tradegenius.com')) {
        lastTradeStatus = 'error';
        lastTradeStatusTime = Date.now();
        lastApiError = 'HTTP 400';
        lastApiErrorTime = Date.now();
        console.log('[Genius] HTTP 400 错误:', url);
        return response;
      }

      // 检测 index-balance-for-token API (带 tx_hash 说明是交易确认)
      if (url.includes('index-balance-for-token') && url.includes('tx_hash')) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          if (data.status === 'success') {
            lastTradeStatus = 'success';
            lastTradeStatusTime = Date.now();
            console.log('[Genius] 交易确认成功:', data.tx_hash);
          }
        } catch (e) {}
        return response;
      }

      // 检测 transferHistory API (交易历史记录)
      if (url.includes('/api/db/transferHistory')) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();
          // 检查最新一笔交易的状态
          if (Array.isArray(data) && data.length > 0) {
            const latest = data[0];
            if (latest.status === 'success' || latest.result?.decodedResponse?.status === 'success') {
              lastTradeStatus = 'success';
              lastTradeStatusTime = Date.now();
              console.log('[Genius] transferHistory 确认成功:', latest.txn);
            } else if (latest.result?.decodedResponse?.error) {
              lastTradeStatus = 'error';
              lastTradeStatusTime = Date.now();
              lastApiError = latest.result.decodedResponse.error;
              lastApiErrorTime = Date.now();
              console.log('[Genius] transferHistory 检测到错误:', latest.result.decodedResponse.error);
            }
          }
        } catch (e) {}
        return response;
      }

      // 检测其他 API 错误响应
      if (url.includes('tradegenius.com')) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();

          if (data) {
            let errorMsg = null;

            // 格式1: { success: false, message: "xxx" }
            if (data.success === false && data.message) {
              errorMsg = data.message;
            }
            // 格式2: { status: "error/fail", message: "xxx" }
            else if ((data.status === 'error' || data.status === 'fail') && data.message) {
              errorMsg = data.message;
            }
            // 格式3: { code: xxx, msg: "xxx" } (非0为错误)
            else if (data.code && data.code !== 0 && data.msg) {
              errorMsg = data.msg;
            }
            // 格式4: { error: "xxx" }
            else if (data.error) {
              errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
            }

            if (errorMsg) {
              lastApiError = errorMsg;
              lastApiErrorTime = Date.now();
              lastTradeStatus = 'error';
              lastTradeStatusTime = Date.now();
              console.log('[Genius] API 错误:', errorMsg);
            }
          }
        } catch (e) {}
      }

      return response;
    };
  };

  // 获取最近的 API 错误
  const getLastApiError = () => {
    if (lastApiError && Date.now() - lastApiErrorTime < STATUS_TTL) {
      const error = lastApiError;
      lastApiError = null;
      return error;
    }
    return null;
  };

  // 获取最近的交易状态
  const getLastTradeStatus = () => {
    if (lastTradeStatus && Date.now() - lastTradeStatusTime < STATUS_TTL) {
      const status = lastTradeStatus;
      lastTradeStatus = null; // 读取后清除
      return status;
    }
    return null;
  };

  // 清除交易状态（开始新交易时调用）
  const clearTradeStatus = () => {
    lastTradeStatus = null;
    lastTradeStatusTime = 0;
    lastApiError = null;
    lastApiErrorTime = 0;
    clearDomStatus(); // 同时清除 DOM 状态
  };

  // 启动拦截器
  setupApiInterceptor();

  let panelRefs = null;
  let panelObserver = null;
  let running = false;
  let stopRequested = false;
  let userPoints = null;
  let localVolumeAdded = 0; // 本次会话累加的交易量
  let cachedWalletAddress = null; // 缓存的钱包地址
  let cachedFingerprint = null; // 缓存的请求头指纹
  const logBuffer = [];

  // 随机等待时间
  const randomWait = (range) => {
    const ms = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
    return ms;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ==================== 请求头指纹生成和缓存 ====================

  // 生成随机请求头指纹（首次调用时生成，后续复用）
  const generateFingerprint = () => {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    ];
    const languages = ["en-US,en;q=0.9", "en-US,en;q=0.9,zh-CN;q=0.8", "zh-CN,zh;q=0.9,en;q=0.8"];
    const platforms = ["Win32", "MacIntel", "Linux x86_64"];

    return {
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
      acceptLanguage: languages[Math.floor(Math.random() * languages.length)],
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      timestamp: Date.now(),
    };
  };

  // 获取或生成请求头指纹（带缓存）
  const getFingerprint = async () => {
    // 优先使用内存缓存
    if (cachedFingerprint) {
      return cachedFingerprint;
    }

    // 尝试从 storage 加载
    if (chrome?.storage?.local) {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get({ [STORAGE_KEYS.requestFingerprint]: null }, resolve);
      });
      const stored = result[STORAGE_KEYS.requestFingerprint];
      if (stored) {
        cachedFingerprint = stored;
        return cachedFingerprint;
      }
    }

    // 首次生成并缓存
    cachedFingerprint = generateFingerprint();
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEYS.requestFingerprint]: cachedFingerprint });
    }
    addLog("已生成请求头指纹并缓存");
    return cachedFingerprint;
  };

  // 构建带指纹的请求头
  const buildHeaders = async (additionalHeaders = {}) => {
    const fp = await getFingerprint();
    return {
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": fp.acceptLanguage,
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      ...additionalHeaders,
    };
  };

  // ==================== 钱包地址获取和缓存 ====================

  // 从页面 localStorage 获取钱包地址（备选方案）
  const getWalletAddressFromLocalStorage = () => {
    try {
      // 遍历 localStorage 查找钱包地址
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        if (!value) continue;

        // 查找 EVM 地址格式
        const match = value.match(/0x[a-fA-F0-9]{40}/);
        if (match) {
          // 跳过合约地址等常见的非钱包地址
          const addr = match[0].toLowerCase();
          // 跳过常见的合约地址（USDT、KOGE 等）
          if (addr === '0x55d398326f99059ff775485246999027b3197955' ||
              addr === '0xe6df05ce8c8301223373cf5b969afcb1498c5528') {
            continue;
          }
          console.log("[Genius] 从 localStorage 获取到钱包地址:", match[0], "key:", key);
          return match[0];
        }
      }
    } catch (e) {
      console.log("[Genius] 读取 localStorage 失败:", e);
    }
    return null;
  };

  // 从页面 DOM 获取钱包地址（备选方案）
  const getWalletAddressFromPage = () => {
    // 尝试从页面上的钱包显示元素获取
    const patterns = [
      /0x[a-fA-F0-9]{40}/,  // 完整地址
    ];

    // 查找包含地址的元素
    const elements = document.querySelectorAll('[class*="address"], [class*="wallet"], [data-address]');
    for (const el of elements) {
      const text = el.textContent || el.getAttribute('data-address') || '';
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          console.log("[Genius] 从页面 DOM 获取到钱包地址:", match[0]);
          return match[0];
        }
      }
    }

    // 也尝试从 URL 参数获取
    const urlParams = new URLSearchParams(window.location.search);
    const addressParam = urlParams.get('address') || urlParams.get('wallet');
    if (addressParam && /^0x[a-fA-F0-9]{40}$/.test(addressParam)) {
      console.log("[Genius] 从 URL 参数获取到钱包地址:", addressParam);
      return addressParam;
    }

    return null;
  };

  // 获取或缓存钱包地址
  const getWalletAddress = async () => {
    // 优先使用内存缓存
    if (cachedWalletAddress) {
      console.log("[Genius] getWalletAddress: 使用内存缓存", cachedWalletAddress);
      return cachedWalletAddress;
    }

    // 尝试从 storage 加载
    if (chrome?.storage?.local) {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get({ [STORAGE_KEYS.walletAddress]: null }, resolve);
      });
      const stored = result[STORAGE_KEYS.walletAddress];
      // 验证存储的地址是否有效（必须是 0x 开头的地址）
      if (stored && typeof stored === 'string' && stored.startsWith('0x') && stored.length === 42) {
        cachedWalletAddress = stored;
        console.log("[Genius] getWalletAddress: 使用 storage 缓存", cachedWalletAddress);
        return cachedWalletAddress;
      } else if (stored) {
        // 清除无效的缓存
        console.log("[Genius] getWalletAddress: 清除无效缓存", stored);
        chrome.storage.local.remove(STORAGE_KEYS.walletAddress);
      }
    }

    // 方案1: 从 genius-total-points API 获取
    console.log("[Genius] getWalletAddress: 从 API 获取...");
    const data = await fetchPoints();
    // wallets 可能在 data.wallets 或 data.geniusPoints.wallets
    const wallets = data?.wallets || data?.geniusPoints?.wallets;
    console.log("[Genius] getWalletAddress: API 返回 wallets:", wallets);
    if (wallets?.EVM) {
      cachedWalletAddress = wallets.EVM;
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEYS.walletAddress]: cachedWalletAddress });
      }
      addLog(`已获取钱包地址: ${cachedWalletAddress.slice(0, 8)}...`);
      console.log("[Genius] getWalletAddress: 获取成功", cachedWalletAddress);
      return cachedWalletAddress;
    }

    // 方案2: 从 localStorage 获取（备选）
    console.log("[Genius] getWalletAddress: API 获取失败，尝试从 localStorage 获取...");
    const localStorageAddress = getWalletAddressFromLocalStorage();
    if (localStorageAddress) {
      cachedWalletAddress = localStorageAddress;
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEYS.walletAddress]: cachedWalletAddress });
      }
      addLog(`从 localStorage 获取钱包地址: ${cachedWalletAddress.slice(0, 8)}...`);
      return cachedWalletAddress;
    }

    // 方案3: 从页面 DOM 获取（备选）
    console.log("[Genius] getWalletAddress: 尝试从页面 DOM 获取...");
    const pageAddress = getWalletAddressFromPage();
    if (pageAddress) {
      cachedWalletAddress = pageAddress;
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEYS.walletAddress]: cachedWalletAddress });
      }
      addLog(`从页面获取钱包地址: ${cachedWalletAddress.slice(0, 8)}...`);
      return cachedWalletAddress;
    }

    console.log("[Genius] getWalletAddress: 所有方案都失败，data=", data);
    return null;
  };

  // ==================== Portfolio API 余额查询 ====================

  // 查询 portfolio 资产余额
  const fetchPortfolioAssets = async () => {
    const address = await getWalletAddress();
    if (!address) {
      console.log("[Genius] fetchPortfolioAssets: 无法获取钱包地址");
      return null;
    }

    try {
      const headers = await buildHeaders();
      const url = `https://staging-api.tradegenius.com/indexer/portfolio/assets?address=${address}`;
      console.log("[Genius] fetchPortfolioAssets 请求:", url);
      const response = await fetch(url, {
        credentials: "include",
        headers,
      });
      if (!response.ok) {
        console.log("[Genius] fetchPortfolioAssets 响应失败:", response.status);
        return null;
      }
      const data = await response.json();
      console.log("[Genius] fetchPortfolioAssets 返回数据:", JSON.stringify(data).slice(0, 500));
      return data;
    } catch (err) {
      console.error("[Genius] 获取 portfolio 失败:", err);
      return null;
    }
  };

  // 从 portfolio 数据中提取 KOGE 和 USDT 余额
  const extractBalances = (portfolioData) => {
    if (!portfolioData) {
      console.log("[Genius] extractBalances: portfolioData 为空");
      return { koge: 0, usdt: 0 };
    }

    let koge = 0;
    let usdt = 0;

    // API 返回格式: { data: [{ chainId, balances: [...] }, ...] }
    // 需要遍历 data 数组，找到 BSC (chainId=56) 的 balances
    const dataArray = portfolioData.data;
    console.log("[Genius] extractBalances: dataArray 类型:", typeof dataArray, "是数组:", Array.isArray(dataArray));

    if (Array.isArray(dataArray)) {
      for (const chain of dataArray) {
        // 只看 BSC 链 (chainId=56)
        if (chain.chainId !== 56) continue;

        console.log("[Genius] 找到 BSC 链数据, balances 数量:", chain.balances?.length);
        const balances = chain.balances;
        if (!Array.isArray(balances)) continue;

        for (const token of balances) {
          const symbol = (token.contract_ticker_symbol || token.contract_name || "").toUpperCase();
          // 使用 formatted_balance 字段（已经是数字格式）
          const amount = parseFloat(token.formatted_balance || 0);
          console.log("[Genius] 代币:", symbol, "余额:", amount);

          if (symbol === "KOGE" || symbol.includes("BNB48")) {
            koge = amount;
          } else if (symbol === "USDT" || symbol.includes("TETHER")) {
            usdt = amount;
          }
        }
      }
    }

    console.log("[Genius] extractBalances 结果: KOGE=", koge, "USDT=", usdt);
    return { koge, usdt };
  };

  // 检测余额变化来判断 swap 是否成功
  const checkBalanceChange = (beforeBalances, afterBalances) => {
    const kogeDiff = afterBalances.koge - beforeBalances.koge;
    const usdtDiff = afterBalances.usdt - beforeBalances.usdt;

    // 如果 KOGE 或 USDT 有明显变化（阈值 0.01），认为 swap 成功
    const threshold = 0.01;
    const hasChange = Math.abs(kogeDiff) > threshold || Math.abs(usdtDiff) > threshold;

    return {
      hasChange,
      kogeDiff,
      usdtDiff,
    };
  };

  const sleepRandom = async (range) => {
    const ms = randomWait(range);
    await sleep(ms);
    return ms;
  };

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
        resolve({ enabled: false, count: 0, localVolume: 0, baseVolume: 0, aggregatorSettings: DEFAULT_ENABLED_AGGREGATORS });
        return;
      }
      chrome.storage.local.get(
        {
          [STORAGE_KEYS.enabled]: false,
          [STORAGE_KEYS.count]: 0,
          [STORAGE_KEYS.targetVolume]: VOLUME_THRESHOLD,
          [STORAGE_KEYS.localVolume]: 0,
          [STORAGE_KEYS.baseVolume]: 0,
          [STORAGE_KEYS.aggregatorSettings]: null,
        },
        (result) => {
          resolve({
            enabled: Boolean(result[STORAGE_KEYS.enabled]),
            count: Number(result[STORAGE_KEYS.count] || 0),
            targetVolume: Number(result[STORAGE_KEYS.targetVolume] || VOLUME_THRESHOLD),
            localVolume: Number(result[STORAGE_KEYS.localVolume] || 0),
            baseVolume: Number(result[STORAGE_KEYS.baseVolume] || 0),
            aggregatorSettings: result[STORAGE_KEYS.aggregatorSettings] || DEFAULT_ENABLED_AGGREGATORS,
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

  // 从页面获取当前交易金额（USDT 数量）
  const getSwapAmountFromPage = () => {
    // 查找 AmountInput 输入框
    const amountInput = document.querySelector('input[data-sentry-element="AmountInput"]');
    if (amountInput) {
      // 优先从 DOM 属性读取（React 可能不更新 .value）
      const attrValue = amountInput.getAttribute('value');
      const propValue = amountInput.value;
      const rawValue = (attrValue || propValue || '').replace(/,/g, '');
      const value = parseFloat(rawValue);
      if (!isNaN(value) && value > 0) {
        return value;
      }
    }
    return 0;
  };

  // 累加本地交易量
  const addLocalVolume = async (amount) => {
    if (!chrome || !chrome.storage || !chrome.storage.local || amount <= 0) {
      return;
    }
    const { localVolume } = await getSettings();
    const newVolume = localVolume + amount;
    localVolumeAdded += amount;
    chrome.storage.local.set({ [STORAGE_KEYS.localVolume]: newVolume });
    addLog(`本次交易 $${amount.toFixed(2)}，本地累计 +$${localVolumeAdded.toFixed(2)}`);
  };

  // 设置 API 基准交易量
  const setBaseVolume = async (volume) => {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEYS.baseVolume]: volume });
  };



  // 获取有效交易量（API 数据 + 本地累加，API 更新后扣除已同步部分）
  //
  // 计算逻辑：
  // - baseVolume: 启动时记录的 API 交易量
  // - localVolume: 本地累计的交易量（当天刷的）
  // - apiVolume: 当前 API 返回的交易量
  //
  // 例子：
  // 1. 启动时 API=1万，baseVolume=1万，localVolume=0
  // 2. 刷了 3万，localVolume=3万，有效交易量 = 1万 + 3万 = 4万
  // 3. API 更新到 2万（同步了 1万），apiVolume=2万
  // 4. API 新增 = 2万 - 1万 = 1万
  // 5. 本地应扣除 1万，localVolume = 3万 - 1万 = 2万
  // 6. 更新 baseVolume=2万
  // 7. 有效交易量 = 2万 + 2万 = 4万
  //
  const getEffectiveVolume = async () => {
    const apiVolume = userPoints?.geniusPoints?.volumeCompleted || 0;
    const { localVolume, baseVolume } = await getSettings();

    // 如果 API 数据已更新（比基准值大），扣除已同步部分
    if (apiVolume > baseVolume + 0.01) { // 0.01 避免浮点误差
      const apiIncrement = apiVolume - baseVolume; // API 新增的部分
      const newLocalVolume = Math.max(0, localVolume - apiIncrement); // 本地扣除已同步部分

      addLog(`API 已同步 $${apiIncrement.toFixed(2)}，本地累计从 $${localVolume.toFixed(2)} 扣除为 $${newLocalVolume.toFixed(2)}`);

      // 更新基准值和本地累计
      await setBaseVolume(apiVolume);
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEYS.localVolume]: newLocalVolume });
      }
      // 同步内存变量
      localVolumeAdded = Math.max(0, localVolumeAdded - apiIncrement);

      return apiVolume + newLocalVolume;
    }

    // API 没更新，使用基准值 + 本地累加
    return baseVolume + localVolume;
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

  // 获取积分数据
  const fetchPoints = async () => {
    try {
      const response = await fetch("https://www.tradegenius.com/api/indexer/genius-total-points", {
        credentials: "include",
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data;
    } catch (err) {
      console.error("获取积分失败:", err);
      return null;
    }
  };

  // 更新积分显示
  const updatePointsDisplay = async (useEffectiveVolume = false) => {
    if (!panelRefs?.pointsValue || !panelRefs?.apiVolumeValue || !panelRefs?.localVolumeValue) {
      return;
    }
    const data = await fetchPoints();
    if (!data?.geniusPoints) {
      panelRefs.pointsValue.textContent = "--";
      panelRefs.apiVolumeValue.textContent = "--";
      panelRefs.localVolumeValue.textContent = "--";
      if (panelRefs.loopHint) {
        panelRefs.loopHint.textContent = "无法获取数据";
        panelRefs.loopHint.style.color = "#dc2626";
      }
      return;
    }
    userPoints = data;
    const points = data.geniusPoints.geniusPoints || 0;
    const apiVolume = data.geniusPoints.volumeCompleted || 0;

    // 获取本地累计交易量
    const { localVolume, targetVolume } = await getSettings();

    // 如果需要计算有效交易量，先处理同步逻辑
    if (useEffectiveVolume) {
      await getEffectiveVolume();
    }

    // 显示积分
    panelRefs.pointsValue.textContent = points.toLocaleString();

    // 显示官网交易量（API 返回值）
    panelRefs.apiVolumeValue.textContent = `$${apiVolume.toFixed(1)}`;

    // 显示本地交易量（本地累计值）
    panelRefs.localVolumeValue.textContent = `$${localVolume.toFixed(1)}`;

    // 计算有效交易量用于判断进度
    const effectiveVolume = apiVolume + localVolume;

    // 更新循环模式提示
    if (panelRefs.loopHint) {
      if (effectiveVolume >= VOLUME_THRESHOLD) {
        // 已达到10万，显示已完成
        panelRefs.loopHint.textContent = `已达10万交易量`;
        panelRefs.loopHint.style.color = "#059669";
      } else {
        // 未达10万，显示剩余
        const remaining = VOLUME_THRESHOLD - effectiveVolume;
        panelRefs.loopHint.textContent = `距10万还差 $${remaining.toFixed(0)}`;
        panelRefs.loopHint.style.color = "#0ea5e9";
      }
    }

    // 始终显示目标交易量输入框
    if (panelRefs.targetRow) {
      panelRefs.targetRow.style.display = "flex";
    }
    if (panelRefs.targetVolumeInput && targetVolume) {
      panelRefs.targetVolumeInput.value = String(targetVolume);
    }
  };

  const renderPanel = ({ enabled }) => {
    if (!panelRefs) {
      return;
    }
    panelRefs.toggle.checked = enabled;
    panelRefs.status.textContent = enabled ? "Enabled" : "Disabled";
    panelRefs.status.dataset.state = enabled ? "on" : "off";
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
        <div class="gsh-title-wrap">
          <div class="gsh-title">Genius Swap</div>
          <button class="gsh-refresh-btn" id="gsh-refresh-points" title="刷新">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>
        <div class="gsh-status" id="gsh-status">Disabled</div>
      </div>
      <div class="gsh-stats-col">
        <div class="gsh-stat-row">
          <div class="gsh-stat-label">积分</div>
          <div class="gsh-stat-value" id="gsh-points">--</div>
        </div>
        <div class="gsh-stat-row">
          <div class="gsh-stat-label">官方交易量</div>
          <div class="gsh-stat-value" id="gsh-api-volume">--</div>
        </div>
        <div class="gsh-stat-row">
          <div class="gsh-stat-label">本地交易量</div>
          <div class="gsh-stat-value" id="gsh-local-volume">--</div>
        </div>
      </div>
      <div class="gsh-row">
        <div>
          <div class="gsh-label">Enable auto swap</div>
          <div class="gsh-hint" id="gsh-loop-hint">加载中...</div>
        </div>
        <label class="gsh-switch">
          <input type="checkbox" id="gsh-toggle" />
          <span class="gsh-slider"></span>
        </label>
      </div>
      <div class="gsh-row gsh-target-row" id="gsh-target-row" style="display: none;">
        <div>
          <div class="gsh-label">目标交易量</div>
          <div class="gsh-hint">达到后停止循环</div>
        </div>
        <div class="gsh-target-input-wrap">
          <span class="gsh-target-prefix">$</span>
          <input class="gsh-input gsh-target-input" id="gsh-target-volume" type="number" min="100000" step="10000" value="100000" />
        </div>
      </div>
      <div class="gsh-row gsh-row-btn">
        <button class="gsh-btn" id="gsh-config-aggregator">配置聚合器</button>
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
    const targetVolumeInput = panel.querySelector("#gsh-target-volume");
    const targetRow = panel.querySelector("#gsh-target-row");
    const configAggregatorBtn = panel.querySelector("#gsh-config-aggregator");
    const pointsValue = panel.querySelector("#gsh-points");
    const apiVolumeValue = panel.querySelector("#gsh-api-volume");
    const localVolumeValue = panel.querySelector("#gsh-local-volume");
    const refreshPointsBtn = panel.querySelector("#gsh-refresh-points");
    const loopHint = panel.querySelector("#gsh-loop-hint");

    panelRefs = {
      toggle,
      status,
      logs,
      targetVolumeInput,
      targetRow,
      configAggregatorBtn,
      container: panel,
      pointsValue,
      apiVolumeValue,
      localVolumeValue,
      refreshPointsBtn,
      loopHint,
    };

    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        const currentVolume = userPoints?.geniusPoints?.volumeCompleted || 0;
        const targetVolume = Number(targetVolumeInput.value) || VOLUME_THRESHOLD;

        // 检查目标交易量是否有效
        if (targetVolume <= currentVolume) {
          addLog(`当前交易量 $${currentVolume.toFixed(1)} 已达到目标 $${targetVolume}`);
          toggle.checked = false;
          return;
        }

        chrome.storage.local.set({
          [STORAGE_KEYS.targetVolume]: targetVolume,
          [STORAGE_KEYS.enabled]: true,
        });
        addLog(`已开启，目标交易量: $${targetVolume.toLocaleString()}`);
      } else {
        chrome.storage.local.set({ [STORAGE_KEYS.enabled]: false });
        addLog("已关闭");
      }
    });

    targetVolumeInput.addEventListener("change", () => {
      let value = Number(targetVolumeInput.value) || VOLUME_THRESHOLD;
      if (value < VOLUME_THRESHOLD) {
        value = VOLUME_THRESHOLD;
      }
      targetVolumeInput.value = String(value);
      chrome.storage.local.set({ [STORAGE_KEYS.targetVolume]: value });
    });

    configAggregatorBtn.addEventListener("click", async () => {
      configAggregatorBtn.disabled = true;
      configAggregatorBtn.textContent = "配置中...";
      try {
        await configureAggregators();
      } finally {
        configAggregatorBtn.disabled = false;
        configAggregatorBtn.textContent = "配置聚合器";
      }
    });

    refreshPointsBtn.addEventListener("click", async () => {
      refreshPointsBtn.disabled = true;
      await updatePointsDisplay();
      refreshPointsBtn.disabled = false;
    });

    getSettings().then((settings) => {
      renderPanel(settings);
      renderLogs();
    });

    // 初始加载积分
    updatePointsDisplay();
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
    const waitMs = await sleepRandom(WAIT_RANGES.afterButton);
    addLog(`已点击来源按钮，等待${(waitMs / 1000).toFixed(1)}秒`);

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
    const waitMs = await sleepRandom(WAIT_RANGES.afterButton);
    logStep(flow, `已点击目标按钮，等待${(waitMs / 1000).toFixed(1)}秒`);

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
    const waitMs2 = await sleepRandom(WAIT_RANGES.afterSavedTab);
    logStep(flow, `已点击已保存，等待${(waitMs2 / 1000).toFixed(1)}秒`);

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

  // 检测需要刷新的报价错误
  const findRefreshError = () => {
    const REFRESH_ERROR_TEXTS = ["Rate limit exceeded", "rate limit", "生成报价失败", "不太聪明"];
    for (const text of REFRESH_ERROR_TEXTS) {
      const fuzzy = findClickableByText(text, document.body);
      if (fuzzy && isVisible(fuzzy) && !panelRefs?.container?.contains(fuzzy)) {
        return text;
      }
    }
    return null;
  };

  // 点击页面上的刷新按钮
  const clickPageRefreshButton = async () => {
    // 查找页面上的"刷新"按钮（不是扩展面板的）
    const refreshTexts = ["刷新", "Refresh", "重试", "Retry"];
    for (const text of refreshTexts) {
      const btn = findClickableByText(text, document.body);
      if (btn && isVisible(btn) && !panelRefs?.container?.contains(btn)) {
        clickEl(btn);
        return true;
      }
    }
    return false;
  };

  const stepThreeClickMax = async (flow) => {
    logStep(flow, "步骤3：点击MAX");
    const maxButton = await waitFor(findMaxButton);
    if (!maxButton) {
      logStep(flow, "未找到MAX按钮");
      return { success: false, needRefresh: false };
    }
    maxButton.scrollIntoView({ block: "center", inline: "nearest" });
    clickEl(maxButton);
    const waitMs = await sleepRandom(WAIT_RANGES.afterMax);
    logStep(flow, `已点击MAX，等待${(waitMs / 1000).toFixed(1)}秒`);

    // 检测是否有报价错误（Rate limit / 不太聪明）
    const refreshError = findRefreshError();
    if (refreshError) {
      logStep(flow, `检测到报价错误: "${refreshError}"，尝试点击刷新...`);
      const clicked = await clickPageRefreshButton();
      if (clicked) {
        logStep(flow, "已点击刷新按钮，等待重新报价...");
        await sleepRandom(WAIT_RANGES.afterRefresh);
        // 再次检测是否还有错误
        const stillError = findRefreshError();
        if (stillError) {
          logStep(flow, `刷新后仍有错误: "${stillError}"，需要重试`);
          return { success: false, needRefresh: true };
        }
      } else {
        logStep(flow, "未找到刷新按钮");
        return { success: false, needRefresh: true };
      }
    }

    return { success: true, needRefresh: false };
  };

  // 检测页面上的错误提示
  const ERROR_TEXTS = ["提交订单时出错", "请重试", "交易失败", "Error", "Failed"];

  const findPageError = () => {
    for (const text of ERROR_TEXTS) {
      const elements = findElementsByExactText(text, document.body);
      for (const el of elements) {
        if (isVisible(el) && !panelRefs?.container?.contains(el)) {
          return text;
        }
      }
      // 也检查包含该文本的元素
      const fuzzy = findClickableByText(text, document.body);
      if (fuzzy && isVisible(fuzzy) && !panelRefs?.container?.contains(fuzzy)) {
        return text;
      }
    }
    return null;
  };

  const stepFourClickConfirm = async (flow) => {
    logStep(flow, "步骤4：点击确认");
    const confirmButton = await waitFor(findConfirmButton);
    if (!confirmButton) {
      logStep(flow, "未找到确认按钮，尝试找Close按钮");
      // 尝试找 Close 按钮（可能是报价失败等情况）
      const closeButton = await waitFor(findCloseButton, 3000);
      if (closeButton) {
        clickEl(closeButton);
        logStep(flow, "已点击Close按钮，将重试");
        await sleep(randomWait(WAIT_RANGES.betweenSwaps));
      }
      // 返回需要重试的状态
      return { success: false, confirmed: false, error: false, needRetry: true };
    }

    // 点击确认前记录余额和清除状态
    const beforeData = await fetchPortfolioAssets();
    const beforeBalances = extractBalances(beforeData);
    logStep(flow, `交易前余额: KOGE=${beforeBalances.koge.toFixed(4)}, USDT=${beforeBalances.usdt.toFixed(2)}`);
    clearTradeStatus();

    confirmButton.scrollIntoView({ block: "center", inline: "nearest" });
    clickEl(confirmButton);
    logStep(flow, "已点击确认，等待交易完成...");

    // 最多重试 5 轮，每轮使用 afterConfirm 等待时间 (25-40秒)
    const maxRetries = 5;
    const checkIntervalMs = 500; // 每 0.5 秒检测一次 DOM

    for (let retry = 0; retry < maxRetries; retry++) {
      const waitMs = randomWait(WAIT_RANGES.afterConfirm);
      const waitSec = (waitMs / 1000).toFixed(0);
      logStep(flow, `第 ${retry + 1} 轮等待 ${waitSec} 秒...`);

      // 在等待期间持续检测 DOM 变化（每 0.5 秒检测一次）
      const startTime = Date.now();
      while (Date.now() - startTime < waitMs) {
        // 1. 检测 DOM 状态（错误弹窗立即关闭并返回）
        const domStatus = getLastDomStatus();
        if (domStatus === 'error') {
          logStep(flow, "DOM 检测到错误弹窗，尝试关闭...");
          // 立即尝试关闭错误弹窗
          const closeBtn = await waitFor(findCloseButton, 2000);
          if (closeBtn) {
            clickEl(closeBtn);
            logStep(flow, "已关闭错误弹窗");
            await sleep(500);
          }
          return { success: true, confirmed: false, error: true };
        }
        if (domStatus === 'success') {
          logStep(flow, "DOM 检测到成功状态，交易成功!");
          return { success: true, confirmed: true, error: false };
        }

        // 2. 检测声音/API 成功信号
        const tradeStatus = getLastTradeStatus();
        if (tradeStatus === 'success') {
          logStep(flow, "检测到成功信号（声音/API），交易成功!");
          return { success: true, confirmed: true, error: false };
        }
        if (tradeStatus === 'error') {
          logStep(flow, "API 检测到错误，尝试关闭弹窗...");
          const closeBtn = await waitFor(findCloseButton, 2000);
          if (closeBtn) {
            clickEl(closeBtn);
            logStep(flow, "已关闭错误弹窗");
            await sleep(500);
          }
          return { success: true, confirmed: false, error: true };
        }

        // 3. 检测页面错误文本（静态检测）
        const pageError = findPageError();
        if (pageError) {
          logStep(flow, `检测到页面错误: "${pageError}"，尝试关闭弹窗...`);
          const closeBtn = await waitFor(findCloseButton, 2000);
          if (closeBtn) {
            clickEl(closeBtn);
            logStep(flow, "已关闭错误弹窗");
            await sleep(500);
          }
          return { success: true, confirmed: false, error: true };
        }

        await sleep(checkIntervalMs);
      }

      // 每轮结束时检测余额变化
      const afterData = await fetchPortfolioAssets();
      const afterBalances = extractBalances(afterData);
      const changeResult = checkBalanceChange(beforeBalances, afterBalances);
      if (changeResult.hasChange) {
        logStep(flow, `余额变化检测到交易成功! KOGE: ${changeResult.kogeDiff > 0 ? "+" : ""}${changeResult.kogeDiff.toFixed(4)}, USDT: ${changeResult.usdtDiff > 0 ? "+" : ""}${changeResult.usdtDiff.toFixed(2)}`);
        return { success: true, confirmed: true, error: false };
      }

      if (retry < maxRetries - 1) {
        logStep(flow, "未检测到成功信号，继续下一轮...");
      }
    }

    // 所有轮次都没有检测到成功信号，认定失败
    logStep(flow, "5轮检测均未检测到成功信号，交易失败");
    return { success: true, confirmed: false, error: true };
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
      return { status: reason === "no_source" ? "no_source" : "failed", amount: 0 };
    }
    const targetSelected = await stepTwoSelectTarget(flow);
    if (!targetSelected) {
      return { status: "failed", amount: 0 };
    }
    const maxResult = await stepThreeClickMax(flow);
    if (!maxResult.success) {
      // 如果是报价错误需要刷新，返回 refresh 状态让外层重试
      if (maxResult.needRefresh) {
        return { status: "refresh", amount: 0 };
      }
      return { status: "failed", amount: 0 };
    }

    // 点击 MAX 后获取交易金额
    const swapAmount = getSwapAmountFromPage();
    if (swapAmount > 0) {
      logStep(flow, `检测到交易金额: $${swapAmount.toFixed(2)}`);
    }

    const confirmResult = await stepFourClickConfirm(flow);
    if (!confirmResult.success) {
      return { status: "failed", amount: 0 };
    }

    // 如果检测到页面错误，尝试关闭错误弹窗
    if (confirmResult.error) {
      logStep(flow, "尝试关闭错误弹窗...");
      // 尝试点击 X 或 Close 按钮关闭弹窗
      const closeBtn = await waitFor(findCloseButton, 3000);
      if (closeBtn) {
        clickEl(closeBtn);
        await sleep(500);
      }
      // 返回 error 状态，让循环可以继续重试
      return { status: "error", amount: 0 };
    }

    const closed = await stepFiveClickClose(flow);
    if (!closed) {
      return { status: "failed", amount: 0 };
    }

    // 通过余额变化判断交易是否成功
    if (confirmResult.confirmed) {
      await incrementCount();
      if (swapAmount > 0) {
        await addLocalVolume(swapAmount);
      }
      return { status: "ok", flow, amount: swapAmount };
    } else {
      // 余额没变化，视为失败
      logStep(flow, "交易失败，不累加交易量");
      return { status: "failed", amount: 0 };
    }
  };

  const runSwapCycle = async () => {
    const result = await runSingleSwap(null);
    if (result?.status === "ok") {
      return "ok";
    }
    if (result?.status === "no_source") {
      return "no_source";
    }
    if (result?.status === "error") {
      return "error"; // 页面错误，可以重试
    }
    if (result?.status === "refresh") {
      return "refresh"; // 报价错误，需要刷新重试
    }
    return "failed";
  };

  const refreshAfterNoSource = async () => {
    addLog("未检测到代币，查询余额确认...");

    // 先查询余额 API，确认是否真的有余额
    const portfolioData = await fetchPortfolioAssets();
    const balances = extractBalances(portfolioData);
    const hasBalance = balances.koge > 0.01 || balances.usdt > 0.01;

    if (hasBalance) {
      // 有余额但页面没显示，说明页面状态不同步，需要 F5 刷新整个页面
      addLog(`API 余额: KOGE=${balances.koge.toFixed(4)}, USDT=${balances.usdt.toFixed(2)}`);
      addLog("有余额但页面未显示，F5 刷新整个页面...");

      // 设置标记，刷新后自动恢复运行
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEYS.pendingReload]: true });
      }

      await sleep(2000); // 等待 2 秒再刷新
      window.location.reload();
      // 刷新后脚本会重新加载，返回 true 表示已处理
      return true;
    }

    // 没有余额，使用原来的刷新按钮逻辑
    const waitMs = await sleepRandom(WAIT_RANGES.afterRefresh);
    addLog(`确认无余额，${(waitMs / 1000).toFixed(1)}秒后点击刷新按钮`);
    const refreshButton = await waitFor(findRefreshButton, 6000);
    if (!refreshButton) {
      addLog("未找到Refresh按钮");
      return false;
    }
    refreshButton.scrollIntoView({ block: "center", inline: "nearest" });
    clickEl(refreshButton);
    addLog("已点击Refresh");
    await sleepRandom(WAIT_RANGES.afterButton);
    return true;
  };

  // ==================== 聚合器配置功能 ====================

  const findSettingsButton = () => {
    const buttons = Array.from(document.querySelectorAll("button")).filter(isVisible);
    for (const btn of buttons) {
      const svg = btn.querySelector("svg");
      if (svg) {
        const path = svg.querySelector("path");
        if (path) {
          const d = path.getAttribute("d") || "";
          if (d.includes("gear") || d.includes("cog") || d.includes("setting") ||
              btn.getAttribute("aria-label")?.toLowerCase().includes("setting")) {
            return btn;
          }
        }
      }
      if (btn.textContent.includes("设置") || btn.getAttribute("aria-label")?.includes("设置")) {
        return btn;
      }
    }
    const settingBtn = document.querySelector('[data-sentry-component*="Setting"], [aria-label*="setting"], [aria-label*="Setting"]');
    if (settingBtn && isVisible(settingBtn)) {
      return settingBtn;
    }
    return null;
  };

  const findAggregatorMenuItem = () => {
    const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [role="button"], div.cursor-pointer, button')).filter(isVisible);
    for (const item of menuItems) {
      const text = item.textContent || "";
      if (text.includes("聚合器") || text.includes("Aggregator") || text.includes("快速交换")) {
        return item;
      }
    }
    return null;
  };

  const findAggregatorToggle = (aggregatorName, sectionRoot) => {
    const searchRoot = sectionRoot || document.body;
    const elements = Array.from(searchRoot.querySelectorAll("*")).filter(isVisible);

    for (const el of elements) {
      const text = (el.textContent || "").trim();
      if (text === aggregatorName || text.startsWith(aggregatorName + " ") || text.endsWith(" " + aggregatorName)) {
        const parent = el.closest("div, li, label");
        if (parent) {
          const toggle = parent.querySelector('button[role="switch"], input[type="checkbox"], [data-state="checked"], [data-state="unchecked"]');
          if (toggle) {
            return { element: toggle, name: aggregatorName, parent };
          }
          const switchBtn = parent.querySelector('button');
          if (switchBtn && (switchBtn.getAttribute("data-state") || switchBtn.getAttribute("aria-checked"))) {
            return { element: switchBtn, name: aggregatorName, parent };
          }
        }
      }
    }
    return null;
  };

  const findAllAggregatorToggles = async () => {
    const toggles = [];
    const { aggregatorSettings } = await getSettings();

    const allAggregators = [
      ...ALL_AGGREGATORS.EVM,
      ...ALL_AGGREGATORS.Solana
    ];
    const uniqueAggregators = [...new Set(allAggregators)];

    for (const name of uniqueAggregators) {
      const toggle = findAggregatorToggle(name, document.body);
      if (toggle) {
        const shouldEnable =
          aggregatorSettings.EVM?.includes(name) ||
          aggregatorSettings.Solana?.includes(name);
        toggles.push({ ...toggle, shouldEnable });
      }
    }
    return toggles;
  };

  const isToggleOn = (toggleEl) => {
    if (!toggleEl) return false;

    const state = toggleEl.getAttribute("data-state");
    if (state === "checked" || state === "on") return true;
    if (state === "unchecked" || state === "off") return false;

    const ariaChecked = toggleEl.getAttribute("aria-checked");
    if (ariaChecked === "true") return true;
    if (ariaChecked === "false") return false;

    if (toggleEl.type === "checkbox") {
      return toggleEl.checked;
    }

    const classes = toggleEl.className || "";
    if (classes.includes("checked") || classes.includes("active") || classes.includes("on")) {
      return true;
    }

    return false;
  };

  const setToggleState = async (toggleEl, shouldBeOn) => {
    const currentState = isToggleOn(toggleEl);
    if (currentState === shouldBeOn) {
      return true;
    }

    clickEl(toggleEl);
    await sleep(300);

    const newState = isToggleOn(toggleEl);
    return newState === shouldBeOn;
  };

  const configureAggregators = async () => {
    addLog("开始配置聚合器...");

    const settingsBtn = await waitFor(findSettingsButton, 5000);
    if (!settingsBtn) {
      addLog("未找到设置按钮，尝试直接查找聚合器开关");
    } else {
      clickEl(settingsBtn);
      addLog("已点击设置按钮");
      await sleep(800);
    }

    const aggregatorMenu = await waitFor(findAggregatorMenuItem, 3000);
    if (aggregatorMenu) {
      clickEl(aggregatorMenu);
      addLog("已点击聚合器与快速交换");
      await sleep(800);
    }

    await sleep(500);
    const toggles = await findAllAggregatorToggles();

    if (toggles.length === 0) {
      addLog("未找到任何聚合器开关，请手动打开设置页面");
      return false;
    }

    addLog(`找到 ${toggles.length} 个聚合器开关`);

    let configured = 0;
    let errors = 0;

    for (const toggle of toggles) {
      const currentState = isToggleOn(toggle.element);

      if (currentState !== toggle.shouldEnable) {
        const success = await setToggleState(toggle.element, toggle.shouldEnable);
        if (success) {
          addLog(`${toggle.name}: ${toggle.shouldEnable ? "已启用" : "已禁用"}`);
          configured++;
        } else {
          addLog(`${toggle.name}: 配置失败`);
          errors++;
        }
        await sleep(200);
      } else {
        addLog(`${toggle.name}: 已是${toggle.shouldEnable ? "启用" : "禁用"}状态`);
      }
    }

    addLog(`配置完成: ${configured} 个已更改, ${errors} 个失败`);

    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEYS.aggregatorConfigured]: true });
    }

    await closeSettingsPanel();

    return errors === 0;
  };

  const closeSettingsPanel = async () => {
    const closeSelectors = [
      '[aria-label="Close"]',
      '[aria-label="关闭"]',
      'button.close',
      'button[class*="close"]',
      '[data-radix-dialog-close]',
      'button svg[class*="close"]',
    ];

    for (const selector of closeSelectors) {
      const closeBtn = document.querySelector(selector);
      if (closeBtn && isVisible(closeBtn)) {
        const btn = closeBtn.closest("button") || closeBtn;
        clickEl(btn);
        addLog("已关闭设置面板");
        await sleep(300);
        return;
      }
    }

    const overlaySelectors = [
      '[data-radix-dialog-overlay]',
      '.overlay',
      '.backdrop',
      '[class*="overlay"]',
      '[class*="backdrop"]',
    ];

    for (const selector of overlaySelectors) {
      const overlay = document.querySelector(selector);
      if (overlay && isVisible(overlay)) {
        clickEl(overlay);
        addLog("已关闭设置面板");
        await sleep(300);
        return;
      }
    }

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(300);
  };

  // 检查是否应该继续循环
  const shouldContinueLoop = async () => {
    // 刷新积分数据并使用有效交易量（API + 本地累加）
    await updatePointsDisplay(true);

    // 获取有效交易量
    const effectiveVolume = await getEffectiveVolume();
    const { targetVolume } = await getSettings();

    // 检查是否达到目标交易量
    if (effectiveVolume >= targetVolume) {
      addLog(`交易量 $${effectiveVolume.toFixed(1)} 已达到目标 $${targetVolume.toLocaleString()}`);
      return false;
    }

    const remaining = targetVolume - effectiveVolume;
    addLog(`当前 $${effectiveVolume.toFixed(1)}，目标 $${targetVolume.toLocaleString()}，还差 $${remaining.toFixed(0)}`);
    return true;
  };

  // 安全检查：确保最终持有的是 USDT 而不是 KOGE
  const ensureFinalBalanceIsUSDT = async () => {
    addLog("安全检查：确认最终余额...");

    // 获取当前余额
    const portfolioData = await fetchPortfolioAssets();
    const balances = extractBalances(portfolioData);

    addLog(`当前余额: KOGE=${balances.koge.toFixed(4)}, USDT=${balances.usdt.toFixed(2)}`);

    // 如果 KOGE > 0.01，说明还持有 KOGE，需要换成 USDT
    if (balances.koge > 0.01) {
      addLog(`检测到 KOGE 余额 ${balances.koge.toFixed(4)}，执行最后一次 KOGE→USDT 交换...`);

      // 强制执行 KOGE → USDT 交换
      const result = await runSingleSwap({ sourceSymbol: "KOGE", targetSymbol: "USDT" });

      if (result.status === "confirmed") {
        addLog("安全检查完成：已将 KOGE 换成 USDT");
      } else if (result.status === "no_source") {
        addLog("安全检查：没有检测到 KOGE 余额");
      } else {
        addLog(`安全检查警告：KOGE→USDT 交换失败 (${result.status})，请手动检查`);
      }
    } else {
      addLog("安全检查通过：当前持有 USDT");
    }
  };

  const runSwapLoop = async () => {
    if (running) {
      addLog("当前正在执行，忽略重复开始");
      return;
    }

    // 获取积分数据
    await updatePointsDisplay();
    const apiVolume = userPoints?.geniusPoints?.volumeCompleted || 0;

    // 获取当前设置
    const { targetVolume, baseVolume, localVolume } = await getSettings();

    // 如果是首次启动（baseVolume 为 0），设置基准值
    if (baseVolume === 0) {
      await setBaseVolume(apiVolume);
      addLog(`首次启动，设置基准交易量: $${apiVolume.toFixed(2)}`);
    } else {
      addLog(`继续运行，基准 $${baseVolume.toFixed(2)}，本地累计 $${localVolume.toFixed(2)}`);
    }
    const currentVolume = apiVolume;

    // 检查是否已达到目标
    if (currentVolume >= targetVolume) {
      addLog(`交易量 $${currentVolume.toFixed(1)} 已达到目标 $${targetVolume.toLocaleString()}`);
      setEnabled(false);
      return;
    }

    running = true;
    stopRequested = false;

    try {
      addLog(`开始循环，目标交易量: $${targetVolume.toLocaleString()}`);

      let swapCount = 0;
      while (true) {
        if (stopRequested) {
          addLog("已停止循环");
          break;
        }

        swapCount += 1;
        addLog(`开始第 ${swapCount} 次交易`);
        const result = await runSwapCycle();

        if (result === "no_source") {
          await refreshAfterNoSource();
          continue;
        }

        if (result === "error") {
          addLog("交易失败，等待后重试...");
          await sleepRandom(WAIT_RANGES.betweenSwaps);
          continue;
        }

        if (result === "refresh") {
          addLog("报价错误，等待后重试...");
          await sleepRandom(WAIT_RANGES.betweenSwaps);
          continue;
        }

        if (result !== "ok") {
          addLog("本次失败，停止循环");
          break;
        }

        // 交易成功后检查是否继续（使用本地累加的交易量判断）
        const shouldContinue = await shouldContinueLoop();
        if (!shouldContinue) {
          // 达到目标交易量，执行安全检查确保最终持有 USDT
          await ensureFinalBalanceIsUSDT();
          break;
        }

        // 交易间随机等待
        if (!stopRequested) {
          const waitMs = await sleepRandom(WAIT_RANGES.betweenSwaps);
          addLog(`等待 ${(waitMs / 1000).toFixed(1)} 秒后继续...`);
        }
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
    if (STORAGE_KEYS.configureAggregator in changes) {
      configureAggregators();
    }
    if (shouldRender) {
      getSettings().then(renderPanel);
    }
  };

  const resetEnabledOnLoad = async () => {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return false;
    }

    // 检查是否有 pendingReload 标记（F5 刷新后需要自动恢复）
    const result = await new Promise((resolve) => {
      chrome.storage.local.get({ [STORAGE_KEYS.pendingReload]: false }, resolve);
    });

    if (result[STORAGE_KEYS.pendingReload]) {
      // 清除标记，保持 enabled 状态
      chrome.storage.local.set({
        [STORAGE_KEYS.pendingReload]: false,
        [STORAGE_KEYS.enabled]: true
      });
      console.log("[Genius] F5 刷新后自动恢复运行");
      return true; // 返回 true 表示需要自动恢复
    }

    // 正常加载，重置 enabled 状态
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: false });
    return false;
  };

  const init = async () => {
    const shouldAutoResume = await resetEnabledOnLoad();
    await waitFor(() => document.body);

    initPanel();
    startPanelObserver();

    if (shouldAutoResume) {
      // F5 刷新后自动恢复，等待页面完全加载
      addLog("F5 刷新后自动恢复运行...");
      await sleep(3000); // 等待 3 秒让页面完全加载
      runSwapLoop();
    } else {
      runIfEnabled();
    }
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
