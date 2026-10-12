const fs = require("fs");

for (const path of ["./dist", "./node_modules", "./tsconfig.tsbuildinfo"]) {
  fs.rmSync(path, { recursive: true, force: true });
  console.log(`Clean: deleted ${path}`);
}
