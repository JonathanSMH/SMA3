/* SMA Cinematic — Tweaks island */
const SMA_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": ["#0F1F46", "#6E8DC4"],
  "motion": "cinematic",
  "heroType": "mixed"
}/*EDITMODE-END*/;

function SMACinematicTweaks() {
  const [t, setTweak] = useTweaks(SMA_TWEAK_DEFAULTS);
  const root = document.documentElement;

  React.useEffect(() => {
    const [main, light] = Array.isArray(t.accent) ? t.accent : [t.accent, t.accent];
    root.style.setProperty("--accent", main);
    root.style.setProperty("--accent-2", light);
  }, [t.accent]);

  React.useEffect(() => {
    // motion intensity: scale the parallax / word-fill aggressiveness via a class
    document.body.classList.remove("motion-calm", "motion-cinematic", "motion-bold");
    document.body.classList.add("motion-" + t.motion);
    if (window.SMA && window.SMA.refresh) window.SMA.refresh();
  }, [t.motion]);

  React.useEffect(() => {
    const h1 = document.querySelector(".hero h1");
    if (!h1) return;
    const italics = h1.querySelectorAll(".serif-it");
    if (t.heroType === "sans") {
      italics.forEach((el) => { el.style.fontFamily = "var(--sans)"; el.style.fontStyle = "normal"; });
    } else {
      italics.forEach((el) => { el.style.fontFamily = ""; el.style.fontStyle = ""; });
    }
  }, [t.heroType]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Identidade" />
      <TweakColor
        label="Cor de destaque"
        value={t.accent}
        options={[
          ["#0F1F46", "#6E8DC4"],
          ["#13294B", "#7FA0D8"],
          ["#0E2438", "#5FA0B8"],
          ["#1A2A52", "#8A9AC8"],
        ]}
        onChange={(v) => setTweak("accent", v)}
      />
      <TweakRadio
        label="Título do hero"
        value={t.heroType}
        options={[
          { value: "mixed", label: "Misto" },
          { value: "sans", label: "Sans" },
        ]}
        onChange={(v) => setTweak("heroType", v)}
      />

      <TweakSection label="Movimento" />
      <TweakRadio
        label="Intensidade"
        value={t.motion}
        options={[
          { value: "calm", label: "Calmo" },
          { value: "cinematic", label: "Cinema" },
          { value: "bold", label: "Bold" },
        ]}
        onChange={(v) => setTweak("motion", v)}
      />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("tweaks-root")).render(<SMACinematicTweaks />);
