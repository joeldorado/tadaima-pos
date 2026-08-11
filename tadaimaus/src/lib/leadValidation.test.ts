import { describe, expect, test } from 'vitest'
import {
  MAX_MESSAGE_LENGTH,
  MAX_SUBJECT_LENGTH,
  validateContactForm,
  validateEmail,
} from './leadValidation'

describe('validateEmail', () => {
  test('accepts a normal address', () => {
    expect(validateEmail('fan@example.com')).toBeNull()
  })

  test('trims surrounding whitespace before validating', () => {
    expect(validateEmail('  fan@example.com  ')).toBeNull()
  })

  test('rejects empty input', () => {
    expect(validateEmail('')).toBe('Please enter your email address.')
    expect(validateEmail('   ')).toBe('Please enter your email address.')
  })

  test('rejects malformed addresses', () => {
    expect(validateEmail('not-an-email')).not.toBeNull()
    expect(validateEmail('a@b')).not.toBeNull()
    expect(validateEmail('a b@c.com')).not.toBeNull()
  })

  test('rejects addresses beyond the backend limit', () => {
    const longEmail = `${'a'.repeat(190)}@example.com`
    expect(validateEmail(longEmail)).toBe('Email is too long.')
  })
})

describe('validateContactForm', () => {
  const valid = {
    name: 'John Doe',
    email: 'john@example.com',
    subject: 'Support',
    message: 'Do you have the Rengoku figure?',
  }

  test('returns no errors for a valid form', () => {
    expect(validateContactForm(valid)).toEqual({})
  })

  test('requires a real name', () => {
    expect(validateContactForm({ ...valid, name: '' }).name).toBeDefined()
    expect(validateContactForm({ ...valid, name: ' J ' }).name).toBeDefined()
  })

  test('requires a message', () => {
    expect(validateContactForm({ ...valid, message: '  ' }).message).toBe(
      'Please write a short message.',
    )
  })

  test('caps the message at the backend limit', () => {
    const message = 'x'.repeat(MAX_MESSAGE_LENGTH + 1)
    expect(validateContactForm({ ...valid, message }).message).toBe(
      'Message is limited to 1000 characters.',
    )
  })

  test('requires a subject — el formulario original lo marca obligatorio', () => {
    expect(validateContactForm({ ...valid, subject: '   ' }).subject).toBe(
      'Please enter a subject.',
    )
  })

  test('caps the subject at the backend limit', () => {
    const subject = 'x'.repeat(MAX_SUBJECT_LENGTH + 1)
    expect(validateContactForm({ ...valid, subject }).subject).toBe('Subject is too long.')
  })

  test('collects multiple errors at once', () => {
    const errors = validateContactForm({ name: '', email: 'bad', subject: '', message: '' })
    expect(Object.keys(errors).sort()).toEqual(['email', 'message', 'name', 'subject'])
  })
})
