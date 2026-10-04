import fs from 'node:fs';
import path from 'node:path';
import { catalogMeta, catalogProducts, sourceRows } from '../data/catalog.js';

const required = ['index.html', 'app.js', 'styles.css', 'server.mjs', 'worker.mjs', 'wrangler.toml', 'schema.sql', '.env.example', 'README.md', 'public/assets/cosmic-life-force-logo.jpeg', 'public/assets/cosmic-life-force-reference.jpeg'];
const missing = required.filter((file) => !fs.existsSync(path.resolve(file)));
if (missing.length) throw new Error(`Missing required files: ${missing.join(', ')}`);
if (!catalogProducts.length || !sourceRows.length) throw new Error('Catalog data is empty.');
if (catalogMeta.sourceRows !== sourceRows.length || catalogMeta.customerProducts !== catalogProducts.length) throw new Error('Catalog metadata is inconsistent.');
const ids = new Set(catalogProducts.map((product) => product.id));
if (ids.size !== catalogProducts.length) throw new Error('Catalog product ids are not unique.');
console.log(`Build check passed: ${catalogProducts.length} products, ${sourceRows.length} source rows, ${catalogMeta.duplicatesRemoved} duplicates removed.`);
