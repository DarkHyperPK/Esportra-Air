import React from "react";

const paths = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7" />
    </>
  ),
  shortcuts: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M6 9h1m4 0h1m4 0h1M6 13h1m4 0h1m4 0h1M8 16h8" />
    </>
  ),
  hud: (
    <>
      <path d="M4 7h16M4 17h16" />
      <rect x="7" y="4" width="4" height="6" rx="1" />
      <rect x="14" y="14" width="4" height="6" rx="1" />
    </>
  ),
  matches: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M7 2v4m10-4v4M3 10h18M8 14h2m4 0h2m-8 3h2" />
    </>
  ),
  players: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v3" />
    </>
  ),
  live: <path d="M2 12h4l3-8 6 16 3-8h4" />,
  template: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18M9 9v12" />
    </>
  ),
  producer: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="3" />
      <path d="M8 21h8m-4-4v4m-2-14 5 3-5 3Z" />
    </>
  ),
  connections: (
    <path d="m8 3-4 4 4 4m8 2 4 4-4 4M4 7h9a4 4 0 0 1 4 4m3 6h-9a4 4 0 0 1-4-4" />
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4.3 1.7c-1.3 1-1.8 1.3-1.8 2.8m0 3h.01" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l1.5 1.5m13 13L20 20M4 20l1.5-1.5m13-13L20 4" />
    </>
  ),
  moon: <path d="M20 14a8.5 8.5 0 0 1-10-10A8.5 8.5 0 1 0 20 14Z" />,
  screen: (
    <>
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </>
  ),
  book: (
    <path d="M12 5C9 3 6 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15" />
  ),
};

export default function AirIcon({ name, size = 18, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.screen}
    </svg>
  );
}
