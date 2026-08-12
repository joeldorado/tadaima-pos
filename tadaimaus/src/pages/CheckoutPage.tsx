import { useEffect, useState, type FormEvent } from 'react'
import { Field } from '../components/forms/Field'
import { placeOrder } from '../lib/api'
import {
  EMPTY_CHECKOUT_VALUES,
  validateCheckout,
  type CheckoutErrors,
  type CheckoutField,
  type CheckoutValues,
} from '../lib/checkoutValidation'
import { formatUsd } from '../lib/format'
import { ApiRequestError } from '../lib/http'
import { navigateTo } from '../lib/routes'
import { useCart } from '../store/CartContext'
import { useCustomerAuth } from '../store/CustomerAuthContext'
import { LOGIN_NEXT_KEY } from './LoginPage'

/**
 * Checkout estilo Wix (flujo replicado del original):
 *   Delivery details → Delivery method ("To confirm order — Free") →
 *   Payment ("Cash on Delivery") → Place Order → confirmación.
 *
 * CUENTAS: invitado captura además una contraseña — la cuenta se crea CON el
 * pedido y la sesión se adopta al confirmar (auto-login, "My Orders" al
 * instante). Logueado ve el banner "Logged in as…" y sus datos pre-llenados
 * (botón Change para editarlos); el backend liga la orden a su cuenta.
 */

/** Mapea errors de Laravel (`errors.address[0]`…) a los campos del form. */
const SERVER_FIELDS: readonly CheckoutField[] = [
  'name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'password',
]

function mapServerErrors(
  fieldErrors: Readonly<Record<string, readonly string[]>>,
): CheckoutErrors {
  const mapped: CheckoutErrors = {}
  for (const field of SERVER_FIELDS) {
    const first = fieldErrors[field]?.[0]
    if (first !== undefined) mapped[field] = first
  }
  return mapped
}

/** Snapshot local para la pantalla de confirmación (no depende del server). */
interface ConfirmationView {
  readonly orderNumber: string
  readonly totalUsd: string | number
  readonly firstName: string
  readonly items: readonly { readonly name: string; readonly quantity: number; readonly lineTotal: number }[]
  readonly shipping: CheckoutValues
}

