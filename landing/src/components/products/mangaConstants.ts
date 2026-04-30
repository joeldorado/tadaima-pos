export const EDITORIALS = [
  'Panini',
  'Ivrea',
  'Tomos y Grapas',
  'Kamite',
  'Ovni Press',
  'Editorial Planeta',
  'Viz Media',
  'Kodansha',
  'Shueisha',
  'Square Enix',
  'Dark Horse',
  'Norma Editorial',
  'ECC Ediciones',
  'Aleta Ediciones',
  'Otro',
] as const

export type Editorial = (typeof EDITORIALS)[number]

export const MANGA_GENRES = [
  'Shōnen',
  'Shōjo',
  'Seinen',
  'Josei',
  'Isekai',
  'Mecha',
  'Slice of Life',
  'Romance',
  'Terror',
  'Comedia',
  'Aventura',
  'Acción',
  'Fantasía',
  'Ciencia Ficción',
  'Deportes',
  'Misterio',
  'Histórico',
  'Otro',
] as const

export type MangaGenre = (typeof MANGA_GENRES)[number]
