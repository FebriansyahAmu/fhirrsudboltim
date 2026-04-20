"""
scripts/jpg_to_dcm.py

Konversi file JPG/JPEG ke format DICOM CR Thorax PA (.dcm).
Dipanggil dari Next.js API route /api/tools/jpg-to-dcm.

Instalasi dependensi:
    pip install pydicom numpy pillow
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image
import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import generate_uid, ExplicitVRLittleEndian


def jpg_to_dcm(
    input_path: str,
    output_path: str,
    accession_number: str = "",
    study_date: str = "",
    study_time: str = "",
) -> str:
    """
    Konversi satu file JPG/JPEG menjadi file DICOM (CR Thorax PA).

    Args:
        input_path       : Path ke file .jpg input
        output_path      : Path ke file .dcm output
        accession_number : Accession Number (ACSN) untuk FHIR ImagingStudy SatuSehat
        study_date       : Tanggal studi format YYYYMMDD (default: hari ini)
        study_time       : Waktu studi format HHMMSS.000000 (default: sekarang)

    Returns:
        Path file output yang berhasil dibuat
    """
    if not accession_number or not accession_number.strip():
        raise ValueError("Accession Number (ACSN) wajib diisi. Gunakan --acsn <nomor>")

    now = datetime.now()
    STUDY_DATE = study_date if study_date else now.strftime("%Y%m%d")
    STUDY_TIME = study_time if study_time else now.strftime("%H%M%S.000000")
    CONTENT_DATE = STUDY_DATE
    CONTENT_TIME = STUDY_TIME

    img = Image.open(input_path)

    if img.mode == "RGBA":
        img = img.convert("RGB")
    elif img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    img_array = np.array(img)
    is_grayscale = (img.mode == "L")
    rows, cols = img_array.shape[:2]

    CR_SOP_CLASS_UID = "1.2.840.10008.5.1.4.1.1.1"

    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID    = CR_SOP_CLASS_UID
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID          = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID     = "1.2.840.10008.5.1.4.1.1.1"
    file_meta.ImplementationVersionName  = "JPG2DCM_CR_v1.1"

    ds = FileDataset(output_path, {}, file_meta=file_meta, preamble=b"\0" * 128)

    # === General Study ===
    ds.StudyInstanceUID       = generate_uid()
    ds.StudyDate              = STUDY_DATE
    ds.StudyTime              = STUDY_TIME
    ds.AccessionNumber        = accession_number
    ds.StudyID                = "STU001"
    ds.StudyDescription       = "Thorax PA"

    # === General Series ===
    ds.SeriesInstanceUID      = generate_uid()
    ds.SeriesNumber           = "1"
    ds.Modality               = "CR"
    ds.SeriesDescription      = "Chest X-Ray PA View"
    ds.SeriesDate             = STUDY_DATE
    ds.SeriesTime             = STUDY_TIME
    ds.BodyPartExamined       = "CHEST"
    ds.PatientPosition        = "PA"
    ds.ViewPosition           = "PA"
    ds.Laterality             = ""

    # === CR Series ===
    ds.ProtocolName           = "THORAX PA DEWASA"
    ds.RequestedProcedureDescription = "Foto Thorax PA"

    # === General Equipment ===
    ds.Manufacturer              = "FUJIFILM Corporation"
    ds.ManufacturerModelName     = "FCR PRIMA T2"
    ds.StationName               = "CR-THORAX-01"
    ds.InstitutionName           = "Instalasi Radiologi"
    ds.InstitutionalDepartmentName = "Radiologi"
    ds.SoftwareVersions          = "3.4.1"
    ds.DeviceSerialNumber        = "FCR-2024-00187"

    # === CR Image ===
    ds.ImageType                 = ["ORIGINAL", "PRIMARY"]
    ds.KVP                       = "110"
    ds.ExposureTime              = "20"
    ds.XRayTubeCurrent           = "200"
    ds.Exposure                  = "4"
    ds.FocalSpots                = "0.6"
    ds.AnodeTargetMaterial       = "TUNGSTEN"
    ds.DistanceSourceToDetector  = "1800"
    ds.DistanceSourceToPatient   = "1500"
    ds.FieldOfViewShape          = "RECTANGLE"
    ds.ImagerPixelSpacing        = [0.254, 0.254]
    ds.Grid                      = "NONE"
    ds.FilterType                = "ADDED"
    ds.FilterMaterial            = "ALUMINUM"
    ds.PlateID                   = "IP-THORAX-43X35"
    ds.CassetteSize              = "35CMX43CM"
    ds.CassetteOrientation       = "PORTRAIT"
    ds.SensitivityValue          = 200.0

    # === General Image ===
    ds.SOPClassUID               = CR_SOP_CLASS_UID
    ds.SOPInstanceUID            = file_meta.MediaStorageSOPInstanceUID
    ds.InstanceNumber            = "1"
    ds.ContentDate               = CONTENT_DATE
    ds.ContentTime               = CONTENT_TIME
    ds.AcquisitionDate           = STUDY_DATE
    ds.AcquisitionTime           = STUDY_TIME
    ds.AcquisitionNumber         = "1"
    ds.ImageComments             = "Inspirasi cukup. Foto dalam posisi PA."
    ds.QualityControlImage       = "NO"
    ds.BurnedInAnnotation        = "NO"
    ds.LossyImageCompression     = "00"
    ds.PresentationIntentType    = "FOR PRESENTATION"

    # === Image Pixel ===
    ds.SamplesPerPixel           = 1 if is_grayscale else 3
    ds.PhotometricInterpretation = "MONOCHROME2" if is_grayscale else "RGB"
    ds.Rows                      = rows
    ds.Columns                   = cols
    ds.BitsAllocated             = 8
    ds.BitsStored                = 8
    ds.HighBit                   = 7
    ds.PixelRepresentation       = 0

    if not is_grayscale:
        ds.PlanarConfiguration = 0

    ds.PixelData = img_array.tobytes()

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    ds.is_little_endian = True
    ds.is_implicit_VR   = False
    ds.save_as(output_path, write_like_original=False)

    return output_path


def convert_folder(input_dir: str, output_dir: str, accession_number: str = "",
                   study_date: str = "", study_time: str = "") -> list:
    """Konversi semua file JPG/JPEG dalam sebuah folder."""
    input_path  = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    jpg_files = list(input_path.glob("*.jpg")) + list(input_path.glob("*.jpeg")) + \
                list(input_path.glob("*.JPG")) + list(input_path.glob("*.JPEG"))

    if not jpg_files:
        print(f"[!] Tidak ada file JPG/JPEG ditemukan di: {input_dir}")
        return []

    results = []
    for i, jpg_file in enumerate(jpg_files, 1):
        out_file = output_path / (jpg_file.stem + ".dcm")
        try:
            jpg_to_dcm(str(jpg_file), str(out_file),
                       accession_number=accession_number,
                       study_date=study_date, study_time=study_time)
            print(f"[{i}/{len(jpg_files)}] OK  {jpg_file.name} -> {out_file.name}")
            results.append(str(out_file))
        except Exception as e:
            print(f"[{i}/{len(jpg_files)}] ERR {jpg_file.name}: {e}")

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Konversi file JPG/JPEG ke format DICOM CR Thorax PA (.dcm)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input",  help="File .jpg atau folder yang berisi file .jpg")
    parser.add_argument("--output", "-o", default="",
                        help="File .dcm output atau folder tujuan (opsional)")
    parser.add_argument("--acsn", default="",
                        help="Accession Number (ACSN) untuk FHIR ImagingStudy SatuSehat")
    parser.add_argument("--study-date", default="",
                        help="Tanggal studi format YYYYMMDD (default: hari ini)")
    parser.add_argument("--study-time", default="",
                        help="Waktu studi format HHMMSS.000000 (default: sekarang)")

    args = parser.parse_args()
    input_path = Path(args.input)

    if input_path.is_dir():
        output_dir = args.output if args.output else str(input_path) + "_dcm"
        results = convert_folder(str(input_path), output_dir,
                                 accession_number=args.acsn,
                                 study_date=args.study_date,
                                 study_time=args.study_time)
        print(f"\nSelesai: {len(results)} file berhasil dikonversi ke '{output_dir}'")

    elif input_path.is_file():
        out_file = args.output if args.output else str(input_path.with_suffix(".dcm"))
        try:
            result = jpg_to_dcm(str(input_path), out_file,
                                 accession_number=args.acsn,
                                 study_date=args.study_date,
                                 study_time=args.study_time)
            print(f"Berhasil: {input_path.name} -> {result}")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)

    else:
        print(f"Error: '{args.input}' bukan file atau folder yang valid.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
