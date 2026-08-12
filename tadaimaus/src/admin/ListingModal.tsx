import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  createListing,
  updateListing,
  uploadImage,
  MAX_IMAGE_BYTES,
  type AdminListing,
  type ListingInput,
} from '../lib/adminApi'
import { SHOP_CATEGORIES, type UsCategory } from '../lib/constants'
import { ApiRequestError } from '../lib/http'
import { ImageIcon } from './icons'

interface ListingModalProps {
  /** null = alta; un listing = edición. */
  readonly listing: AdminListing | null
  readonly onClose: () => void
  readonly onSaved: () => void
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback
}

export function ListingModal({ listing, onClose, onSaved }: ListingModalProps) {
  const isEditing = listing !== null

  const [name, setName] = useState(listing?.name ?? '')
  const [description, setDescription] = useState(listing?.description ?? '')
  const [price, setPrice] = useState(listing !== null ? listing.price_usd.toFixed(2) : '')
  const [category, setCategory] = useState<UsCategory>(listing?.category ?? 'figures')
  const [imageUrl, setImageUrl] = useState(listing?.image_url ?? '')
  const [soldOut, setSoldOut] = useState(listing?.sold_out ?? false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setSaving] = useState(false)
  const [isUploading, setUploading] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleFile = async (file: File): Promise<void> => {
    if (file.size > MAX_IMAGE_BYTES) {
      setError('That photo is larger than 5 MB. Pick a smaller one.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      setImageUrl(await uploadImage(file))
    } catch (uploadError: unknown) {
      setError(errorMessage(uploadError, 'The photo could not be uploaded.'))
    } finally {
      setUploading(false)
      // Permite volver a elegir el MISMO archivo tras un fallo.
      if (fileInput.current !== null) fileInput.current.value = ''
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      setError('Give the item a name (at least 2 characters).')
      return
    }

    const parsedPrice = Number.parseFloat(price)
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError('Enter a price in dollars greater than 0.')
      return
    }

    const payload: ListingInput = {
      name: trimmedName,
      description: description.trim(),
      // El backend guarda decimal(10,2): se redondea aquí para que lo que se ve
      // en la tienda sea exactamente lo que se capturó.
      price_usd: Math.round(parsedPrice * 100) / 100,
      category,
      image_url: imageUrl.trim() === '' ? null : imageUrl.trim(),
      sold_out: soldOut,
    }

    setSaving(true)
    setError(null)
    try {
      if (listing === null) await createListing(payload)
      else await updateListing(listing.id, payload)
      onSaved()
    } catch (saveError: unknown) {
      setSaving(false)
      setError(errorMessage(saveError, 'The item could not be saved.'))
    }
  }

  const isBusy = isSaving || isUploading

  return (
    <div
      className="admin-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-modal-title"
      >
        <header className="admin-modal-head">
          <h2 id="listing-modal-title">{isEditing ? 'Edit item' : 'New item'}</h2>
          <button
            type="button"
            className="admin-icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className="admin-modal-body">
            {error !== null && (
              <p className="admin-error" role="alert">
                {error}
              </p>
            )}

            <div className="field">
              <input
                id="listing-name"
                type="text"
                autoFocus
                placeholder=" "
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <label htmlFor="listing-name">Name</label>
            </div>

            <div className="admin-modal-row">
              <div className="field">
                <input
                  id="listing-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  placeholder=" "
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
                <label htmlFor="listing-price">Price (USD)</label>
              </div>

              {/* El select no puede flotar: siempre tiene un valor, así que
                  `:placeholder-shown` nunca aplica. Etiqueta fija. */}
              <div className="admin-field">
                <label className="admin-label" htmlFor="listing-category">
                  Category
                </label>
                <select
                  id="listing-category"
                  className="admin-select"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as UsCategory)}
                >
                  {SHOP_CATEGORIES.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <textarea
                id="listing-description"
                rows={3}
                placeholder=" "
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              <label htmlFor="listing-description">Description</label>
            </div>

            <div className="admin-field">
              <span className="admin-label">Photo</span>
              <div className="admin-photo">
                {imageUrl.trim() !== '' ? (
                  <img className="admin-photo-preview" src={imageUrl} alt="" />
                ) : (
                  <div className="admin-photo-preview admin-photo-empty">
                    <ImageIcon size={22} />
                  </div>
                )}

                <div className="admin-photo-controls">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file !== undefined) void handleFile(file)
                    }}
                  />
                  <div className="admin-chips">
                    <button
                      type="button"
                      className="admin-btn admin-btn-ghost"
                      onClick={() => fileInput.current?.click()}
                      disabled={isBusy}
                    >
                      {isUploading ? 'Uploading…' : 'Upload photo'}
                    </button>
                    {imageUrl.trim() !== '' && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-danger"
                        onClick={() => setImageUrl('')}
                        disabled={isBusy}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    className="admin-input"
                    type="url"
                    placeholder="…or paste an image URL"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <label className="admin-check" htmlFor="listing-sold-out">
              <input
                id="listing-sold-out"
                type="checkbox"
                checked={soldOut}
                onChange={(event) => setSoldOut(event.target.checked)}
              />
              <span>
                Sold out
                <span className="admin-check-hint">
                  Shown in the store with a “Sold Out” badge; customers can’t order it.
                </span>
              </span>
            </label>
          </div>

          <footer className="admin-modal-foot">
            <button
              type="button"
              className="admin-btn admin-btn-ghost"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={isBusy}>
              {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create item'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
