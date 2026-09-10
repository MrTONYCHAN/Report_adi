import fs from "node:fs";
import { setTimeout } from "node:timers/promises";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

export async function startLocalDatabase({ dbPath, port = 27018, name = "adigrams" }) {
  fs.mkdirSync(dbPath, { recursive: true });
  const server = await MongoMemoryServer.create({
    instance: { dbPath, port, replSet: name, storageEngine: "wiredTiger", ip: "127.0.0.1" },
  });
  const client = new MongoClient(server.getUri(), {
    directConnection: true,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    const admin = client.db("admin");
    try {
      await admin.command({ replSetGetStatus: 1 });
    } catch (error) {
      if (error.code !== 94) throw error;
      await admin.command({
        replSetInitiate: {
          _id: name,
          members: [{ _id: 0, host: `127.0.0.1:${server.instanceInfo.port}` }],
        },
      });
    }
    // Existing replica-set configuration is retained. Reconfiguring it during
    // startup can race MongoDB's own recovery and is unnecessary for a fixed port.
    const deadline = Date.now() + 30000;
    while (!(await admin.command({ hello: 1 })).isWritablePrimary) {
      if (Date.now() > deadline) throw new Error("Local MongoDB did not elect a primary");
      await setTimeout(200);
    }
    return {
      uri: `${server.getUri()}?replicaSet=${name}`,
      stop: () => server.stop({ doCleanup: false }),
    };
  } catch (error) {
    await server.stop({ doCleanup: false });
    throw error;
  } finally {
    await client.close();
  }
}
