import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import uuid from "uuid/v4";
import { Bedrock } from "../../config";
import { checkoutCommitPushCreatePRLink } from "../../lib/gitutils";
import {
  disableVerboseLogging,
  enableVerboseLogging,
  logger
} from "../../logger";
import {
  createTestBedrockYaml,
  createTestMaintainersYaml
} from "../../test/mockFactory";
import { createService } from "./create";
jest.mock("../../lib/gitutils");

const prepTest = async (randomTmpDir: string, serviceName: string) => {
  await writeSampleMaintainersFileToDir(
    path.join(randomTmpDir, "maintainers.yaml")
  );
  await writeSampleBedrockFileToDir(path.join(randomTmpDir, "bedrock.yaml"));

  logger.info(
    `creating randomTmpDir ${randomTmpDir} and service ${serviceName}`
  );
};

const validateTest = (
  randomTmpDir: string,
  serviceName: string,
  packagesDir: string
) => {
  // Check temp test directory exists
  expect(fs.existsSync(randomTmpDir)).toBe(true);

  // Check service directory exists
  const serviceDirPath = path.join(randomTmpDir, packagesDir, serviceName);
  expect(fs.existsSync(serviceDirPath)).toBe(true);

  // Verify new azure-pipelines created
  ["azure-pipelines.yaml", "Dockerfile"]
    .map(filename => path.join(serviceDirPath, filename))
    .forEach(f => {
      expect(fs.existsSync(f)).toBe(true);
    });

  // TODO: Verify root project bedrock.yaml and maintainers.yaml has been changed too.
};

const validateMiddlewaresInBedrockConfig = (
  randomTmpDir: string,
  serviceName: string,
  middlewares?: string[]
) => {
  middlewares = middlewares || [];
  const bedrockConfig = Bedrock(randomTmpDir);

  // check that the added service has the expected middlewares
  for (const [servicePath, service] of Object.entries(bedrockConfig.services)) {
    if (servicePath.includes(serviceName)) {
      expect(service.middlewares).toBeDefined();
      expect(Array.isArray(service.middlewares)).toBe(true);
      expect(service.middlewares!.length).toBe(middlewares.length);
      expect(service.middlewares!).toStrictEqual(middlewares);
    }
  }
};

const executeTest = async (
  randomTmpDir: string,
  serviceName: string,
  packagesDir: string,
  gitPush: boolean,
  middlewares?: string[]
) => {
  await prepTest(randomTmpDir, serviceName);

  if (middlewares) {
    await createService(
      randomTmpDir,
      serviceName,
      {
        packagesDir
      },
      gitPush,
      middlewares
    );
  } else {
    await createService(
      randomTmpDir,
      serviceName,
      {
        packagesDir
      },
      gitPush
    );
  }
  validateTest(randomTmpDir, serviceName, packagesDir);

  if (gitPush) {
    expect(checkoutCommitPushCreatePRLink).toHaveBeenCalled();
  }
};

beforeAll(() => {
  enableVerboseLogging();
});

afterAll(() => {
  disableVerboseLogging();
});

describe("Adding a service to a repo directory", () => {
  let randomTmpDir = "";
  beforeEach(async () => {
    // Create random directory to initialize
    randomTmpDir = path.join(os.tmpdir(), uuid());
    fs.mkdirSync(randomTmpDir);
  });

  it("New directory is created under root directory with required service files.", async () => {
    await executeTest(randomTmpDir, uuid(), "", false);
  });

  it("New directory is created under '/packages' directory with required service files.", async () => {
    await executeTest(randomTmpDir, uuid(), "packages", false);
  });

  it("New directory is created under '/packages' directory with required service files and git push enabled.", async () => {
    await executeTest(randomTmpDir, uuid(), "packages", true);
  });

  it("empty middleware list is created when none provided", async () => {
    const serviceName = uuid();
    await executeTest(randomTmpDir, serviceName, "packages", false);
    validateMiddlewaresInBedrockConfig(randomTmpDir, serviceName);
  });

  it("middleware gets added when provided", async () => {
    const serviceName = uuid();
    const middlewares = ["foo", "bar", "baz"];
    await executeTest(
      randomTmpDir,
      serviceName,
      "packages",
      false,
      middlewares
    );
    validateMiddlewaresInBedrockConfig(randomTmpDir, serviceName, middlewares);
  });
});

const writeSampleMaintainersFileToDir = async (maintainersFilePath: string) => {
  await promisify(fs.writeFile)(
    maintainersFilePath,
    createTestMaintainersYaml(),
    "utf8"
  );
};

const writeSampleBedrockFileToDir = async (bedrockFilePath: string) => {
  await promisify(fs.writeFile)(
    bedrockFilePath,
    createTestBedrockYaml(),
    "utf8"
  );
};
