import { cloneDeep } from "lodash";
import { disableVerboseLogging, enableVerboseLogging } from "../../logger";

jest.mock("../../lib/pipelines/pipelines");

import {
  createPipelineForDefinition,
  getBuildApiClient,
  queueBuild
} from "../../lib/pipelines/pipelines";

import {
  ICommandOptions,
  installHldToManifestPipeline,
  requiredPipelineVariables,
  validateValues
} from "./pipeline";

beforeAll(() => {
  enableVerboseLogging();
});

afterAll(() => {
  disableVerboseLogging();
});

describe("required pipeline variables", () => {
  it("should use have the proper pipeline vars vars", () => {
    const variables = requiredPipelineVariables(
      "somePAT",
      "buildScriptUrl",
      "manifestRepoUrl"
    );

    expect(Object.keys(variables).length).toBe(3);

    expect(variables.PAT.value).toBe("somePAT");
    expect(variables.PAT.isSecret).toBe(true);
    expect(variables.PAT.allowOverride).toBe(true);

    expect(variables.BUILD_SCRIPT_URL.value).toBe("buildScriptUrl");
    expect(variables.BUILD_SCRIPT_URL.isSecret).toBe(false);
    expect(variables.BUILD_SCRIPT_URL.allowOverride).toBe(true);

    expect(variables.MANIFEST_REPO.value).toBe("manifestRepoUrl");
    expect(variables.MANIFEST_REPO.isSecret).toBe(false);
    expect(variables.MANIFEST_REPO.allowOverride).toBe(true);
  });
});

describe("validate pipeline config", () => {
  const configValues: ICommandOptions = {
    buildScriptUrl: "https://buildscript",
    devopsProject: "testDevopsProject",
    hldName: "testHld",
    hldUrl: "https://hldurl",
    manifestUrl: "https://manifestulr",
    orgName: "testOrg",
    personalAccessToken: "af8e99c1234ef93e8c4365b1dc9bd8d9ba987d3",
    pipelineName: "testPipeline"
  };

  it("config is valid", () => {
    expect(validateValues(configValues).length).toBe(0);
  });

  it("undefined values", () => {
    // TOFIX: cannot find a better way to do this.
    Object.getOwnPropertyNames(configValues).forEach(k => {
      const invalidValues: ICommandOptions = cloneDeep(configValues);
      invalidValues[k] = undefined;
      expect(validateValues(invalidValues).length).toBe(1);
    });
  });
});

const testCreatePipeline = async (timesCall?: number) => {
  const exitFn = jest.fn();
  await installHldToManifestPipeline(
    {
      buildScriptUrl: "buildScriptUrl",
      devopsProject: "project",
      hldName: "hldRepoName",
      hldUrl: "hldRepoUrl", // TOFIX: do we need to validate URL format?
      manifestUrl: "manifestRepoUrl", // TOFIX: do we need to validate URL format?
      orgName: "orgName",
      personalAccessToken: "personalAccessToken",
      pipelineName: "pipelineName"
    },
    exitFn
  );

  if (timesCall) {
    expect(exitFn).toBeCalledTimes(timesCall);
  }
};

describe("create hld to manifest pipeline test", () => {
  it("should create a pipeline", async () => {
    (createPipelineForDefinition as jest.Mock).mockReturnValue({ id: 10 });
    await testCreatePipeline(0);
  });

  it("should fail if the build client cant be instantiated", async () => {
    (getBuildApiClient as jest.Mock).mockReturnValue(Promise.reject());
    await testCreatePipeline(1);
  });

  it("should fail if the pipeline definition cannot be created", async () => {
    (getBuildApiClient as jest.Mock).mockReturnValue({});
    (createPipelineForDefinition as jest.Mock).mockReturnValue(
      Promise.reject()
    );
    await testCreatePipeline(1);
  });

  it("should fail if a build cannot be queued on the pipeline", async () => {
    (getBuildApiClient as jest.Mock).mockReturnValue({});
    (createPipelineForDefinition as jest.Mock).mockReturnValue({ id: 10 });
    (queueBuild as jest.Mock).mockReturnValue(Promise.reject());
    await testCreatePipeline(1);
  });
});
