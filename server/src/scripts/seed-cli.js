import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { assertRuntimeEnv, env } from '../config/env.js';
import { runStartupSeed } from '../services/seed.service.js';

async function main() {
  assertRuntimeEnv();
  await connectDatabase();
  const result = await runStartupSeed({ includeAdmin: true });
  // eslint-disable-next-line no-console
  console.info('[seed] Roles upserted:', result.rolesSeeded);
  const { adminResult } = result;
  if (adminResult.seeded) {
    // eslint-disable-next-line no-console -- never log password
    console.info(
      `[seed] Admin OK — login username: "${adminResult.username}" (password = ADMIN_SEED_PASSWORD trong .env)`,
    );
    console.info(`[seed] mustChangePassword=${adminResult.mustChangePassword}`);
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[seed] Admin skipped: ${adminResult.reason}`);
    if (!env.adminSeedEmail || !env.adminSeedPassword) {
      console.warn('[seed] Gợi ý: copy server/.env.example → server/.env rồi chạy lại npm run seed');
    }
  }
  await disconnectDatabase();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
