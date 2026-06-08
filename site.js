/* ============================================================
   SMA Advocacia — interactions
   ============================================================ */
(function () {
  "use strict";

  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  const lerp = (a, b, n) => (1 - n) * a + n * b;

  /* ---------- custom cursor ---------- */
  if (!isTouch) {
    const dot = document.querySelector(".cursor-dot");
    const ring = document.querySelector(".cursor-ring");
    let mx = innerWidth / 2, my = innerHeight / 2;
    let rx = mx, ry = my;

    window.addEventListener("mousemove", (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
    });

    function loop() {
      rx = lerp(rx, mx, 0.18);
      ry = lerp(ry, my, 0.18);
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    }
    loop();

    // hover states
    const hoverSel = "a, button, .btn, .area-row, .hindex .row, .member, input, textarea, .ulink, [data-cursor]";
    document.addEventListener("mouseover", (e) => {
      const t = e.target.closest(hoverSel);
      if (t) {
        ring.classList.add("hover");
        const label = t.getAttribute("data-label");
        if (label) { ring.setAttribute("data-label", label); ring.classList.add("label"); }
      }
    });
    document.addEventListener("mouseout", (e) => {
      const t = e.target.closest(hoverSel);
      if (t) { ring.classList.remove("hover"); ring.classList.remove("label"); }
    });

    // flip cursor color over dark sections
    const darkSections = () => document.querySelectorAll(".areas, .quote, .footer, [data-dark]");
    function checkDark() {
      let onDark = false;
      darkSections().forEach((s) => {
        const r = s.getBoundingClientRect();
        if (ry >= r.top && ry <= r.bottom) onDark = true;
      });
      dot.classList.toggle("on-dark", onDark);
      ring.classList.toggle("on-dark", onDark);
      requestAnimationFrame(checkDark);
    }
    checkDark();
  }

  /* ---------- magnetic buttons ---------- */
  if (!isTouch) {
    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      const strength = parseFloat(el.getAttribute("data-magnetic")) || 0.3;
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".reveal, .line-mask").forEach((el) => io.observe(el));

  /* ---------- nav scroll state + progress ---------- */
  const nav = document.querySelector(".nav");
  const progress = document.querySelector(".progress");
  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle("scrolled", y > 40);
    const h = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.width = (y / h * 100) + "%";
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- parallax ---------- */
  const parallaxEls = document.querySelectorAll("[data-parallax]");
  if (parallaxEls.length && !isTouch) {
    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      parallaxEls.forEach((el) => {
        const sp = parseFloat(el.getAttribute("data-parallax")) || 0.1;
        el.style.transform = `translateY(${y * sp}px)`;
      });
    }, { passive: true });
  }

  /* ---------- áreas accordion ---------- */
  document.querySelectorAll(".area-row").forEach((row) => {
    row.addEventListener("click", () => {
      const open = row.classList.contains("open");
      document.querySelectorAll(".area-row.open").forEach((r) => r.classList.remove("open"));
      if (!open) row.classList.add("open");
    });
  });

  /* ---------- smooth anchor scroll ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
      }
    });
  });

  /* ---------- count-up stats ---------- */
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const to = parseFloat(el.getAttribute("data-count"));
      const dur = 1500, t0 = performance.now();
      const suffix = el.getAttribute("data-suffix") || "";
      function step(t) {
        const p = Math.min((t - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = to % 1 === 0 ? Math.round(to * eased) : (to * eased).toFixed(1);
        el.textContent = val + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      statObserver.unobserve(el);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll("[data-count]").forEach((el) => statObserver.observe(el));

  /* ---------- expose hero switch for tweaks ---------- */
  window.SMA = window.SMA || {};
  window.SMA.setHero = (dir) => { document.body.setAttribute("data-hero", dir); };
})();
