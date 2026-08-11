// Validación pura de los formularios de leads (newsletter + contacto).
// Refleja las reglas del backend (StoreUsLeadRequest) para fallar antes del
// round-trip; el server sigue siendo la autoridad.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MAX_EMAIL_LENGTH = 190
export const MAX_NAME_LENGTH = 120
export const MAX_SUBJECT_LENGTH = 150
export const MAX_MESSAGE_LENGTH = 1000

export function validateEmail(email: string): string | null {
  const value = email.trim()
  if (value === '') return 'Please enter your email address.'
  if (!EMAIL_PATTERN.test(value)) return 'Please enter a valid email address.'
  if (value.length > MAX_EMAIL_LENGTH) return 'Email is too long.'
  return null
}

export interface ContactFormValues {
  readonly name: string
  readonly email: string
  /** "Subject *" del formulario original. */
  readonly subject: string
  readonly message: string
}

export type ContactFormErrors = Partial<Record<keyof ContactFormValues, string>>

export function validateContactForm(values: ContactFormValues): ContactFormErrors {
  const errors: ContactFormErrors = {}

  if (values.name.trim().length < 2) {
    errors.name = 'Please enter your name.'
  } else if (values.name.trim().length > MAX_NAME_LENGTH) {
    errors.name = 'Name is too long.'
  }

  const emailError = validateEmail(values.email)
  if (emailError !== null) errors.email = emailError

  if (values.subject.trim() === '') {
    errors.subject = 'Please enter a subject.'
  } else if (values.subject.trim().length > MAX_SUBJECT_LENGTH) {
    errors.subject = 'Subject is too long.'
  }

  if (values.message.trim() === '') {
    errors.message = 'Please write a short message.'
  } else if (values.message.trim().length > MAX_MESSAGE_LENGTH) {
    errors.message = 'Message is limited to 1000 characters.'
  }

  return errors
}
