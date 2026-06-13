#!/usr/bin/env python3
"""
Import EPI depuis MyDiveClub/_sourcesMatos/ vers Portail Club (matériel).

Dépendances : pip install openpyxl xlrd pyyaml

Usage :
  python site/tools/import_materiel_sources.py              # dry-run (défaut)
  python site/tools/import_materiel_sources.py --export payload.json
  python site/tools/import_materiel_sources.py --apply      # via PHP sur NAS/local
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import openpyxl
    import xlrd
    import yaml
except ImportError as exc:
    print("Dépendances manquantes : pip install openpyxl xlrd pyyaml", file=sys.stderr)
    raise SystemExit(1) from exc

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "_sourcesMatos"
MAPPING_FILE = SOURCES / "import_mapping.yaml"
APPLY_PHP = Path(__file__).resolve().parent / "import_materiel_apply.php"

SKIP_SHEETS = {"FR", "FORMULAIRE MAINTENANCE DETENDEUR"}


@dataclass
class Intervention:
    subtype: str
    done_on: str
    responsible_free: str
    summary: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "subtype": self.subtype,
            "done_on": self.done_on,
            "responsible_free": self.responsible_free,
            "summary": self.summary,
        }


@dataclass
class EquipmentItem:
    public_id: str
    structure_slug: str
    type_slug: str
    brand: str = ""
    model: str = ""
    serial: str = ""
    purchase_year: int | None = None
    state: str = "operational"
    notes: str = ""
    interventions: list[Intervention] = field(default_factory=list)
    source: str = ""

    def merge(self, other: "EquipmentItem") -> None:
        if other.brand and not self.brand:
            self.brand = other.brand
        if other.model and not self.model:
            self.model = other.model
        if other.serial and not self.serial:
            self.serial = other.serial
        if other.purchase_year and not self.purchase_year:
            self.purchase_year = other.purchase_year
        if other.notes and not self.notes:
            self.notes = other.notes
        self.interventions.extend(other.interventions)
        self.interventions.sort(key=lambda x: x.done_on)


def norm_id(raw: Any) -> str:
    s = str(raw or "").strip().upper()
    s = re.sub(r"\s+", "", s)
    return s


def cell_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip()


def parse_date(v: Any) -> str | None:
    if v is None or v == "":
        return None
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, float):
        try:
            date_tuple = xlrd.xldate_as_tuple(v, 0)
            return dt.date(date_tuple[0], date_tuple[1], date_tuple[2]).isoformat()
        except Exception:
            return None
    s = str(v).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    m = re.match(r"^\.\./(\d{4})$", s)
    if m:
        return f"{m.group(1)}-01-01"
    return None


def year_from_date(v: Any) -> int | None:
    d = parse_date(v)
    return int(d[:4]) if d else None


def is_marked(row: list[Any], idx: int) -> bool:
    if idx >= len(row):
        return False
    v = row[idx]
    if v is None:
        return False
    s = str(v).strip().upper()
    return s in {"X", "O", "OUI", "OK", "1", "TRUE"} or s == "NEUF"


def derive_state_from_row(row: list[Any]) -> str:
    text = " ".join(cell_str(c).upper() for c in row if c is not None)
    if "NEUF" in text or "DEFINITIVE" in text and is_marked(row, 5):
        return "operational"
    if "DEFINITIVE" in text and any(is_marked(row, i) for i in range(4, 8)):
        return "scrapped"
    if "MAJEURE" in text and any(is_marked(row, i) for i in range(3, 7)):
        return "in_repair"
    return "operational"


def rows_from_openpyxl(ws) -> list[list[Any]]:
    return [list(r) for r in ws.iter_rows(values_only=True)]


def rows_from_xlrd(sh) -> list[list[Any]]:
    out: list[list[Any]] = []
    for r in range(sh.nrows):
        out.append([sh.cell_value(r, c) for c in range(sh.ncols)])
    return out


def find_label_row(rows: list[list[Any]], label: str, col: int = 0) -> int | None:
    label_l = label.lower()
    for i, row in enumerate(rows):
        if col < len(row) and label_l in cell_str(row[col]).lower():
            return i
    return None


def find_intervention_columns(header_row: list[Any]) -> tuple[int, int]:
    """Col. technicien (A) et date de révision (souvent F, pas B — cellules fusionnées)."""
    tech_col = 0
    date_col: int | None = None
    for i, cell in enumerate(header_row):
        label = cell_str(cell).lower()
        if "date" in label and ("révision" in label or "revision" in label):
            date_col = i
            break
    if date_col is None:
        for i, cell in enumerate(header_row):
            if cell_str(cell).lower().startswith("date"):
                date_col = i
                break
    return tech_col, date_col if date_col is not None else 5


def equipment_merge_key(item: EquipmentItem) -> str:
    return f"{item.type_slug}:{item.public_id}"


def parse_fiche_epi_rows(rows: list[list[Any]], sheet_name: str, structure_slug: str, type_slug: str, source: str) -> EquipmentItem | None:
    title = cell_str(rows[2][0] if len(rows) > 2 and rows[2] else "")
    if "FICHE DE GESTION" not in title.upper() and "FICHE" not in title.upper():
        return None

    public_id = ""
    brand = ""
    model = ""
    serial = ""
    purchase_year = None

    for row in rows:
        c0 = cell_str(row[0] if len(row) > 0 else "")
        c1 = cell_str(row[1] if len(row) > 1 else "")
        c2 = cell_str(row[2] if len(row) > 2 else "")
        if c0.lower() == "modèle" or c0.lower() == "modele":
            model = c1
            if "série" in c2.lower() or "serie" in c2.lower():
                serial = cell_str(row[3] if len(row) > 3 else "")
            elif c2.upper() in {"AQUALUNG", "SCUBAPRO", "MARES", "BEUCHAT", "CRESSI"}:
                brand = c2
        if c1.upper() == "AQUALUNG" and not brand:
            brand = "AQUALUNG"
        if c0.upper() == "AQUABLUE PLONGEE" or c1.upper() == "AQUABLUE PLONGEE":
            ident = cell_str(row[2] if c0.upper().startswith("AQUABLUE") else row[2])
            if ident and ident.lower() != "identification":
                public_id = norm_id(ident)
        if c0.lower().startswith("date achat"):
            purchase_year = year_from_date(row[1] if len(row) > 1 else None) or purchase_year

    if not public_id:
        fallback = re.sub(r"^(GILET|MASQUE|MASQUES)\s+", "", sheet_name.strip(), flags=re.I)
        public_id = norm_id(fallback.split()[-1] if fallback.split() else sheet_name)

    if not public_id:
        return None

    interventions: list[Intervention] = []
    state = "operational"
    header_idx = find_label_row(rows, "Nom du technicien")
    if header_idx is not None:
        tech_col, date_col = find_intervention_columns(rows[header_idx])
        for row in rows[header_idx + 1 : header_idx + 20]:
            tech = cell_str(row[tech_col] if len(row) > tech_col else "")
            if not tech or tech.lower().startswith("nom "):
                continue
            done = parse_date(row[date_col] if len(row) > date_col else None)
            if not done:
                continue
            summary_parts = []
            if any(is_marked(row, i) for i in range(2, 6)):
                summary_parts.append("Contrôle périodique importé")
            if "NEUF" in " ".join(cell_str(c) for c in row).upper():
                summary_parts.append("NEUF")
            interventions.append(
                Intervention(
                    subtype="repair",
                    done_on=done,
                    responsible_free=tech,
                    summary=" — ".join(summary_parts) or "Révision importée",
                )
            )
            state = derive_state_from_row(row)

    return EquipmentItem(
        public_id=public_id,
        structure_slug=structure_slug,
        type_slug=type_slug,
        brand=brand,
        model=model,
        serial=serial,
        purchase_year=purchase_year,
        state=state,
        interventions=interventions,
        source=source,
    )


def parse_fiche_epi_workbook(wb_path: Path, structure_slug: str, type_slug: str) -> list[EquipmentItem]:
    wb = openpyxl.load_workbook(wb_path, read_only=True, data_only=True)
    items: list[EquipmentItem] = []
    for name in wb.sheetnames:
        if name.strip().upper() in SKIP_SHEETS:
            continue
        ws = wb[name]
        item = parse_fiche_epi_rows(rows_from_openpyxl(ws), name, structure_slug, type_slug, str(wb_path.name))
        if item:
            items.append(item)
    wb.close()
    return items


def parse_detendeur_rows(rows: list[list[Any]], sheet_name: str, structure_slug: str, type_slug: str, source: str) -> EquipmentItem | None:
    public_id = ""
    brand = "AQUALUNG"
    model = ""
    serial_parts: list[str] = []
    purchase_year = None
    observations: list[str] = []
    repairs: list[str] = []
    subtype = "repair"

    for row in rows:
        c0 = cell_str(row[0] if len(row) > 0 else "")
        c1 = cell_str(row[1] if len(row) > 1 else "")
        c2 = cell_str(row[2] if len(row) > 2 else "")
        if "numéro dossier" in c0.lower() or "numero dossier" in c0.lower():
            public_id = norm_id(c1) or norm_id(c2)
        if c0.lower() == "date" and not c0.lower().startswith("date achat"):
            purchase_year = year_from_date(c1) or purchase_year
            if c2.lower() == "produit" and len(row) > 3:
                model = cell_str(row[3])
        if c0.lower().startswith("modèle 1") or c0.lower().startswith("modele 1"):
            if c1:
                model = model or c1
        if "numéro de série" in c0.lower() or "numero de serie" in c0.lower():
            for c in row[1:5]:
                s = cell_str(c)
                if s and s not in serial_parts:
                    serial_parts.append(s)
        if "observations" in c0.lower():
            observations.append(c1)
        if c0.upper() == "REPARATION" or c1.upper() == "REPARATION":
            repairs.append(c1 or c2)
        if "travail effectué" in c0.lower() or "travail effectue" in c0.lower():
            repairs.extend(cell_str(c) for c in row[1:6] if cell_str(c))

    if not public_id:
        public_id = norm_id(sheet_name)

    if not public_id or public_id in SKIP_SHEETS:
        return None

    done_on = f"{purchase_year or 2020}-01-01"
    for row in rows:
        if cell_str(row[0]).lower() == "date":
            done_on = parse_date(row[1]) or done_on
            break

    summary = " | ".join([s for s in observations + repairs if s]) or "Maintenance détendeur importée"
    if not re.search(r"repar", summary, re.I):
        subtype = "repair"

    return EquipmentItem(
        public_id=public_id,
        structure_slug=structure_slug,
        type_slug=type_slug,
        brand=brand,
        model=model,
        serial=" / ".join(serial_parts),
        purchase_year=purchase_year,
        state="in_repair" if re.search(r"repar|fuite|ko", summary, re.I) else "operational",
        interventions=[
            Intervention(
                subtype=subtype,
                done_on=done_on,
                responsible_free="Import AQUABLUE",
                summary=summary[:2000],
            )
        ],
        source=source,
    )


def parse_detendeur_xls(path: Path, structure_slug: str, type_slug: str) -> list[EquipmentItem]:
    wb = xlrd.open_workbook(str(path))
    items: list[EquipmentItem] = []
    for name in wb.sheet_names():
        if name.strip().upper() in SKIP_SHEETS:
            continue
        sh = wb.sheet_by_name(name)
        item = parse_detendeur_rows(rows_from_xlrd(sh), name, structure_slug, type_slug, f"{path.name}:{name}")
        if item:
            items.append(item)
    return items


def parse_detendeur_xlsx(path: Path, structure_slug: str, type_slug: str) -> list[EquipmentItem]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    items: list[EquipmentItem] = []
    for name in wb.sheetnames:
        item = parse_detendeur_rows(rows_from_openpyxl(wb[name]), name, structure_slug, type_slug, path.name)
        if item:
            items.append(item)
    wb.close()
    return items


def load_mapping() -> dict[str, Any]:
    if not MAPPING_FILE.is_file():
        raise FileNotFoundError(f"Mapping introuvable : {MAPPING_FILE}")
    return yaml.safe_load(MAPPING_FILE.read_text(encoding="utf-8"))


def collect_items() -> dict[str, EquipmentItem]:
    mapping = load_mapping()
    merged: dict[str, EquipmentItem] = {}

    def add_item(item: EquipmentItem) -> None:
        key = equipment_merge_key(item)
        if key in merged:
            merged[key].merge(item)
        else:
            merged[key] = item

    for folder_name, cfg in mapping.items():
        folder = SOURCES / folder_name
        if not folder.is_dir():
            print(f"AVERTissement : dossier absent {folder}")
            continue
        structure_slug = cfg["structure_slug"]
        type_slug = cfg["type_slug"]

        if cfg.get("parser") == "fiche_epi":
            file_name = cfg["file"]
            matches = list(folder.glob(file_name)) if "*" not in file_name else list(folder.glob(file_name))
            for fp in matches:
                for item in parse_fiche_epi_workbook(fp, structure_slug, type_slug):
                    add_item(item)
        elif cfg.get("sources"):
            for src in cfg["sources"]:
                rel = src["path"]
                parser = src["parser"]
                for fp in folder.glob(rel):
                    if parser == "detendeur_form" and fp.suffix.lower() == ".xls":
                        items = parse_detendeur_xls(fp, structure_slug, type_slug)
                    elif parser in {"detendeur_form", "detendeur_repair"}:
                        items = parse_detendeur_xlsx(fp, structure_slug, type_slug)
                    else:
                        continue
                    for item in items:
                        add_item(item)

    return merged


def payload_from_items(items: dict[str, EquipmentItem]) -> dict[str, Any]:
    return {
        "items": [
            {
                "public_id": it.public_id,
                "structure_slug": it.structure_slug,
                "type_slug": it.type_slug,
                "brand": it.brand,
                "model": it.model,
                "serial": it.serial,
                "purchase_year": it.purchase_year,
                "state": it.state,
                "notes": it.notes,
                "interventions": [i.as_dict() for i in it.interventions],
                "source": it.source,
            }
            for it in sorted(items.values(), key=lambda x: x.public_id)
        ]
    }


def print_report(items: dict[str, EquipmentItem]) -> None:
    by_type: dict[str, int] = {}
    int_count = 0
    for it in items.values():
        by_type[it.type_slug] = by_type.get(it.type_slug, 0) + 1
        int_count += len(it.interventions)
    print(f"Équipements : {len(items)}")
    for slug, cnt in sorted(by_type.items()):
        print(f"  - {slug}: {cnt}")
    print(f"Interventions : {int_count}")
    print("\nÉchantillon (10 premiers IDs) :")
    for key in sorted(items.keys())[:10]:
        it = items[key]
        print(f"  {it.public_id} ({it.type_slug}) — {len(it.interventions)} int.")

    by_public_id: dict[str, list[str]] = {}
    for it in items.values():
        by_public_id.setdefault(it.public_id, []).append(it.type_slug)
    collisions = {pid: types for pid, types in by_public_id.items() if len(types) > 1}
    if collisions:
        print(f"\nInfo : {len(collisions)} ID(s) partagés entre types (autorisé : unicité par type).")


def run_apply(payload: dict[str, Any]) -> int:
    if not APPLY_PHP.is_file():
        print(f"Script PHP introuvable : {APPLY_PHP}", file=sys.stderr)
        return 1
    proc = subprocess.run(
        ["php", str(APPLY_PHP)],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        encoding="utf-8",
        capture_output=True,
        cwd=str(APPLY_PHP.parent),
    )
    if proc.stdout:
        print(proc.stdout)
    if proc.stderr:
        print(proc.stderr, file=sys.stderr)
    return proc.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Import EPI _sourcesMatos → Portail Club")
    parser.add_argument("--apply", action="store_true", help="Appliquer via import_materiel_apply.php")
    parser.add_argument("--export", metavar="FILE", help="Exporter le payload JSON")
    args = parser.parse_args()

    if not SOURCES.is_dir():
        print(f"Dossier sources introuvable : {SOURCES}", file=sys.stderr)
        return 1

    items = collect_items()
    if not items:
        print("Aucun équipement parsé.", file=sys.stderr)
        return 1

    print_report(items)
    payload = payload_from_items(items)

    if args.export:
        Path(args.export).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nPayload exporté : {args.export}")

    if args.apply:
        print("\nApplication en base…")
        return run_apply(payload)

    if not args.export:
        print("\nMode dry-run — aucune écriture. Utilisez --apply ou --export.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
