<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Preventa confirmada</title>
<style>
  body { margin: 0; padding: 0; background: #f5f5f5; font-family: Arial, sans-serif; color: #333; }
  .wrap { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
  .header { background: #1a1a2e; padding: 32px 32px 24px; text-align: center; }
  .header h1 { margin: 0; color: #fff; font-size: 22px; letter-spacing: .5px; }
  .header .folio { display: inline-block; margin-top: 10px; background: #e8b04b; color: #1a1a2e; font-weight: 700; font-size: 20px; padding: 6px 20px; border-radius: 4px; letter-spacing: 1px; }
  .body { padding: 28px 32px; }
  .greeting { font-size: 16px; margin: 0 0 20px; }
  .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: .8px; color: #888; margin: 24px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; color: #888; border-bottom: 1px solid #eee; padding: 6px 0; }
  td { padding: 8px 0; font-size: 14px; border-bottom: 1px solid #f5f5f5; vertical-align: top; }
  .td-right { text-align: right; }
  .totals-row td { border-bottom: none; padding: 4px 0; font-size: 14px; }
  .totals-row.balance td { font-weight: 700; font-size: 15px; color: #1a1a2e; padding-top: 10px; border-top: 2px solid #1a1a2e; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-pending { background: #fff3cd; color: #856404; }
  .footer { background: #f9f9f9; padding: 20px 32px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; }
  .footer a { color: #888; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Tadaima POS</h1>
    <div class="folio">{{ $order->code }}</div>
  </div>

  <div class="body">
    <p class="greeting">
      Hola <strong>{{ $order->customer?->name ?? 'Cliente' }}</strong>,<br>
      tu preventa ha sido registrada exitosamente en <strong>{{ $order->store?->name ?? 'nuestra tienda' }}</strong>.
    </p>

    {{-- Items --}}
    <div class="section-title">Artículos</div>
    <table>
      <tr>
        <th>Producto</th>
        <th class="td-right">Cant.</th>
        <th class="td-right">Precio</th>
        <th class="td-right">Subtotal</th>
      </tr>
      @foreach($order->items as $item)
      <tr>
        <td>{{ $item->catalog?->product_name ?? '—' }}</td>
        <td class="td-right">{{ $item->quantity }}</td>
        <td class="td-right">${{ number_format($item->unit_price, 2) }}</td>
        <td class="td-right">${{ number_format($item->subtotal, 2) }}</td>
      </tr>
      @endforeach
    </table>

    {{-- Totals --}}
    <table style="margin-top:16px;">
      <tr class="totals-row">
        <td>Total</td>
        <td class="td-right">${{ number_format($order->total, 2) }}</td>
      </tr>
      <tr class="totals-row">
        <td>Anticipo pagado</td>
        <td class="td-right">− ${{ number_format($order->paid_amount, 2) }}</td>
      </tr>
      <tr class="totals-row balance">
        <td>Saldo pendiente</td>
        <td class="td-right">${{ number_format($order->balance, 2) }}</td>
      </tr>
    </table>

    {{-- Status --}}
    <div class="section-title">Estado</div>
    <span class="badge badge-pending">{{ ucfirst($order->status) }}</span>
    <p style="font-size:13px; color:#666; margin-top:12px;">
      Te avisaremos cuando tu pedido esté listo para recoger.
      @if($order->pickup_deadline)
        La fecha límite de recogida es el <strong>{{ \Carbon\Carbon::parse($order->pickup_deadline)->translatedFormat('d \d\e F \d\e Y') }}</strong>.
      @endif
    </p>
  </div>

  <div class="footer">
    Este correo fue generado automáticamente · Tadaima POS<br>
    <a href="{{ config('app.url') }}">poslite.com.mx</a>
  </div>
</div>
</body>
</html>
