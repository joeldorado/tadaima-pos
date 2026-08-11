#!/usr/bin/env python3
"""Scraper del sitio Wix original tadaimaus.com → seed para TadaimaUS.

Extrae los productos reales (nombre, precio USD, categoría, imagen full-res)
y produce:
  - backend/database/seed-data/tadaimaus-catalog.json  (fuente del comando
    `php artisan tadaima:import-us-catalog`, upsert idempotente por slug)
  - backend/public/us-img/products/<slug>.<ext>        (imágenes descargadas,
    servidas por ambos server blocks de nginx — cero dependencia de Wix)
  - tadaimaus/public/img/naruto.png                    (Naruto del footer)

Solo stdlib (sin requests/bs4): la máquina de deploy no tiene pip garantizado.
Uso:  python3 scripts/scrape_tadaimaus.py [--skip-images]
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

BASE = "https://www.tadaimaus.com"
REPO = Path(__file__).resolve().parent.parent
SEED_JSON = REPO / "backend" / "database" / "seed-data" / "tadaimaus-catalog.json"
IMG_DIR = REPO / "backend" / "public" / "us-img" / "products"
NARUTO_OUT = REPO / "tadaimaus" / "public" / "img" / "naruto.png"
# Imagen del footer "We hear you!" del sitio original (media id fijo de Wix).
NARUTO_MEDIA = "https://static.wixstatic.com/media/2fb4c7_b065e824c2cc4af3bd0650ab0a50b5e5~mv2.png"

CATEGORY_PAGES = {"figures": "/figures", "manga": "/manga", "tcg": "/tcg"}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) TadaimaUS-migrator/1.0"
DELAY_S = 0.5

SLUG_RE = re.compile(r'data-slug="([a-z0-9-]+)"')
# Bloque de un producto en el grid de Wix: del data-slug al cierre del <li>.
ITEM_RE = re.compile(r'data-slug="(?P<slug>[a-z0-9-]+)".*?</li>', re.DOTALL)
NAME_RE = re.compile(r'data-hook="product-item-name[^"]*"[^>]*>(?P<name>[^<]+)<')
PRICE_RE = re.compile(r'data-wix-price="USD\s*(?P<price>[\d,]+\.?\d*)"')
MEDIA_RE = re.compile(r'src="(https://static\.wixstatic\.com/media/[^"/]+~mv2\.(?:jpe?g|png|webp))')


def fetch(url: str, binary: bool = False) -> bytes | str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = resp.read()
                return data if binary else data.decode("utf-8", errors="ignore")
        except Exception as exc:  # noqa: BLE001 — reintento simple
            if attempt == 2:
                raise
            print(f"  retry {attempt + 1} {url}: {exc}", file=sys.stderr)
            time.sleep(2)
    raise RuntimeError("unreachable")


def full_res(media_url: str) -> str:
    """La URL cruda del media (sin el transform /v1/fill/...) es la full-res."""
    return media_url.split("/v1/")[0]


def parse_grid(page_html: str) -> dict[str, dict]:
    """{slug: {name, price_usd, image}} de una página de listado Wix."""
    items: dict[str, dict] = {}
    for match in ITEM_RE.finditer(page_html):
        block = match.group(0)
        slug = match.group("slug")
        name = NAME_RE.search(block)
        price = PRICE_RE.search(block)
        media = MEDIA_RE.search(block)
        if not name or not price:
            continue
        items[slug] = {
            # unescape: Wix entrega "&amp;" y compañía en los nombres.
            "name": html.unescape(name.group("name")).strip(),
            "price_usd": float(price.group("price").replace(",", "")),
            "image_src": full_res(media.group(1)) if media else None,
        }
    return items


MAX_DIM = 1000  # las cards renderizan ~480px; 1000px cubre retina 2x
JPEG_QUALITY = 82


def optimize_images() -> None:
    """Reencoda a tamaño web (idempotente: si ya está ≤MAX_DIM no toca).

    Requiere Pillow; si no está instalado se omite con aviso — las full-res
    de Wix pesan 1-3 MB c/u y NO deben quedarse así en el repo.
    """
    try:
        from PIL import Image
    except ImportError:
        print("  ⚠ Pillow no disponible — imágenes quedaron full-res (pesadas)")
        return

    for path in sorted(IMG_DIR.glob("*.*")):
        with Image.open(path) as img:
            if max(img.size) <= MAX_DIM:
                continue
            img.thumbnail((MAX_DIM, MAX_DIM))
            before = path.stat().st_size
            if path.suffix.lower() in (".jpg", ".jpeg"):
                img.convert("RGB").save(path, quality=JPEG_QUALITY, optimize=True)
            else:
                img.save(path, optimize=True)
            print(f"  ⚙ {path.name}: {before // 1024} → {path.stat().st_size // 1024} KB")

    if NARUTO_OUT.exists():
        with Image.open(NARUTO_OUT) as img:
            if max(img.size) > 700:
                img.thumbnail((700, 700))
                img.save(NARUTO_OUT, optimize=True)
                print(f"  ⚙ naruto.png → {NARUTO_OUT.stat().st_size // 1024} KB")


def main() -> None:
    skip_images = "--skip-images" in sys.argv

    print(f"[1/4] Home {BASE}/ …")
    products = parse_grid(fetch(BASE + "/"))
    print(f"  {len(products)} productos en la home")

    print("[2/4] Categorías …")
    category_of: dict[str, str] = {}
    for category, path in CATEGORY_PAGES.items():
        time.sleep(DELAY_S)
        page_items = parse_grid(fetch(BASE + path))
        print(f"  {path}: {len(page_items)} productos")
        for slug, data in page_items.items():
            category_of[slug] = category
            products.setdefault(slug, data)  # producto solo visible en su categoría

    print("[3/4] Imágenes …")
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    catalog = []
    for slug in sorted(products):
        data = products[slug]
        image_rel = None
        if data["image_src"]:
            ext = data["image_src"].rsplit(".", 1)[-1]
            ext = "jpg" if ext in ("jpeg", "webp") else ext
            image_rel = f"us-img/products/{slug}.{ext}"
            target = REPO / "backend" / "public" / image_rel
            if not skip_images and not target.exists():
                time.sleep(DELAY_S)
                target.write_bytes(fetch(data["image_src"], binary=True))
                print(f"  ↓ {image_rel} ({target.stat().st_size // 1024} KB)")
        catalog.append(
            {
                "slug": slug,
                "name": data["name"],
                "price_usd": data["price_usd"],
                "category": category_of.get(slug, "other"),
                "image": image_rel,
                "source": f"{BASE}/product-page/{slug}",
            }
        )

    print("[4/4] Naruto del footer …")
    if not skip_images and not NARUTO_OUT.exists():
        NARUTO_OUT.write_bytes(fetch(NARUTO_MEDIA, binary=True))
        print(f"  ↓ {NARUTO_OUT.relative_to(REPO)} ({NARUTO_OUT.stat().st_size // 1024} KB)")

    if not skip_images:
        optimize_images()

    SEED_JSON.parent.mkdir(parents=True, exist_ok=True)
    SEED_JSON.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    by_cat: dict[str, int] = {}
    for item in catalog:
        by_cat[item["category"]] = by_cat.get(item["category"], 0) + 1
    print(f"\nOK — {len(catalog)} productos → {SEED_JSON.relative_to(REPO)}  {by_cat}")


if __name__ == "__main__":
    main()
