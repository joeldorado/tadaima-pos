import { describe, it, expect } from "vitest"
import { normalizeWaNumber, buildOrderMessage, buildWhatsAppLink } from "./catalogWhatsApp"

describe("normalizeWaNumber", () => {
  it("antepone 52 a un número local de 10 dígitos", () => {
    expect(normalizeWaNumber("6641112233")).toBe("526641112233")
  })
  it("respeta un número ya internacional (52…)", () => {
    expect(normalizeWaNumber("526641112233")).toBe("526641112233")
  })
  it("respeta 521… (celular con 1)", () => {
    expect(normalizeWaNumber("5216641112233")).toBe("5216641112233")
  })
  it("limpia espacios, signos y paréntesis", () => {
    expect(normalizeWaNumber("+52 (664) 111-2233")).toBe("526641112233")
  })
  it("vacío / null / undefined → cadena vacía", () => {
    expect(normalizeWaNumber("")).toBe("")
    expect(normalizeWaNumber(null)).toBe("")
    expect(normalizeWaNumber(undefined)).toBe("")
  })
})

describe("buildOrderMessage", () => {
  const items = [
    { productId: 1, name: "Funko Goku", price: 250, qty: 2 },
    { productId: 2, name: "Llavero", price: 80, qty: 1 },
  ]

  it("incluye líneas, subtotales y total cuando showPrice", () => {
    const msg = buildOrderMessage("Tadaima Centro", items, { showPrice: true })
    expect(msg).toContain("1. Funko Goku x2")
    expect(msg).toContain("Total:")
    expect(msg).toContain("$580")
  })

  it("omite precios y total cuando showPrice es false", () => {
    const msg = buildOrderMessage("Tadaima Centro", items, { showPrice: false })
    expect(msg).toContain("1. Funko Goku x2")
    expect(msg).not.toContain("Total:")
    expect(msg).not.toContain("$")
  })

  it("agrega nombre y notas cuando se proveen", () => {
    const msg = buildOrderMessage("Tadaima", items, {
      showPrice: true,
      customerName: "Joel",
      notes: "Paso a las 5pm",
    })
    expect(msg).toContain("Nombre: Joel")
    expect(msg).toContain("Notas: Paso a las 5pm")
  })

  it("no agrega '—' a productos sin precio aunque showPrice esté activo", () => {
    const msg = buildOrderMessage("Tadaima", [{ name: "Sorpresa", qty: 1 }], {
      showPrice: true,
    })
    expect(msg).toContain("1. Sorpresa x1")
    expect(msg).not.toContain("Sorpresa x1 —")
  })
})

describe("buildWhatsAppLink", () => {
  it("usa el número normalizado", () => {
    expect(buildWhatsAppLink("6641112233", "hola")).toBe("https://wa.me/526641112233?text=hola")
  })
  it("sin número → wa.me sin destinatario", () => {
    expect(buildWhatsAppLink("", "hola")).toBe("https://wa.me/?text=hola")
  })
})
