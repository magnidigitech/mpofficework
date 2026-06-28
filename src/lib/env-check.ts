export function validateBuildEnvironment() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  console.log("[Environment Check] Validating production build variables...");
  const errors: string[] = [];

  const checkBuildPresence = (key: string) => {
    const val = process.env[key];
    if (!val || val.trim() === "") {
      errors.push(`Missing build-time environment variable: ${key}`);
    }
  };

  checkBuildPresence("NEXT_PUBLIC_APP_URL");
  checkBuildPresence("NEXT_PUBLIC_VAPID_PUBLIC_KEY");

  if (errors.length > 0) {
    console.error("=================================================");
    console.error(" CRITICAL BUILD ENVIRONMENT FAILURE              ");
    console.error("=================================================");
    errors.forEach((err) => console.error(`- ${err}`));
    console.error("=================================================");
    process.exit(1);
  }
}

export function validateRuntimeEnvironment() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  console.log("[Environment Check] Validating production runtime variables...");
  const errors: string[] = [];

  const checkPresence = (key: string) => {
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

  console.log("[Environment Check] Production runtime environment validated successfully.");
}

export function validateProductionEnvironment() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    validateBuildEnvironment();
  } else {
    // If it is runtime server or local development, let the runtime or database connections handle validation.
    // We already run scripts/verify-env.js before server starts, so we can run build validation here to be safe.
    validateBuildEnvironment();
  }
}
