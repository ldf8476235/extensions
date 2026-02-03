(() => {
  const STORAGE_KEYS = {
    enabled: "geniusSwapEnabled",
    count: "geniusSwapCount",
  };

  const toggle = document.getElementById("enabledToggle");
  const statusText = document.getElementById("statusText");
  const countValue = document.getElementById("countValue");

  const getSettings = () =>
    new Promise((resolve) => {
      chrome.storage.local.get(
        {
          [STORAGE_KEYS.enabled]: false,
          [STORAGE_KEYS.count]: 0,
        },
        (result) => {
          resolve({
            enabled: Boolean(result[STORAGE_KEYS.enabled]),
            count: Number(result[STORAGE_KEYS.count] || 0),
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

  const init = async () => {
    render(await getSettings());
    toggle.addEventListener("change", onToggleChange);
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
