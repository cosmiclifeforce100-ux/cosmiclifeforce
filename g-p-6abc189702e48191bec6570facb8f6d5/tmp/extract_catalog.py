import json
import re
from pathlib import Path

import pdfplumber


PDF_PATH = Path(r"C:\Users\siddhesh\Downloads\product list (1).pdf")
OUT_PATH = Path("tmp/catalog-rows.json")


def clean(value):
    return re.sub(r"\s+", " ", (value or "").replace("\n", " ")).strip()


rows = []
with pdfplumber.open(PDF_PATH) as pdf:
    for page_number, page in enumerate(pdf.pages, start=1):
        for table in page.extract_tables():
            for row in table:
                if not row or len(row) < 2:
                    continue
                manufacturer = clean(row[0])
                product_name = clean(row[1])
                if not manufacturer or not product_name:
                    continue
                if manufacturer.lower().startswith("manufacturer"):
                    continue
                rows.append(
                    {
                        "sourcePage": page_number,
                        "manufacturer": manufacturer,
                        "name": product_name,
                    }
                )

unique = []
seen = set()
for row in rows:
    key = (row["manufacturer"].casefold(), row["name"].casefold())
    if key in seen:
        continue
    seen.add(key)
    unique.append(row)

OUT_PATH.write_text(json.dumps({"sourceRows": rows, "products": unique}, indent=2), encoding="utf-8")
print(f"sourceRows={len(rows)} uniqueProducts={len(unique)}")

terms = (
    "KNEE",
    "LUMBO",
    "WRIST",
    "ABDOMINAL",
    "ANKL",
    "ARM POUCH",
    "CLAVICLE",
    "ELBOW",
    "RIB BELT",
    "L.S. BELT",
    "KINESIO",
    "NEOPRENE",
    "VISSCO",
    "BRACE",
    "ORTHO",
    "WALKER",
    "STICK",
    "COMMODE",
    "PLASTER",
    "CRUTCH",
)
orthopedic = [row for row in unique if any(term in row["name"].upper() for term in terms)]
print(json.dumps(orthopedic, indent=2))
