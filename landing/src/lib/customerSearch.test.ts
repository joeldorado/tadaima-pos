import { describe, expect, it } from "vitest";
import { matchesCustomerSearch } from "./customerSearch";

const andrea = { name: "Andrea Lizárraga Navarro", email: "andrea.l@mail.com", phone: "664 123 4567", external_member_id: "TAD51711150" };

describe("matchesCustomerSearch", () => {
  it("sin acentos y con el nombre completo", () => {
    expect(matchesCustomerSearch(andrea, "andrea lizarraga")).toBe(true);
    expect(matchesCustomerSearch(andrea, "Lizárraga Navarro")).toBe(true);
    expect(matchesCustomerSearch(andrea, "andrea lopez")).toBe(false);
  });

  it("por correo, número de socio o teléfono", () => {
    expect(matchesCustomerSearch(andrea, "andrea.l@")).toBe(true);
    expect(matchesCustomerSearch(andrea, "tad5171")).toBe(true);
    expect(matchesCustomerSearch(andrea, "6641234")).toBe(true);
    expect(matchesCustomerSearch(andrea, "123-4567")).toBe(true);
  });

  it("búsqueda vacía coincide con todos", () => {
    expect(matchesCustomerSearch({ name: "Jesica" }, "  ")).toBe(true);
  });
});
