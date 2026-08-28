const overlay = document.querySelector("[data-overlay]");
document.querySelector("[data-cancel]")?.addEventListener("click", () => { overlay.hidden = true; });
document.querySelector("[data-confirm]")?.addEventListener("click", () => { overlay.hidden = true; });
