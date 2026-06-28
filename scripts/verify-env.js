const fs = require("fs");
const path = require("path");

function verifyEnvAndSetupUploads() {
  // Only enforce strict checks in production
  if (process.env.NODE_ENV !== "production") {
    console.log("[Verify-Env] Running in non-production environment. Skipping strict environment validation.");
    setupUploadDirectories();
    return;
  }

  console.log("[Verify-Env] Running production environment validation...");
  const errors = [];

  const checkPresence = (key) => {
    const val = process.env[key];
    if (!val || val.trim() === "") {
      errors.push(`Missing critical environment variable: ${key}`);
      return null;
    }
    return val.trim();
  };

  // 1. Database Connection
  const dbUrl = checkPresence("DATABASE_URL");
  if (dbUrl && !dbUrl.startsWith("postgres://") && !dbUrl.startsWith("postgresql://")) {
    errors.push("DATABASE_URL must be a valid PostgreSQL connection string starting with 'postgres://' or 'postgresql://'");
  }

  // 2. Redis Cache & Queue
  const redisUrl = checkPresence("REDIS_URL");
  if (redisUrl && !redisUrl.startsWith("redis://") && !redisUrl.startsWith("rediss://")) {
    errors.push("REDIS_URL must be a valid Redis connection string starting with 'redis://' or 'rediss://'");
  }

  // 3. Better Auth credentials
  const authUrl = checkPresence("BETTER_AUTH_URL");
  if (authUrl && !authUrl.startsWith("http://") && !authUrl.startsWith("https://")) {
    errors.push("BETTER_AUTH_URL must be a valid URL starting with 'http://' or 'https://'");
  }
  checkPresence("BETTER_AUTH_SECRET");

  // 4. Public Web URL
  const appUrl = checkPresence("NEXT_PUBLIC_APP_URL");
  if (appUrl && !appUrl.startsWith("http://") && !appUrl.startsWith("https://")) {
    errors.push("NEXT_PUBLIC_APP_URL must be a valid URL starting with 'http://' or 'https://'");
  }

  // 5. VAPID details
  checkPresence("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  checkPresence("VAPID_PRIVATE_KEY");
  const subject = checkPresence("VAPID_SUBJECT");
  if (subject && !subject.startsWith("mailto:") && !subject.startsWith("http://") && !subject.startsWith("https://")) {
    errors.push("VAPID_SUBJECT must be a valid mailto link or HTTP URL");
  }

  if (errors.length > 0) {
    console.error("=================================================");
    console.error(" CRITICAL RUNTIME ENVIRONMENT FAILURE            ");
    console.error("=================================================");
    errors.forEach((err) => console.error(`- ${err}`));
    console.error("=================================================");
    process.exit(1);
  }

  console.log("[Verify-Env] Production environment variables verified successfully.");
  setupUploadDirectories();
}

function setupUploadDirectories() {
  const uploadDirRoot = process.env.UPLOAD_DIR || (process.env.NODE_ENV === "production" ? "/app/uploads" : "./uploads");
  const absoluteUploadRoot = path.resolve(uploadDirRoot);

  console.log(`[Verify-Env] Setting up upload directories under: ${absoluteUploadRoot}`);

  const subdirectories = [
    "",
    "schedules",
    "checklists",
    "social-media",
    "ttd/letters",
    "ttd/documents",
    "profile-images",
    "temp-exports"
  ];

  try {
    for (const sub of subdirectories) {
      const dirPath = path.join(absoluteUploadRoot, sub);
      if (!fs.existsSync(dirPath)) {
        console.log(`[Verify-Env] Creating directory: ${dirPath}`);
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
    console.log("[Verify-Env] All upload subdirectories created/validated successfully.");
  } catch (err) {
    console.error("=================================================");
    console.error(" CRITICAL FAILURE DURING UPLOAD FOLDER CREATION   ");
    console.error("=================================================");
    console.error(err.message || err);
    console.error("=================================================");
    process.exit(1);
  }
}

verifyEnvAndSetupUploads();
