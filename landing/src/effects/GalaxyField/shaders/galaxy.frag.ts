/**
 * GalaxyField — Fragment shader
 * ==================================================================
 * Se ejecuta para cada píxel DENTRO del cuadrado que `gl.POINTS` dibuja
 * por estrella. Su único trabajo es convertir ese cuadrado en un punto
 * de luz redondo y suave.
 *
 * `gl_PointCoord` es una coordenada 0..1 dentro del punto: (0,0) esquina
 * superior izquierda, (1,1) inferior derecha. Midiendo la distancia al
 * centro (0.5, 0.5) obtenemos un disco.
 *
 * El decaimiento usa una potencia alta en vez de un `smoothstep` lineal
 * porque así el núcleo queda muy brillante y el halo se desvanece rápido
 * — el aspecto de una estrella real, no de un círculo plano.
 *
 * Se dibuja con BLENDING ADITIVO (configurado en el componente): donde se
 * acumulan muchas estrellas el color se suma y aparece el resplandor
 * brillante del núcleo galáctico, sin necesidad de un pase de bloom.
 *
 * ------------------------------------------------------------------
 * UNIFORMS:
 *   uOpacity  float  opacidad global [0..1]
 * VARYINGS (vienen del vertex shader):
 *   vColor    vec3   color ya mezclado núcleo->borde
 *   vTwinkle  float  factor de centelleo de esta estrella
 * ==================================================================
 */

export const galaxyFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uOpacity;

  varying vec3  vColor;
  varying float vTwinkle;

  void main() {
    // Distancia al centro del punto: 0 en el centro, ~0.707 en las esquinas.
    float dist = distance(gl_PointCoord, vec2(0.5));

    // Descartamos las esquinas del cuadrado: fuera del radio 0.5 no hay estrella.
    // Ahorra trabajo de blending en píxeles que serían transparentes.
    if (dist > 0.5) discard;

    // Perfil de brillo: 1 en el centro -> 0 en el borde, con caída acelerada.
    float falloff = 1.0 - dist * 2.0;      // rampa lineal 1..0
    float strength = pow(falloff, 2.4);    // el exponente concentra el núcleo

    float alpha = strength * uOpacity * vTwinkle;

    // El color se premultiplica por la intensidad para que el blending
    // aditivo acumule luz (y no un gris plano) donde hay muchas estrellas.
    gl_FragColor = vec4(vColor * strength, alpha);
  }
`
