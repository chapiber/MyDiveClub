#!/usr/bin/env python3
"""Tests unitaires parser détendeurs (layout col B/D)."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from import_materiel_sources import (  # noqa: E402
    collect_items,
    parse_detendeur_xls,
    parse_detendeur_xlsx,
)

SOURCES = ROOT / "_sourcesMatos"
A15 = SOURCES / "EPI - 2026/DETENDEURS AQB/DET Réparation/A15.xlsx"
XLS_REV = SOURCES / "EPI - 2026/DETENDEURS AQB/DET Révision/Detendeur AQUABLUE 2026.xls"


class TestDetendeurParser(unittest.TestCase):
    @unittest.skipUnless(A15.is_file(), "A15.xlsx absent")
    def test_a15_specs_and_detail(self) -> None:
        items = parse_detendeur_xlsx(A15, "aquablue", "regulator", form_kind="repair")
        self.assertTrue(items, "A15 non parsé")
        item = items[0]
        self.assertEqual(item.public_id, "A15")
        specs = item.specs_json or {}
        self.assertEqual(specs.get("model_hp"), "CALYPSO")
        self.assertEqual(specs.get("model_mp"), "CALYPSO")
        self.assertEqual(specs.get("model_octopus"), "CALYPSO")
        self.assertEqual(specs.get("accessories"), "DIN")
        self.assertEqual(specs.get("serial_hp"), "C081977")
        self.assertEqual(specs.get("serial_mp"), "9047891")
        self.assertEqual(specs.get("serial_octopus"), "H042201")
        self.assertIn("CALYPSO", specs.get("product_label", "").upper())
        self.assertTrue(item.interventions)
        inv = item.interventions[0]
        self.assertEqual(inv.subtype, "repair")
        self.assertEqual(inv.done_on, "2026-04-08")
        self.assertIsNotNone(inv.detail_json)
        assert inv.detail_json is not None
        self.assertTrue(inv.detail_json.get("tasks", {}).get("maint_hp"))
        self.assertEqual(inv.detail_json.get("test_values", {}).get("hp_test"), 200.0)

    @unittest.skipUnless(XLS_REV.is_file(), "Detendeur AQUABLUE 2026.xls absent")
    def test_p7_sheet_from_xls(self) -> None:
        items = parse_detendeur_xls(XLS_REV, "aquablue", "regulator")
        p7 = next((it for it in items if it.public_id == "P7"), None)
        self.assertIsNotNone(p7, "Feuille P7 introuvable")
        assert p7 is not None
        specs = p7.specs_json or {}
        self.assertEqual(specs.get("model_hp"), "CALYPSO")
        self.assertEqual(specs.get("serial_hp"), "9047894")
        self.assertEqual(specs.get("serial_octopus"), "F018067")
        self.assertIn("CALYPSO", specs.get("product_label", "").upper())

    @unittest.skipUnless(SOURCES.is_dir(), "_sourcesMatos absent")
    def test_collect_regulators_have_specs(self) -> None:
        items = collect_items()
        regulators = [it for it in items.values() if it.type_slug == "regulator"]
        self.assertGreaterEqual(len(regulators), 100)
        empty = sum(
            1 for it in regulators
            if not it.specs_json or not any(
                v for k, v in it.specs_json.items() if k != "public_id" and v
            )
        )
        self.assertEqual(empty, 0, f"{empty} détendeurs sans specs_json")


if __name__ == "__main__":
    unittest.main()
