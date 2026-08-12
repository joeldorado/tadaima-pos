// Validación client-side del checkout (espejo de StoreUsOrderRequest del
// backend) — pura y unit-testeada en checkoutValidation.test.ts.

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MIN_PHONE_DIGITS = 7
export const MIN_PASSWORD_LENGTH = 8

export interface CheckoutValues {
  readonly name: string
  readonly email: string
  readonly phone: string
  readonly address: string
  readonly city: string
  readonly state: string
  readonly zip: string
  readonly country: string
  readonly password: string
}

export type CheckoutField = keyof CheckoutValues
export type CheckoutErrors = Partial<Record<CheckoutField, string>>

export const EMPTY_CHECKOUT_VALUES: CheckoutValues = {
  name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  // Default del Wix original — la mayoría de los pedidos son US.
  country: 'United States',
  password: '',
}

/**
 * `requirePassword`: true para invitados (la cuenta se crea al comprar);
 * false con sesión de cliente activa (el backend liga la orden al token).
 */
export function validateCheckout(
  values: CheckoutValues,
  options: { readonly requirePassword: boolean },
): CheckoutErrors {
  const errors: CheckoutErrors = {}

  if (values.name.trim().length < 2) {
    errors.name = 'Please enter your full name.'
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Please enter a valid email address.'
  }
  if (values.phone.replace(/\D/g, '').length < MIN_PHONE_DIGITS) {
    errors.phone = 'Please enter a valid phone number.'
  }
  if (values.address.trim().length < 3) {
    errors.address = 'Please enter your address.'
  }
  if (values.city.trim().length < 2) {
    errors.city = 'Please enter your city.'
  }
  if (values.state.trim().length < 2) {
    errors.state = 'Please enter your state.'
  }
  if (values.zip.trim().length < 3) {
    errors.zip = 'Please enter your zip / postal code.'
  }
  if (values.country.trim().length < 2) {
    errors.country = 'Please enter your country.'
  }
  if (options.requirePassword && values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password =
      values.password.length === 0
        ? 'Create a password to track your orders.'
        : 'Password must be at least 8 characters.'
  }

  return errors
}
