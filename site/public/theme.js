// Runs before first paint, as a blocking external script (script-src 'self'
// allows it; an inline one would be blocked). Sets data-theme so the page
// never flashes the wrong theme. The toggle itself lives in the main bundle.
(function () {
  var mode = "system";
  try {
    mode = localStorage.getItem("ps-docs-theme") || "system";
  } catch (e) {}
  var dark =
    mode === "dark" ||
    (mode !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var root = document.documentElement;
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.setAttribute("data-theme-mode", mode);
})();
