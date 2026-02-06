const progress = document.getElementById("scroll-progress");
const revealTargets = document.querySelectorAll("[data-reveal]");
const parallaxTargets = document.querySelectorAll("[data-parallax]");
const tiltTargets = document.querySelectorAll("[data-tilt]");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const updateProgress = () => {
  const root = document.documentElement;
  const height = root.scrollHeight - root.clientHeight;
  if (!height) {
    progress.style.width = "0%";
    return;
  }
  const percent = (root.scrollTop / height) * 100;
  progress.style.width = `${percent}%`;
};

let ticking = false;
window.addEventListener(
  "scroll",
  () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateProgress();
        ticking = false;
      });
      ticking = true;
    }
  },
  { passive: true }
);

updateProgress();

if (prefersReducedMotion) {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
} else if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const delay = entry.target.getAttribute("data-delay");
        if (delay) {
          entry.target.style.transitionDelay = `${delay}ms`;
        }
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.18 }
  );

  revealTargets.forEach((target) => observer.observe(target));
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

if (!prefersReducedMotion && (parallaxTargets.length || tiltTargets.length)) {
  const applyParallax = (x, y) => {
    parallaxTargets.forEach((el) => {
      const depth = Number(el.dataset.parallax || 0);
      const px = x * depth;
      const py = y * depth;
      el.style.setProperty("--px", `${px}px`);
      el.style.setProperty("--py", `${py}px`);
    });
  };

  const applyTilt = (x, y) => {
    tiltTargets.forEach((el) => {
      const max = Number(el.dataset.tilt || 0);
      const rx = y * max;
      const ry = -x * max;
      el.style.setProperty("--rx", `${rx}deg`);
      el.style.setProperty("--ry", `${ry}deg`);
    });
  };

  const handlePointer = (event) => {
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    applyParallax(x, y);
    applyTilt(x, y);
  };

  window.addEventListener("pointermove", handlePointer, { passive: true });
  window.addEventListener("pointerleave", () => {
    applyParallax(0, 0);
    applyTilt(0, 0);
  });
}
