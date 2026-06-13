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
SKIP_SHEET_SUBSTR = ("liste menu", "feuil1")

# Colonnes critères (index) alignées sur import_materiel_prepare.php
CHECK_COLUMNS: dict[str, list[tuple[int, str]]] = {
    "bcd": [
        (2, "flex_ds_devise"),
        (3, "flex_ds_coupe"),
        (4, "flex_ds_hernie"),
        (5, "flex_ds_5ans"),
        (9, "ras"),
        (10, "mineure"),
        (11, "majeure"),
    ],
    "mask": [
        (2, "jupe_trou"),
        (3, "jupe_desolidarisee"),
        (4, "verres_rayures"),
        (9, "ras"),
        (10, "mineure"),
        (11, "majeure"),
    ],
    "wetsuit": [
        (2, "fermeture_dents"),
        (3, "fermeture_curseur"),
        (9, "ras"),
        (10, "mineure"),
        (11, "majeure"),
    ],
    "computer": [
        (2, "batterie_boutons"),
        (3, "couvercle"),
        (4, "ordi_hs"),
        (9, "ras"),
        (10, "mineure"),
        (11, "majeure"),
    ],
}


@dataclass
class Intervention:
    subtype: str
    done_on: str
    responsible_free: str
    summary: str = ""
    check_values: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "subtype": self.subtype,
            "done_on": self.done_on,
            "responsible_free": self.responsible_free,
            "summary": self.summary,
        }
        if self.check_values:
            out["check_values"] = self.check_values
        return out


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
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$", s)
    if m:
        d, mo, y = m.groups()
        if len(y) == 2:
            y = "20" + y
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


def cell_to_check_value(row: list[Any], idx: int, field_key: str) -> str | None:
    if idx >= len(row):
        return None
    v = row[idx]
    if v is None or str(v).strip() == "":
        return None
    if is_marked(row, idx):
        return "ok" if field_key == "ras" else "ok"
    s = str(v).strip().lower()
    if s in {"ko", "nok", "non"}:
        return "ko"
    if s in {"na", "n/a", "-"}:
        return "na"
    return "ok"


def check_profile_for_type(type_slug: str) -> str:
    if type_slug in {"bcd", "mask", "computer", "compass"}:
        return type_slug
    if type_slug.startswith("combi_") or type_slug.startswith("shorty_"):
        return "wetsuit"
    return ""


def extract_check_values(row: list[Any], type_slug: str) -> dict[str, str]:
    profile = check_profile_for_type(type_slug)
    if not profile or profile == "compass":
        return {}
    cols = CHECK_COLUMNS.get(profile, [])
    out: dict[str, str] = {}
    for col_idx, field_key in cols:
        val = cell_to_check_value(row, col_idx, field_key)
        if val is not None:
            out[field_key] = val
    return out


def derive_state_from_row(row: list[Any]) -> str:
    text = " ".join(cell_str(c).upper() for c in row if c is not None)
    if "NEUF" in text or "DEFINITIVE" in text and is_marked(row, 5):
        return "operational"
    if is_marked(row, 11) or ("MAJEURE" in text and is_marked(row, 11)):
        return "in_repair"
    if is_marked(row, 10) or ("MINEURE" in text and is_marked(row, 10)):
        return "in_repair"
    if "DEFINITIVE" in text and any(is_marked(row, i) for i in range(4, 8)):
        return "scrapped"
    return "operational"


def import_free_label(structure_slug: str) -> str:
    return "Import RÉDERIS" if structure_slug == "rederis" else "Import AQUABLUE"


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


def should_skip_sheet(name: str) -> bool:
    upper = name.strip().upper()
    if upper in SKIP_SHEETS:
        return True
    low = name.strip().lower()
    return any(s in low for s in SKIP_SHEET_SUBSTR)


def is_valid_public_id(public_id: str) -> bool:
    return bool(public_id) and bool(re.match(r"^[A-Z0-9-]+$", public_id))


def sheet_fallback_id(sheet_name: str) -> str:
    cleaned = re.sub(r"^(GILET|GILETS|MASQUE|MASQUES|VETEMENT|SHORTY|ORDI)\s+", "", sheet_name.strip(), flags=re.I)
    cleaned = cleaned.strip()
    if cleaned:
        pid = norm_id(cleaned.split()[-1] if " " in cleaned else cleaned)
        if is_valid_public_id(pid):
            return pid
    pid = norm_id(sheet_name)
    return pid if is_valid_public_id(pid) else ""


def equipment_merge_key(item: EquipmentItem) -> str:
    return f"{item.structure_slug}:{item.type_slug}:{item.public_id}"


