/* ============================================================
   SMA Cinematic — scroll-driven motion engine (vanilla)
   ============================================================ */
(function () {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function motionFactor() {
    if (document.body.classList.contains("motion-calm")) return 0.55;
    if (document.body.classList.contains("motion-bold")) return 1.6;
    return 1;
  }

  /* ============================================================
     HERO SCRUB — pinned video, scroll controls playback.
     Frames are extracted ONCE at load into a bitmap cache, then
     drawn to a canvas on scroll — so there is NO seeking during
     scrolling (every cached frame is independent → no stutter,
     equivalent to an all-keyframe re-encode). Down = advance,
     Up = rewind. Page stays pinned until the end of the section.
     ============================================================ */
  const hsSection = document.querySelector(".hero-scrub");
  const hsVideo   = document.querySelector(".hs-video");
  const hsCanvas  = document.querySelector(".hs-canvas");
  const hsLoader  = document.querySelector(".hs-loader");
  const hsLoaderBar = hsLoader ? hsLoader.querySelector("i") : null;
  const hsStages  = [...document.querySelectorAll(".hs-stage")];
  const hsHint    = document.querySelector(".hs-hint");
  const HS_DIR    = 1;            // 1 = scroll down advances (deconstructs)
  const HS_FRAMES = 96;           // cached frames across the clip
  const HS_MAXW   = 720;          // cap source capture width (memory)

  let hsFrames = new Array(HS_FRAMES);  // sparse ImageBitmap cache, filled progressively
  let hsFilled = 0;
  let hsReady = false;
  let hsProg = 0;          // smoothed (displayed) progress
  let hsTargetProg = 0;    // raw scroll-derived progress (the target we ease toward)
  let hsCurProg = 0;       // current eased value
  let hsLoopOn = false;
  let hsDrawIdx = -1;
  let hsLastBmp = null;
  const ctx = hsCanvas ? hsCanvas.getContext("2d", { alpha: false }) : null;

  function hsSizeCanvas() {
    if (!hsCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    hsCanvas.width = Math.round(hsCanvas.clientWidth * dpr);
    hsCanvas.height = Math.round(hsCanvas.clientHeight * dpr);
  }

  // nearest already-captured frame to a requested index (progressive refinement)
  function hsNearest(idx) {
    if (hsFrames[idx]) return hsFrames[idx];
    for (let d = 1; d < HS_FRAMES; d++) {
      if (hsFrames[idx - d]) return hsFrames[idx - d];
      if (hsFrames[idx + d]) return hsFrames[idx + d];
    }
    return null;
  }

  function hsDraw(idx) {
    if (!ctx) return;
    idx = clamp(Math.round(idx), 0, HS_FRAMES - 1);
    const bmp = hsFrames[idx] || hsNearest(idx);
    if (!bmp || !bmp.width) return;                    // skip missing/closed bitmaps
    if (idx === hsDrawIdx && bmp === hsLastBmp) return; // nothing new to paint
    const cw = hsCanvas.width, ch = hsCanvas.height;
    const sr = bmp.width / bmp.height, dr = cw / ch;
    let dw, dh, dx, dy;
    if (sr > dr) { dh = ch; dw = ch * sr; dx = (cw - dw) / 2; dy = 0; }     // cover
    else { dw = cw; dh = cw / sr; dx = 0; dy = (ch - dh) / 2; }
    try {
      ctx.drawImage(bmp, dx, dy, dw, dh);
      hsDrawIdx = idx; hsLastBmp = bmp;
    } catch (e) { /* bad bitmap — leave previous frame on canvas */ }
  }

  // Continuous easing loop — decouples the painted frame from discrete scroll
  // events so the scrub glides instead of stepping/jittering. Eases hsCurProg
  // toward hsTargetProg, repaints, then auto-pauses once it settles.
  function hsEnsureLoop() { if (!hsLoopOn) { hsLoopOn = true; requestAnimationFrame(hsTick); } }
  function hsTick() {
    const diff = hsTargetProg - hsCurProg;
    const settled = Math.abs(diff) < 0.00035;
    hsCurProg = settled ? hsTargetProg : hsCurProg + diff * 0.16;  // smoothing factor
    hsProg = hsCurProg;

    const t = HS_DIR > 0 ? hsCurProg : (1 - hsCurProg);
    if (hsReady) hsDraw(t * (HS_FRAMES - 1));

    // staged content (intro + manifesto captions) tracks the eased progress
    for (let i = 0; i < hsStages.length; i++) {
      const c = hsStages[i];
      const from = parseFloat(c.dataset.from), to = parseFloat(c.dataset.to);
      const on = hsCurProg >= from && hsCurProg < to;
      if (on !== c.classList.contains("on")) c.classList.toggle("on", on);
    }
    if (hsHint) hsHint.classList.toggle("show", hsCurProg < 0.05);

    if (settled) { hsLoopOn = false; return; }   // idle → stop burning frames
    requestAnimationFrame(hsTick);
  }

  if (hsVideo) {
    hsVideo.muted = true;
    hsVideo.setAttribute("muted", "");
    hsVideo.playsInline = true;
    hsVideo.controls = false;
    hsVideo.autoplay = false;
    hsVideo.removeAttribute("autoplay");
    hsVideo.loop = false;
    hsVideo.pause();
    // belt-and-braces: if anything ever tries to start playback, stop it —
    // the hero must be a static, scroll-driven frame, never a playing video.
    hsVideo.addEventListener("play", () => { if (!hsVideo.__allowPlay) hsVideo.pause(); });

    const seek = (t) => new Promise((res) => {
      let done = false;
      const ok = () => { if (done) return; done = true; hsVideo.removeEventListener("seeked", ok); res(); };
      hsVideo.addEventListener("seeked", ok);
      try { hsVideo.currentTime = t; } catch (e) { ok(); }
      setTimeout(ok, 500); // safety: don't hang on a missed seeked event
    });

    async function captureAt(i, dur, w, h) {
      if (hsFrames[i]) return;
      const t = (i / (HS_FRAMES - 1)) * (dur - 0.05);
      await seek(t);
      try {
        const bmp = await createImageBitmap(hsVideo, {
          resizeWidth: w, resizeHeight: h, resizeQuality: "medium",
        }).catch(() => createImageBitmap(hsVideo));
        hsFrames[i] = bmp; hsFilled++;
      } catch (e) { /* skip frame */ }
      if (hsLoaderBar) hsLoaderBar.style.width = Math.round((hsFilled / HS_FRAMES) * 100) + "%";
    }

    async function extractFrames() {
      hsVideo.pause();
      const dur = hsVideo.duration || 8;
      const w = Math.min(hsVideo.videoWidth || HS_MAXW, HS_MAXW);
      const h = Math.round(w * (hsVideo.videoHeight || 1280) / (hsVideo.videoWidth || 720));

      // Progressive passes: a sparse sweep first (full-range coverage, ready in
      // ~1–2s so the first scroll already scrubs), then each pass doubles the
      // density and refines smoothness. hsDraw falls back to the nearest frame.
      const strides = [16, 8, 4, 2, 1];
      let firstDrawn = false, readyMarked = false;

      for (let s = 0; s < strides.length; s++) {
        const stride = strides[s];
        for (let i = 0; i < HS_FRAMES; i += stride) {
          await captureAt(i, dur, w, h);

          // paint a static opening frame the instant frame 0 exists
          if (!firstDrawn && hsFrames[0]) {
            hsSizeCanvas(); hsDrawIdx = -1; hsLastBmp = null; hsDraw(0);
            if (hsCanvas) hsCanvas.classList.add("ready");
            firstDrawn = true;
          }
        }
        // after the first (coarse) pass, enable scroll scrubbing immediately
        if (!readyMarked) { hsReady = true; readyMarked = true; requestFrame(); }
        // re-paint current scroll position at the new, denser quality
        hsDrawIdx = -1; hsLastBmp = null; hsDraw(hsProg * (HS_FRAMES - 1));
        // yield so the UI stays responsive between passes
        await new Promise((r) => setTimeout(r, 0));
      }

      hsReady = true;
      hsDrawIdx = -1; hsLastBmp = null; hsDraw(hsProg * (HS_FRAMES - 1));
      if (hsVideo) hsVideo.style.display = "none"; // free the decoder; frames are cached
      if (hsLoader) hsLoader.classList.add("done");
      requestFrame();
    }

    let hsStarted = false;
    const startExtract = () => {
      if (hsStarted) return;            // run exactly once — no concurrent extraction
      hsStarted = true;
      extractFrames();
    };
    if (hsVideo.readyState >= 2) startExtract();
    else {
      hsVideo.addEventListener("loadeddata", startExtract, { once: true });
      hsVideo.addEventListener("canplay", startExtract, { once: true }); // fallback if loadeddata is slow
      hsVideo.load();
    }
  }

  window.addEventListener("resize", () => { hsSizeCanvas(); hsDrawIdx = -1; hsLastBmp = null; hsDraw(hsProg * (HS_FRAMES - 1)); });

  /* ---------- nav solidify + progress ---------- */
  const nav = document.querySelector(".nav");
  const progress = document.querySelector(".progress");
  function onScroll() {
    const y = window.scrollY;
    if (nav) nav.classList.toggle("solid", y > 30);
    if (progress) {
      const h = document.documentElement.scrollHeight - innerHeight;
      progress.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- reveal on enter ---------- */
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".fade, .mask").forEach((el) => io.observe(el));

  // hero intro is above the fold — reveal immediately
  function revealHero() {
    document.querySelectorAll(".hs-intro .mask, .hs-intro .fade").forEach((el) => el.classList.add("in"));
  }
  if (document.readyState === "complete") requestAnimationFrame(revealHero);
  else window.addEventListener("load", () => requestAnimationFrame(revealHero));
  setTimeout(revealHero, 300);
  // safety net: if the entrance transition was paused (e.g. tab loaded in the
  // background, where browsers freeze CSS transitions), snap the hero text to
  // its final visible state once the animation would normally have finished.
  setTimeout(() => {
    document.querySelectorAll(".hs-intro .mask > span, .hs-intro .fade").forEach((el) => {
      const cs = getComputedStyle(el);
      const stuck = cs.transform && cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)";
      if (stuck || parseFloat(cs.opacity) < 0.99) {
        el.style.transition = "none";
        el.style.transform = "none";
        el.style.opacity = "1";
      }
    });
  }, 2600);

  /* ---------- panels parallax ---------- */
  // o painel 01 tem movimento proprio: fica preso enquanto o predio se monta,
  // entao fica fora do parallax. Mexer no transform dele a cada scroll so
  // custaria recomposicao sem ganho nenhum.
  const panels = [...document.querySelectorAll(".panel")]
    .filter((p) => !p.classList.contains("area-build"))
    .map((p) => ({ p, media: p.querySelector(".p-media") }));

  let ticking = false;
  function frame() {
    try {
      const vh = innerHeight;
      const mf = motionFactor();

      /* hero scrub: update the scroll target; the eased loop paints it */
      if (hsSection) {
        const r = hsSection.getBoundingClientRect();
        const total = hsSection.offsetHeight - vh;
        hsTargetProg = clamp((-r.top) / (total || 1), 0, 1);
        hsEnsureLoop();
      }

      /* panel media parallax */
      if (!reduce) {
        panels.forEach(({ p, media }) => {
          if (!media) return;
          const r = p.getBoundingClientRect();
          if (r.bottom < -200 || r.top > vh + 200) return;
          const p2 = clamp((vh - r.top) / (vh + r.height), 0, 1);
          media.style.transform = `translateY(${lerp(-6, 6, p2) * mf}%) scale(${1 + 0.06 * mf})`;
        });
      }
    } catch (e) {
      // never let a single bad frame permanently freeze scroll updates
    } finally {
      ticking = false;
    }
  }
  function requestFrame() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener("scroll", requestFrame, { passive: true });
  window.addEventListener("resize", requestFrame);
  frame();

  /* ---------- count-up metrics ---------- */
  const mo = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target, to = parseFloat(el.dataset.count), dur = 1700, t0 = performance.now();
      const dec = (el.dataset.count.split(".")[1] || "").length;
      (function step(t) {
        const k = clamp((t - t0) / dur, 0, 1), eased = 1 - Math.pow(1 - k, 3);
        el.textContent = (to * eased).toFixed(dec);
        if (k < 1) requestAnimationFrame(step); else el.textContent = to.toFixed(dec);
      })(performance.now());
      mo.unobserve(el);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach((el) => mo.observe(el));

  /* ---------- form focus ---------- */
  document.querySelectorAll(".field input, .field textarea").forEach((el) => {
    el.addEventListener("focus", () => el.closest(".field").classList.add("focus"));
    el.addEventListener("blur", () => el.closest(".field").classList.remove("focus"));
  });

  /* ---------- anchor smooth offset ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href"); if (id.length < 2) return;
      const t = document.querySelector(id);
      if (t) { e.preventDefault(); window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 52, behavior: "smooth" }); }
    });
  });

  /* ---------- keys video: mouse-scrubbed (still until you move the mouse) ---------- */
  const keysVideo = document.querySelector(".keys-video");
  const keysCanvas = document.querySelector(".keys-canvas");
  const keysPanel = document.querySelector(".keys-panel");
  if (keysVideo && keysPanel) {
    keysVideo.muted = true;
    keysVideo.autoplay = false;
    keysVideo.removeAttribute("autoplay");
    keysVideo.loop = false;
    keysVideo.pause();

    const ctx = keysCanvas ? keysCanvas.getContext("2d") : null;
    let dur = 0, ready = false;
    let targetT = 0;      // where the mouse wants the playhead
    let curT = 0;         // eased actual playhead
    let seeking = false, pendingT = null;
    const START_FRAC = 0.0;   // resting frame when the page loads

    function sizeCanvas() {
      if (!keysCanvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = keysCanvas.clientWidth, h = keysCanvas.clientHeight;
      if (!w || !h) return;
      keysCanvas.width = Math.round(w * dpr);
      keysCanvas.height = Math.round(h * dpr);
    }
    function drawCover() {
      if (!ctx || !keysVideo.videoWidth) return;
      const cw = keysCanvas.width, ch = keysCanvas.height;
      const sr = keysVideo.videoWidth / keysVideo.videoHeight, dr = cw / ch;
      let w, h; if (sr > dr) { h = ch; w = ch * sr; } else { w = cw; h = cw / sr; }
      try { ctx.drawImage(keysVideo, (cw - w) / 2, (ch - h) / 2, w, h); } catch (e) {}
    }

    function onMeta() {
      dur = keysVideo.duration || 0;
      ready = true;
      sizeCanvas();
      try { keysVideo.currentTime = dur * START_FRAC; } catch (e) {}
    }
    if (keysVideo.readyState >= 1) onMeta();
    else keysVideo.addEventListener("loadedmetadata", onMeta, { once: true });
    keysVideo.addEventListener("seeked", () => {
      seeking = false;
      drawCover();
      if (keysCanvas) keysCanvas.classList.add("on");
      if (pendingT != null) { const t = pendingT; pendingT = null; doSeek(t); }
    });
    window.addEventListener("resize", () => { sizeCanvas(); drawCover(); });

    function doSeek(t) {
      if (!ready) return;
      if (seeking) { pendingT = t; return; }
      seeking = true;
      try { keysVideo.currentTime = t; } catch (e) { seeking = false; }
    }

    // map horizontal mouse position over the panel → playhead target
    function onMove(e) {
      if (!ready) return;
      keysPanel.classList.add("scrubbing");
      const r = keysPanel.getBoundingClientRect();
      const px = e.touches ? e.touches[0].clientX : e.clientX;
      let n = (px - r.left) / r.width;
      n = n < 0 ? 0 : n > 1 ? 1 : n;
      targetT = n * (dur - 0.04);
    }
    keysPanel.addEventListener("pointermove", onMove, { passive: true });
    keysPanel.addEventListener("touchmove", onMove, { passive: true });

    // ease the playhead toward the mouse target; only re-seek when it moved enough
    (function loop() {
      if (ready) {
        curT += (targetT - curT) * 0.16;
        if (Math.abs(curT - keysVideo.currentTime) > 0.02) doSeek(curT);
      }
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- panel 01: o predio se monta conforme a pagina desce ----------
     Mesma ideia do hero: os quadros sao extraidos UMA vez para um cache de
     ImageBitmap e depois so desenhados, entao nao ha seek durante a rolagem
     (cada quadro e independente -> sem engasgo). Duas diferencas:

       1. a extracao e preguicosa. So comeca quando o painel esta a ~1,5 tela
          de distancia, para o clipe nao disputar banda e CPU com o hero no
          carregamento da pagina. O <video> nasce com preload="none".
       2. o desenho e contain sobre canvas transparente, porque o clipe e 9:16
          numa caixa mais larga. O que sobra nas laterais fica transparente e
          mostra o marfim do painel, em vez de barra preta.
     ---------------------------------------------------------------------- */
  const bPanel  = document.querySelector(".area-build");
  const bVideo  = document.querySelector(".build-video");
  const bCanvas = document.querySelector(".build-canvas");
  if (bPanel && bVideo && bCanvas) {
    const B_FRAMES = 64;      // quadros no cache ao longo do clipe
    const B_MAXW   = 540;     // teto da largura de captura (memoria)
    // Medidas do proprio clipe, tiradas do quadro final: o pe do predio esta
    // a 90,8% da altura do quadro e o teto a 14,4%, ou seja quase um quarto do
    // quadro e margem vazia. Enquadrar pelo quadro desperdicava esse quarto e
    // deixava o edificio pequeno; aqui o enquadramento e feito pelo predio.
    const B_PES    = 0.908;   // onde o pe do predio esta dentro do quadro
    const B_TOPO   = 0.144;   // onde o teto do predio pronto esta dentro do quadro
    const B_ALTURA = 0.86;    // quanto da altura da caixa o predio pronto ocupa
    const B_BASE   = 0.92;    // onde o pe do predio pousa na caixa
    const B_LADO   = 0.07;    // faixa de cada lado dissolvida no marfim
    const bctx = bCanvas.getContext("2d", { alpha: false });
    // cor da propria secao: e ela que o fundo do clipe vira, e e ela que
    // preenche o que sobra da caixa em volta do quadro
    const bFundo = getComputedStyle(bPanel).backgroundColor || "#F1EEE6";
    const bRGB = (bFundo.match(/\d+/g) || [241, 238, 230]).map(Number);
    const bFrames = new Array(B_FRAMES);
    let bReady = false, bDrawIdx = -1;
    let bTarget = 0, bCur = 0, bLoopOn = false;

    bVideo.muted = true;
    bVideo.autoplay = false;
    bVideo.removeAttribute("autoplay");
    bVideo.loop = false;
    bVideo.pause();
    // o painel nunca toca sozinho: quem move o playhead e a rolagem
    bVideo.addEventListener("play", () => { if (!bVideo.__allowPlay) bVideo.pause(); });

    function bSize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = bCanvas.clientWidth, h = bCanvas.clientHeight;
      if (!w || !h) return;
      bCanvas.width = Math.round(w * dpr);
      bCanvas.height = Math.round(h * dpr);
    }

    // quadro capturado mais proximo do pedido (as passadas grossas vem antes)
    function bNearest(i) {
      if (bFrames[i]) return bFrames[i];
      for (let d = 1; d < B_FRAMES; d++) {
        if (bFrames[i - d]) return bFrames[i - d];
        if (bFrames[i + d]) return bFrames[i + d];
      }
      return null;
    }

    function bDraw(idx) {
      if (!bctx) return;
      idx = clamp(Math.round(idx), 0, B_FRAMES - 1);
      const bmp = bFrames[idx] || bNearest(idx);
      if (!bmp || !bmp.width) return;
      if (idx === bDrawIdx) return;
      const cw = bCanvas.width, ch = bCanvas.height;
      // A escala sai do predio, nao do quadro: o clipe e esticado ate que o
      // edificio pronto ocupe B_ALTURA da caixa, e depois posicionado pelo pe.
      // As margens vazias do quadro sobram para fora da caixa, em cima e
      // embaixo, entao nenhuma borda horizontal do clipe aparece na pagina e
      // as pecas que chegam voando entram de fora da tela.
      let dh = ch * (B_ALTURA / (B_PES - B_TOPO));
      let dw = dh * bmp.width / bmp.height;
      // no celular a caixa e mais estreita que alta: sem este teto o quadro
      // passaria da largura da tela e as laterais dissolvidas ficariam de
      // fora, trazendo de volta o corte seco que elas existem para evitar
      if (dw > cw) { dw = cw; dh = dw * bmp.height / bmp.width; }
      try {
        bctx.fillStyle = bFundo;
        bctx.fillRect(0, 0, cw, ch);                         // laterais na cor da secao
        bctx.drawImage(bmp, (cw - dw) / 2, ch * B_BASE - dh * B_PES, dw, dh);
        bDrawIdx = idx;
      } catch (e) { /* bitmap ruim: deixa o quadro anterior na tela */ }
    }

    // O painel fica preso: 0 quando o topo dele encosta no topo da tela e 1
    // quando a secao inteira ja passou. Toda a rolagem presa e a linha do
    // tempo do clipe, entao o proximo painel so entra com o predio pronto.
    function bProgress() {
      const r = bPanel.getBoundingClientRect();
      const total = bPanel.offsetHeight - innerHeight;
      return clamp((-r.top) / (total || 1), 0, 1);
    }

    function bEnsureLoop() { if (!bLoopOn) { bLoopOn = true; requestAnimationFrame(bTick); } }
    function bTick() {
      const diff = bTarget - bCur;
      const settled = Math.abs(diff) < 0.0004;
      bCur = settled ? bTarget : bCur + diff * 0.16;
      if (bReady) bDraw(bCur * (B_FRAMES - 1));
      if (settled) { bLoopOn = false; return; }
      requestAnimationFrame(bTick);
    }
    function bOnScroll() { bTarget = bProgress(); bEnsureLoop(); }


    // ---- fundo do clipe -> branco puro ----------------------------------
    // O clipe foi filmado sobre um fundo de estudio com gradiente suave
    // (luma 226 a 240) e o predio e praticamente todo mais escuro que ele.
    // Aqui cada quadro e dividido, canal a canal, pelo nivel do fundo
    // estimado por linha: o fundo vira 255,255,255 e some quando a camada
    // entra em multiply, e o que sobra na pagina e o predio e a sombra dele.
    // Os poucos brilhos especulares acima do fundo estouram para branco e
    // somem junto, que e o resultado desejado.
    //
    // O nivel do fundo de cada linha e o percentil 88 da luminancia: mesmo
    // nas linhas em que o predio cobre metade da largura, esse percentil
    // ainda cai dentro do fundo. Depois o plate e suavizado na vertical
    // para a correcao nao criar faixas.
    const bWork = document.createElement('canvas');
    const bwctx = bWork.getContext('2d', { willReadFrequently: true });

    function bFundoParaBranco(w, h) {
      const img = bwctx.getImageData(0, 0, w, h);
      const p = img.data;
      const bgR = new Float32Array(h), bgG = new Float32Array(h), bgB = new Float32Array(h);
      const hist = new Uint32Array(256);
      const alvo = Math.floor(w * 0.88);

      for (let y = 0; y < h; y++) {
        hist.fill(0);
        const linha = y * w * 4;
        for (let x = 0; x < w; x++) {
          const i = linha + x * 4;
          hist[(p[i] * 54 + p[i + 1] * 183 + p[i + 2] * 19) >> 8]++;
        }
        let acc = 0, nivel = 255;
        for (let l = 0; l < 256; l++) { acc += hist[l]; if (acc >= alvo) { nivel = l; break; } }

        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let x = 0; x < w; x++) {
          const i = linha + x * 4;
          const l = (p[i] * 54 + p[i + 1] * 183 + p[i + 2] * 19) >> 8;
          if (l >= nivel - 3 && l <= nivel + 3) { sr += p[i]; sg += p[i + 1]; sb += p[i + 2]; n++; }
        }
        bgR[y] = n ? sr / n : 255; bgG[y] = n ? sg / n : 255; bgB[y] = n ? sb / n : 255;
      }

      const suave = (a) => {
        const o = new Float32Array(h), R = 8;
        for (let y = 0; y < h; y++) {
          let s = 0, n = 0;
          for (let k = -R; k <= R; k++) { const yy = y + k; if (yy < 0 || yy >= h) continue; s += a[yy]; n++; }
          o[y] = s / n;
        }
        return o;
      };
      const fR = suave(bgR), fG = suave(bgG), fB = suave(bgB);

      // branco puro e, na mesma passada, multiplicado pela cor da secao: o
      // fundo sai do quadro exatamente na cor da pagina, que e o que faz o
      // retangulo sumir sem precisar de blend na hora de compor
      const mr = bRGB[0] / 255, mg = bRGB[1] / 255, mb = bRGB[2] / 255;
      for (let y = 0; y < h; y++) {
        const kr = 255 / Math.max(1, fR[y]), kg = 255 / Math.max(1, fG[y]), kb = 255 / Math.max(1, fB[y]);
        const linha = y * w * 4;
        for (let x = 0; x < w; x++) {
          const i = linha + x * 4;
          const r = p[i] * kr, g = p[i + 1] * kg, b = p[i + 2] * kb;
          p[i]     = (r > 255 ? 255 : r) * mr;
          p[i + 1] = (g > 255 ? 255 : g) * mg;
          p[i + 2] = (b > 255 ? 255 : b) * mb;
        }
      }
      // As laterais sao um corte seco: o predio sai pelas duas bordas do clipe
      // original (medido: a coluna 0 e a 1079 tem centenas de linhas de predio
      // solido no fim da montagem). Como o quadro e mais estreito que a tela,
      // esse corte apareceria como duas linhas verticais no meio do marfim.
      // Cada lado entao se dissolve na cor da secao numa faixa estreita, e o
      // que a pagina mostra e um edificio que continua para fora do enquadre.
      const faixa = Math.max(1, Math.round(w * B_LADO));
      for (let x = 0; x < faixa; x++) {
        const u = x / faixa, a = u * u * (3 - 2 * u);
        for (let y = 0; y < h; y++) {
          const e = (y * w + x) * 4, d = (y * w + (w - 1 - x)) * 4;
          for (let k = 0; k < 3; k++) {
            p[e + k] = bRGB[k] + (p[e + k] - bRGB[k]) * a;
            p[d + k] = bRGB[k] + (p[d + k] - bRGB[k]) * a;
          }
        }
      }
      bwctx.putImageData(img, 0, 0);
    }
    const bSeek = (t) => new Promise((res) => {
      let done = false;
      const ok = () => { if (done) return; done = true; bVideo.removeEventListener("seeked", ok); res(); };
      bVideo.addEventListener("seeked", ok);
      try { bVideo.currentTime = t; } catch (e) { ok(); }
      setTimeout(ok, 500);   // nao trava se o evento seeked se perder
    });

    async function bExtract() {
      bVideo.pause();
      const dur = bVideo.duration || 10;
      const vw = bVideo.videoWidth || 1080, vh = bVideo.videoHeight || 1920;
      const w = Math.min(vw, B_MAXW), h = Math.round(w * vh / vw);
      let first = false;

      // passadas progressivas: uma varredura esparsa cobre o clipe inteiro em
      // ~1 s (o scrub ja funciona), e cada passada seguinte dobra a densidade
      for (const stride of [16, 8, 4, 2, 1]) {
        for (let i = 0; i < B_FRAMES; i += stride) {
          if (bFrames[i]) continue;
          await bSeek((i / (B_FRAMES - 1)) * (dur - 0.05));
          try {
            bWork.width = w; bWork.height = h;
            bwctx.drawImage(bVideo, 0, 0, w, h);
            bFundoParaBranco(w, h);
            bFrames[i] = await createImageBitmap(bWork);
          } catch (e) { /* pula o quadro */ }
          if (!first && bFrames[0]) {
            bSize(); bDrawIdx = -1; bDraw(0);
            bCanvas.classList.add("on");
            first = true;
          }
        }
        if (!bReady) { bReady = true; bOnScroll(); }
        bDrawIdx = -1; bDraw(bCur * (B_FRAMES - 1));
        await new Promise((r) => setTimeout(r, 0));   // devolve a mao para a UI
      }
      bVideo.style.display = "none";   // libera o decoder: os quadros ja estao em cache
    }

    if (reduce) {
      // sem animacao: mostra o predio pronto e para por ai
      bVideo.preload = "auto";
      const parado = () => { try { bVideo.currentTime = Math.max(0, (bVideo.duration || 10) - 0.05); } catch (e) {} };
      if (bVideo.readyState >= 2) parado();
      else { bVideo.addEventListener("loadeddata", parado, { once: true }); bVideo.load(); }
    } else {
      const bIO = new IntersectionObserver((ents) => {
        if (!ents.some((e) => e.isIntersecting)) return;
        bIO.disconnect();
        bVideo.preload = "auto";
        const go = () => bExtract();
        if (bVideo.readyState >= 2) go();
        else { bVideo.addEventListener("loadeddata", go, { once: true }); bVideo.load(); }
      }, { rootMargin: "150% 0px" });
      bIO.observe(bPanel);

      window.addEventListener("scroll", bOnScroll, { passive: true });
      window.addEventListener("resize", () => { bSize(); bDrawIdx = -1; bDraw(bCur * (B_FRAMES - 1)); bOnScroll(); });
      bOnScroll();
    }
  }

  /* ---------- liquid-glass cursor ---------- */
  const lgCursor = document.querySelector(".lg-cursor");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (lgCursor && finePointer && !reduce) {
    let mx = innerWidth / 2, my = innerHeight / 2;   // raw mouse
    let cx = mx, cy = my;                              // eased bubble position
    let shown = false;
    const hoverSel = "a, button, .btn, .nav-cta, .link-arrow, input, textarea, [role='button'], .area-row, .keys-media";

    window.addEventListener("mousemove", (e) => {
      mx = e.clientX; my = e.clientY;
      if (!shown) { shown = true; lgCursor.classList.add("ready"); }
      // light/dark context → adapt the rim
      const el = document.elementFromPoint(mx, my);
      const lightCtx = el && el.closest(".light, .keys-panel, .approach, .area-light, .area-solid, #sobre, #contato");
      lgCursor.classList.toggle("on-light", !!lightCtx);
      // hover affordance
      lgCursor.classList.toggle("hover", !!(el && el.closest(hoverSel)));
    }, { passive: true });

    window.addEventListener("mousedown", (e) => {
      lgCursor.classList.add("down");
      // glass shockwave ripple at the click point
      const rip = document.createElement("div");
      rip.className = "lg-ripple" + (lgCursor.classList.contains("on-light") ? " on-light" : "");
      rip.style.left = e.clientX + "px";
      rip.style.top = e.clientY + "px";
      document.body.appendChild(rip);
      rip.addEventListener("animationend", () => rip.remove());
      setTimeout(() => rip.remove(), 800);
    });
    window.addEventListener("mouseup", () => lgCursor.classList.remove("down"));
    document.addEventListener("mouseleave", () => lgCursor.classList.remove("ready"));
    document.addEventListener("mouseenter", () => { if (shown) lgCursor.classList.add("ready"); });

    (function follow() {
      cx += (mx - cx) * 0.28;
      cy += (my - cy) * 0.28;
      // arrow hotspot is its top-left tip, so anchor there (no centering offset)
      lgCursor.style.transform = `translate(${cx}px, ${cy}px) translate(-1px, -1px)`;
      requestAnimationFrame(follow);
    })();
  }

  /* ---------- expose for tweaks ---------- */
  window.SMA = window.SMA || {};
  window.SMA.refresh = requestFrame;
})();
