// Press-and-hold: the action only fires after the button has been held for
// `ms`, so a toddler's quick taps do nothing. A ring fills while holding.

export function holdToActivate(button, ms, onDone) {
  button.style.setProperty("--hold-ms", ms + "ms");
  let timer = null;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    button.classList.remove("is-holding");
  };

  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    cancel();
    try { button.setPointerCapture(e.pointerId); } catch {}
    button.classList.add("is-holding");
    timer = setTimeout(() => {
      timer = null;
      button.classList.remove("is-holding");
      button.classList.add("is-done");
      setTimeout(() => button.classList.remove("is-done"), 300);
      onDone();
    }, ms);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]) {
    button.addEventListener(type, cancel);
  }
  // Swallow the click so nothing underneath reacts to a short tap.
  button.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
}
