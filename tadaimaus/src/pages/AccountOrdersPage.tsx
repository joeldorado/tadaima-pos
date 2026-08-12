import { useCallback, useEffect, useState } from 'react'
import { fetchMyOrders, MY_ORDERS_CAP, type CustomerOrder } from '../lib/customerApi'
import { formatUsd } from '../lib/format'
import { ApiRequestError } from '../lib/http'
import { navigateTo } from '../lib/routes'
import { useCustomerAuth } from '../store/CustomerAuthContext'

/**
 * "My Orders" (#/account) — historial del cliente logueado: folio, fecha,
 * status, items snapshot (precio congelado al comprar) y total.
 * Guard: anónimo → #/login (el effect de abajo).
 */
const STATUS_LABEL: Record<CustomerOrder['status'], string> = {
  new: 'Received',
  contacted: 'Contacted',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

type PanelState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly orders: readonly CustomerOrder[] }

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

function formatDate(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormat.format(parsed)
}

export function AccountOrdersPage() {
  const { status: authStatus } = useCustomerAuth()
  const [state, setState] = useState<PanelState>({ status: 'loading' })

  useEffect(() => {
    if (authStatus === 'anonymous') navigateTo({ page: 'login' })
  }, [authStatus])

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' })
    try {
      const orders = await fetchMyOrders()
      setState({ status: 'ready', orders })
    } catch (loadError: unknown) {
      setState({
        status: 'error',
        message:
          loadError instanceof ApiRequestError
            ? loadError.message
            : 'Your orders could not be loaded.',
      })
    }
  }, [])

  useEffect(() => {
    if (authStatus === 'authenticated') void load()
  }, [authStatus, load])

  if (authStatus !== 'authenticated') return null

  return (
    <div className="container section">
      <div className="account-page">
        <header className="page-head">
          <p className="section-kicker">Account</p>
          <h1 className="page-title">My Orders</h1>
        </header>

        <nav className="account-tabs" aria-label="Account sections">
          <a href="#/account" aria-current="page">
            My Orders
          </a>
          <a href="#/account/settings">Settings</a>
        </nav>

        {state.status === 'loading' && (
          <div className="catalog-notice" role="status" aria-busy="true">
            <p className="catalog-notice-copy">Loading your orders…</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="catalog-notice" role="status">
            <p className="catalog-notice-title">We hit a snag</p>
            <p className="catalog-notice-copy">{state.message}</p>
            <button type="button" className="btn btn-ghost-dark" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}

        {state.status === 'ready' && state.orders.length === 0 && (
          <div className="catalog-notice" role="status">
            <p className="catalog-notice-title">No orders yet</p>
            <p className="catalog-notice-copy">
              When you place an order it will show up here with its status.
            </p>
            <a className="btn btn-primary" href="#/">
              Browse the shop
            </a>
          </div>
        )}

        {state.status === 'ready' &&
          state.orders.map((order) => (
            <article className="account-order" key={order.id}>
              <header className="account-order-head">
                <div>
                  <p className="account-order-number">{order.order_number}</p>
                  <p className="account-order-date">{formatDate(order.created_at)}</p>
                </div>
                <span className={`status-badge is-${order.status}`}>
                  {STATUS_LABEL[order.status]}
                </span>
              </header>

              <ul className="account-order-items">
                {order.items.map((item) => (
                  <li key={item.id}>
                    <span className="account-order-item-name">
                      {item.name}
                      <span className="account-order-item-qty"> × {item.quantity}</span>
                    </span>
                    <span>{formatUsd(item.line_total_usd)}</span>
                  </li>
                ))}
              </ul>

              <footer className="account-order-foot">
                {order.shipping.address !== null && (
                  <p className="account-order-shipping">
                    Ships to: {order.shipping.address}, {order.shipping.city},{' '}
                    {order.shipping.state} {order.shipping.zip}
                  </p>
                )}
                <p className="account-order-total">
                  Total <strong>{formatUsd(order.total_usd)}</strong>
                </p>
              </footer>
            </article>
          ))}

        {state.status === 'ready' && state.orders.length >= MY_ORDERS_CAP && (
          <p className="catalog-notice-copy">Showing your most recent {MY_ORDERS_CAP} orders.</p>
        )}
      </div>
    </div>
  )
}
