/**
 * Sabha's Constellation-S identity.
 *
 * The geometry is taken from the approved logo exploration. Each instance
 * receives an id prefix so the two appearance variants can keep independent
 * gradient definitions even when the lockup appears more than once on a page.
 */
export function SabhaMark({
  idPrefix,
  className,
}: {
  idPrefix: string;
  className?: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <svg
      className={className ? `sabha-mark ${className}` : "sabha-mark"}
      viewBox="257 305 198 239"
      fill="none"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={id("top-arc")}
          x1="303"
          y1="410"
          x2="416"
          y2="337"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#c9b1e5" stopOpacity="0.05" />
          <stop offset="0.35" stopColor="#ba94ce" stopOpacity="0.8" />
          <stop offset="1" stopColor="#b782af" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient
          id={id("mid-arc")}
          x1="312"
          y1="423"
          x2="411"
          y2="490"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#b491d9" stopOpacity="0.65" />
          <stop offset="1" stopColor="#a571b9" />
        </linearGradient>
        <linearGradient
          id={id("bottom-arc")}
          x1="297"
          y1="521"
          x2="405"
          y2="510"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#c7b0e5" stopOpacity="0" />
          <stop offset="0.38" stopColor="#c0a0dc" stopOpacity="0.8" />
          <stop offset="1" stopColor="#9b6cab" />
        </linearGradient>
        <linearGradient id={id("plum-node")} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#a974a2" />
          <stop offset="0.6" stopColor="#7b3e78" />
          <stop offset="1" stopColor="#612b61" />
        </linearGradient>
        <radialGradient id={id("lilac-node")} cx="20%" cy="20%" r="90%">
          <stop stopColor="#e2cff4" />
          <stop offset="0.6" stopColor="#be98df" />
          <stop offset="1" stopColor="#a87cd0" />
        </radialGradient>
        <linearGradient id={id("star")} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#c9b1d8" />
          <stop offset="1" stopColor="#846595" />
        </linearGradient>
        <linearGradient
          id={id("night-arc")}
          x1="300"
          y1="340"
          x2="418"
          y2="529"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="0.5" stopColor="#b68fdd" />
          <stop offset="1" stopColor="#d0bce9" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      <g className="sabha-mark__light">
        <path
          d="M303 406 C301 365 357 341 417 336"
          stroke={`url(#${id("top-arc")})`}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M313 423 C338 440 392 437 408 469 C416 482 412 495 404 504"
          stroke={`url(#${id("mid-arc")})`}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M298 524 C337 535 374 521 404 507"
          stroke={`url(#${id("bottom-arc")})`}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <circle cx="419" cy="336" r="16.7" fill={`url(#${id("plum-node")})`} />
        <circle
          cx="305.5"
          cy="418.5"
          r="16.5"
          fill={`url(#${id("lilac-node")})`}
        />
        <circle
          cx="404.5"
          cy="504"
          r="16.5"
          fill={`url(#${id("plum-node")})`}
        />
        <g fill={`url(#${id("star")})`}>
          <circle cx="337.5" cy="315.3" r="5.6" />
          <circle cx="282.4" cy="359.5" r="5.2" />
          <circle cx="413.4" cy="412" r="5.4" />
          <circle cx="444.3" cy="445.5" r="5.4" />
          <circle cx="301.8" cy="482.8" r="5.1" />
          <circle cx="267.8" cy="510.5" r="6" />
        </g>
      </g>

      <g className="sabha-mark__dark">
        <path
          d="M303 406 C301 365 357 341 417 336 M313 423 C338 440 392 437 408 469 C416 482 412 495 404 504 M298 524 C337 535 374 521 404 507"
          stroke={`url(#${id("night-arc")})`}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <circle cx="419" cy="336" r="17" fill="#fff" />
        <circle
          cx="305.5"
          cy="418.5"
          r="16.5"
          fill={`url(#${id("lilac-node")})`}
        />
        <circle cx="404.5" cy="504" r="16.5" fill="#fff" />
        <g fill="#faf5ff">
          <circle cx="337.5" cy="315.3" r="5.6" />
          <circle cx="282.4" cy="359.5" r="5.2" />
          <circle cx="413.4" cy="412" r="5.4" />
          <circle cx="444.3" cy="445.5" r="5.4" />
          <circle cx="301.8" cy="482.8" r="5.1" />
          <circle cx="267.8" cy="510.5" r="6" />
        </g>
      </g>
    </svg>
  );
}

export function SabhaLogo({
  idPrefix,
  className,
  label,
  wordmark = "Sabha AI",
}: {
  idPrefix: string;
  className?: string;
  label?: string;
  wordmark?: string;
}) {
  return (
    <span
      className={className ? `sabha-logo ${className}` : "sabha-logo"}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <SabhaMark idPrefix={idPrefix} className="sabha-logo__mark" />
      <span
        className="sabha-logo__wordmark"
        aria-hidden={label ? "true" : undefined}
      >
        {wordmark}
      </span>
    </span>
  );
}
