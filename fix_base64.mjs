
import fs from "fs/promises";
import path from "path";

async function fixDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "fix_base64.mjs") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await fixDir(fullPath);
    } else {
      try {
        const content = await fs.readFile(fullPath, "utf8");
        if (content.startsWith(`{"data":"`)) {
          const json = JSON.parse(content);
          if (json.data) {
            await fs.writeFile(fullPath, Buffer.from(json.data, "base64"));
            console.log("Fixed", fullPath);
          }
        }
      } catch (e) {
        // Not a JSON with data or binary file
      }
    }
  }
}

fixDir(process.cwd()).then(() => console.log("Done")).catch(console.error);

