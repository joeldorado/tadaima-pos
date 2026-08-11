import { useCallback, useEffect, useState } from 'react'
import { listLeads, LEADS_CAP, type AdminLead, type LeadSource } from '../lib/adminApi'
import { ApiRequestError } from '../lib/http'
import { CheckIcon } from './icons'

type Filter = 'all' | LeadSource

const FILTERS: readonly { readonly value: Filter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'contact', label: 'Contact' },
]

type PanelState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly leads: readonly AdminLead[] }

// La tienda es en inglés, así que el panel también fecha en en-US (el módulo
// equivalente del POS usa es-MX porque ahí todo es español).
const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDate(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormat.format(parsed)
}

export function LeadsPanel() {
  const [filter, setFilter] = useState<Filter>('all')
  const [state, setState] = useState<PanelState>({ status: 'loading' })

  const load = useCallback(async (source: Filter): Promise<void> => {
    setState({ status: 'loading' })
    try {
      const leads = await listLeads(source === 'all' ? undefined : source)
      setState({ status: 'ready', leads })
    } catch (loadError: unknown) {
      setState({
        status: 'error',
        message:
          loadError instanceof ApiRequestError
            ? loadError.message
            : 'The leads could not be loaded.',
      })
    }
  }, [])

  useEffect(() => {
    void load(filter)
  }, [load, filter])

  const count = state.status === 'ready' ? state.leads.length : null

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Leads</h1>
          {count !== null && (
            <p className="admin-head-count">
              {count} {count === 1 ? 'message' : 'messages'} from the site
            </p>
          )}
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-chips">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`admin-chip${filter === option.value ? ' is-active' : ''}`}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-card">
        {state.status === 'loading' && (
          <div className="admin-state">
            <div className="admin-spinner" />
            Loading leads…
          </div>
        )}

        {state.status === 'error' && (
          <div className="admin-state" role="alert">
            <p className="admin-state-title">We hit a snag</p>
            <p>{state.message}</p>
            <button
              type="button"
              className="admin-btn admin-btn-ghost"
              onClick={() => void load(filter)}
            >
              Try again
            </button>
          </div>
        )}

        {state.status === 'ready' && state.leads.length === 0 && (
          <div className="admin-state">
            <p className="admin-state-title">Nothing here yet</p>
            <p>Newsletter sign-ups and contact messages will show up on this page.</p>
          </div>
        )}

        {state.status === 'ready' &&
          state.leads.map((lead) => (
            <article className="admin-lead" key={lead.id}>
              <div className="admin-lead-main">
                <div className="admin-lead-tags">
                  <span className="admin-badge admin-badge-neutral">
                    {lead.source === 'newsletter' ? 'Newsletter' : 'Contact'}
                  </span>
                  {lead.marketing_consent && (
                    <span className="admin-badge admin-badge-ok">
                      <CheckIcon size={11} /> Opt-in
                    </span>
                  )}
                </div>

                <p className="admin-lead-who">
                  {lead.name !== null && lead.name !== '' ? `${lead.name} · ` : ''}
                  <a href={`mailto:${lead.email}`}>{lead.email}</a>
                </p>

                {/* Chequeo por verdad y no `!== null`: un backend viejo (antes
                    de la migración de subject) omite el campo y `undefined`
                    pintaría un párrafo vacío. */}
                {Boolean(lead.subject) && (
                  <p className="admin-lead-subject">{lead.subject}</p>
                )}

                {Boolean(lead.message) && <p className="admin-lead-msg">{lead.message}</p>}
              </div>

              <p className="admin-lead-date">{formatDate(lead.created_at)}</p>
            </article>
          ))}

        {/* Igual que en artículos: el backend corta y hay que decirlo. */}
        {state.status === 'ready' && state.leads.length >= LEADS_CAP && (
          <p className="admin-notice">
            Showing the most recent {LEADS_CAP} leads.
          </p>
        )}
      </div>
    </>
  )
}
