<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerCredit extends Model
{
    protected $table = 'customer_credit';

    protected $fillable = ['customer_id', 'amount', 'reason'];

    protected $casts = ['amount' => 'float'];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
