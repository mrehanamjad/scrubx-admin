/**
 * Client-Side Direct Upload to ImageKit API
 *
 * Streams uploads directly from the user's browser to ImageKit CDN,
 * bypassing Next.js serverless functions while maintaining strict server-authenticated security.
 */

export interface UploadedFileResult {
  fileId: string;
  url: string;
  thumbnailUrl: string;
  name: string;
  size: number;
}

export interface UploadOptions {
  folder?: string;
  tags?: string[];
  onProgress?: (progressPercent: number) => void;
  signal?: AbortSignal;
}

interface AuthParameters {
  token: string;
  expire: number;
  signature: string;
  folder?: string;
}

/**
 * Uploads a local File to ImageKit using direct client upload.
 */
export async function uploadToImageKit(
  file: File,
  options: UploadOptions = {}
): Promise<UploadedFileResult> {
  // SEC-006: Defence in depth: reject SVG before requesting signature
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    throw new Error("SVG uploads are disabled for security. Allowed formats: JPEG, PNG, WebP, AVIF.");
  }

  const folder = options.folder || "/scrubx/products";

  // 1. Fetch short-lived auth signature from server with folder capability binding (SEC-005)
  const authUrl = new URL("/api/upload/auth", window.location.origin);
  authUrl.searchParams.set("folder", folder);

  const authRes = await fetch(authUrl.toString(), {
    method: "GET",
    headers: { "Cache-Control": "no-cache" },
    signal: options.signal,
  });

  if (!authRes.ok) {
    const errorBody = await authRes.json().catch(() => ({}));
    throw new Error(
      errorBody.error || `Upload authorization failed with HTTP ${authRes.status}.`
    );
  }

  const authParams: AuthParameters = await authRes.json();
  const targetFolder = authParams.folder || folder;
  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;

  if (!publicKey) {
    throw new Error("Client configuration error: NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY is not defined.");
  }

  // 2. Build multipart form data
  const sanitizedName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .replace(/-+/g, "-");
  const fileName = `${Date.now()}-${sanitizedName}`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("fileName", fileName);
  formData.append("publicKey", publicKey);
  formData.append("signature", authParams.signature);
  formData.append("expire", authParams.expire.toString());
  formData.append("token", authParams.token);
  formData.append("folder", targetFolder);
  formData.append("useUniqueFileName", "true");

  if (options.tags && options.tags.length > 0) {
    formData.append("tags", options.tags.join(","));
  }

  // 3. Upload via XMLHttpRequest to capture real-time progress events
  return new Promise<UploadedFileResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://upload.imagekit.io/api/v1/files/upload");

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        xhr.abort();
        reject(new Error("Upload aborted by user."));
      });
    }

    if (xhr.upload && options.onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          options.onProgress!(percent);
        }
      };
    }

    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            fileId: response.fileId,
            url: response.url,
            thumbnailUrl: response.thumbnailUrl || response.url,
            name: response.name,
            size: response.size || file.size,
          });
        } else {
          reject(
            new Error(
              response.message || response.error || `Upload failed with status ${xhr.status}`
            )
          );
        }
      } catch {
        reject(new Error(`Failed to parse ImageKit response (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network connection error during ImageKit upload."));
    };

    xhr.send(formData);
  });
}
