import { createNextRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

// Strip accidental surrounding quotes from environment variables
if (process.env.UPLOADTHING_SECRET) {
  process.env.UPLOADTHING_SECRET = process.env.UPLOADTHING_SECRET.replace(
    /^['"]|['"]$/g,
    ""
  ).trim();
}
if (process.env.UPLOADTHING_APP_ID) {
  process.env.UPLOADTHING_APP_ID = process.env.UPLOADTHING_APP_ID.replace(
    /^['"]|['"]$/g,
    ""
  ).trim();
}

// Export routes for Next App Router
export const runtime = "nodejs";

export const { GET, POST } = createNextRouteHandler({
  router: ourFileRouter,
});
