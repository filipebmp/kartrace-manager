interface KartIconProps {
  className?: string;
}

/**
 * Ícone de kart (vista frontal) baseado na imagem fornecida pelo utilizador.
 * Compatível com o estilo stroke do Lucide (24x24, stroke 2, currentColor).
 */
export function KartIcon({ className }: KartIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* capacete */}
      <path d="M9.5 7.5a2.5 2.5 0 0 1 5 0V10h-5z" />
      <path d="M12 5v2.5" />
      {/* corpo do piloto */}
      <path d="M10 10l-.7 4h5.4L14 10" />
      {/* volante */}
      <path d="M11.6 12h.8" />
      {/* eixo traseiro */}
      <path d="M3.5 14.5h17" />
      {/* nariz / asa frontal */}
      <path d="M9 16.2l3-1 3 1" />
      <path d="M9.6 18l2.4 1 2.4-1" />
      {/* estrutura lateral */}
      <path d="M4.8 16.5h3.4M15.8 16.5h3.4" />
      <path d="M5.5 19h13" />
      {/* roda esquerda */}
      <rect x="1.5" y="12.5" width="3.4" height="7" rx="1" />
      {/* roda direita */}
      <rect x="19.1" y="12.5" width="3.4" height="7" rx="1" />
    </svg>
  );
}
