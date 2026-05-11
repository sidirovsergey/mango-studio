/**
 * Stroke-based SVG icons matching landing's `.i` style:
 * width/height 14, stroke-width 1.8, currentColor stroke, no fill.
 * Larger sizes are passed via the optional `size` prop.
 *
 * All icons are purely decorative (aria-hidden + role=presentation) — they
 * accompany text labels in every call site. Biome's noSvgWithoutTitle still
 * fires for empty <svg>; suppress at file level since adding empty <title>
 * just to silence the rule is worse for screen readers than role=presentation.
 */
import type { SVGProps } from 'react';

interface Props extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

function base(p: Props) {
  const { size = 14, ...rest } = p;
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    role: 'presentation' as const,
    ...rest,
  };
}

export function IconPencil(p: Props) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, role=presentation
    <svg {...base(p)}>
      <path d="M4 20h4l11-11-4-4L4 16v4z" />
      <path d="M14 6l4 4" />
    </svg>
  );
}

export function IconFrame(p: Props) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, role=presentation
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 16l5-5 4 4 3-3 6 6" />
      <circle cx="8.5" cy="9" r="1.5" />
    </svg>
  );
}

export function IconClapper(p: Props) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, role=presentation
    <svg {...base(p)}>
      <path d="M3 9l18-3v3H3z" />
      <path d="M7 6l1 3M12 5l1 3M17 4l1 3" />
      <rect x="3" y="9" width="18" height="11" rx="1.5" />
    </svg>
  );
}

export function IconPlay(p: Props) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, role=presentation
    <svg {...base(p)}>
      <path d="M8 5l11 7-11 7V5z" />
    </svg>
  );
}

export function IconRefresh(p: Props) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, role=presentation
    <svg {...base(p)}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

export function IconUpload(p: Props) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, role=presentation
    <svg {...base(p)}>
      <path d="M12 3v13" />
      <path d="M6 9l6-6 6 6" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function IconNote(p: Props) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, role=presentation
    <svg {...base(p)}>
      <path d="M5 4h11l4 4v12H5z" />
      <path d="M8 13h8M8 17h6M8 9h4" />
    </svg>
  );
}

export function IconArrowUpRight(p: Props) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, role=presentation
    <svg {...base(p)}>
      <path d="M8 17L17 8" />
      <path d="M9 8h8v8" />
    </svg>
  );
}

export function IconChevronDown(p: Props) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, role=presentation
    <svg {...base(p)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconDot(p: Props) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, role=presentation
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}
