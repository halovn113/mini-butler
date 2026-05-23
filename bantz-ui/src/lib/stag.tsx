/**
 * Inline geometric stag mark — Bantz's primary brand symbol.
 * Kept inline (not <img>) so it inherits currentColor and accepts animations.
 */
export function StagMark({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size * 1.1}
      viewBox="-10 -10 100 110"
      fill="none"
      className={className}
      aria-label="Bantz stag"
    >
      {/* Skull */}
      <path
        d="M40,52 C47,52 54,55 55,62 C56,69 54,77 50,82 C47,86 44,88 40,88 C36,88 33,86 30,82 C26,77 24,69 25,62 C26,55 33,52 40,52 Z"
        fill="currentColor"
      />
      {/* Left ear */}
      <path
        d="M29,56 C22,46 12,44 13,54 C14,61 23,62 29,59 Z"
        fill="currentColor"
      />
      {/* Right ear */}
      <path
        d="M51,56 C58,46 68,44 67,54 C66,61 57,62 51,59 Z"
        fill="currentColor"
      />
      {/* Left antlers */}
      <path
        d="M38,52 C36,42 29,30 17,18 C10,10 3,4 -2,0"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M28,38 C22,30 20,21 23,13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16,18 C11,10 10,4 13,0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M2,6 C-1,2 -2,0 -2,0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M2,6 C5,2 7,1 8,0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Right antlers */}
      <path
        d="M42,52 C44,42 51,30 63,18 C70,10 77,4 82,0"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M52,38 C58,30 60,21 57,13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M64,18 C69,10 70,4 67,0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M78,6 C81,2 82,0 82,0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M78,6 C75,2 73,1 72,0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
