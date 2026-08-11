<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * TadaimaUS — lead capturado en el sitio público US.
 * newsletter = "We hear you! / Sign Up" (solo email) ·
 * contact = formulario de contacto (nombre + email + mensaje).
 * Solo almacenamiento en v1; el correo de welcome viene después.
 */
class UsLead extends Model
{
    public const SOURCE_NEWSLETTER = 'newsletter';
    public const SOURCE_CONTACT    = 'contact';

    public const SOURCES = [
        self::SOURCE_NEWSLETTER,
        self::SOURCE_CONTACT,
    ];

    protected $fillable = ['source', 'name', 'email', 'subject', 'message', 'marketing_consent'];

    protected $casts = [
        'marketing_consent' => 'boolean',
    ];
}
