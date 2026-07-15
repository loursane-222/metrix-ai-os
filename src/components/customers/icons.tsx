// Minimal inline SVG icon set — no icon library dependency added.
import type { ReactNode } from "react";

type IconProps = { className?: string };

function base(paths: ReactNode, className?: string) {
  return (
    <svg
      className={className ?? "h-5 w-5"}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
    >
      {paths}
    </svg>
  );
}

export const IconHome = ({ className }: IconProps) =>
  base(<path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />, className);

export const IconTasks = ({ className }: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12 2.3 2.3L15.5 9.5" />
    </>,
    className,
  );

export const IconChat = ({ className }: IconProps) =>
  base(<path d="M4 5h16v11H8l-4 4V5Z" />, className);

export const IconChart = ({ className }: IconProps) =>
  base(<path d="M5 19V9m6.5 10V5M18 19v-6" />, className);

export const IconUsers = ({ className }: IconProps) =>
  base(
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-3.1 2.9-5 5.5-5s4.9 1.9 5.5 5M16 8.5a2.75 2.75 0 1 1 0-.01M20.5 19c-.4-2.1-1.7-3.7-3.5-4.5" />
    </>,
    className,
  );

export const IconPerson = ({ className }: IconProps) =>
  base(
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1-4 4-6.2 7.5-6.2s6.5 2.2 7.5 6.2" />
    </>,
    className,
  );

export const IconChevronLeft = ({ className }: IconProps) => base(<path d="m14.5 5-7 7 7 7" />, className);

export const IconStar = ({ className }: IconProps) =>
  base(<path d="m12 4 2.3 4.9 5.2.7-3.8 3.8.9 5.4L12 16.3 7.4 18.8l.9-5.4-3.8-3.8 5.2-.7L12 4Z" />, className);

export const IconDots = ({ className }: IconProps) =>
  base(
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>,
    className,
  );

export const IconSearch = ({ className }: IconProps) =>
  base(
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </>,
    className,
  );

export const IconSort = ({ className }: IconProps) =>
  base(<path d="M7 5v14m0 0-3-3m3 3 3-3M17 19V5m0 0 3 3m-3-3-3 3" />, className);

export const IconPhone = ({ className }: IconProps) =>
  base(<path d="M6 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2C10 18.5 5.5 14 4 7.2A2 2 0 0 1 6 4Z" />, className);

export const IconMail = ({ className }: IconProps) =>
  base(
    <>
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <path d="m4 6.5 8 6 8-6" />
    </>,
    className,
  );

export const IconMapPin = ({ className }: IconProps) =>
  base(
    <>
      <path d="M12 21s7-6.1 7-11.5a7 7 0 0 0-14 0C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </>,
    className,
  );

export const IconBadge = ({ className }: IconProps) =>
  base(
    <>
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <path d="M7 9h2m-2 3h6M7 15h4" />
    </>,
    className,
  );

export const IconShield = ({ className }: IconProps) =>
  base(<path d="M12 3.5 5 6v6c0 4.2 3 7 7 8.5 4-1.5 7-4.3 7-8.5V6l-7-2.5Z" />, className);

export const IconBrain = ({ className }: IconProps) =>
  base(
    <>
      <path d="M9 4.5A2.5 2.5 0 0 0 6.5 7v.3A2.7 2.7 0 0 0 5 9.7v1A2.7 2.7 0 0 0 6.5 13v.5A3 3 0 0 0 9.5 16.5H10v3" />
      <path d="M15 4.5A2.5 2.5 0 0 1 17.5 7v.3A2.7 2.7 0 0 1 19 9.7v1A2.7 2.7 0 0 1 17.5 13v.5A3 3 0 0 1 14.5 16.5H14v3" />
      <path d="M10 4.5v15M14 4.5v15" />
    </>,
    className,
  );

export const IconSparkle = ({ className }: IconProps) =>
  base(
    <>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
      <path d="m7 7 2 2m6 6 2 2M17 7l-2 2M9 15l-2 2" />
    </>,
    className,
  );

export const IconFileText = ({ className }: IconProps) =>
  base(
    <>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 12h6M9 15.5h6M14 3.5V8h4" />
    </>,
    className,
  );

