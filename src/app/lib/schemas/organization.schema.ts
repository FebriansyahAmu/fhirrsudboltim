import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalUuid = (label: string) =>
  Yup.string()
    .optional()
    .default(undefined)
    .test(`uuid-if-present-${label}`, `${label} harus dalam format UUID`, (v) =>
      !v ? true : UUID_REGEX.test(v),
    )
    .trim();

// ─────────────────────────────────────────────
// Organization type codes
// ─────────────────────────────────────────────

export const ORG_TYPE_CODES = [
  "prov",
  "dept",
  "team",
  "govt",
  "ins",
  "pay",
  "edu",
  "reli",
  "crs",
  "cg",
  "bus",
  "other",
] as const;

export type OrgTypeCode = (typeof ORG_TYPE_CODES)[number];

export const ORG_TYPE_DISPLAY: Record<OrgTypeCode, string> = {
  prov: "Healthcare Provider",
  dept: "Hospital Department",
  team: "Organizational Team",
  govt: "Government",
  ins: "Insurance Company",
  pay: "Payer",
  edu: "Educational Institute",
  reli: "Religious Institution",
  crs: "Clinical Research Sponsor",
  cg: "Community Group",
  bus: "Non-Healthcare Business",
  other: "Other",
};

// ─────────────────────────────────────────────
// GET schema
// ─────────────────────────────────────────────

export const organizationGetSchema = Yup.object({
  organizationId: optionalUuid("Organization ID"),
  name: Yup.string().optional().default(undefined).trim(),
  partOf: optionalUuid("Part Of (Organization ID)"),
});

export type OrganizationGetValues = Yup.InferType<typeof organizationGetSchema>;

// ─────────────────────────────────────────────
// POST / PUT / PATCH form schema
// ─────────────────────────────────────────────

export const organizationFormSchema = Yup.object({
  organizationId: optionalUuid("Organization ID"),
  active: Yup.boolean().required().default(true),
  name: Yup.string().required("Nama organisasi wajib diisi").min(2).trim(),
  identifierValue: Yup.string()
    .required("Identifier value wajib diisi")
    .trim(),
  typeCode: Yup.string()
    .required("Tipe organisasi wajib dipilih")
    .oneOf(ORG_TYPE_CODES as unknown as string[]),
  phone: Yup.string().optional().default("").trim(),
  email: Yup.string().optional().default("").email("Format email tidak valid").trim(),
  websiteUrl: Yup.string().optional().default("").trim(),
  addressLine: Yup.string().optional().default("").trim(),
  city: Yup.string().optional().default("").trim(),
  postalCode: Yup.string().optional().default("").trim(),
  country: Yup.string().optional().default("ID").trim(),
  province: Yup.string().optional().default("").trim(),
  cityCode: Yup.string().optional().default("").trim(),
  district: Yup.string().optional().default("").trim(),
  village: Yup.string().optional().default("").trim(),
  partOf: optionalUuid("Part Of (Organization ID)"),
});

export type OrganizationFormValues = Yup.InferType<
  typeof organizationFormSchema
>;
