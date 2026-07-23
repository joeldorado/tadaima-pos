/**
 * GalaxyField — Vertex shader
 * ==================================================================
 * Cada vértice es UNA estrella, dibujada con `gl.POINTS`. Este shader
 * hace tres cosas por estrella:
 *
 *   1. La proyecta en pantalla (matrices que inyecta OGL).
 *   2. Calcula su tamaño en píxeles con `gl_PointSize`, aplicando
 *      perspectiva: las estrellas lejanas se ven más pequeñas.
 *   3. Decide su color mezclando el color del núcleo con el del borde
 *      según su distancia normalizada al centro.
 *
 * TRUCO DE RENDIMIENTO: el color NO se hornea en la geometría. Se guarda
 * solo `aRadius` (0 en el núcleo, 1 en el borde) y la mezcla se hace aquí.
 * Así cambiar los colores desde los controles es instantáneo: actualiza
 * dos uniforms, sin regenerar los miles de vértices.
 *
 * ------------------------------------------------------------------
 * ATRIBUTOS (por estrella, generados en el componente):
 *   position  vec3   posición en el disco de la galaxia
 *   aRadius   float  distancia normalizada al centro [0..1]
 *   aRandom   float  semilla aleatoria [0..1] para variar tamaño y parpadeo
 *
 * UNIFORMS:
 *   uTime         float  segundos (para el centelleo)
 *   uSize         float  tamaño base de la estrella en px
 *   uPixelRatio   float  devicePixelRatio efectivo del renderer
 *   uCoreColor    vec3   color del núcleo
 *   uEdgeColor    vec3   color del borde exterior
 *   uTwinkle      float  amplitud del centelleo [0..1]
 * ==================================================================
 */

export const galaxyVertexShader = /* glsl */ `
  precision highp float;

  // Atributos propios de cada estrella.
  attribute vec3  position;
  attribute float aRadius;
  attribute float aRandom;

  // Matrices que OGL inyecta automáticamente al renderizar con cámara.
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;

  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3  uCoreColor;
  uniform vec3  uEdgeColor;
  uniform float uTwinkle;

  varying vec3  vColor;
  varying float vTwinkle;

  void main() {
    // --- Proyección estándar ---
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    // --- Tamaño con perspectiva ---
    // Dividir entre -z hace que el tamaño decaiga con la distancia, igual
    // que en la proyección en perspectiva. aRandom rompe la uniformidad
    // para que no parezcan todas la misma estrella.
    float sizeVariation = 0.55 + aRandom * 0.9;
    gl_PointSize = uSize * uPixelRatio * sizeVariation * (1.0 / max(-viewPosition.z, 0.001));

    // --- Color: núcleo -> borde ---
    // aRadius llega normalizado (0 centro, 1 borde). Un exponente > 1 retrasa
    // la transición hacia el color exterior, así el color del núcleo domina
    // la zona central — como en una galaxia real, donde el bulbo es pequeño
    // pero muy luminoso frente al disco.
    vColor = mix(uCoreColor, uEdgeColor, pow(aRadius, 1.35));

    // --- Centelleo ---
    // Cada estrella tiene una fase distinta (aRandom * 2π) para que el
    // parpadeo no sea sincronizado.
    float flicker = sin(uTime * 1.6 + aRandom * 6.2831853);
    vTwinkle = 1.0 - uTwinkle * 0.5 + uTwinkle * 0.5 * flicker;
  }
`
