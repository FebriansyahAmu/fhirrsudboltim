"""
scripts/patch_acsn.py

Patch AccessionNumber (dan opsional StudyDescription) pada file DICOM yang sudah ada.
Dipanggil dari Next.js API route /api/tools/patch-acsn.

Usage:
    python patch_acsn.py <input.dcm> <output.dcm> --acsn <value> [--study-description <value>]
"""

import sys
import json
import argparse
import pydicom


def safe_str(val) -> str | None:
    if val is None:
        return None
    try:
        return str(val).strip() or None
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input",  help="Path file .dcm input")
    parser.add_argument("output", help="Path file .dcm output")
    parser.add_argument("--acsn", required=True, help="Accession Number baru")
    parser.add_argument("--study-description", default="", help="StudyDescription (opsional)")
    args = parser.parse_args()

    try:
        ds = pydicom.dcmread(args.input)
    except Exception as e:
        print(json.dumps({"error": f"Gagal membaca file DICOM: {e}"}))
        sys.exit(1)

    ds.AccessionNumber = args.acsn.strip()

    if args.study_description.strip():
        ds.StudyDescription = args.study_description.strip()

    try:
        ds.save_as(args.output, write_like_original=False)
    except Exception as e:
        print(json.dumps({"error": f"Gagal menyimpan file DICOM: {e}"}))
        sys.exit(1)

    print(json.dumps({
        "AccessionNumber":  safe_str(getattr(ds, "AccessionNumber", None)),
        "StudyDescription": safe_str(getattr(ds, "StudyDescription", None)),
        "SOPInstanceUID":   safe_str(getattr(ds, "SOPInstanceUID", None)),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
