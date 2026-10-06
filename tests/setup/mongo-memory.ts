import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Global setup for integration/security tests: one standalone mongod for the
 * run. Workers inherit MONGODB_URI_TEST from this process.
 */
export default async function setup() {
  const server = await MongoMemoryServer.create();
  process.env.MONGODB_URI_TEST = `${server.getUri()}exovault_test`;
  return async () => {
    await server.stop();
  };
}
