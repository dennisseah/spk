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
  installLifecyclePipeline,
  requiredPipelineVariables,
  validateValues
} from "./pipeline";

beforeAll(() => {
  enableVerboseLogging();
});

afterAll(() => {
  disableVerboseLogging();
});

describe("validate pipeline config", () => {
  const configValues: ICommandOptions = {
    buildScriptUrl: "https://buildscript",
    devopsProject: "testDevopsProject",
    hldUrl: "https://hldurl",
    orgName: "testOrg",
    personalAccessToken: "af8e99c1234ef93e8c4365b1dc9bd8d9ba987d3",
    pipelineName: "testPipeline",
    repoName: "repoName",
    repoUrl: "https:/repoulr"
  };

  it("config is valid", async () => {
    const result = validateValues(configValues);
    expect(result.length).toBe(0);
  });

  it("undefined values", async () => {
    Object.getOwnPropertyNames(configValues).forEach(k => {
      const invalidValues: ICommandOptions = cloneDeep(configValues);
      invalidValues[k] = undefined;
      const result = validateValues(invalidValues);
      expect(result.length).toBe(1);
    });
  });
});

describe("required pipeline variables", () => {
  it("should use have the proper pipeline vars vars", () => {
    const variables = requiredPipelineVariables(
      "somePAT",
      "buildScriptUrl",
      "hldRepoUrl"
    );

    expect(Object.keys(variables).length).toBe(3);

    expect(variables.PAT.value).toBe("somePAT");
    expect(variables.PAT.isSecret).toBe(true);
    expect(variables.PAT.allowOverride).toBe(true);

    expect(variables.BUILD_SCRIPT_URL.value).toBe("buildScriptUrl");
    expect(variables.BUILD_SCRIPT_URL.isSecret).toBe(false);
    expect(variables.BUILD_SCRIPT_URL.allowOverride).toBe(true);

    expect(variables.HLD_REPO.value).toBe("hldRepoUrl");
    expect(variables.HLD_REPO.isSecret).toBe(false);
    expect(variables.HLD_REPO.allowOverride).toBe(true);
  });
});

const testCreatePipeline = async (timesCall?: number) => {
  const exitFn = jest.fn();
  await installLifecyclePipeline(
    {
      buildScriptUrl: "buildScriptUrl",
      devopsProject: "pipelineName",
      hldUrl: "hldRepoUrl",
      orgName: "orgName",
      personalAccessToken: "PAT",
      pipelineName: "azDoProject",
      repoName: "repoName",
      repoUrl: "repoUrl"
    },
    exitFn
  );

  if (timesCall !== undefined) {
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

  it("should fail if a build definition id doesn't exist", async () => {
    (getBuildApiClient as jest.Mock).mockReturnValue({});
    (createPipelineForDefinition as jest.Mock).mockReturnValue({
      fakeProperty: "temp"
    });
    (queueBuild as jest.Mock).mockReturnValue(Promise.reject());
    await testCreatePipeline(1);
  });
});
