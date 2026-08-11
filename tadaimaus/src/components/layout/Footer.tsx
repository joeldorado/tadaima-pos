import { BRAND, CONTACT_INFO, SHOP_CATEGORIES, SOCIAL_LINKS } from '../../lib/constants'

/** Redes con URL cargada — las vacías simplemente no se pintan. */
const SOCIALS = [
  { key: 'facebook', label: 'Facebook', href: SOCIAL_LINKS.facebook, path: 'M14 8.5h2.5V5.6A32 32 0 0 0 13.9 5.5c-2.6 0-4.4 1.6-4.4 4.5v2.1H6.8v3.2h2.7v8.2h3.3v-8.2h2.7l.4-3.2h-3.1v-1.8c0-.9.3-1.6 1.2-1.6Z' },
  { key: 'instagram', label: 'Instagram', href: SOCIAL_LINKS.instagram, path: 'M15 8.6a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8Zm0 10.6a4.2 4.2 0 1 1 0-8.4 4.2 4.2 0 0 1 0 8.4Zm8.2-10.9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm4.2 1.5c-.1-2-.5-3.8-2-5.2-1.4-1.4-3.2-1.9-5.2-2C18.2 2.5 11.8 2.5 9.8 2.6c-2 .1-3.8.5-5.2 2C3.2 6 2.7 7.8 2.6 9.8c-.1 2-.1 8.4 0 10.4.1 2 .6 3.8 2 5.2 1.4 1.4 3.2 1.9 5.2 2 2 .1 8.4.1 10.4 0 2-.1 3.8-.6 5.2-2 1.4-1.4 1.9-3.2 2-5.2.1-2 .1-8.4 0-10.4Zm-2.7 12.6c-.4 1.1-1.3 2-2.4 2.4-1.7.7-5.7.5-7.6.5s-5.9.2-7.6-.5c-1.1-.4-2-1.3-2.4-2.4-.7-1.7-.5-5.7-.5-7.6s-.2-5.9.5-7.6c.4-1.1 1.3-2 2.4-2.4 1.7-.7 5.7-.5 7.6-.5s5.9-.2 7.6.5c1.1.4 2 1.3 2.4 2.4.7 1.7.5 5.7.5 7.6s.2 5.9-.5 7.6Z' },
  { key: 'tiktok', label: 'TikTok', href: SOCIAL_LINKS.tiktok, path: 'M22.5 3h-3.7v14.9a3 3 0 1 1-2.6-3v-3.8a6.8 6.8 0 1 0 6.3 6.8V10a8.6 8.6 0 0 0 5 1.6V7.8a4.9 4.9 0 0 1-5-4.8Z' },
] as const

export function Footer() {
  const socials = SOCIALS.filter((social) => social.href !== '')

  return (
    <footer className="site-footer">
      <div className="container site-footer-grid">
        <div className="site-footer-brand">
          <p className="site-footer-name">{BRAND.legalName}</p>
          <p className="site-footer-copy">
            Figures, manga and trading card games — hand-picked for anime
            fans.
          </p>
        </div>

        <nav className="site-footer-nav" aria-label="Footer navigation">
          <p className="site-footer-heading">Shop</p>
          <ul>
            {SHOP_CATEGORIES.map((category) => (
              <li key={category.slug}>
                <a href={`#/${category.slug}`}>{category.label}</a>
              </li>
            ))}
            <li>
              <a href="#/contact">Contact</a>
            </li>
          </ul>
        </nav>

        {(CONTACT_INFO.email !== '' ||
          CONTACT_INFO.phone !== '' ||
          CONTACT_INFO.location !== '') && (
          <div className="site-footer-contact">
            <p className="site-footer-heading">Get in touch</p>
            <ul>
              {CONTACT_INFO.email !== '' && (
                <li>
                  <a href={`mailto:${CONTACT_INFO.email}`}>{CONTACT_INFO.email}</a>
                </li>
              )}
              {CONTACT_INFO.phone !== '' && <li>{CONTACT_INFO.phone}</li>}
              {CONTACT_INFO.location !== '' && <li>{CONTACT_INFO.location}</li>}
            </ul>
          </div>
        )}
      </div>

      {socials.length > 0 && (
        <div className="container site-footer-social">
          {socials.map((social) => (
            <a
              key={social.key}
              href={social.href}
              className="site-footer-social-link"
              target="_blank"
              rel="noreferrer noopener"
              aria-label={social.label}
            >
              <svg viewBox="0 0 30 30" width="20" height="20" aria-hidden="true" focusable="false">
                <path d={social.path} fill="currentColor" />
              </svg>
            </a>
          ))}
        </div>
      )}

      <div className="container site-footer-bottom">
        {/* Formato del Wix original ("© Tadaima Okaeri LLC 2025") con el año
            que pidió Joel. */}
        <p>© {BRAND.legalName} 2026</p>
      </div>
    </footer>
  )
}
