<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\SocioSearchQuery;
use PHPUnit\Framework\TestCase;

/**
 * Búsqueda de socios Tadaima por nombre (2026-09-30): "Andrea Lizarraga Navarro"
 * no salía porque la socia está como "Lizárraga" (acento) y el nombre completo
 * cruza nombre + apellidos.
 */
class SocioSearchQueryTest extends TestCase
{
    public function test_words_splits_and_ignores_single_letters(): void
    {
        $this->assertSame(['andrea', 'lizarraga', 'navarro'], SocioSearchQuery::words('  Andrea   Lizarraga Navarro '));
        // Tal cual la escribieron (con acentos y ñ): la primera consulta es exacta.
        $this->assertSame(['lizárraga'], SocioSearchQuery::words('Lizárraga'));
        $this->assertSame(['ana', 'lópez'], SocioSearchQuery::words('Ana M. López'));
        $this->assertSame(['muñoz', 'peña'], SocioSearchQuery::words('MUÑOZ Peña'));
        $this->assertSame(['andrea.l@mail.com'], SocioSearchQuery::words('andrea.l@mail.com,'));
        // Nada que rompa el filtro de PostgREST: sin comas, paréntesis, comillas, * ni %.
        $this->assertSame(['xorid.gt.0', 'abcdef'], SocioSearchQuery::words('x),or(id.gt.0 a"b\'c*d%e:f'));
        $this->assertCount(4, SocioSearchQuery::words('uno dos tres cuatro cinco seis'));
    }

    public function test_like_pattern_tolerates_accents_on_long_words(): void
    {
        $this->assertSame('l_z_rr_g_', SocioSearchQuery::likePattern('lizarraga'));
        $this->assertSame('l_z_rr_g_', SocioSearchQuery::likePattern('lizárraga'));
        $this->assertSame('_ndr__', SocioSearchQuery::likePattern('andrea'));
        // Palabras cortas quedan tal cual (un comodín ahí traería medio padrón).
        $this->assertSame('ana', SocioSearchQuery::likePattern('ana'));
        $this->assertSame('luz', SocioSearchQuery::likePattern('luz'));
        $this->assertSame('ian', SocioSearchQuery::likePattern('ían'));
        // "Muñoz" tecleado con ñ sigue encontrando "Muñoz" (y también "Munoz").
        $this->assertSame('m___z', SocioSearchQuery::likePattern('muñoz'));
    }

    public function test_matches_is_accent_insensitive_and_needs_every_word(): void
    {
        $text = 'Andrea Lizárraga Navarro andrea.l@mail.com';
        $this->assertTrue(SocioSearchQuery::matches($text, ['andrea', 'lizarraga', 'navarro']));
        $this->assertTrue(SocioSearchQuery::matches($text, ['lizarraga']));
        $this->assertFalse(SocioSearchQuery::matches($text, ['andrea', 'lopez']));
        // Un falso positivo del comodín ("l_z_rr_g_") se descarta aquí.
        $this->assertFalse(SocioSearchQuery::matches('Luzorrigo Pérez', ['lizarraga']));
        $this->assertTrue(SocioSearchQuery::matches('Juan Muñoz', ['muñoz']));
        $this->assertTrue(SocioSearchQuery::matches('Juan Munoz', ['muñoz']));
    }
}
