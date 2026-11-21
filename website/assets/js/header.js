const header = document.querySelector(".site-header");

if (header) {
  const updateScrolledState = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };

  updateScrolledState();
  window.addEventListener("scroll", updateScrolledState, { passive: true });
}
