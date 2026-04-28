// Scroll the given container so `section`'s top aligns with the container's top.
// Avoids `Element.scrollIntoView`, which walks up all scroll-containers (including
// the Sidebar's `overflow-hidden` wrapper) and can scroll ancestors we don't want
// to move.
export function scrollSectionIntoContainer(
  container: HTMLElement,
  section: HTMLElement,
  behavior: ScrollBehavior,
) {
  const top =
    section.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop
  container.scrollTo({ top, behavior })
}
