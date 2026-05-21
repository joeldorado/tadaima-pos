import { useState } from "react";
import { X, Upload, Trash2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  uploadUserAvatar,
  setUserExternalAvatar,
  removeUserAvatar,
} from "@tadaima/api";
import { UserAvatar } from "./UserAvatar";

/**
 * Modal para elegir foto de perfil. Dos fuentes:
 *  1. Galería Pokémon — sprites oficiales servidos por GitHub (PokéAPI repo).
 *     Solo guardamos la URL en `users.avatar_url` (jamás se descargan al bucket).
 *  2. Subir foto propia — file upload al bucket (profile_pics/), validado en
 *     backend (max 3MB, MIME estricto).
 *
 * Backend whitelist (UserController::setExternalAvatar) sólo acepta URLs del
 * repo PokéAPI/sprites — cualquier otra fuente se rechaza con 422.
 *
 * Plan futuro: pre-descargar los 24 sprites Pokémon al bucket para eliminar la
 * dependencia externa por completo (decisión Joel 2026-05-21).
 */

interface AvatarPickerProps {
  userId: number;
  userName: string;
  currentAvatarUrl: string | null;
  open: boolean;
  onClose: () => void;
  /** Llamado cuando el avatar cambia exitosamente — para refrescar caches. */
  onSaved: (newAvatarUrl: string | null) => void;
}

// Pokémon curados: ID 1-151 (Gen 1) cubre los más reconocibles. Tomo una
// selección diversa para que la galería se sienta variada.
const POKEMON_IDS = [
  1, 4, 7, 25, 39, 52, 54, 58, 63, 79,
  92, 94, 113, 122, 130, 131, 133, 143, 144, 145, 146, 150, 151, 6,
];

const POKEMON_URL = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

type Tab = "pokemon" | "upload";

export function AvatarPicker({
  userId,
  userName,
  currentAvatarUrl,
  open,
  onClose,
  onSaved,
}: AvatarPickerProps) {
  const [tab, setTab] = useState<Tab>("pokemon");
  const [saving, setSaving] = useState(false);
  const [hoverUrl, setHoverUrl] = useState<string | null>(null);

  if (!open) return null;

  const pickExternal = async (url: string) => {
    setSaving(true);
    try {
      const updated = await setUserExternalAvatar(userId, url);
      toast.success("Avatar actualizado");
      onSaved(updated.avatar_url ?? null);
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Error al actualizar avatar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("La foto excede 3 MB");
      return;
    }
    setSaving(true);
    try {
      const updated = await uploadUserAvatar(userId, file);
      toast.success("Foto subida");
      onSaved(updated.avatar_url ?? null);
      onClose();
    } catch {
      toast.error("Error al subir la foto");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await removeUserAvatar(userId);
      toast.success("Avatar eliminado");
      onSaved(null);
      onClose();
    } catch {
      toast.error("Error al eliminar avatar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      />
      <div
        style={{
          position: "relative", background: "var(--td-popup-bg)",
          border: "1px solid var(--td-popup-border)", borderRadius: 24,
          width: "100%", maxWidth: 640, maxHeight: "90vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--td-divider)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <UserAvatar name={userName} avatarUrl={hoverUrl ?? currentAvatarUrl} size={44} />
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "var(--td-text-hi)" }}>Foto de perfil</p>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                {userName}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--td-text-ghost)", padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "12px 22px 0" }}>
          {(["pokemon", "upload"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 16px", borderRadius: 12, cursor: "pointer",
                background: tab === t ? "linear-gradient(135deg,#CC2200,#FF4422)" : "transparent",
                border: tab === t ? "none" : "1px solid var(--td-card-border)",
                color: tab === t ? "#fff" : "var(--td-text-md)",
                fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em",
              }}
            >
              {t === "pokemon" ? "Pokémon" : "Subir foto"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          {tab === "pokemon" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 10 }}>
              {POKEMON_IDS.map(id => {
                const url = POKEMON_URL(id);
                return (
                  <button
                    key={id}
                    onClick={() => void pickExternal(url)}
                    onMouseEnter={() => setHoverUrl(url)}
                    onMouseLeave={() => setHoverUrl(null)}
                    disabled={saving}
                    style={{
                      aspectRatio: "1 / 1",
                      background: "var(--td-card-bg)",
                      border: `2px solid ${currentAvatarUrl === url ? "#E0221A" : "var(--td-card-border)"}`,
                      borderRadius: 14, cursor: saving ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 4, transition: "border-color 0.15s, transform 0.1s",
                    }}
                    onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.96)"; }}
                    onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                  >
                    <img
                      src={url}
                      alt={`Pokemon ${id}`}
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      referrerPolicy="no-referrer"
                    />
                  </button>
                );
              })}
            </div>
          )}

          {tab === "upload" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "20px 0" }}>
              <UserAvatar name={userName} avatarUrl={currentAvatarUrl} size={96} />
              <label
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 24px", borderRadius: 14, cursor: saving ? "not-allowed" : "pointer",
                  background: "linear-gradient(135deg,#CC2200,#FF4422)",
                  color: "#fff", fontSize: 12, fontWeight: 900,
                  textTransform: "uppercase", letterSpacing: "0.12em",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {saving ? "Subiendo..." : "Elegir archivo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  disabled={saving}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                  }}
                />
              </label>
              <p style={{ margin: 0, fontSize: 10, color: "var(--td-text-ghost)", textAlign: "center" }}>
                JPG, PNG o WebP · máx 3 MB
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "14px 22px", borderTop: "1px solid var(--td-divider)" }}>
          {currentAvatarUrl ? (
            <button
              onClick={() => void handleRemove()}
              disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, background: "transparent", border: "1px solid rgba(220,38,38,0.4)", color: "#DC2626", fontSize: 11, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "0.12em" }}
            >
              <Trash2 size={13} />
              Quitar foto
            </button>
          ) : <span />}
          <button
            onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 12, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: "var(--td-text-md)", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            <Check size={13} />
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
