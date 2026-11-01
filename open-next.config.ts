import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No incremental cache: every page that reads the database is dynamic.
export default defineCloudflareConfig({});
