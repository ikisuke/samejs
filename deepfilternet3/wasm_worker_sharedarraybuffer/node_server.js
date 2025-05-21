import {
  getAssetFromKV,
  mapRequestToAsset,
} from "@cloudflare/kv-asset-handler";

// 元の mimeTypes 定義。kv-asset-handler が適切な Content-Type を設定することが多いが、
// .wasm のように特定のタイプを保証したい場合に役立つ可能性がある。
const mimeTypes = {
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  js: "text/javascript",
  wasm: "application/wasm", // .wasm ファイルは application/wasm で提供されることが重要
  css: "text/css",
};

/**
 * The DEBUG flag will do two things:
 * 1. Return readable error messages rather than opaque error pages
 * 2. Serve index.html for / requests (instead of blank page)
 */
const DEBUG = false; // 本番環境では false に設定

addEventListener("fetch", (event) => {
  try {
    event.respondWith(handleEvent(event));
  } catch (e) {
    if (DEBUG) {
      return event.respondWith(
        new Response(e.message || e.toString(), {
          status: 500,
        })
      );
    }
    event.respondWith(new Response("Internal Server Error", { status: 500 }));
  }
});

async function handleEvent(event) {
  const url = new URL(event.request.url);
  let options = {};

  // ASSET_NAMESPACE と ASSET_MANIFEST は wrangler によって提供されるグローバル変数です。
  // これらが getAssetFromKV に渡されるようにオプションを設定します。
  options.ASSET_NAMESPACE = globalThis.__STATIC_CONTENT; // KV Namespace
  options.ASSET_MANIFEST = globalThis.__STATIC_CONTENT_MANIFEST; // Manifest JSON

  try {
    const page = await getAssetFromKV(event, options);

    // レスポンスヘッダーをコピーして新しい Headers オブジェクトを作成
    const newHeaders = new Headers(page.headers);

    // Cross-Originポリシーヘッダーを追加
    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");

    // 元のコードにあったMIMEタイプ設定を参考に、特定の拡張子でContent-Typeを上書きする場合
    // (通常、kv-asset-handlerが適切に設定しますが、.wasmなどを確実に指定したい場合)
    const pathname = url.pathname;
    const fileExtension = pathname.split(".").pop();
    if (fileExtension && mimeTypes[fileExtension.toLowerCase()]) {
      newHeaders.set("Content-Type", mimeTypes[fileExtension.toLowerCase()]);
    }

    return new Response(page.body, {
      ...page, // status, statusText などをコピー
      headers: newHeaders,
    });
  } catch (e) {
    // エラーが発生した場合、404.html を提供しようと試みる (存在すれば)
    if (!DEBUG) {
      try {
        const notFoundResponse = await getAssetFromKV(event, {
          mapRequestToAsset: (req) =>
            new Request(`${new URL(req.url).origin}/404.html`, req),
          ASSET_NAMESPACE: globalThis.__STATIC_CONTENT,
          ASSET_MANIFEST: globalThis.__STATIC_CONTENT_MANIFEST,
        });

        const newHeaders = new Headers(notFoundResponse.headers);
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
        newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
        // 404.html なので Content-Type を text/html に設定
        newHeaders.set("Content-Type", "text/html; charset=utf-8");

        return new Response(notFoundResponse.body, {
          ...notFoundResponse, // status, statusText
          status: 404, // ステータスコードを404に
          headers: newHeaders,
        });
      } catch (e) {} // 404.html がなければ、最終的なエラーレスポンスへ
    }

    return new Response(e.message || e.toString(), { status: 500 });
  }
}

// 元の http.createServer や console.log の部分は Cloudflare Workers では不要です。
// // http
// //   .createServer(function (request, response) {
// //     ...
// //   })
// //   .listen(parseInt(port, 10));

// // console.log(
// //   "Static file server running at\\n  => http://localhost:" +
// //     port +
// //     "/\\nCTRL + C to shutdown"
// // );