export const IconPlus = ({ className }: IconProps) => base(<path d="M12 5v14M5 12h14" />, className);

export const IconPackage = ({ className }: IconProps) =>
  base(
    <>
      <path d="m3.5 8 8.5-4.5L20.5 8 12 12.5 3.5 8Z" />
      <path d="M3.5 8v8L12 20.5m0-8L20.5 8m-8.5 4.5V20.5" />
    </>,
    className,
  );

export const IconWallet = ({ className }: IconProps) =>
  base(
    <>
      <rect height="13" rx="2" width="18" x="3" y="6.5" />
      <path d="M16.5 13.2h.01M3 10h18" />
    </>,
    className,
  );

export const IconGlobe = ({ className }: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.7 5.4 3.7 8.5s-1.3 6.1-3.7 8.5c-2.4-2.4-3.7-5.4-3.7-8.5S9.6 5.9 12 3.5Z" />
    </>,
    className,
  );

export const IconLock = ({ className }: IconProps) =>
  base(
    <>
      <rect height="10" rx="2" width="14" x="5" y="10.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>,
    className,
  );

export const IconArchive = ({ className }: IconProps) =>
  base(
    <>
      <rect height="4" rx="1" width="18" x="3" y="4" />
      <path d="M5 8v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 13h4" />
    </>,
    className,
  );

export const IconClose = ({ className }: IconProps) => base(<path d="m6 6 12 12M18 6 6 18" />, className);

export const IconFilter = ({ className }: IconProps) =>
  base(<path d="M4 5.5h16l-6 7.2V19l-4 2v-8.3L4 5.5Z" />, className);

export const IconTrendUp = ({ className }: IconProps) =>
  base(
    <>
      <path d="m4 15.5 5.5-6 4 3.5L20 5" />
      <path d="M14.5 5H20v5.5" />
    </>,
    className,
  );

// Shared "METRIX Executive" silhouette — single asset used at every size
// (hero orb, floating orb). Anonymous suited bust: oval head, neck, wide
// jacket shoulders, lapels and a shirt/tie trace. No facial detail, no
// photo/stock avatar. Only the CSS box sizing changes between usages.
export const IconSilhouette = ({ className }: IconProps) => (
  <svg className={className ?? "h-10 w-10"} viewBox="0 0 200 200">
    <defs>
      <linearGradient id="silhouetteRim" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#4fd7dd" stopOpacity="0.55" />
        <stop offset="30%" stopColor="#0a1015" stopOpacity="0" />
      </linearGradient>
    </defs>

    {/* head — flatter crown, tapered jaw */}
    <path
      d="M100,24 C123,24 140,43 140,66 C140,85 129,100 114,106 L114,112 L86,112 L86,106 C71,100 60,85 60,66 C60,43 77,24 100,24 Z"
      fill="#02070a"
    />
    {/* neck */}
    <path d="M85,112 L115,112 L124,131 L76,131 Z" fill="#02070a" />
    {/* jacket / shoulders */}
    <path d="M18,192 C22,149 44,130 78,126 L100,150 L122,126 C156,130 178,149 182,192 Z" fill="#02070a" />
    {/* lapels */}
    <path d="M100,150 L78,126 L90,182 Z" fill="#0c151b" />
    <path d="M100,150 L122,126 L110,182 Z" fill="#0c151b" />
    {/* shirt collar + tie trace */}
    <path d="M92,144 L108,144 L104,158 L96,158 Z" fill="#111b21" />
    <path d="M97,158 L103,158 L101,192 L99,192 Z" fill="#111b21" />

    {/* diagonal cyan rim light over head + shoulders */}
    <path
      d="M100,24 C123,24 140,43 140,66 C140,85 129,100 114,106 L114,112 L86,112 L86,106 C71,100 60,85 60,66 C60,43 77,24 100,24 Z"
      fill="url(#silhouetteRim)"
    />
    <path d="M18,192 C22,149 44,130 78,126 L100,150 L122,126 C156,130 178,149 182,192 Z" fill="url(#silhouetteRim)" />
  </svg>
);
