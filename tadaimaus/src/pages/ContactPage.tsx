import { BRAND, CONTACT_INFO } from '../lib/constants'

export function ContactPage() {
  return (
    <div className="container section">
      <header className="page-head">
        <p className="section-kicker">
          <span lang="ja">お問い合わせ</span> Contact
        </p>
        <h1 className="page-title">Say hello</h1>
        <p className="page-sub">
          We are a small family-run shop. Questions about an order, a preorder or
          a grail you are hunting? Reach out — a real person answers.
        </p>
      </header>

      {CONTACT_INFO.email === '' &&
      CONTACT_INFO.phone === '' &&
      CONTACT_INFO.hours.length === 0 ? (
        <p className="page-sub">
          Contact details are on their way — for now, place an order and our
          team will reach out to you directly.
        </p>
      ) : (
        <div className="contact-grid">
          {CONTACT_INFO.email !== '' && (
            <section className="contact-card" aria-labelledby="contact-email-heading">
              <p className="contact-card-jp" lang="ja" aria-hidden="true">
                メール
              </p>
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
              <p className="contact-card-jp" lang="ja" aria-hidden="true">
                電話
              </p>
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
              <p className="contact-card-jp" lang="ja" aria-hidden="true">
                営業時間
              </p>
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

      <p className="contact-footnote">
        {BRAND.legalName} · Demo storefront — orders placed online are confirmed
        personally by our team; no payment is taken on this site.
      </p>
    </div>
  )
}
