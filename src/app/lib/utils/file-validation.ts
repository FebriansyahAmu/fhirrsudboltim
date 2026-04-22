const JPEG_MAGIC = [0xff, 0xd8, 0xff];

const DICOM_MAGIC_OFFSET = 128;
const DICOM_MAGIC = [0x44, 0x49, 0x43, 0x4d]; // "DICM"

export function isValidJpeg(buffer: Buffer): boolean {
  if (buffer.length < 3) return false;
  return JPEG_MAGIC.every((byte, i) => buffer[i] === byte);
}

export function isValidDicom(buffer: Buffer): boolean {
  if (buffer.length < DICOM_MAGIC_OFFSET + 4) return false;
  return DICOM_MAGIC.every(
    (byte, i) => buffer[DICOM_MAGIC_OFFSET + i] === byte,
  );
}
