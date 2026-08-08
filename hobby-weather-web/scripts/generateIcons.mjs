import sharp from "sharp";
import { existsSync, mkdirSync } from "fs";

const input = "public/lumora-logo.png";

if (!existsSync(input)) {
  throw new Error(`Missing input file: ${input}`);
}

if (!existsSync("public")) {
  mkdirSync("public");
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

for (const item of sizes) {
  await sharp(input)
    .resize(item.size, item.size, {
      fit: "cover",
      position: "center",
    })
    .png()
    .toFile(item.file);

  console.log(`Created ${item.file}`);
}