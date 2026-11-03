// Shares the Lenis smooth-scroll instance created in App.jsx,
// so components can scroll to a position without fighting it.
let lenis = null

export const setLenis = (instance) => {
  lenis = instance
}

export function scrollToY(y) {
  if (lenis) lenis.scrollTo(y, { duration: 1.4 })
  else window.scrollTo({ top: y, behavior: 'smooth' })
}
