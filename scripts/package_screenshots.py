"""Bundle the browser-captured ByAzen screens into a PDF and a ZIP."""
from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_STORED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = ROOT / "screenshots"
WORKSPACES = SCREENSHOTS / "workspaces"
OVERVIEW = SCREENSHOTS / "ByAzen-overview.jpg"
PDF_OUT = SCREENSHOTS / "ByAzen-all-screens.pdf"
ZIP_OUT = SCREENSHOTS / "ByAzen-screenshots.zip"
PAGE_WIDTH = 1080
PAGE_HEIGHT = 735


def pdf_escape(value: str) -> bytes:
    return value.encode("ascii", "replace").replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def make_pdf(images: list[Path]) -> None:
    objects: dict[int, bytes] = {}
    page_ids: list[int] = []
    for index, image_path in enumerate(images):
        image_id = 3 + index * 3
        content_id = image_id + 1
        page_id = image_id + 2
        jpg = image_path.read_bytes()
        objects[image_id] = (
            f"<< /Type /XObject /Subtype /Image /Width 1440 /Height 980 "
            f"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode "
            f"/Interpolate true /Length {len(jpg)} >>\nstream\n".encode("ascii")
            + jpg
            + b"\nendstream"
        )
        content = f"q\n{PAGE_WIDTH} 0 0 {PAGE_HEIGHT} 0 0 cm\n/Screen Do\nQ\n".encode("ascii")
        objects[content_id] = f"<< /Length {len(content)} >>\nstream\n".encode("ascii") + content + b"endstream"
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /XObject << /Screen {image_id} 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode("ascii")
        page_ids.append(page_id)

    info_id = 3 + len(images) * 3
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[1] = f"<< /Type /Catalog /Pages 2 0 R >>".encode("ascii")
    objects[2] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii")
    objects[info_id] = (
        b"<< /Title (ByAzen - screenshots of all 185 app workspaces) "
        b"/Author (ByAzen) /Producer (ByAzen screenshot packager) >>"
    )

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0] * (info_id + 1)
    for object_id in range(1, info_id + 1):
        offsets[object_id] = len(output)
        output.extend(f"{object_id} 0 obj\n".encode("ascii"))
        output.extend(objects[object_id])
        output.extend(b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {info_id + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for object_id in range(1, info_id + 1):
        output.extend(f"{offsets[object_id]:010d} 00000 n \n".encode("ascii"))
    output.extend(
        f"trailer\n<< /Size {info_id + 1} /Root 1 0 R /Info {info_id} 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    PDF_OUT.write_bytes(output)


def make_zip(images: list[Path]) -> None:
    notes = (
        "ByAzen screenshot set\n"
        "=====================\n"
        "overview.jpg: the main desktop library screen.\n"
        "apps/: 185 individual workspace screenshots, numbered to match the supplied list.\n"
        "All captures are UI prototypes with demo data.\n"
    )
    with ZipFile(ZIP_OUT, "w", compression=ZIP_STORED) as archive:
        archive.write(OVERVIEW, "ByAzen-screenshots/overview.jpg")
        for image_path in images[1:]:
            archive.write(image_path, f"ByAzen-screenshots/apps/{image_path.name}")
        archive.writestr("ByAzen-screenshots/README.txt", notes)


def main() -> None:
    if not OVERVIEW.is_file():
        raise SystemExit(f"Missing overview image: {OVERVIEW}")
    workspaces = sorted(WORKSPACES.glob("*.jpg"))
    if len(workspaces) != 185:
        raise SystemExit(f"Expected 185 workspace screenshots, found {len(workspaces)}")
    images = [OVERVIEW, *workspaces]
    make_pdf(images)
    make_zip(images)
    print(f"PDF ({len(images)} pages): {PDF_OUT} · {PDF_OUT.stat().st_size:,} bytes")
    print(f"ZIP (185 JPGs + overview): {ZIP_OUT} · {ZIP_OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