def parse_fiche_epi_rows(
    rows: list[list[Any]], sheet_name: str, structure_slug: str, type_slug: str, source: str
) -> EquipmentItem | None:
    title = cell_str(rows[2][0] if len(rows) > 2 and rows[2] else "")
    title_u = title.upper()
    if "FICHE DE GESTION" not in title_u and "FICHE" not in title_u:
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
        if c0.lower() in {"modèle", "modele"}:
            model = c1
            if "série" in c2.lower() or "serie" in c2.lower():
                serial = cell_str(row[3] if len(row) > 3 else "")
            elif c2.upper() in {"AQUALUNG", "SCUBAPRO", "MARES", "BEUCHAT", "CRESSI"}:
                brand = c2
        if c1.upper() == "AQUALUNG" and not brand:
            brand = "AQUALUNG"
        if c0.upper() in {"AQUABLUE PLONGEE", "REDERIS"} or c1.upper() in {"AQUABLUE PLONGEE", "REDERIS"}:
            ident = cell_str(row[2] if c0.upper() in {"AQUABLUE PLONGEE", "REDERIS"} else row[2])
            if ident and ident.lower() not in {"identification", ""}:
                public_id = norm_id(ident)
        if c0.lower().startswith("date achat"):
            purchase_year = year_from_date(row[1] if len(row) > 1 else None) or purchase_year
        if c0.lower() == "identification" and c1:
            public_id = norm_id(c1) or public_id
            if c2:
                brand = brand or c2

    if not public_id:
        public_id = sheet_fallback_id(sheet_name)

    if not is_valid_public_id(public_id):
        return None

    interventions: list[Intervention] = []
    state = "operational"
    header_idx = find_label_row(rows, "Nom du technicien")
    if header_idx is not None:
        tech_col, date_col = find_intervention_columns(rows[header_idx])
        for row in rows[header_idx + 1 : header_idx + 25]:
            tech = cell_str(row[tech_col] if len(row) > tech_col else "")
            if not tech or tech.lower().startswith("nom "):
                continue
            done = parse_date(row[date_col] if len(row) > date_col else None)
            if not done:
                continue
            check_values = extract_check_values(row, type_slug)
            summary_parts = []
            if check_values:
                summary_parts.append("Contrôle périodique importé")
            if "NEUF" in " ".join(cell_str(c) for c in row).upper():
                summary_parts.append("NEUF")
            summary = " — ".join(summary_parts) or "Révision importée"
            row_text = " ".join(cell_str(c) for c in row).upper()
            is_repair = bool(re.search(r"REPARATION|RÉPARATION", row_text)) or check_values.get("majeure") == "ok"
            if check_values.get("mineure") == "ok" and not is_repair:
                is_repair = True
            interventions.append(
                Intervention(
                    subtype="repair" if is_repair else "revision",
                    done_on=done,
                    responsible_free=tech,
                    summary=summary,
                    check_values=check_values if not is_repair else {},
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
        if should_skip_sheet(name):
            continue
        ws = wb[name]
        item = parse_fiche_epi_rows(rows_from_openpyxl(ws), name, structure_slug, type_slug, str(wb_path.name))
        if item:
            items.append(item)
    wb.close()
    return items


def parse_liste_epi_rows(rows: list[list[Any]], structure_slug: str, type_slug: str, source: str) -> list[EquipmentItem]:
    items: list[EquipmentItem] = []
    header_idx: int | None = None
    for i, row in enumerate(rows):
        c0 = cell_str(row[0] if row else "").lower()
        if c0 == "identification":
            header_idx = i
            break
    if header_idx is None:
        return items

    for row in rows[header_idx + 1 :]:
        ident = norm_id(row[0] if len(row) > 0 else "")
        if not ident:
            continue
        brand = cell_str(row[1] if len(row) > 1 else "")
        model = cell_str(row[2] if len(row) > 2 else "")
        done = parse_date(row[3] if len(row) > 3 else None)
        interventions: list[Intervention] = []
        if done:
            interventions.append(
                Intervention(
                    subtype="revision",
                    done_on=done,
                    responsible_free=import_free_label(structure_slug),
                    summary="Mise en service importée",
                    check_values={"controle_visuel": "ok", "fonctionnement": "ok"},
                )
            )
        items.append(
            EquipmentItem(
                public_id=ident,
                structure_slug=structure_slug,
                type_slug=type_slug,
                brand=brand,
                model=model,
                purchase_year=year_from_date(done),
                interventions=interventions,
                source=source,
            )
        )
    return items


def parse_liste_epi_workbook(wb_path: Path, structure_slug: str, type_slug: str) -> list[EquipmentItem]:
    wb = openpyxl.load_workbook(wb_path, read_only=True, data_only=True)
    items: list[EquipmentItem] = []
    for name in wb.sheetnames:
        items.extend(parse_liste_epi_rows(rows_from_openpyxl(wb[name]), structure_slug, type_slug, wb_path.name))
    wb.close()
    return items


def parse_detendeur_rows(
    rows: list[list[Any]],
    sheet_name: str,
    structure_slug: str,
    type_slug: str,
    source: str,
    *,
    form_kind: str = "form",
) -> EquipmentItem | None:
    public_id = ""
    brand = "AQUALUNG"
    model = ""
    serial_parts: list[str] = []
    purchase_year = None
    observations: list[str] = []
    repairs: list[str] = []
    subtype = "revision" if form_kind == "form" else "repair"

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

    summary = " | ".join([s for s in observations + repairs if s]) or (
        "Maintenance détendeur importée" if form_kind == "form" else "Réparation détendeur importée"
    )
    if form_kind == "repair" or re.search(r"repar|répar", summary, re.I):
        subtype = "repair"
    elif form_kind == "form":
        subtype = "revision"

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
                responsible_free=import_free_label(structure_slug),
                summary=summary[:2000],
            )
        ],
        source=source,
    )


