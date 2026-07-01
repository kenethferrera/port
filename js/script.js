const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.querySelector(".nav-menu");
const backToTop = document.querySelector(".back-to-top");
const typingText = document.querySelector("#typing-text");
const heroPhrase = "organized operations.";

const refreshIcons = () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }
};

const setMenuState = (isOpen) => {
  navMenu.classList.toggle("open", isOpen);
  document.body.classList.toggle("menu-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.innerHTML = `<i data-lucide="${isOpen ? "x" : "menu"}"></i>`;
  refreshIcons();
};

navToggle.addEventListener("click", () => {
  setMenuState(!navMenu.classList.contains("open"));
});

navMenu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMenuState(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenuState(false);
  }
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

const typeHero = () => {
  let index = 0;
  typingText.textContent = "";

  const type = () => {
    typingText.textContent = heroPhrase.slice(0, index);
    index += 1;

    if (index <= heroPhrase.length) {
      window.setTimeout(type, 28);
    }
  };

  type();
};

window.addEventListener("scroll", () => {
  backToTop.classList.toggle("visible", window.scrollY > 500);
});

backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("load", () => {
  refreshIcons();
  typeHero();
});
