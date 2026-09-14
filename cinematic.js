/* ============================================================
   SMA Cinematic — motor de rolagem (vanilla)
   ============================================================ */
(function () {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const estreito = window.matchMedia("(max-width: 860px)").matches;
  const economia = !!(navigator.connection && navigator.connection.saveData);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ============================================================
     SEQUENCIA DE QUADROS
     Os clipes do hero e do painel 01 viram sequencias de WebP na
     hora de publicar (ver assets/hero e assets/predio). O navegador
     nao decodifica video nem faz seek: baixa quadros prontos em
     passadas cada vez mais densas e desenha o mais proximo do
     ponto da rolagem. A primeira passada (4 quadros) chega em
     menos de um segundo e ja da o scrub inteiro; as seguintes so
     refinam. No celular a sequencia para na metade da densidade.
     ============================================================ */
  function sequencia(pasta, total, aoChegar) {
    const quadros = new Array(total);
    // cada quadro e um <img> decodificado: o navegador guarda o bitmap no
    // cache dele e pode soltar e redecodificar sob pressao de memoria, o que
    // um ImageBitmap preso em memoria nao permite
    function carregar(i) {
      if (quadros[i]) return Promise.resolve();
      return new Promise((res) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          const fim = () => { quadros[i] = img; aoChegar(i); res(); };
          if (img.decode) img.decode().then(fim, fim); else fim();
        };
        img.onerror = () => res();
        img.src = pasta + "/" + String(i + 1).padStart(2, "0") + ".webp";
      });
    }
    // quadro carregado mais proximo do pedido (as passadas grossas vem antes)
    function proximo(i) {
      if (quadros[i]) return quadros[i];
      for (let d = 1; d < total; d++) {
        if (quadros[i - d]) return quadros[i - d];
        if (quadros[i + d]) return quadros[i + d];
      }
      return null;
    }
    async function passadas(lista, paralelo) {
      for (const passo of lista) {
        const fila = [];
        for (let i = 0; i < total; i += passo) if (!quadros[i]) fila.push(i);
        // ate `paralelo` pedidos ao mesmo tempo: aproveita o HTTP/2 sem
        // sufocar a conexao no celular
        let k = 0;
        await Promise.all(Array.from({ length: paralelo }, async () => {
          while (k < fila.length) await carregar(fila[k++]);
        }));
        await new Promise((r) => setTimeout(r, 0));   // devolve a mao para a UI
      }
    }
    return { quadros, proximo, passadas };
  }

  /* ============================================================
     HERO — quadro preso, a rolagem controla a linha do tempo.
     ============================================================ */
  const hsSection = document.querySelector(".hero-scrub");
  const hsCanvas  = document.querySelector(".hs-canvas");
  const hsPoster  = document.querySelector(".hs-poster");
  const hsStages  = [...document.querySelectorAll(".hs-stage")];
  const HS_TOTAL  = 64;
  const ctx = hsCanvas ? hsCanvas.getContext("2d", { alpha: false }) : null;

  let hsTargetProg = 0, hsCur = 0, hsLoopOn = false, hsReady = false;
  let hsDrawIdx = -1, hsLastImg = null;

  function hsSizeCanvas() {
    if (!hsCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    hsCanvas.width = Math.round(hsCanvas.clientWidth * dpr);
    hsCanvas.height = Math.round(hsCanvas.clientHeight * dpr);
  }

  const hsSeq = hsCanvas ? sequencia("assets/hero", HS_TOTAL, (i) => {
    // repinta se o quadro que chegou e o que a rolagem pede agora
    if (hsReady && Math.round(hsCur * (HS_TOTAL - 1)) === i) { hsDrawIdx = -1; hsDraw(i); }
  }) : null;

  function hsDraw(idx) {
    if (!ctx || !hsSeq) return;
    idx = clamp(Math.round(idx), 0, HS_TOTAL - 1);
    const img = hsSeq.quadros[idx] || hsSeq.proximo(idx);
    if (!img) return;
    if (idx === hsDrawIdx && img === hsLastImg) return;
    const cw = hsCanvas.width, ch = hsCanvas.height;
    const sr = img.naturalWidth / img.naturalHeight, dr = cw / ch;
    let dw, dh, dx, dy;
    if (sr > dr) { dh = ch; dw = ch * sr; dx = (cw - dw) / 2; dy = 0; }     // cover
    else { dw = cw; dh = cw / sr; dx = 0; dy = (ch - dh) / 2; }
    try { ctx.drawImage(img, dx, dy, dw, dh); hsDrawIdx = idx; hsLastImg = img; } catch (e) {}
  }

  // Laco de suavizacao: o quadro pintado persegue a rolagem em vez de
  // pular a cada evento, e o laco para sozinho quando assenta.
  function hsEnsureLoop() { if (!hsLoopOn) { hsLoopOn = true; requestAnimationFrame(hsTick); } }
  function hsTick() {
    const diff = hsTargetProg - hsCur;
    const settled = Math.abs(diff) < 0.00035;
    hsCur = settled ? hsTargetProg : hsCur + diff * 0.16;
    if (hsReady) hsDraw(hsCur * (HS_TOTAL - 1));
    for (let i = 0; i < hsStages.length; i++) {
      const c = hsStages[i];
      const on = hsCur >= parseFloat(c.dataset.from) && hsCur < parseFloat(c.dataset.to);
      if (on !== c.classList.contains("on")) c.classList.toggle("on", on);
    }
    if (settled) { hsLoopOn = false; return; }
    requestAnimationFrame(hsTick);
  }

  if (hsSeq) {
    hsSizeCanvas();
    (async () => {
      // o poster (quadro 01) ja esta na pagina como <img>; o canvas assume
      // assim que o mesmo quadro estiver decodificado, sem salto
      await hsSeq.passadas([HS_TOTAL], 1);
      hsReady = true;
      hsDrawIdx = -1; hsDraw(hsCur * (HS_TOTAL - 1));
      hsCanvas.classList.add("ready");
      requestFrame();
      const densidade = reduce ? [16] : estreito || economia ? [16, 8, 4, 2] : [16, 8, 4, 2, 1];
      await hsSeq.passadas(densidade, estreito ? 4 : 8);
      if (hsPoster) hsPoster.remove();
    })();
  }
  window.addEventListener("resize", () => { hsSizeCanvas(); hsDrawIdx = -1; hsDraw(hsCur * (HS_TOTAL - 1)); });

  /* ---------- nav: fundo solido, barra de progresso, menu do celular ---------- */
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

  const menuBtn = document.querySelector(".nav-menu");
  const menu = document.querySelector(".menu");
  function fecharMenu() {
    if (!menu) return;
    document.body.classList.remove("menu-aberto");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
  }
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", () => {
      const aberto = document.body.classList.toggle("menu-aberto");
      menuBtn.setAttribute("aria-expanded", aberto ? "true" : "false");
    });
    menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", fecharMenu));
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharMenu(); });
  }

  /* ---------- revelar ao entrar ---------- */
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".fade, .mask").forEach((el) => io.observe(el));

  // a abertura do hero esta acima da dobra: revela de imediato
  function revealHero() {
    document.querySelectorAll(".hs-intro .mask, .hs-intro .fade").forEach((el) => el.classList.add("in"));
  }
  if (document.readyState === "complete") requestAnimationFrame(revealHero);
  else window.addEventListener("load", () => requestAnimationFrame(revealHero));
  setTimeout(revealHero, 300);
  // rede de seguranca: aba aberta em segundo plano congela transicoes CSS;
  // passado o tempo da entrada, o texto do hero e cravado no estado final
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

  /* ---------- parallax dos paineis ---------- */
  // o painel 01 tem movimento proprio (fica preso enquanto o predio se monta)
  // e por isso fica fora do parallax
  const panels = [...document.querySelectorAll(".panel")]
    .filter((p) => !p.classList.contains("area-build"))
    .map((p) => ({ p, media: p.querySelector(".p-media") }));

  let ticking = false;
  function frame() {
    try {
      const vh = innerHeight;
      if (hsSection) {
        const r = hsSection.getBoundingClientRect();
        const total = hsSection.offsetHeight - vh;
        hsTargetProg = clamp((-r.top) / (total || 1), 0, 1);
        hsEnsureLoop();
      }
      if (!reduce && !estreito) {
        panels.forEach(({ p, media }) => {
          if (!media) return;
          const r = p.getBoundingClientRect();
          if (r.bottom < -200 || r.top > vh + 200) return;
          const p2 = clamp((vh - r.top) / (vh + r.height), 0, 1);
          media.style.transform = `translateY(${lerp(-6, 6, p2)}%) scale(1.06)`;
        });
      }
    } catch (e) {
      // um quadro ruim nunca pode travar as atualizacoes de rolagem
    } finally {
      ticking = false;
    }
  }
  function requestFrame() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener("scroll", requestFrame, { passive: true });
  window.addEventListener("resize", requestFrame);
  frame();

  /* ---------- foco do formulario ---------- */
  document.querySelectorAll(".field input, .field textarea").forEach((el) => {
    el.addEventListener("focus", () => el.closest(".field").classList.add("focus"));
    el.addEventListener("blur", () => el.closest(".field").classList.remove("focus"));
  });

  /* ---------- ancoras com deslocamento da nav ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href"); if (id.length < 2) return;
      const t = document.querySelector(id);
      if (t) { e.preventDefault(); window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 52, behavior: "smooth" }); }
    });
  });

  /* ---------- painel 03: chaves, parado ate o mouse passar ----------
     O <video> nasce com preload="none" e um poster WebP: e o poster que
     todo mundo ve. So quem tem mouse, e so quando o painel se aproxima,
     baixa o clipe (280 KB, sem audio) para o scrub horizontal. No toque
     nao ha scrub, entao o clipe nunca e pedido. */
  const keysVideo = document.querySelector(".keys-video");
  const keysCanvas = document.querySelector(".keys-canvas");
  const keysPanel = document.querySelector(".keys-panel");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (keysVideo && keysPanel && keysCanvas && finePointer && !reduce) {
    keysVideo.muted = true;
    keysVideo.loop = false;
    const kctx = keysCanvas.getContext("2d");
    let dur = 0, ready = false, targetT = 0, curT = 0, seeking = false, pendingT = null;

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = keysCanvas.clientWidth, h = keysCanvas.clientHeight;
      if (!w || !h) return;
      keysCanvas.width = Math.round(w * dpr);
      keysCanvas.height = Math.round(h * dpr);
    }
    function drawCover() {
      if (!keysVideo.videoWidth) return;
      const cw = keysCanvas.width, ch = keysCanvas.height;
      const sr = keysVideo.videoWidth / keysVideo.videoHeight, dr = cw / ch;
      let w, h; if (sr > dr) { h = ch; w = ch * sr; } else { w = cw; h = cw / sr; }
      try { kctx.drawImage(keysVideo, (cw - w) / 2, (ch - h) / 2, w, h); } catch (e) {}
    }
    function onMeta() { dur = keysVideo.duration || 0; ready = true; sizeCanvas(); }
    keysVideo.addEventListener("loadedmetadata", onMeta, { once: true });
    keysVideo.addEventListener("seeked", () => {
      seeking = false;
      drawCover();
      keysCanvas.classList.add("on");
      if (pendingT != null) { const t = pendingT; pendingT = null; doSeek(t); }
    });
    window.addEventListener("resize", () => { sizeCanvas(); drawCover(); });

    function doSeek(t) {
      if (!ready) return;
      if (seeking) { pendingT = t; return; }
      seeking = true;
      try { keysVideo.currentTime = t; } catch (e) { seeking = false; }
    }
    // o playhead persegue o mouse e o laco para quando alcanca: sem rAF
    // rodando com o mouse parado
    let loopOn = false;
    function loop() {
      curT += (targetT - curT) * 0.16;
      if (Math.abs(curT - keysVideo.currentTime) > 0.02) doSeek(curT);
      if (Math.abs(targetT - curT) < 0.005) { loopOn = false; return; }
      requestAnimationFrame(loop);
    }
    keysPanel.addEventListener("pointermove", (e) => {
      if (!ready) return;
      keysPanel.classList.add("scrubbing");
      const r = keysPanel.getBoundingClientRect();
      let n = (e.clientX - r.left) / r.width;
      n = n < 0 ? 0 : n > 1 ? 1 : n;
      targetT = n * (dur - 0.04);
      if (!loopOn) { loopOn = true; requestAnimationFrame(loop); }
    }, { passive: true });

    const kIO = new IntersectionObserver((ents) => {
      if (!ents.some((e) => e.isIntersecting)) return;
      kIO.disconnect();
      keysVideo.preload = "auto";
      keysVideo.load();
    }, { rootMargin: "150% 0px" });
    kIO.observe(keysPanel);
  }

  /* ---------- painel 01: o predio se monta conforme a pagina desce ----------
     Os quadros ja vem prontos de assets/predio, com o fundo do estudio
     trocado pelo marfim da secao e as laterais dissolvidas: o trabalho de
     pixel que antes rodava a cada visita foi feito uma vez na publicacao.
     Aqui so se baixa e desenha. A sequencia so comeca a ser pedida quando
     o painel esta a ~1,5 tela de distancia, para nao disputar banda com o
     hero na abertura. */
  const bPanel  = document.querySelector(".area-build");
  const bCanvas = document.querySelector(".build-canvas");
  if (bPanel && bCanvas) {
    const B_TOTAL  = 64;
    // Medidas do proprio clipe: o pe do predio esta a 90,8% da altura do
    // quadro e o teto a 14,4%. O enquadramento e feito pelo predio, nao
    // pelo quadro, senao um quarto da caixa seria margem vazia.
    const B_PES    = 0.908;
    const B_TOPO   = 0.144;
    // no celular o predio fica na metade de cima da tela e o texto embaixo,
    // em vez de um sobre o outro
    const B_ALTURA = estreito ? 0.46 : 0.86;   // quanto da altura da caixa o predio pronto ocupa
    const B_BASE   = estreito ? 0.56 : 0.92;   // onde o pe do predio pousa na caixa
    const bctx = bCanvas.getContext("2d", { alpha: false });
    const bFundo = getComputedStyle(bPanel).backgroundColor || "#F1EEE6";
    let bReady = false, bDrawIdx = -1, bTarget = 0, bCur = 0, bLoopOn = false;

    function bSize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = bCanvas.clientWidth, h = bCanvas.clientHeight;
      if (!w || !h) return;
      bCanvas.width = Math.round(w * dpr);
      bCanvas.height = Math.round(h * dpr);
    }
    const bSeq = sequencia("assets/predio", B_TOTAL, (i) => {
      if (bReady && Math.round(bCur * (B_TOTAL - 1)) === i) { bDrawIdx = -1; bDraw(i); }
    });
    function bDraw(idx) {
      idx = clamp(Math.round(idx), 0, B_TOTAL - 1);
      const img = bSeq.quadros[idx] || bSeq.proximo(idx);
      if (!img) return;
      if (idx === bDrawIdx) return;
      const cw = bCanvas.width, ch = bCanvas.height;
      let dh = ch * (B_ALTURA / (B_PES - B_TOPO));
      let dw = dh * img.naturalWidth / img.naturalHeight;
      // no celular a caixa e mais estreita que alta: sem este teto o quadro
      // passaria da largura da tela e as laterais dissolvidas ficariam de fora
      if (dw > cw) { dw = cw; dh = dw * img.naturalHeight / img.naturalWidth; }
      try {
        bctx.fillStyle = bFundo;
        bctx.fillRect(0, 0, cw, ch);
        bctx.drawImage(img, (cw - dw) / 2, ch * B_BASE - dh * B_PES, dw, dh);
        bDrawIdx = idx;
      } catch (e) {}
    }
    // 0 quando o topo do painel encosta no topo da tela, 1 quando a secao
    // inteira ja passou: a rolagem presa e a linha do tempo do clipe
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
      if (bReady) bDraw(bCur * (B_TOTAL - 1));
      if (settled) { bLoopOn = false; return; }
      requestAnimationFrame(bTick);
    }
    function bOnScroll() { bTarget = bProgress(); bEnsureLoop(); }

    async function bCarregar() {
      if (reduce) {
        // sem animacao: mostra o predio pronto e para por ai
        await bSeq.passadas([B_TOTAL], 1);
        bSize(); bDrawIdx = -1; bDraw(B_TOTAL - 1); bCanvas.classList.add("on");
        return;
      }
      await bSeq.passadas([16], 4);
      bReady = true;
      bSize(); bDrawIdx = -1; bDraw(bCur * (B_TOTAL - 1)); bCanvas.classList.add("on");
      bOnScroll();
      await bSeq.passadas(estreito || economia ? [8, 4, 2] : [8, 4, 2, 1], estreito ? 4 : 8);
    }
    const bIO = new IntersectionObserver((ents) => {
      if (!ents.some((e) => e.isIntersecting)) return;
      bIO.disconnect();
      bCarregar();
    }, { rootMargin: "150% 0px" });
    bIO.observe(bPanel);

    if (!reduce) {
      window.addEventListener("scroll", bOnScroll, { passive: true });
      window.addEventListener("resize", () => { bSize(); bDrawIdx = -1; bDraw(bCur * (B_TOTAL - 1)); bOnScroll(); });
      bOnScroll();
    } else {
      window.addEventListener("resize", () => { bSize(); bDrawIdx = -1; bDraw(B_TOTAL - 1); });
    }
  }

  /* ---------- cursor de vidro ---------- */
  const lgCursor = document.querySelector(".lg-cursor");
  if (lgCursor && finePointer && !reduce) {
    let mx = innerWidth / 2, my = innerHeight / 2;
    let cx = mx, cy = my;
    let shown = false, following = false;
    const hoverSel = "a, button, .btn, .nav-cta, .link-arrow, input, textarea, [role='button'], .keys-media";

    // a bolha persegue o mouse e o laco para quando alcanca: sem rAF
    // rodando a pagina inteira com o mouse parado
    function follow() {
      cx += (mx - cx) * 0.28;
      cy += (my - cy) * 0.28;
      lgCursor.style.transform = `translate(${cx}px, ${cy}px) translate(-1px, -1px)`;
      if (Math.abs(mx - cx) < 0.3 && Math.abs(my - cy) < 0.3) { following = false; return; }
      requestAnimationFrame(follow);
    }

    window.addEventListener("mousemove", (e) => {
      mx = e.clientX; my = e.clientY;
      if (!shown) { shown = true; lgCursor.classList.add("ready"); }
      const el = document.elementFromPoint(mx, my);
      const lightCtx = el && el.closest(".light, .keys-panel, .approach, .area-light, .area-solid, #sobre, #contato");
      lgCursor.classList.toggle("on-light", !!lightCtx);
      lgCursor.classList.toggle("hover", !!(el && el.closest(hoverSel)));
      if (!following) { following = true; requestAnimationFrame(follow); }
    }, { passive: true });

    window.addEventListener("mousedown", (e) => {
      lgCursor.classList.add("down");
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
  }
})();
