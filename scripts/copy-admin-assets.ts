import fsExtra from "fs-extra";
import { join } from "path";

const { copySync, existsSync } = fsExtra;

const src = join(process.cwd(), "admin", "public");
const dest = join(process.cwd(), "dist", "admin", "public");

if (existsSync(src)) {
  copySync(src, dest, { overwrite: true });
  console.log(`Copied admin assets from ${src} to ${dest}`);
} else {
  console.warn(`Admin source not found: ${src}`);
}