import sharp from "sharp";
import { existsSync } from "fs";

const input = "public/lumora-logo.png";

if (!existsSync(input)) {
  throw new Error(`Missing input file: ${input}`);
}

const sizes = [
  {
    file: "public/favicon-32.png",
    size: 32,
  },
  {
    file: "public/favicon-16.png",
    size: 16,
  },
  {
    file: "public/apple-touch-icon.png",
    size: 180,
  },
  {
    file: "public/icon-192.png",
    size: 192,
  },
  {
    file: "public/icon-512.png",
    size: 512,
  },
];

// Increase this number to zoom in more.
// Try 1.20, 1.30, or 1.40.
const zoom = 1.35;

for (const item of sizes) {
  const cropSize = Math.round(1024 / zoom);

  await sharp(input)
    .resize(1024, 1024, {
      fit: "cover",
      position: "center",
    })
    .extract({
      left: Math.round((1024 - cropSize) / 2),
      top: Math.round((1024 - cropSize) / 2),
      width: cropSize,
      height: cropSize,
    })
    .resize(item.size, item.size, {
      fit: "cover",
      position: "center",
    })
    .png()
    .toFile(item.file);

  console.log(`Created ${item.file}`);
}