const container = document.getElementById("reveal-container");
const revealLayer = document.getElementById("reveal-layer");

container.addEventListener("mousemove", (e) => {
  const rect = container.getBoundingClientRect();

  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  revealLayer.style.setProperty("--x", `${x}px`);
  revealLayer.style.setProperty("--y", `${y}px`);
});
