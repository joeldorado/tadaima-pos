import { describe, expect, it } from 'vitest'
import {
  EMPTY_CHECKOUT_VALUES,
  validateCheckout,
  type CheckoutValues,
} from './checkoutValidation'

const VALID: CheckoutValues = {
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+1 619 555 0100',
  address: '742 Evergreen Terrace',
  city: 'San Diego',
  state: 'CA',
  zip: '92101',
  country: 'United States',
  password: 'super-secret-1',
}

describe('validateCheckout', () => {
  it('passes a fully valid guest checkout', () => {
    expect(validateCheckout(VALID, { requirePassword: true })).toEqual({})
  })

  it('flags every empty field for a guest', () => {
    const errors = validateCheckout(
      { ...EMPTY_CHECKOUT_VALUES, country: '' },
      { requirePassword: true },
    )
    expect(Object.keys(errors).sort()).toEqual(
      ['address', 'city', 'country', 'email', 'name', 'password', 'phone', 'state', 'zip'].sort(),
    )
  })

  it('validates email shape and phone digit count', () => {
    expect(validateCheckout({ ...VALID, email: 'nope' }, { requirePassword: true }).email).toBeDefined()
    expect(validateCheckout({ ...VALID, phone: '12-34' }, { requirePassword: true }).phone).toBeDefined()
    // 7 dígitos entre separadores sí pasa.
    expect(validateCheckout({ ...VALID, phone: '(555) 12-34-567' }, { requirePassword: true }).phone).toBeUndefined()
  })

  it('requires 8+ password chars only for guests', () => {
    const short = { ...VALID, password: 'abc' }
    expect(validateCheckout(short, { requirePassword: true }).password).toBe(
      'Password must be at least 8 characters.',
    )
    expect(validateCheckout({ ...VALID, password: '' }, { requirePassword: true }).password).toBe(
      'Create a password to track your orders.',
    )
    // Logueado: password ignorada por completo.
    expect(validateCheckout({ ...VALID, password: '' }, { requirePassword: false })).toEqual({})
  })

  it('keeps the United States default country valid', () => {
    expect(validateCheckout(VALID, { requirePassword: true }).country).toBeUndefined()
    expect(EMPTY_CHECKOUT_VALUES.country).toBe('United States')
  })
})
