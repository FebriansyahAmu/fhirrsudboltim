"""
scripts/read_dcm.py

Baca metadata DICOM dari file .dcm dan output sebagai JSON ke stdout.
Dipanggil dari Next.js API route /api/tools/verify-dcm.

Usage:
    python read_dcm.py <path_to_file.dcm>
"""

import sys
import json
import pydicom


def safe_str(val) -> str | None:
    if val is None:
        return None
    try:
        return str(val).strip()
    except Exception:
        return None


def fmt_date(raw: str | None) -> str | None:
    if not raw or len(raw) != 8:
        return raw
    return f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"


def fmt_time(raw: str | None) -> str | None:
    if not raw or len(raw) < 6:
        return raw
    return f"{raw[:2]}:{raw[2:4]}:{raw[4:6]}"


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Path file .dcm wajib disertakan"}))
        sys.exit(1)

    path = sys.argv[1]

    try:
        ds = pydicom.dcmread(path, stop_before_pixels=True)
    except Exception as e:
        print(json.dumps({"error": f"Gagal membaca file DICOM: {e}"}))
        sys.exit(1)

    def g(tag: str) -> str | None:
        return safe_str(getattr(ds, tag, None))

    raw_date = g("StudyDate")
    raw_time = g("StudyTime")

    result = {
        # Identifikasi utama
        "AccessionNumber":    g("AccessionNumber"),
        "StudyDate":          fmt_date(raw_date),
        "StudyTime":          fmt_time(raw_time),
        "StudyDescription":   g("StudyDescription"),
        # Modalitas & anatomi
        "Modality":           g("Modality"),
        "BodyPartExamined":   g("BodyPartExamined"),
        "ViewPosition":       g("ViewPosition"),
        "SeriesDescription":  g("SeriesDescription"),
        # Instance UIDs
        "StudyInstanceUID":   g("StudyInstanceUID"),
        "SeriesInstanceUID":  g("SeriesInstanceUID"),
        "SOPInstanceUID":     g("SOPInstanceUID"),
        "SOPClassUID":        g("SOPClassUID"),
        # Perangkat
        "Manufacturer":            g("Manufacturer"),
        "ManufacturerModelName":   g("ManufacturerModelName"),
        "StationName":             g("StationName"),
        "InstitutionName":         g("InstitutionName"),
        # Pixel
        "Rows":               g("Rows"),
        "Columns":            g("Columns"),
        "BitsAllocated":      g("BitsAllocated"),
        "SamplesPerPixel":    g("SamplesPerPixel"),
        "PhotometricInterpretation": g("PhotometricInterpretation"),
        # Transfer syntax
        "TransferSyntaxUID":  safe_str(getattr(ds.file_meta, "TransferSyntaxUID", None)),
    }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
