import { useState, type FormEvent } from 'react'
import {
  ApiRequestError,
  placeOrder,
  type OrderConfirmation,
} from '../lib/api'
import { formatUsd } from '../lib/format'
import { useCart } from '../store/CartContext'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PHONE_DIGITS = 7

type FieldName = 'name' | 'email' | 'phone'

interface FormValues {
  readonly name: string
  readonly email: string
  readonly phone: string
}

type FormErrors = Partial<Record<FieldName, string>>

const EMPTY_VALUES: FormValues = { name: '', email: '', phone: '' }

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {}
  if (values.name.trim().length < 2) {
    errors.name = 'Please enter your full name.'
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Please enter a valid email address.'
  }
  if (values.phone.replace(/\D/g, '').length < MIN_PHONE_DIGITS) {
    errors.phone = 'Please enter a valid phone number.'
  }
  return errors
}

/** Maps Laravel validation errors (`errors.name[0]`…) onto our three fields. */
function mapServerErrors(
  fieldErrors: Readonly<Record<string, readonly string[]>>,
): FormErrors {
  const mapped: FormErrors = {}
  for (const field of ['name', 'email', 'phone'] as const) {
    const first = fieldErrors[field]?.[0]
    if (first !== undefined) mapped[field] = first
  }
  return mapped
}

interface FieldProps {
  readonly name: FieldName
  readonly label: string
  readonly type: 'text' | 'email' | 'tel'
  readonly autoComplete: string
  readonly value: string
  readonly error: string | undefined
  readonly onChange: (name: FieldName, value: string) => void
}

function Field({ name, label, type, autoComplete, value, error, onChange }: FieldProps) {
  const errorId = `checkout-${name}-error`
  return (
    <div className="field">
      <label htmlFor={`checkout-${name}`}>{label}</label>
      <input
        id={`checkout-${name}`}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
      />
      {error !== undefined && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function CheckoutPage() {
  const { lines, subtotal, clearCart } = useCart()
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES)
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null)

  const handleChange = (name: FieldName, value: string): void => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    setServerError(null)
    try {
      const result = await placeOrder({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        website: '', // honeypot — el backend rechaza cualquier valor no vacío
        items: lines.map((line) => ({
          listing_id: line.listingId,
          quantity: line.quantity,
        })),
      })
      // Clear the cart ONLY on success — a failed order keeps it intact.
      clearCart()
      setConfirmation(result)
      window.scrollTo({ top: 0 })
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setErrors(mapServerErrors(error.fieldErrors))
        setServerError(error.message)
      } else {
        setServerError('Something went wrong while placing your order. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (confirmation !== null) {
    return (
      <div className="container section">
        <div className="order-success" role="status">
          <p className="order-success-jp" lang="ja" aria-hidden="true">
            ありがとうございます
          </p>
          <h1>Thank you!</h1>
          <p className="order-success-number">
            Order <strong>{confirmation.order_number}</strong>
          </p>
          <p className="order-success-total">
            Total: <strong>{formatUsd(confirmation.total_usd)}</strong>
          </p>
          <p className="order-success-note">
            This is a demo order — our team will contact you to arrange payment
            and delivery.
          </p>
          <a className="btn btn-primary" href="#/">
            Back to the shop
          </a>
        </div>
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="container section">
        <div className="catalog-notice" role="status">
          <p className="catalog-notice-jp" lang="ja" aria-hidden="true">
            カート
          </p>
          <p className="catalog-notice-title">Your cart is empty</p>
          <p className="catalog-notice-copy">
            Add a few items before checking out — the shelves are waiting.
          </p>
          <a className="btn btn-primary" href="#/figures">
            Browse figures
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="container section">
      <header className="page-head">
        <p className="section-kicker">
          <span lang="ja">ご注文</span> Checkout
        </p>
        <h1 className="page-title">Almost home</h1>
        <p className="page-sub">
          Leave your details and we will confirm your order personally — no
          payment is taken online.
        </p>
      </header>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <Field
            name="name"
            label="Full name"
            type="text"
            autoComplete="name"
            value={values.name}
            error={errors.name}
            onChange={handleChange}
          />
          <Field
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={values.email}
            error={errors.email}
            onChange={handleChange}
          />
          <Field
            name="phone"
            label="Phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            error={errors.phone}
            onChange={handleChange}
          />

          {serverError !== null && (
            <p className="form-server-error" role="alert">
              {serverError}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
            {isSubmitting ? 'Placing order…' : 'Place Order'}
          </button>
          <p className="checkout-disclaimer">
            Demo store — by placing an order you are only sharing your contact
            details so we can reach out.
          </p>
        </form>

        <aside className="checkout-summary" aria-label="Order summary">
          <h2>Order summary</h2>
          <ul>
            {lines.map((line) => (
              <li key={line.listingId}>
                <span className="checkout-summary-name">
                  {line.name}
                  <span className="checkout-summary-qty"> × {line.quantity}</span>
                </span>
                <span>{formatUsd(line.priceUsd * line.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="checkout-summary-total">
            <span>Subtotal</span>
            <span>{formatUsd(subtotal)}</span>
          </div>
          <p className="checkout-summary-note">
            Final total is confirmed by our team together with shipping.
          </p>
        </aside>
      </div>
    </div>
  )
}
