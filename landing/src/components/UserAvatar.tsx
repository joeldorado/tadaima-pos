import { useState } from "react";

/**
 * Avatar reusable: muestra `user.avatar_url` (foto subida o URL externa
 * Pokémon/DiceBear) y cae a iniciales con color derivado del nombre cuando
 * no hay foto o falla la carga.
 *
 * Convención: el backend (UserResource) ya entrega `avatar_url` como URL
 * absoluta lista para `<img src>`. Si en runtime la imagen falla (404, red),
 * usamos el fallback de iniciales sin romper la UI.
 */
interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  /** Texto/border ring custom (ej. activo). */
  ringColor?: string;
  className?: string;
  /** Mostrar tooltip nativo con el nombre completo. */
  title?: string;
}

const PALETTE = [
  "#E0221A", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? PALETTE[0]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 32,
  ringColor,
  className,
  title,
}: UserAvatarProps) {
  const [broken, setBroken] = useState(false);
  const showImage = !!avatarUrl && !broken;
  const bg = hashColor(name || "?");
  const px = `${size}px`;
  const fontSize = Math.max(10, Math.round(size * 0.4));

  return (
    <div
      title={title ?? name}
      className={className}
      style={{
        width: px, height: px, borderRadius: "9999px",
        background: showImage ? "transparent" : bg,
        color: "#fff", fontWeight: 800, fontSize,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", flexShrink: 0,
        ...(ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : {}),
      }}
    >
      {showImage ? (
        <img
          src={avatarUrl!}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          // Las imágenes vienen de orígenes externos confiables (PokéAPI,
          // DiceBear) o de nuestro propio bucket. No se renderizan inline
          // como DOM (img tag sandboxea cualquier script en SVGs externos).
          referrerPolicy="no-referrer"
        />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
