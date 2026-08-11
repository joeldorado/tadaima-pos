import { useState, type FormEvent } from 'react'
import { ApiRequestError, submitLead } from '../lib/api'
import { assetUrl, BRAND, CONTACT_INFO } from '../lib/constants'
import {
  MAX_SUBJECT_LENGTH,
  validateContactForm,
  type ContactFormErrors,
  type ContactFormValues,
} from '../lib/leadValidation'

const EMPTY_FORM: ContactFormValues = { name: '', email: '', subject: '', message: '' }

type FormStatus = 'idle' | 'sending' | 'success'

/** Formulario de contacto → lead source=contact (se guarda; respuesta manual). */
function ContactForm() {
  const [values, setValues] = useState<ContactFormValues>(EMPTY_FORM)
  const [errors, setErrors] = useState<ContactFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [status, setStatus] = useState<FormStatus>('idle')

  const setField = (field: keyof ContactFormValues, value: string): void => {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const nextErrors = validateContactForm(values)
    setErrors(nextErrors)
    if (Object.values(nextErrors).some((message) => message !== undefined)) return

    setStatus('sending')
    setServerError(null)
    try {
      await submitLead({
        source: 'contact',
        name: values.name.trim(),
        email: values.email.trim(),
        subject: values.subject.trim(),
        message: values.message.trim(),
        website: '', // honeypot — el backend rechaza cualquier valor no vacío
      })
      setStatus('success')
    } catch (error: unknown) {
      setStatus('idle')
      setServerError(
        error instanceof ApiRequestError
          ? error.message
          : 'Something went wrong. Please try again.',
      )
    }
  }

  if (status === 'success') {
    return (
      <div className="contact-form-success" role="status">
        <p className="contact-form-success-title">Message sent!</p>
        <p className="contact-form-success-copy">
          Thanks for reaching out — a real person will reply soon.
        </p>
      </div>
    )
  }

  return (
    <form
      className="contact-form"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      aria-label="Contact form"
    >
      {/* input antes de label + placeholder=" ": lo que necesita la etiqueta
          flotante (ver .field en base.css). */}
      <div className="field">
        <input
          id="contact-name"
          type="text"
          autoComplete="name"
          placeholder=" "
          value={values.name}
          onChange={(event) => setField('name', event.target.value)}
          aria-invalid={errors.name !== undefined}
        />
        <label htmlFor="contact-name">Name</label>
        {errors.name !== undefined && (
          <p className="field-error" role="alert">
            {errors.name}
          </p>
        )}
      </div>

      <div className="field">
        <input
          id="contact-email"
          type="email"
          autoComplete="email"
          placeholder=" "
          value={values.email}
          onChange={(event) => setField('email', event.target.value)}
          aria-invalid={errors.email !== undefined}
        />
        <label htmlFor="contact-email">Email</label>
        {errors.email !== undefined && (
          <p className="field-error" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <div className="field">
        <input
          id="contact-subject"
          type="text"
          placeholder=" "
          maxLength={MAX_SUBJECT_LENGTH}
          value={values.subject}
          onChange={(event) => setField('subject', event.target.value)}
          aria-invalid={errors.subject !== undefined}
        />
        <label htmlFor="contact-subject">Subject</label>
        {errors.subject !== undefined && (
          <p className="field-error" role="alert">
            {errors.subject}
          </p>
        )}
      </div>

      <div className="field">
        <textarea
          id="contact-message"
          rows={5}
          placeholder=" "
          value={values.message}
          onChange={(event) => setField('message', event.target.value)}
          aria-invalid={errors.message !== undefined}
        />
        <label htmlFor="contact-message">Message</label>
        {errors.message !== undefined && (
          <p className="field-error" role="alert">
            {errors.message}
          </p>
        )}
      </div>

      {serverError !== null && (
        <p className="form-server-error" role="alert">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={status === 'sending'}
      >
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}

export function ContactPage() {
  return (
    <div className="container section contact-page">
      <header className="page-head">
        <p className="section-kicker">Contact</p>
        <h1 className="page-title">Contact Us</h1>
        {/* Copy del sitio original, palabra por palabra. */}
        <p className="contact-intro">
          Please submit a suggestion, comment or question — we would love to hear
          from you!
        </p>
      </header>

      {/* Dos columnas: el formulario dejaba ~900px muertos a la derecha en
          desktop. La imagen es decorativa (aria-hidden) — no carga información
          que el usuario necesite leer. */}
      <div className="contact-layout">
        <ContactForm />

        <figure className="contact-visual" aria-hidden="true">
          <img
            src={assetUrl('img/contact-visual.webp')}
            alt=""
            width={720}
            height={720}
            loading="lazy"
            decoding="async"
          />
          <figcaption>{BRAND.tagline}</figcaption>
        </figure>
      </div>

      {CONTACT_INFO.email === '' &&
      CONTACT_INFO.phone === '' &&
      CONTACT_INFO.hours.length === 0 ? null : (
        <div className="contact-grid">
          {CONTACT_INFO.email !== '' && (
            <section className="contact-card" aria-labelledby="contact-email-heading">
              <h2 id="contact-email-heading">Email</h2>
              <p>
                <a className="contact-link" href={`mailto:${CONTACT_INFO.email}`}>
                  {CONTACT_INFO.email}
                </a>
              </p>
              <p className="contact-card-note">We usually reply within one business day.</p>
            </section>
          )}

          {CONTACT_INFO.phone !== '' && (
            <section className="contact-card" aria-labelledby="contact-phone-heading">
              <h2 id="contact-phone-heading">Phone</h2>
              <p>
                <a
                  className="contact-link"
                  href={`tel:+1${CONTACT_INFO.phone.replace(/\D/g, '')}`}
                >
                  {CONTACT_INFO.phone}
                </a>
              </p>
              <p className="contact-card-note">
                Call or text during store hours
                {CONTACT_INFO.location !== '' ? ` — ${CONTACT_INFO.location}` : ''}.
              </p>
            </section>
          )}

          {CONTACT_INFO.hours.length > 0 && (
            <section className="contact-card" aria-labelledby="contact-hours-heading">
              <h2 id="contact-hours-heading">Store hours</h2>
              <dl className="contact-hours">
                {CONTACT_INFO.hours.map((slot) => (
                  <div key={slot.days}>
                    <dt>{slot.days}</dt>
                    <dd>{slot.time}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      )}

    </div>
  )
}
