/* SMA — Tweaks island. Drives the vanilla site via CSS vars + window.SMA. */
const SMA_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "heroDirection": "a",
  "accent": ["#7A2230", "#95303D"],
  "displayFont": "Bodoni Moda",
  "grain": true,
  "customCursor": true
}/*EDITMODE-END*/;

function SMATweaks() {
  const [t, setTweak] = useTweaks(SMA_TWEAK_DEFAULTS);
  const root = document.documentElement;

  React.useEffect(() => {
    if (window.SMA && window.SMA.setHero) window.SMA.setHero(t.heroDirection);
    else document.body.setAttribute("data-hero", t.heroDirection);
  }, [t.heroDirection]);

  React.useEffect(() => {
    const [main, light] = Array.isArray(t.accent) ? t.accent : [t.accent, t.accent];
    root.style.setProperty("--accent", main);
    root.style.setProperty("--burgundy", main);
    root.style.setProperty("--burgundy-2", light);
  }, [t.accent]);

  React.useEffect(() => {
    root.style.setProperty("--font-display", `"${t.displayFont}", serif`);
  }, [t.displayFont]);

  React.useEffect(() => {
    document.body.style.setProperty("--grain-op", t.grain ? "0.05" : "0");
    let s = document.getElementById("grain-style");
    if (!s) { s = document.createElement("style"); s.id = "grain-style"; document.head.appendChild(s); }
    s.textContent = `body::after{opacity:${t.grain ? 0.05 : 0} !important;}`;
  }, [t.grain]);

  React.useEffect(() => {
    document.body.style.cursor = t.customCursor ? "none" : "auto";
    const dot = document.querySelector(".cursor-dot");
    const ring = document.querySelector(".cursor-ring");
    [dot, ring].forEach((el) => { if (el) el.style.display = t.customCursor ? "" : "none"; });
  }, [t.customCursor]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Layout" />
      <TweakRadio
        label="Direção do hero"
        value={t.heroDirection}
        options={[
          { value: "a", label: "Editorial" },
          { value: "b", label: "Centralizado" },
          { value: "c", label: "Índice" },
        ]}
        onChange={(v) => setTweak("heroDirection", v)}
      />

      <TweakSection label="Identidade" />
      <TweakColor
        label="Cor de destaque"
        value={t.accent}
        options={[
          ["#7A2230", "#95303D"],
          ["#9B5A3C", "#B5764F"],
          ["#1E5A4C", "#2C7766"],
          ["#9C7A3C", "#B89A54"],
        ]}
        onChange={(v) => setTweak("accent", v)}
      />
      <TweakSelect
        label="Fonte de título"
        value={t.displayFont}
        options={["Bodoni Moda", "Cormorant Garamond", "Playfair Display"]}
        onChange={(v) => setTweak("displayFont", v)}
      />

      <TweakSection label="Movimento" />
      <TweakToggle label="Cursor personalizado" value={t.customCursor} onChange={(v) => setTweak("customCursor", v)} />
      <TweakToggle label="Textura de grão" value={t.grain} onChange={(v) => setTweak("grain", v)} />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("tweaks-root")).render(<SMATweaks />);
