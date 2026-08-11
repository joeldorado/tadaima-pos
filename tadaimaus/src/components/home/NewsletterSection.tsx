import { useState, type FormEvent } from 'react'
import { ApiRequestError, submitLead } from '../../lib/api'
import { assetUrl } from '../../lib/constants'
import { validateEmail } from '../../lib/leadValidation'
import { useReveal } from '../../hooks/useReveal'

type Status = 'idle' | 'sending' | 'success'

/**
 * "We hear you!" del sitio original de Wix — Sign Up de newsletter con el
 * Naruto asomándose. Solo captura el email (lead source=newsletter); el
 * correo de welcome viene después.
 */
export function NewsletterSection() {
  const { ref, isRevealed } = useReveal<HTMLElement>()
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const validationError = validateEmail(email)
    if (validationError !== null) {
      setError(validationError)
      return
    }

    setStatus('sending')
    setError(null)
    try {
      await submitLead({
        source: 'newsletter',
        email: email.trim(),
        marketing_consent: consent,
        website: '', // honeypot — el backend rechaza cualquier valor no vacío
      })
      setStatus('success')
    } catch (submitError: unknown) {
      setStatus('idle')
      setError(
        submitError instanceof ApiRequestError
          ? submitError.message
          : 'Something went wrong. Please try again.',
      )
    }
  }

  return (
    <section
      ref={ref}
      className={`newsletter reveal${isRevealed ? ' is-revealed' : ''}`}
      aria-labelledby="newsletter-heading"
    >
      <div className="container newsletter-inner">
        <div className="newsletter-copy">
          <p className="newsletter-kicker">Newsletter</p>
          <h2 id="newsletter-heading">We hear you!</h2>
          <p className="newsletter-sub">
            Restocks, preorders and grails — sign up and be the first to know
            what lands on our shelves.
          </p>

          {status === 'success' ? (
            <p className="newsletter-success" role="status">
              You&rsquo;re in — welcome home!
            </p>
          ) : (
            <form
              className="newsletter-form"
              onSubmit={(event) => void handleSubmit(event)}
              noValidate
            >
              <label className="sr-only" htmlFor="newsletter-email">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setError(null)
                }}
                aria-invalid={error !== null}
                aria-describedby={error !== null ? 'newsletter-error' : undefined}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={status === 'sending'}
              >
                {status === 'sending' ? 'Signing up…' : 'Sign Up'}
              </button>

              {/* Consentimiento explícito, igual que el sitio original: sin
                  esta marca el lead se guarda pero NO se le puede mandar
                  publicidad. */}
              <label className="newsletter-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>I want to subscribe to your mailing list.</span>
              </label>
            </form>
          )}

          {error !== null && (
            <p className="field-error" id="newsletter-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <img
          className="newsletter-naruto"
          src={assetUrl('img/naruto.png')}
          alt=""
          width={500}
          height={583}
          loading="lazy"
          aria-hidden="true"
        />
      </div>
    </section>
  )
}
