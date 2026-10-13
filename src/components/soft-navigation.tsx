"use client";

import { useRouter } from "next/navigation";
import { useRef, type MouseEvent, type ReactNode } from "react";

// Client-side navigation for plain <a> links inside children.
// One listener instead of a <Link> per row keeps large lists cheap to hydrate.
export function SoftNavigation({ children }: { children: ReactNode }) {
  const router = useRouter();
  const prefetched = useRef(new Set<string>());

  function findLink(event: MouseEvent) {
    const link = (event.target as Element).closest("a");
    if (!link || link.target || link.origin !== window.location.origin) {
      return null;
    }
    return link.pathname + link.search;
  }

  function handleClick(event: MouseEvent) {
    // Keep browser behavior for new-tab clicks and modified clicks
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const href = findLink(event);
    if (!href) return;
    event.preventDefault();
    router.push(href);
  }

  // Prefetch the card on hover, like <Link> would, once per link
  function handleMouseOver(event: MouseEvent) {
    const href = findLink(event);
    if (!href || prefetched.current.has(href)) return;
    prefetched.current.add(href);
    router.prefetch(href);
  }

  return (
    <div onClick={handleClick} onMouseOver={handleMouseOver}>
      {children}
    </div>
  );
}
