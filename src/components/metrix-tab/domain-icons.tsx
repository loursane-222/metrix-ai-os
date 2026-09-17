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

export const IconTasks = ({ className }: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12 2.3 2.3L15.5 9.5" />
    </>,
    className,
  );

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

export const IconFileText = ({ className }: IconProps) =>
  base(
    <>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 12h6M9 15.5h6M14 3.5V8h4" />
    </>,
    className,
  );

export const IconPackage = ({ className }: IconProps) =>
  base(
    <>
      <path d="m3.5 8 8.5-4.5L20.5 8 12 12.5 3.5 8Z" />
      <path d="M3.5 8v8L12 20.5m0-8L20.5 8m-8.5 4.5V20.5" />
    </>,
    className,
  );

export const IconTruck = ({ className }: IconProps) =>
  base(
    <>
      <path d="M3.5 6.5h10v10h-10zM13.5 10h3.8l3.2 3.4v3.1h-7" />
      <circle cx="7" cy="18" r="2" /><circle cx="17.5" cy="18" r="2" />
      <path d="M13.5 13.5h6" />
    </>,
    className,
  );

export const IconFactory = ({ className }: IconProps) =>
  base(
    <>
      <path d="M3.5 20.5v-11l5 3v-3l5 3V5h4v9l3 2v4.5h-17Z" />
      <path d="M7 16.5h1M12 16.5h1M17 16.5h1" />
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