export function CheckoutPage() {
  const { lines, subtotal, clearCart } = useCart()
  const { status: authStatus, customer, adoptSession, logout } = useCustomerAuth()

  const [values, setValues] = useState<CheckoutValues>(EMPTY_CHECKOUT_VALUES)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [accountExists, setAccountExists] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<ConfirmationView | null>(null)
  // Logueado: los datos se muestran como resumen (estilo Wix) hasta "Change".
  const [isEditingDetails, setEditingDetails] = useState(false)

  const isAuthenticated = authStatus === 'authenticated' && customer !== null

  // Pre-llenar con el perfil de la cuenta al entrar logueado (o tras login).
  useEffect(() => {
    if (customer === null) return
    setValues((prev) => ({
      ...prev,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address ?? '',
      city: customer.city ?? '',
      state: customer.state ?? '',
      zip: customer.zip ?? '',
      country: customer.country ?? 'United States',
      password: '',
    }))
    setEditingDetails(false)
  }, [customer])

  const setField = (field: CheckoutField) => (value: string): void => {
    setAccountExists(false)
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  const handleSignInCta = (): void => {
    try {
      window.sessionStorage.setItem(LOGIN_NEXT_KEY, 'checkout')
    } catch {
      // Sin sessionStorage el login manda a My Orders — no es fatal.
    }
    navigateTo({ page: 'login' })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    const effectiveValues: CheckoutValues = isAuthenticated
      ? { ...values, email: customer.email }
      : values

    const nextErrors = validateCheckout(effectiveValues, {
      requirePassword: !isAuthenticated,
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setEditingDetails(true)
      return
    }

    setSubmitting(true)
    setServerError(null)
    setAccountExists(false)
    try {
      const result = await placeOrder({
        name: effectiveValues.name.trim(),
        email: effectiveValues.email.trim(),
        phone: effectiveValues.phone.trim(),
        address: effectiveValues.address.trim(),
        city: effectiveValues.city.trim(),
        state: effectiveValues.state.trim(),
        zip: effectiveValues.zip.trim(),
        country: effectiveValues.country.trim(),
        ...(isAuthenticated ? {} : { password: effectiveValues.password }),
        website: '', // honeypot — el backend rechaza cualquier valor no vacío
        items: lines.map((line) => ({
          listing_id: line.listingId,
          quantity: line.quantity,
        })),
      })

      // Auto-login: el checkout de invitado creó la cuenta y devolvió token.
      if (result.token !== undefined && result.customer !== undefined) {
        adoptSession(result.token, {
          id: result.customer.id,
          name: result.customer.name,
          email: result.customer.email,
          phone: effectiveValues.phone.trim(),
          address: effectiveValues.address.trim(),
          city: effectiveValues.city.trim(),
          state: effectiveValues.state.trim(),
          zip: effectiveValues.zip.trim(),
          country: effectiveValues.country.trim(),
        })
      }

      setConfirmation({
        orderNumber: result.order_number,
        totalUsd: result.total_usd,
        firstName: effectiveValues.name.trim().split(/\s+/)[0] ?? '',
        items: lines.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          lineTotal: line.priceUsd * line.quantity,
        })),
        shipping: effectiveValues,
      })
      // Clear the cart ONLY on success — a failed order keeps it intact.
      clearCart()
      window.scrollTo({ top: 0 })
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setErrors(mapServerErrors(error.fieldErrors))
        setServerError(error.message)
        if (error.code === 'account_exists') {
          setAccountExists(true)
          setEditingDetails(true)
        }
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
          <h1>Thank you, {confirmation.firstName}!</h1>
          <p className="order-success-number">
            Order <strong>{confirmation.orderNumber}</strong>
          </p>

          <ul className="order-success-items">
            {confirmation.items.map((item, index) => (
              <li key={index}>
                <span>
                  {item.name}
                  <span className="checkout-summary-qty"> × {item.quantity}</span>
                </span>
                <span>{formatUsd(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <p className="order-success-total">
            Total: <strong>{formatUsd(confirmation.totalUsd)}</strong>
          </p>

          {/* Las 3 columnas del original: dirección / método / pago. */}
          <div className="order-success-details">
            <div>
              <h2>Delivery address</h2>
              <p>
                {confirmation.shipping.name}
                <br />
                {confirmation.shipping.address}
                <br />
                {confirmation.shipping.city}, {confirmation.shipping.state}{' '}
                {confirmation.shipping.zip}
                <br />
                {confirmation.shipping.country}
                <br />
                {confirmation.shipping.phone}
              </p>
            </div>
            <div>
              <h2>Delivery method</h2>
              <p>To confirm order — Free</p>
            </div>
            <div>
              <h2>Payment</h2>
              <p>Cash on Delivery</p>
            </div>
          </div>

          <p className="order-success-note">
            We have received your order and will contact you. Thank you!
          </p>

          <div className="order-success-actions">
            <a className="btn btn-primary" href="#/account">
              View my orders
            </a>
            <a className="btn btn-ghost-dark" href="#/">
              Back to the shop
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="container section">
        <div className="catalog-notice" role="status">
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

  const showDetailsSummary = isAuthenticated && !isEditingDetails

  return (
    <div className="container section">
      <header className="page-head">
        <p className="section-kicker">Checkout</p>
        <h1 className="page-title">Almost home</h1>
      </header>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          {isAuthenticated && (
            <div className="checkout-banner">
              <span>
                Logged in as <strong>{customer.email}</strong>
              </span>
              <button type="button" className="checkout-banner-link" onClick={logout}>
                Log out
              </button>
            </div>
          )}

          <section className="checkout-section" aria-labelledby="delivery-details-heading">
            <div className="checkout-section-head">
              <h2 id="delivery-details-heading">Delivery details</h2>
              {showDetailsSummary && (
                <button
                  type="button"
                  className="checkout-banner-link"
                  onClick={() => setEditingDetails(true)}
                >
                  Change
                </button>
              )}
            </div>

            {showDetailsSummary ? (
              <p className="checkout-details-summary">
                {values.name}
                <br />
                {customer.email}
                <br />
                {values.address}
                <br />
                {values.city}, {values.state} {values.zip}, {values.country}
                <br />
                {values.phone}
              </p>
            ) : (
              <>
                <Field id="checkout-name" label="Full name" autoComplete="name" value={values.name} error={errors.name} onChange={setField('name')} />
                {!isAuthenticated && (
                  <Field id="checkout-email" label="Email" type="email" autoComplete="email" value={values.email} error={errors.email} onChange={setField('email')} />
                )}

                {accountExists && (
                  <div className="checkout-account-exists" role="alert">
                    <p>This email already has an account.</p>
                    <button type="button" className="btn btn-ghost-dark" onClick={handleSignInCta}>
                      Sign in to continue
                    </button>
                  </div>
                )}

                <Field id="checkout-phone" label="Phone" type="tel" autoComplete="tel" value={values.phone} error={errors.phone} onChange={setField('phone')} />
                <Field id="checkout-address" label="Address" autoComplete="street-address" value={values.address} error={errors.address} onChange={setField('address')} />
                <div className="checkout-address-row">
                  <Field id="checkout-city" label="City" autoComplete="address-level2" value={values.city} error={errors.city} onChange={setField('city')} />
                  <Field id="checkout-state" label="State" autoComplete="address-level1" value={values.state} error={errors.state} onChange={setField('state')} />
                  <Field id="checkout-zip" label="Zip / Postal code" autoComplete="postal-code" value={values.zip} error={errors.zip} onChange={setField('zip')} />
                </div>
                <Field id="checkout-country" label="Country" autoComplete="country-name" value={values.country} error={errors.country} onChange={setField('country')} />

                {!isAuthenticated && (
                  <>
                    <Field
                      id="checkout-password"
                      label="Create a password to track your orders"
                      type="password"
                      autoComplete="new-password"
                      value={values.password}
                      error={errors.password}
                      onChange={setField('password')}
                    />
                    <p className="checkout-hint">
                      Your account is created with this order — sign in later with
                      your email or phone to see your orders.
                    </p>
                  </>
                )}
              </>
            )}
          </section>

          <section className="checkout-section" aria-labelledby="delivery-method-heading">
            <h2 id="delivery-method-heading">Delivery method</h2>
            <div className="checkout-static-option">
              <span className="checkout-static-radio" aria-hidden="true" />
              <span>To confirm order</span>
              <span className="checkout-static-price">Free</span>
            </div>
          </section>

          <section className="checkout-section" aria-labelledby="payment-heading">
            <h2 id="payment-heading">Payment</h2>
            <div className="checkout-static-option">
              <span className="checkout-static-radio" aria-hidden="true" />
              <span>Cash on Delivery</span>
            </div>
            <p className="checkout-hint">
              We will contact you to arrange payment and delivery.
            </p>
          </section>

          {serverError !== null && !accountExists && (
            <p className="form-server-error" role="alert">
              {serverError}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
            {isSubmitting ? 'Placing order…' : 'Place Order'}
          </button>
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
        </aside>
      </div>
    </div>
  )
}
