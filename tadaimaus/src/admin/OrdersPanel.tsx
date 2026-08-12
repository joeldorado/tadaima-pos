import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  listOrders,
  updateOrderStatus,
  ORDERS_CAP,
  type AdminOrder,
  type OrderStatus,
} from '../lib/adminApi'
import { ApiRequestError } from '../lib/http'

type Filter = 'all' | OrderStatus

const FILTERS: readonly { readonly value: Filter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

/** Workflow de contacto del pedido dummy (sin cobro online). */
const STATUS_ORDER: readonly OrderStatus[] = ['new', 'contacted', 'completed', 'cancelled']

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_BADGE: Record<OrderStatus, string> = {
  new: 'admin-badge-warn',
  contacted: 'admin-badge-neutral',
  completed: 'admin-badge-ok',
  cancelled: 'admin-badge-neutral',
}

type PanelState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly orders: readonly AdminOrder[] }

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

// Mismo locale que LeadsPanel: la tienda (y su panel) son en inglés.
const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDate(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormat.format(parsed)
}

export function OrdersPanel() {
  const [filter, setFilter] = useState<Filter>('all')
  const [state, setState] = useState<PanelState>({ status: 'loading' })
  const [actionError, setActionError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' })
    try {
      const orders = await listOrders()
      setState({ status: 'ready', orders })
    } catch (loadError: unknown) {
      setState({
        status: 'error',
        message: errorMessage(loadError, 'The orders could not be loaded.'),
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Cambio de status optimista con rollback, como patch() en ListingsPanel:
   * el badge cambia al instante y se revierte si el servidor lo rechaza.
   */
  const changeStatus = useCallback(
    async (order: AdminOrder, next: OrderStatus): Promise<void> => {
      if (next === order.status) return
      if (
        next === 'cancelled' &&
        !window.confirm(
          `Cancel order ${order.order_number}? This does not notify the customer.`,
        )
      ) {
        return
      }

      setActionError(null)
      setSavingId(order.id)
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              orders: current.orders.map((item) =>
                item.id === order.id ? { ...item, status: next } : item,
              ),
            }
          : current,
      )
      try {
        const saved = await updateOrderStatus(order.id, next)
        setState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                orders: current.orders.map((item) =>
                  item.id === saved.id ? saved : item,
                ),
              }
            : current,
        )
      } catch (statusError: unknown) {
        setActionError(errorMessage(statusError, 'The status could not be changed.'))
        setState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                orders: current.orders.map((item) =>
                  item.id === order.id ? order : item,
                ),
              }
            : current,
        )
      } finally {
        setSavingId(null)
      }
    },
    [],
  )

  // El endpoint no filtra por status (cap 200): el filtro es client-side.
  const visibleOrders =
    state.status === 'ready'
      ? filter === 'all'
        ? state.orders
        : state.orders.filter((order) => order.status === filter)
      : []

  const count = state.status === 'ready' ? state.orders.length : null

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Orders</h1>
          {count !== null && (
            <p className="admin-head-count">
              {count} {count === 1 ? 'order' : 'orders'} from the store
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
              onClick={() => {
                setFilter(option.value)
                setExpandedId(null)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {actionError !== null && (
        <p className="admin-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="admin-card">
        {state.status === 'loading' && (
          <div className="admin-state">
            <div className="admin-spinner" />
            Loading orders…
          </div>
        )}

        {state.status === 'error' && (
          <div className="admin-state" role="alert">
            <p className="admin-state-title">We hit a snag</p>
            <p>{state.message}</p>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}

        {state.status === 'ready' && visibleOrders.length === 0 && (
          <div className="admin-state">
            <p className="admin-state-title">
              {filter === 'all' ? 'No orders yet' : 'No orders with this status'}
            </p>
            <p>
              {filter === 'all'
                ? 'Orders placed in the store will show up on this page.'
                : 'Try another filter.'}
            </p>
          </div>
        )}

        {state.status === 'ready' && visibleOrders.length > 0 && (
          <>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Details</span>
                    </th>
                    <th scope="col">Order</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Total (USD)</th>
                    <th scope="col">Date</th>
                    <th scope="col">Status</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((order) => {
                    const isOpen = expandedId === order.id
                    const isSaving = savingId === order.id
                    return (
                      <Fragment key={order.id}>
                        <tr
                          className="admin-order-row"
                          onClick={() => setExpandedId(isOpen ? null : order.id)}
                        >
                          <td>
                            <span
                              className={`admin-order-caret${isOpen ? ' is-open' : ''}`}
                              aria-hidden="true"
                            >
                              ▸
                            </span>
                            <span className="sr-only">
                              {isOpen ? 'Hide items' : 'Show items'}
                            </span>
                          </td>
                          <td className="admin-order-number">{order.order_number}</td>
                          <td onClick={(event) => event.stopPropagation()}>
                            <span className="admin-order-customer">{order.customer_name}</span>
                            <span className="admin-order-contact">
                              {order.customer_email !== '' && (
                                <a href={`mailto:${order.customer_email}`}>
                                  {order.customer_email}
                                </a>
                              )}
                              {order.customer_phone !== '' && (
                                <a href={`tel:${order.customer_phone}`}>
                                  {order.customer_phone}
                                </a>
                              )}
                            </span>
                          </td>
                          <td className="admin-order-total">{usd.format(order.total_usd)}</td>
                          <td>{formatDate(order.created_at)}</td>
                          <td>
                            <span className={`admin-badge ${STATUS_BADGE[order.status]}`}>
                              {STATUS_LABEL[order.status]}
                            </span>
                          </td>
                          <td onClick={(event) => event.stopPropagation()}>
                            <select
                              className="admin-cell-select"
                              value={order.status}
                              disabled={isSaving}
                              aria-label={`Change status of ${order.order_number}`}
                              onChange={(event) =>
                                void changeStatus(order, event.target.value as OrderStatus)
                              }
                            >
                              {STATUS_ORDER.map((status) => (
                                <option key={status} value={status}>
                                  {STATUS_LABEL[status]}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="admin-order-items-row">
                            <td colSpan={7}>
                              <p className="admin-order-items-title">
                                Order items (prices frozen at checkout)
                              </p>
                              <table className="admin-order-items">
                                <thead>
                                  <tr>
                                    <th scope="col">Item</th>
                                    <th scope="col">Qty</th>
                                    <th scope="col">Price</th>
                                    <th scope="col">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.items.map((item) => (
                                    <tr key={item.id}>
                                      <td>{item.name}</td>
                                      <td>{item.quantity}</td>
                                      <td>{usd.format(item.price_usd)}</td>
                                      <td>{usd.format(item.line_total_usd)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Igual que en artículos: el backend corta y hay que decirlo. */}
            {state.orders.length >= ORDERS_CAP && (
              <p className="admin-notice">
                Showing the most recent {ORDERS_CAP} orders.
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}
