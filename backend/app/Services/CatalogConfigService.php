<?php

namespace App\Services;

use App\Models\Company;
use App\Models\SystemSetting;
use Illuminate\Support\Facades\DB;

/**
 * Configuración GLOBAL del Catálogo Online de cadena (Catálogo v3).
 *
 * Todo vive como llaves `catalog_*` en `system_settings` (key-value por
 * empresa) con defaults en código — sin migraciones para agregar opciones.
 * El endpoint público es sin auth, así que se resuelve la primera empresa.
 *
 * Bloques que produce:
 *  - flags():      visibilidad clásica (7 toggles) + default_sort
 *  - appearance(): theme + background + layout (whitelists), socials (JSON), description
 *  - footer():     show_stores/show_address/show_contact + lista de tiendas
 */
class CatalogConfigService
{
    /** Temas soportados — mantener en sync con landing/src/lib/catalogThemes.ts y mcp/catalog. */
    public const THEMES = ['tadaima', 'gradient', 'navidad', 'halloween', 'patrio', 'muertos'];

    /**
     * Fondos animados (Catálogo v4). Eje INDEPENDIENTE del tema: el tema pone el
     * color, el fondo pone el efecto. `null` (sin configurar) = lo que dicte el
     * tema, para que lo ya publicado no cambie de aspecto solo.
     */
    public const BACKGROUNDS = ['shader', 'gradient', 'galaxy'];

    /** Acomodo de la tienda pública (Catálogo v4). */
    public const LAYOUTS = ['classic', 'sidebar', 'masonry'];

    public const SORTS = ['new', 'featured'];

    /** Redes soportadas en el footer. */
    public const SOCIAL_KEYS = ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'discord'];

    private const FLAG_DEFAULTS = [
        'show_price'        => true,
        'show_stock'        => true,
        'show_search'       => true,
        'show_categories'   => true,
        'show_description'  => true,
        'cart_enabled'      => true,
        'hide_out_of_stock' => false,
    ];

    private const FOOTER_DEFAULTS = [
        'show_stores'  => true,
        'show_address' => true,
        'show_contact' => true,
    ];

    /** @var array<string, string|null>|null cache por request de las llaves catalog_* */
    private ?array $stored = null;

    /** Todas las llaves `catalog_*` de la primera empresa (una sola query). */
    private function stored(): array
    {
        if ($this->stored !== null) {
            return $this->stored;
        }

        $companyId = Company::query()->min('id');
        $this->stored = $companyId
            ? SystemSetting::where('company_id', $companyId)
                ->where('key', 'like', 'catalog_%')
                ->pluck('value', 'key')
                ->all()
            : [];

        return $this->stored;
    }

    private function boolValue(string $key, bool $default): bool
    {
        $raw = $this->stored()["catalog_{$key}"] ?? null;

        return $raw === null ? $default : filter_var($raw, FILTER_VALIDATE_BOOLEAN);
    }

    /** Flags de visibilidad (compat con el bloque `catalog` histórico) + default_sort. */
    public function flags(): array
    {
        $flags = [];
        foreach (self::FLAG_DEFAULTS as $key => $default) {
            $flags[$key] = $this->boolValue($key, $default);
        }

        $sort = $this->stored()['catalog_default_sort'] ?? null;
        $flags['default_sort'] = in_array($sort, self::SORTS, true) ? $sort : 'new';

        return $flags;
    }

    /** Tema + redes + descripción de la marca. Valores corruptos degradan a defaults. */
    public function appearance(): array
    {
        $stored = $this->stored();

        $theme = $stored['catalog_theme'] ?? null;
        if (!in_array($theme, self::THEMES, true)) {
            $theme = 'tadaima';
        }

        // Sin configurar queda null a propósito: el front deriva el fondo del
        // tema (compat con lo publicado antes de Catálogo v4).
        $background = $stored['catalog_background'] ?? null;
        if (!in_array($background, self::BACKGROUNDS, true)) {
            $background = null;
        }

        $layout = $stored['catalog_layout'] ?? null;
        if (!in_array($layout, self::LAYOUTS, true)) {
            $layout = 'classic';
        }

        $socials = [];
        $rawSocials = $stored['catalog_socials'] ?? null;
        if (is_string($rawSocials) && $rawSocials !== '') {
            $decoded = json_decode($rawSocials, true);
            if (is_array($decoded)) {
                foreach (self::SOCIAL_KEYS as $key) {
                    $url = $decoded[$key] ?? null;
                    if (is_string($url) && trim($url) !== '') {
                        $socials[$key] = trim($url);
                    }
                }
            }
        }

        $description = $stored['catalog_description'] ?? null;
        $description = is_string($description) && trim($description) !== '' ? trim($description) : null;

        return [
            'theme'       => $theme,
            'background'  => $background,
            'layout'      => $layout,
            'socials'     => (object) $socials, // {} en JSON aunque esté vacío
            'description' => $description,
        ];
    }

    /** Config del footer + lista de sucursales activas (respetando los toggles). */
    public function footer(): array
    {
        $config = [];
        foreach (self::FOOTER_DEFAULTS as $key => $default) {
            $config[$key] = $this->boolValue($key, $default);
        }

        $stores = [];
        if ($config['show_stores']) {
            // WhatsApp de pedidos con el mismo COALESCE que whatsappByStore().
            $stores = DB::table('stores')
                ->leftJoin('catalog_settings', 'catalog_settings.store_id', '=', 'stores.id')
                ->where('stores.active', true)
                ->orderBy('stores.name')
                ->selectRaw("stores.id, stores.name, stores.address, stores.phone, COALESCE(NULLIF(catalog_settings.whatsapp_number, ''), stores.phone) as whatsapp")
                ->get()
                ->map(fn ($s) => [
                    'id'       => (int) $s->id,
                    'name'     => $s->name,
                    'address'  => $config['show_address'] ? ($s->address ?: null) : null,
                    'phone'    => $config['show_contact'] ? ($s->phone ?: null) : null,
                    'whatsapp' => $s->whatsapp ?: null,
                ])
                ->values()
                ->all();
        }

        return [
            'show_stores'  => $config['show_stores'],
            'show_address' => $config['show_address'],
            'show_contact' => $config['show_contact'],
            'stores'       => $stores,
        ];
    }
}
