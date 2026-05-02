<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class PaymentMethod extends Model
{
    protected $fillable = ['name', 'active'];

    protected $casts = ['active' => 'boolean'];

    public function stores(): BelongsToMany
    {
        return $this->belongsToMany(Store::class, 'store_payment_methods')
                    ->withPivot('active')
                    ->withTimestamps();
    }
}
