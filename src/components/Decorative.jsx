export function LineHouse({ className = "" }) {
  return (
    <svg className={`line-house ${className}`} viewBox="0 0 620 280" role="img" aria-label="Illustration lineaire de Meezane">
      <path d="M52 173 L180 108 L372 108 L520 172" />
      <path d="M183 107 L183 198 M373 108 L373 204 M84 173 L84 220 M520 172 L520 222" />
      <path d="M183 198 L372 204 L520 222 L84 220 Z" />
      <path d="M207 127 L352 127 L352 178 L207 178 Z" />
      <path d="M392 139 L488 165 L488 207 L392 190 Z" />
      <path d="M102 221 C178 242 256 254 356 245 C442 238 501 248 568 263" />
      <path d="M22 248 C104 230 176 234 255 259" />
      <path d="M279 56 C295 44 318 44 335 56" />
      <path d="M308 39 L308 18" />
      <path d="M450 82 C464 67 485 67 499 82" />
    </svg>
  );
}

export function BalanceIcon({ index }) {
  const drawings = [
    <path key="one" d="M22 47 H78 M50 21 V78 M30 47 C30 64 42 74 50 74 C58 74 70 64 70 47 M35 32 L22 58 H48 Z M65 32 L52 58 H78 Z" />,
    <path key="two" d="M50 18 C31 28 24 45 29 63 C35 82 65 82 71 63 C76 45 69 28 50 18 Z M39 46 C47 38 54 38 62 46" />,
    <path key="three" d="M20 56 C30 31 48 20 72 28 C82 51 70 73 45 78 C31 75 22 67 20 56 Z M32 55 C48 47 58 48 70 58" />,
    <path key="four" d="M21 56 C33 36 47 26 63 23 C70 38 67 58 55 75 C39 72 28 65 21 56 Z M34 43 L60 63" />,
    <path key="five" d="M18 68 C33 48 51 42 74 49 C68 68 52 79 28 78 C24 75 21 72 18 68 Z M48 51 C45 37 50 27 64 20 M57 38 C70 34 79 38 84 49" />,
  ];

  return (
    <svg className="balance-icon" viewBox="0 0 100 100" aria-hidden="true">
      {drawings[index % drawings.length]}
    </svg>
  );
}

export function SectionStamp() {
  return (
    <div className="stamp" aria-hidden="true">
      <span>Meezane</span>
    </div>
  );
}
