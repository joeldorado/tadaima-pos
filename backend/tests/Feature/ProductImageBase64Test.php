<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * GET /products/{product}/image-base64 (banner de promo 2026-07-16): primera
 * imagen como data-URL para que el export PNG del banner no taintée el canvas.
 */
class ProductImageBase64Test extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);
        $this->user = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $store->id,
        ]);
        $this->product = Product::create([
            'company_id' => $company->id, 'name' => 'Producto Promo', 'sku' => 'SKU-PROMO', 'active' => true,
        ]);
    }

    public function test_returns_first_image_as_data_url(): void
    {
        Storage::fake();
        Storage::put('products/promo.png', 'fake-png-bytes');
        ProductImage::create(['product_id' => $this->product->id, 'image_path' => 'products/promo.png', 'sort_order' => 0]);

        $resp = $this->actingAs($this->user)->getJson("/api/v1/products/{$this->product->id}/image-base64");

        $resp->assertOk();
        $dataUrl = $resp->json('data.data_url');
        $this->assertStringStartsWith('data:image/png;base64,', $dataUrl);
        $this->assertSame('fake-png-bytes', base64_decode(substr($dataUrl, strlen('data:image/png;base64,'))));
    }

    public function test_404_when_product_has_no_image(): void
    {
        $this->actingAs($this->user)
            ->getJson("/api/v1/products/{$this->product->id}/image-base64")
            ->assertStatus(404);
    }
}
