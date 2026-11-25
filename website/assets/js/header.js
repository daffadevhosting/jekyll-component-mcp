const header = document.querySelector(".site-header");
const menuToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector("#primary-navigation");

if (header) {
  const updateScrolledState = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };

  updateScrolledState();
  window.addEventListener("scroll", updateScrolledState, { passive: true });
}

if (menuToggle && siteNav) {
  const setMenuOpen = (isOpen) => {
    siteNav.classList.toggle("is-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  };

  menuToggle.addEventListener("click", () => {
    setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
  });

  siteNav.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false);
      menuToggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 640) setMenuOpen(false);
  });
}
