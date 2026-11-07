import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(import.meta.dirname, "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (
      !file.startsWith(root + sep) ||
      (!["/index.html", "/styles.css"].includes(pathname) &&
        pathname !== "/" &&
        !/^\/(src|assets)\/[^.][^]*$/.test(pathname)) ||
      !types[extname(file)]
    ) {
      res.writeHead(404).end();
      return;
    }
    const body = await readFile(file);
    res
      .writeHead(200, {
        "Content-Type": types[extname(file)],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://rpc-testnet.maroo.io; frame-ancestors 'none'; base-uri 'self'",
      })
      .end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
  console.log("오롯: http://127.0.0.1:" + (process.env.PORT || 4173)),
);
