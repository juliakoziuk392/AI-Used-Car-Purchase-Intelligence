/**
 * Узагальнений силует кросовера (вигляд збоку, перед праворуч). Без бренду —
 * підходить під будь-яке оголошення. Координати зон дефектів — у zones.ts у цій же системі (800×300).
 */
export const CAR_VIEWBOX = { width: 800, height: 300 };

const BODY_PATH =
  'M95 225 L88 175 C88 150 100 128 125 118 L165 98 C175 92 185 90 200 90 L455 90 C475 90 490 95 505 105 L565 145 L690 158 C712 161 722 172 724 188 L726 218 C726 224 721 228 714 228 L658 228 A58 58 0 0 0 542 228 L263 228 A58 58 0 0 0 147 228 L104 228 C98 228 95 226 95 225 Z';

const WINDOWS_PATH =
  'M142 122 C152 109 166 103 186 103 L450 103 C467 103 479 108 491 117 L538 147 L152 147 C141 147 137 135 142 122 Z';

function Wheel({ cx }: { cx: number }) {
  return (
    <g className="car-wheel">
      <circle cx={cx} cy={228} r={46} fill="#14191d" />
      <circle cx={cx} cy={228} r={44} fill="none" stroke="#2a3239" strokeWidth={3} />
      <circle cx={cx} cy={228} r={30} fill="url(#rim)" />
      {[0, 72, 144, 216, 288].map((angle) => (
        <rect
          key={angle}
          x={cx - 3.5}
          y={200}
          width={7}
          height={26}
          rx={3}
          fill="#5f6b74"
          transform={`rotate(${angle} ${cx} 228)`}
        />
      ))}
      <circle cx={cx} cy={228} r={8} fill="#8b979f" />
    </g>
  );
}

export function CarSilhouette({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${CAR_VIEWBOX.width} ${CAR_VIEWBOX.height}`}
      className={className}
      role="img"
      aria-label="Силует авто"
    >
      <defs>
        <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f7f9" />
          <stop offset="0.45" stopColor="#c9d3da" />
          <stop offset="1" stopColor="#7d8b95" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="#25313a" />
          <stop offset="0.55" stopColor="#3d4f5c" />
          <stop offset="1" stopColor="#1c252c" />
        </linearGradient>
        <radialGradient id="rim" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#e3e9ed" />
          <stop offset="1" stopColor="#8f9ba3" />
        </radialGradient>
        <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx={405} cy={276} rx={360} ry={18} fill="url(#shadow)" />

      <path d={BODY_PATH} fill="url(#paint)" />
      {/* Нижня пластикова накладка */}
      <path
        d="M104 228 L147 228 A58 58 0 0 1 263 228 L542 228 A58 58 0 0 1 658 228 L714 228 C721 228 726 224 726 218 L726 210 L96 210 L95 225 C95 226 98 228 104 228 Z"
        fill="#3a454d"
        opacity={0.85}
      />
      <path d={WINDOWS_PATH} fill="url(#glass)" />
      <rect x={298} y={103} width={9} height={44} fill="#c9d3da" />
      <rect x={420} y={103} width={8} height={44} fill="#c9d3da" />
      {/* Лінії дверей і ручки */}
      <path d="M302 150 L302 208 M424 150 L430 208" stroke="#7d8b95" strokeWidth={1.5} fill="none" />
      <rect x={330} y={162} width={22} height={4} rx={2} fill="#7d8b95" />
      <rect x={452} y={162} width={22} height={4} rx={2} fill="#7d8b95" />
      {/* Дзеркало, фари */}
      <path d="M528 146 L548 140 L552 152 L534 156 Z" fill="#3a454d" />
      <path d="M688 163 L719 170 L718 182 L686 177 Z" fill="#f8fbff" />
      <path d="M690 166 L716 172" stroke="#9fd8ff" strokeWidth={2} />
      <path d="M90 148 L111 144 L113 166 L89 169 Z" fill="#e5484d" />
      {/* Відблиск на кузові */}
      <path d="M200 120 C320 112 470 112 560 150" stroke="#ffffff" strokeOpacity={0.5} strokeWidth={2} fill="none" />

      <Wheel cx={205} />
      <Wheel cx={600} />
    </svg>
  );
}
