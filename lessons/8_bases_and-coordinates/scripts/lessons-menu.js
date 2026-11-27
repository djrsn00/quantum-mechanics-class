(() => {
  "use strict";

  const trigger = document.querySelector(".lessons-menu-toggle");
  const panel = document.getElementById("lessons-menu");
  if (!trigger || !panel) return;

  if (!panel.querySelector("a[href]")) {
    const cards = document.querySelectorAll(".topic-grid > a.topic-link[href]");
    if (cards.length === 0) return;

    const links = document.createDocumentFragment();

    for (const card of cards) {
      const link = document.createElement("a");
      link.setAttribute("href", card.getAttribute("href"));

      const step = document.createElement("span");
      step.className = "lessons-menu-step";
      step.textContent = card.querySelector(".topic-step").textContent;

      const title = document.createElement("span");
      title.textContent = card.querySelector(".topic-title").textContent;

      link.append(step, " ", title);
      links.append(link);
    }

    panel.append(links);
  }

  function handleEscape(event) {
    if (event.key !== "Escape" || event.defaultPrevented) return;

    event.preventDefault();
    setOpen(false);
    trigger.focus({ preventScroll: true });
  }

  function setOpen(open) {
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));

    if (open) {
      document.addEventListener("keydown", handleEscape);
    } else {
      document.removeEventListener("keydown", handleEscape);
    }
  }

  trigger.addEventListener("click", () => {
    setOpen(panel.hidden);
    trigger.focus({ preventScroll: true });
  });

  function closeOnLink(event) {
    if (!event.target.closest("a[href]")) return;

    setOpen(false);
    trigger.focus({ preventScroll: true });
  }

  panel.addEventListener("click", closeOnLink);
  panel.addEventListener("auxclick", event => {
    if (event.button === 1) closeOnLink(event);
  });

  trigger.hidden = false;
})();