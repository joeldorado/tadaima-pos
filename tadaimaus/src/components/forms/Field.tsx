// Campo con etiqueta flotante (estilo .field de base.css), compartido por
// Checkout, Login del cliente y Settings de la cuenta.
//
// Dos requisitos FRÁGILES del markup (hay e2e que los caza):
//   · el <input> va ANTES del <label> — los selectores hermanos de CSS solo
//     miran hacia adelante (for/id mantiene la accesibilidad);
//   · lleva placeholder=" " para que :placeholder-shown distinga vacío/lleno.

interface FieldProps {
  readonly id: string
  readonly label: string
  readonly type?: 'text' | 'email' | 'tel' | 'password'
  readonly autoComplete?: string
  readonly value: string
  readonly error?: string | undefined
  readonly onChange: (value: string) => void
}

export function Field({
  id,
  label,
  type = 'text',
  autoComplete,
  value,
  error,
  onChange,
}: FieldProps) {
  const errorId = `${id}-error`
  return (
    <div className="field">
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        placeholder=" "
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
      />
      <label htmlFor={id}>{label}</label>
      {error !== undefined && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
