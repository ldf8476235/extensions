(() => {
  const KEYWORD = "opinion";
  if (!window.location.href.includes(KEYWORD)) {
    return;
  }

  const STYLE_ID = "opinion-hide-marquee";
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .rfm-marquee-container { display: none !important; }
    .recharts-cartesian-grid,
    .recharts-wrapper {
      display: none !important;
    }
    [data-sentry-component="MarketNew"] {
      display: none !important;
    }
    [data-sentry-source-file="countdown.tsx"][class*="absolute"] {
      display: none !important;
    }
    [data-sentry-component="RewardCard"],
    [data-sentry-source-file="rewardCard.tsx"] {
      display: none !important;
    }
  `;

  const mount = document.documentElement || document.head || document.body;
  if (!mount) {
    return;
  }
  mount.appendChild(style);
})();
