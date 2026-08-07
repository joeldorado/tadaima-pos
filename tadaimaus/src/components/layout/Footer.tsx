import { BRAND, CONTACT_INFO, SHOP_CATEGORIES } from '../../lib/constants'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer-grid">
        <div className="site-footer-brand">
          <p className="site-footer-jp" lang="ja" aria-hidden="true">
            ただいま — おかえり
          </p>
          <p className="site-footer-name">{BRAND.legalName}</p>
          <p className="site-footer-copy">
            Figures, manga and trading card games — hand-picked for anime fans
            across the USA.
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

      <div className="container site-footer-bottom">
        <p>© 2026 {BRAND.legalName}. All rights reserved.</p>
        <p className="site-footer-disclaimer">
          Demo storefront — no real payments are processed online.
        </p>
      </div>
    </footer>
  )
}
