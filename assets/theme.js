/* Algebra 7H — theme switch.
 * Cycles Auto -> Light -> Dark -> Auto. "Auto" follows the reader's system setting,
 * which is the honest default; an explicit choice overrides it and is remembered.
 *
 * The no-flash work is NOT here — it is a tiny inline script in each page's <head>,
 * because it has to run before first paint. This file only draws the control.
 */
(function () {
  "use strict";
  var KEY = ((window.SITE && window.SITE.ns) || "alg7h") + ":theme";
  var ORDER = ["auto", "light", "dark"];
  var FACE = {
    auto:  { glyph: "◐", label: "Auto"  },
    light: { glyph: "☀", label: "Light" },
    dark:  { glyph: "☾", label: "Dark"  }
  };

  function stored() {
    try { var v = localStorage.getItem(KEY); return (v === "light" || v === "dark") ? v : "auto"; }
    catch (e) { return "auto"; }
  }
  function persist(mode) {
    try {
      if (mode === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch (e) { /* storage off: the toggle still works for this page view */ }
  }
  function apply(mode) {
    var el = document.documentElement;
    if (mode === "auto") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", mode);
  }
  function effective(mode) {
    if (mode !== "auto") return mode;
    try {
      return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark" : "light";
    } catch (e) { return "light"; }
  }

  function build() {
    var header = document.querySelector("header");
    if (!header || document.querySelector(".themetoggle")) return;

    var mode = stored();
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "themetoggle";
    btn.setAttribute("aria-live", "polite");

    function paint() {
      var f = FACE[mode];
      btn.innerHTML = '<span class="glyph" aria-hidden="true">' + f.glyph + "</span>" +
                      "<span>" + f.label + "</span>";
      var now = effective(mode);
      btn.title = mode === "auto"
        ? "Following your device setting (currently " + now + "). Click for light."
        : "Theme: " + f.label + ". Click for " + FACE[ORDER[(ORDER.indexOf(mode) + 1) % 3]].label.toLowerCase() + ".";
      btn.setAttribute("aria-label", "Theme: " + f.label + ". Click to change.");
    }

    btn.addEventListener("click", function () {
      mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
      apply(mode); persist(mode); paint();
    });

    // Keep the tooltip honest if the system flips while we are on Auto.
    try {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () { if (mode === "auto") paint(); };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (e) {}

    paint();
    header.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else { build(); }
})();
