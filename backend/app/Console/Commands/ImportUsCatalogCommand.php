<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\UsListing;
use Illuminate\Console\Command;

/**
 * TadaimaUS — siembra el catálogo migrado del Wix original (tadaimaus.com)
 * en us_listings como listings CUSTOM (product_id null).
 *
 * Fuente: backend/database/seed-data/tadaimaus-catalog.json, generado por
 * scripts/scrape_tadaimaus.py (imágenes ya descargadas a public/us-img/).
 *
 * IDEMPOTENTE — upsert por `slug`: re-correrlo no duplica. Por default NO
 * pisa ediciones manuales (si el listing ya existe solo se rellenan campos;
 * precio/visible/categoría se respetan). Con --pisar sobreescribe
 * nombre/precio/categoría/imagen con lo del JSON.
 *
 * Corre igual contra SQLite local (QA) que contra Supabase prod (conexión
 * default del .env activo — patrón import-macro: backend local con env de
 * prod SOLO con OK explícito de Joel).
 */
class ImportUsCatalogCommand extends Command
{
    protected $signature = 'tadaima:import-us-catalog
        {--file= : Ruta del JSON (default: database/seed-data/tadaimaus-catalog.json)}
        {--pisar : Sobrescribir nombre/precio/categoría/imagen de listings ya sembrados}
        {--dry-run : Solo reportar, sin escribir}';

    protected $description = 'Siembra los productos migrados del Wix tadaimaus.com en us_listings (upsert por slug)';

    public function handle(): int
    {
        $file = (string) ($this->option('file') ?: database_path('seed-data/tadaimaus-catalog.json'));

        if (! is_readable($file)) {
            $this->error("No puedo leer el archivo: {$file}");

            return self::FAILURE;
        }

        $items = json_decode((string) file_get_contents($file), true);

        if (! is_array($items) || $items === []) {
            $this->error('JSON vacío o inválido.');

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $pisar = (bool) $this->option('pisar');

        $existing = UsListing::query()
            ->whereNotNull('slug')
            ->pluck('id', 'slug');

        $created = 0;
        $updated = 0;
        $skipped = 0;

        foreach ($items as $item) {
            $slug = $item['slug'] ?? null;
            $name = $item['name'] ?? null;
            $price = $item['price_usd'] ?? null;

            if (! is_string($slug) || $slug === '' || ! is_string($name) || ! is_numeric($price)) {
                $this->warn('Item inválido, omitido: ' . json_encode($item));
                $skipped++;

                continue;
            }

            $category = in_array($item['category'] ?? null, UsListing::CATEGORIES, true)
                ? $item['category']
                : UsListing::CATEGORY_OTHER;

            $payload = [
                'name'      => $name,
                'price_usd' => (float) $price,
                'category'  => $category,
                'image_url' => $item['image'] ?? null,
            ];

            if (isset($existing[$slug])) {
                if (! $pisar) {
                    $skipped++;

                    continue;
                }

                if (! $dryRun) {
                    UsListing::whereKey($existing[$slug])->update($payload);
                }
                $updated++;

                continue;
            }

            if (! $dryRun) {
                UsListing::create($payload + [
                    'slug'       => $slug,
                    'product_id' => null,
                    'visible'    => true,
                ]);
            }
            $created++;
        }

        $mode = $dryRun ? ' (dry-run, nada escrito)' : '';
        $this->info("Listo{$mode}: {$created} creados, {$updated} actualizados, {$skipped} sin tocar.");

        return self::SUCCESS;
    }
}
