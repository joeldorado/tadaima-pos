import { useEffect, useState, type FormEvent } from 'react'
import { Field } from '../components/forms/Field'
import {
  changeCustomerPassword,
  updateCustomerProfile,
  type CustomerProfileInput,
} from '../lib/customerApi'
import { ApiRequestError } from '../lib/http'
import { navigateTo } from '../lib/routes'
import { useCustomerAuth } from '../store/CustomerAuthContext'

/**
 * Settings de la cuenta (#/account/settings): perfil + dirección default
 * (pre-llena el próximo checkout) y cambio de contraseña. El email no se
 * edita — es la llave de la cuenta. Guard: anónimo → #/login.
 */
export function AccountSettingsPage() {
  const { status: authStatus, customer, setCustomer } = useCustomerAuth()

  const [profile, setProfile] = useState<CustomerProfileInput>({
    name: '', phone: '', address: '', city: '', state: '', zip: '', country: 'United States',
  })
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)
  const [isSavingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [isSavingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (authStatus === 'anonymous') navigateTo({ page: 'login' })
  }, [authStatus])

  // Pre-llenar con el perfil de la sesión (llega tras restoring).
  useEffect(() => {
    if (customer === null) return
    setProfile({
      name: customer.name,
      phone: customer.phone,
      address: customer.address ?? '',
      city: customer.city ?? '',
      state: customer.state ?? '',
      zip: customer.zip ?? '',
      country: customer.country ?? 'United States',
    })
  }, [customer])

  const setField = (field: keyof CustomerProfileInput) => (value: string): void => {
    setProfileSaved(false)
    setProfile((prev) => ({ ...prev, [field]: value }))
  }

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setSavingProfile(true)
    setProfileError(null)
    setProfileSaved(false)
    try {
      const updated = await updateCustomerProfile(profile)
      setCustomer(updated)
      setProfileSaved(true)
    } catch (saveError: unknown) {
      setProfileError(
        saveError instanceof ApiRequestError
          ? saveError.message
          : 'Your profile could not be saved.',
      )
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      return
    }
    setSavingPassword(true)
    setPasswordError(null)
    setPasswordSaved(false)
    try {
      await changeCustomerPassword(currentPassword, newPassword)
      setPasswordSaved(true)
      setCurrentPassword('')
      setNewPassword('')
    } catch (saveError: unknown) {
      setPasswordError(
        saveError instanceof ApiRequestError
          ? saveError.message
          : 'Your password could not be changed.',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  if (authStatus !== 'authenticated') return null

  return (
    <div className="container section">
      <div className="account-page">
        <header className="page-head">
          <p className="section-kicker">Account</p>
          <h1 className="page-title">Settings</h1>
        </header>

        <nav className="account-tabs" aria-label="Account sections">
          <a href="#/account">My Orders</a>
          <a href="#/account/settings" aria-current="page">
            Settings
          </a>
        </nav>

        <section className="account-card" aria-labelledby="profile-heading">
          <h2 id="profile-heading">Profile &amp; delivery address</h2>
          <p className="account-card-sub">
            Signed in as <strong>{customer?.email}</strong>. This address pre-fills
            your next checkout.
          </p>

          <form onSubmit={(event) => void handleProfileSubmit(event)} noValidate>
            <Field id="settings-name" label="Full name" autoComplete="name" value={profile.name} onChange={setField('name')} />
            <Field id="settings-phone" label="Phone" type="tel" autoComplete="tel" value={profile.phone} onChange={setField('phone')} />
            <Field id="settings-address" label="Address" autoComplete="street-address" value={profile.address} onChange={setField('address')} />
            <div className="checkout-address-row">
              <Field id="settings-city" label="City" autoComplete="address-level2" value={profile.city} onChange={setField('city')} />
              <Field id="settings-state" label="State" autoComplete="address-level1" value={profile.state} onChange={setField('state')} />
              <Field id="settings-zip" label="Zip / Postal code" autoComplete="postal-code" value={profile.zip} onChange={setField('zip')} />
            </div>
            <Field id="settings-country" label="Country" autoComplete="country-name" value={profile.country} onChange={setField('country')} />

            {profileError !== null && (
              <p className="form-server-error" role="alert">{profileError}</p>
            )}
            {profileSaved && (
              <p className="form-success" role="status">Profile saved.</p>
            )}

            <button type="submit" className="btn btn-primary" disabled={isSavingProfile}>
              {isSavingProfile ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </section>

        <section className="account-card" aria-labelledby="password-heading">
          <h2 id="password-heading">Change password</h2>
          <p className="account-card-sub">
            Changing your password signs you out of any other device.
          </p>

          <form onSubmit={(event) => void handlePasswordSubmit(event)} noValidate>
            <Field
              id="settings-current-password"
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
            />
            <Field
              id="settings-new-password"
              label="New password (min. 8 characters)"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
            />

            {passwordError !== null && (
              <p className="form-server-error" role="alert">{passwordError}</p>
            )}
            {passwordSaved && (
              <p className="form-success" role="status">Password updated.</p>
            )}

            <button type="submit" className="btn btn-primary" disabled={isSavingPassword}>
              {isSavingPassword ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
