import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const input = JSON.parse(fs.readFileSync(path.join(root, 'tmp', 'catalog-rows.json'), 'utf8'));

const normalize = (value) => value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const has = (value, terms) => terms.some((term) => value.includes(term));

function classify(row) {
  const value = `${row.manufacturer} ${row.name}`.toUpperCase();
  const orthopedic = [
    'KNEE CAP', 'LUMBO', 'L.S. BELT', 'WRIST SUPPORT', 'WRIST BRACE', 'ABDOMINAL BELT',
    'ANKLET', 'ARM POUCH', 'CLAVICLE', 'ELBOW BRACE', 'RIB BELT', 'KINESIOLOGY',
    'NEOPRENE', 'ORTHO', 'WALKER', 'SINGAL STICK', 'TRIPOD STICK', 'COMMODE CHAIR',
    'PLASTER OF PARIS', 'CREPE BANDAG', 'CREPE BANDAGE', 'SUPPORT', 'BRACE',
  ];
  const surgical = [
    'SYRINGE', 'NEEDLE', 'COTTON', 'GAUZE', 'BANDAGE', 'CANNULA', 'CATH', 'CATHETER',
    'DRESSING', 'BLADE', 'SCALP', 'BLOOD SET', 'URIN BAG', 'PAPER TAPE', 'ADHESIVE',
    'SURGICAL', 'GLOVES', 'DISCARDIT', 'FOLEY', 'SKIN STAPLER', 'EXAMINATION',
  ];
  const devices = ['BP APPARATUS', 'WRIST BP', 'NEBULIZER', 'GLUCO', 'MACHINE', 'THERMOMETER', 'APPARATUS'];
  const ppe = ['GLOVES', 'MASK', 'PPE', 'DIPAR PANT', 'DIPER PANT'];
  const diagnostics = ['TEST', 'STRIP', 'REAGENT', 'DIAGNOSTIC', 'HCG', 'PREGNANCY'];
  const dental = ['DENTAL', 'TOOTH', 'ORAL'];
  const hospital = ['BED', 'CHAIR', 'STOOL', 'TROLLEY', 'WALKER'];

  if (has(value, orthopedic)) return { category: 'Orthopedic', subcategory: getOrthopedicSubcategory(value) };
  if (has(value, ppe)) return { category: 'PPE Products', subcategory: 'Protective wear' };
  if (has(value, dental)) return { category: 'Dental Products', subcategory: 'Dental care' };
  if (has(value, diagnostics)) return { category: 'Diagnostic Products', subcategory: 'Diagnostic supplies' };
  if (has(value, devices)) return { category: 'Medical Devices', subcategory: 'Monitoring devices' };
  if (has(value, surgical)) return { category: 'Surgical Supplies', subcategory: 'Procedure supplies' };
  if (has(value, hospital)) return { category: 'Hospital Equipment', subcategory: 'Care equipment' };
  if (has(value, ['FREIGHT', 'INSURANCE', 'KEY CHAINS', 'NOTEPAD', 'ADD'])) return { category: 'Healthcare & Hard Products', subcategory: 'Business supplies' };
  if (has(value, ['SOAP', 'CREAM', 'LOTION', 'OINT', 'SHAMPOO', 'GEL', 'OIL'])) return { category: 'Healthcare & Hard Products', subcategory: 'Personal care' };
  return { category: 'Medicines', subcategory: 'Pharmaceuticals' };
}

function getOrthopedicSubcategory(value) {
  if (has(value, ['KNEE'])) return 'Knee Support';
  if (has(value, ['LUMBO', 'L.S. BELT', 'RIB BELT'])) return 'Back Support';
  if (has(value, ['WRIST'])) return 'Wrist Support';
  if (has(value, ['ELBOW'])) return 'Elbow Support';
  if (has(value, ['ANKL'])) return 'Ankle Support';
  if (has(value, ['CLAVICLE', 'ARM POUCH'])) return 'Shoulder Support';
  if (has(value, ['ABDOMINAL'])) return 'Abdominal Support';
  if (has(value, ['TAPE'])) return 'Tapes';
  if (has(value, ['PLASTER'])) return 'Fracture Support';
  if (has(value, ['WALKER', 'STICK', 'COMMODE'])) return 'Walking / Mobility Support';
  if (has(value, ['BRACE', 'NEOPRENE'])) return 'Braces';
  if (has(value, ['BELT'])) return 'Belts';
  return 'Orthopedic supports';
}

const frequency = new Map();
for (const row of input.sourceRows) {
  const key = `${normalize(row.manufacturer)}|${normalize(row.name)}`;
  frequency.set(key, (frequency.get(key) ?? 0) + 1);
}

const products = input.products.map((row, index) => {
  const key = `${normalize(row.manufacturer)}|${normalize(row.name)}`;
  const classification = classify(row);
  return {
    id: `clf-${String(index + 1).padStart(4, '0')}`,
    name: row.name,
    manufacturer: row.manufacturer,
    sourcePage: row.sourcePage,
    sourceDuplicates: frequency.get(key) - 1,
    category: classification.category,
    subcategory: classification.subcategory,
    brand: '',
    description: '',
    packSize: '',
    specifications: {},
    variants: [],
    images: [],
    moq: null,
    price: null,
    wholesalePrice: null,
    bulkPricing: [],
    gst: null,
    stockStatus: 'not-configured',
    purchaseMode: 'quote',
    active: true,
  };
});

const data = `// Generated from product list (1).pdf. Source rows are kept for audit/import workflows.\nexport const catalogMeta = ${JSON.stringify({ sourcePages: 31, sourceRows: input.sourceRows.length, customerProducts: products.length, duplicatesRemoved: input.sourceRows.length - products.length }, null, 2)};\nexport const catalogProducts = ${JSON.stringify(products, null, 2)};\nexport const sourceRows = ${JSON.stringify(input.sourceRows, null, 2)};\n`;
fs.writeFileSync(path.join(root, 'data', 'catalog.js'), data, 'utf8');
console.log(`Wrote ${products.length} customer products and ${input.sourceRows.length} source rows.`);
