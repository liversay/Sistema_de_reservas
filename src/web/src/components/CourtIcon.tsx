import type { Sport } from "../shared";

const LABEL: Record<Sport, string> = {
  futbol: "Cancha de fútbol",
  padel: "Pista de pádel",
  basquet: "Cancha de básquet",
};

/** Diagrama pequeño de la cancha según el deporte (decorativo si `decorative`). */
export function CourtIcon({ sport, half, size = 56 }: { sport: Sport; half?: boolean; size?: number }) {
  const h = Math.round((size * 44) / 64);
  const stroke = { stroke: "#FFFFFF", strokeWidth: 1.5, fill: "none" } as const;
  return (
    <svg className="court-icon" width={size} height={h} viewBox="0 0 64 44" role="img" aria-label={LABEL[sport]}>
      {sport === "futbol" && (
        <>
          <rect width="64" height="44" rx="8" fill="#1E7A4C" />
          {half && <rect x="5" y="5" width="27" height="34" fill="#2A9160" />}
          <rect x="5" y="5" width="54" height="34" {...stroke} />
          <path d="M32 5v34" {...stroke} />
          <circle cx="32" cy="22" r="6" {...stroke} />
          <path d="M5 15h7v14H5M59 15h-7v14h7" {...stroke} />
        </>
      )}
      {sport === "padel" && (
        <>
          <rect width="64" height="44" rx="8" fill="#1F6FA3" />
          <rect x="5" y="5" width="54" height="34" {...stroke} />
          <path d="M32 5v34M18 5v34M46 5v34M18 22h28" {...stroke} />
        </>
      )}
      {sport === "basquet" && (
        <>
          <rect width="64" height="44" rx="8" fill="#B5642A" />
          <rect x="5" y="5" width="54" height="34" {...stroke} />
          <path d="M32 5v34" {...stroke} />
          <circle cx="32" cy="22" r="5" {...stroke} />
          <path d="M5 16h9v12H5M59 16h-9v12h9" {...stroke} />
          <path d="M5 10a14 14 0 0 1 0 24M59 10a14 14 0 0 0 0 24" {...stroke} />
        </>
      )}
    </svg>
  );
}
