<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class CashRegister extends Model
{
    protected $fillable = ['store_id', 'name', 'active'];

    protected $casts = ['active' => 'boolean'];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(CashRegisterSession::class, 'register_id');
    }

    public function activeSession(): HasOne
    {
        return $this->hasOne(CashRegisterSession::class, 'register_id')
            ->where('status', CashRegisterSession::STATUS_OPEN);
    }
}