def parse_detendeur_xls(path: Path, structure_slug: str, type_slug: str) -> list[EquipmentItem]:
    wb = xlrd.open_workbook(str(path))
    items: list[EquipmentItem] = []
    for name in wb.sheet_names():
        if should_skip_sheet(name):
            continue
        sh = wb.sheet_by_name(name)
        item = parse_detendeur_rows(
            rows_from_xlrd(sh), name, structure_slug, type_slug, f"{path.name}:{name}", form_kind="form"
        )
        if item:
            items.append(item)
    return items


def parse_detendeur_xlsx(path: Path, structure_slug: str, type_slug: str, *, form_kind: str = "repair") -> list[EquipmentItem]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    items: list[EquipmentItem] = []
    for name in wb.sheetnames:
        if should_skip_sheet(name):
            continue
        item = parse_detendeur_rows(
            rows_from_openpyxl(wb[name]), name, structure_slug, type_slug, path.name, form_kind=form_kind
        )
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
        parser = cfg.get("parser")

        if parser == "fiche_epi":
            file_name = cfg["file"]
            matches = list(folder.glob(file_name))
            for fp in matches:
                if fp.suffix.lower() == ".pdf":
                    continue
                for item in parse_fiche_epi_workbook(fp, structure_slug, type_slug):
                    add_item(item)
        elif parser == "liste_epi":
            file_name = cfg["file"]
            for fp in folder.glob(file_name):
                for item in parse_liste_epi_workbook(fp, structure_slug, type_slug):
                    add_item(item)
        elif cfg.get("sources"):
            for src in cfg["sources"]:
                rel = src["path"]
                src_parser = src["parser"]
                for fp in folder.glob(rel):
                    if src_parser == "detendeur_form" and fp.suffix.lower() == ".xls":
                        items = parse_detendeur_xls(fp, structure_slug, type_slug)
                    elif src_parser == "detendeur_form":
                        items = parse_detendeur_xlsx(fp, structure_slug, type_slug, form_kind="form")
                    elif src_parser == "detendeur_repair":
                        items = parse_detendeur_xlsx(fp, structure_slug, type_slug, form_kind="repair")
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
            for it in sorted(items.values(), key=lambda x: (x.structure_slug, x.type_slug, x.public_id))
        ]
    }


def normalize_tech_name(name: str) -> str:
    """Approximation aliases PHP pour rapport dry-run."""
    aliases = {
        "courtaudiere": "Julien C.",
        "coutaudiere": "Julien C.",
        "courdaudiere": "Julien C.",
        "courtaidiere": "Julien C.",
        "cputaudiere": "Julien C.",
        "mesnier": "Marie M.",
        "petit": "Eric D.",
        "delmas": "Eric D.",
        "lacote": "Julie L.",
        "chaumeton": "Jérôme C.",
    }
    key = name.strip().lower()
    return aliases.get(key, name.strip())


def print_report(items: dict[str, EquipmentItem]) -> None:
    by_type: dict[str, int] = {}
    by_structure: dict[str, int] = {}
    int_count = 0
    checks_count = 0
    unknown_techs: set[str] = set()
    known = {
        "julien c.", "marie m.", "eric d.", "julie l.", "nicolas c.", "jérôme c.", "jerome c.",
        "import aquablue", "import réderis", "import rederis",
    }

    for it in items.values():
        by_type[it.type_slug] = by_type.get(it.type_slug, 0) + 1
        by_structure[it.structure_slug] = by_structure.get(it.structure_slug, 0) + 1
        for inv in it.interventions:
            int_count += 1
            if inv.check_values:
                checks_count += 1
            tech = normalize_tech_name(inv.responsible_free).lower()
            if tech and tech not in known and not tech.startswith("import "):
                unknown_techs.add(inv.responsible_free.strip())

    print(f"Équipements : {len(items)}")
    for slug, cnt in sorted(by_structure.items()):
        print(f"  [{slug}] {cnt}")
    for slug, cnt in sorted(by_type.items()):
        print(f"  - {slug}: {cnt}")
    print(f"Interventions : {int_count} ({checks_count} avec critères)")

    if unknown_techs:
        print(f"\nTechniciens non aliasés ({len(unknown_techs)}) :")
        for t in sorted(unknown_techs)[:20]:
            print(f"  - {t}")
        if len(unknown_techs) > 20:
            print(f"  … et {len(unknown_techs) - 20} autres")

    print("\nÉchantillon (10 premiers IDs) :")
    for key in sorted(items.keys())[:10]:
        it = items[key]
        print(f"  {it.public_id} ({it.structure_slug}/{it.type_slug}) — {len(it.interventions)} int.")


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
        out = Path(args.export)
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nPayload exporté : {out}")

    if args.apply:
        print("\nApplication en base…")
        return run_apply(payload)

    if not args.export:
        print("\nMode dry-run — aucune écriture. Utilisez --apply ou --export.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
